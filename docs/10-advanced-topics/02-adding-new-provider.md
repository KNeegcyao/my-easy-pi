---
对应源码: src/ai/providers/*.ts, src/ai/types.ts, src/ai/registry.ts, src/cli.ts
最后更新: 2026-08-08
适用版本: 0.1.0
---

# 实践：接入新的 LLM 提供商

## 1. 本节目标

本教程将手把手教你为 piagent 接入一个新的 LLM 提供商。我们将以 **Google Gemini** 为例，完整演示从创建 Provider 文件到 CLI 切换测试的全过程。

## 2. 前置知识

- 了解 piagent 的 AI 层架构（`ProviderFactory`、`Model`、`ModelRegistry`）
- 了解目标 LLM 提供商的 API 文档（请求格式、流式响应格式）
- 了解 TypeScript 的 `AsyncIterable` 和 Generator 语法

## 3. 核心概念

### Provider 架构

piagent 的 AI 层使用两层抽象：

```
ProviderFactory（工厂）     →   创建 Provider 实例
    Provider 实例           →   列出模型、创建模型实例
        Model 实例          →   流式调用 LLM（stream 方法）
```

**ProviderFactory 接口**：

```typescript
// src/ai/types.ts
export interface ProviderFactory {
  create(config: ProviderConfig): {
    name: string
    listModels(): ModelInfo[]
    createModel(modelId: string): Model | null
  }
}
```

**Model 接口**：

```typescript
export interface Model {
  id: string
  provider: string
  stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent>
  supportsTools(): boolean
  supportsThinking(): boolean
}
```

### 统一事件格式

所有 Provider 的流式响应都被转换为统一的 `LLMEvent` 格式：

```typescript
export type LLMEvent =
  | { type: 'text_delta'; delta: string }           // 文本增量
  | { type: 'tool_call_start'; id: string; name: string; args: unknown }  // 工具调用开始
  | { type: 'tool_call_delta'; id: string; delta: string }  // 工具调用参数增量
  | { type: 'thinking_delta'; delta: string }        // 思考过程
  | { type: 'error'; message: string }               // 错误
  | { type: 'done'; stopReason?: ... }               // 完成
```

### 消息格式转换

每个 Provider 需要实现消息格式的转换。piagent 使用统一的消息格式（`LLMMessage`），Provider 负责将其转换为目标 API 的格式：

```typescript
// piagent 统一格式
{ role: 'user', content: '你好' }
{ role: 'assistant', content: '你好！', toolCalls: [...] }
{ role: 'toolResult', toolCallId: 'xxx', content: '结果' }

// OpenAI 格式         →  { role: 'user'|'assistant'|'tool', content, tool_calls }
// Anthropic 格式      →  { role: 'user'|'assistant', content: [...] }
// Gemini 格式         →  { role: 'user'|'model'|'function', parts: [...] }
```

## 4. 代码实现

### 4.1 创建 Provider 文件

在 `src/ai/providers/` 目录下创建 `gemini.ts`：

```typescript
// ============================================================
// Google Gemini Provider
//
// 实现了 ProviderFactory 接口，负责调用 Google Gemini API。
// 使用 Gemini 的 streamGenerateContent 接口。
// 支持：
//   - 流式文本输出（text_delta）
//   - 工具/函数调用（tool_call）
//
// 文档：https://ai.google.dev/api/generate-content
// ============================================================

import type {
  ProviderFactory, Model, ModelContext, ModelInfo,
  LLMEvent, StreamOptions,
} from '../types.js'
import { fetchWithRetry } from '../retry.js'

// ── Gemini API 常量 ──
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'

// ── GeminiProvider 工厂 ──
export const GeminiProvider: ProviderFactory = {
  create(config) {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl || GEMINI_BASE_URL

    return {
      name: 'gemini',

      /** 返回支持的模型列表 */
      listModels(): ModelInfo[] {
        return [
          { id: 'gemini-2.0-flash', provider: 'gemini', description: 'Gemini 2.0 Flash（快速）' },
          { id: 'gemini-2.0-pro', provider: 'gemini', description: 'Gemini 2.0 Pro（强大）' },
          { id: 'gemini-1.5-pro', provider: 'gemini', description: 'Gemini 1.5 Pro' },
        ]
      },

      /** 创建一个模型实例 */
      createModel(modelId: string): Model | null {
        const supported = this.listModels().find(m => m.id === modelId)
        if (!supported) return null
        return new GeminiModel(modelId, apiKey, baseUrl)
      },
    }
  },
}

// ── GeminiModel ──
// 具体的模型实现，负责与 Gemini API 通信
class GeminiModel implements Model {
  id: string
  provider = 'gemini'

  constructor(
    id: string,
    private apiKey: string,
    private baseUrl: string,
  ) {
    this.id = id
  }

  supportsTools(): boolean {
    // Gemini 全系列支持函数调用
    return true
  }

  supportsThinking(): boolean {
    return false
  }

  /** 核心方法：流式调用 Gemini API */
  async *stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent> {
    // 1. 构建 Gemini 格式的请求体
    const body = this.buildRequestBody(context)

    // 2. Gemini 使用 API key 作为查询参数，而不是请求头
    const url = `${this.baseUrl}/v1beta/models/${this.id}:streamGenerateContent?alt=sse&key=${this.apiKey}`

    // 3. 发起流式请求
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    // 4. 处理错误
    if (!response.ok) {
      const errorText = await response.text()
      yield { type: 'error', message: `Gemini API Error (${response.status}): ${errorText}` }
      return
    }

    // 5. 读取流式响应（SSE 格式）
    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', message: 'No response body' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const event = this.parseSSELine(line)
          if (event) yield event
        }
      }

      // 处理缓冲区剩余内容
      if (buffer.trim()) {
        const event = this.parseSSELine(buffer.trim())
        if (event) yield event
      }

      // Gemini 的 SSE 流没有 [DONE] 标记，所以手动发送 done 事件
      yield { type: 'done' }

    } finally {
      reader.releaseLock()
    }
  }

  /** 构建 Gemini API 请求体 */
  private buildRequestBody(context: ModelContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      // 系统指令
      system_instruction: {
        parts: [{ text: context.systemPrompt }],
      },
      // 对话历史
      contents: this.buildContents(context),
      // 生成配置
      generationConfig: {
        maxOutputTokens: 8192,
      },
    }

    // 添加工具定义（转成 Gemini 的 function_declarations 格式）
    if (context.tools && context.tools.length > 0 && this.supportsTools()) {
      body.tools = [{
        function_declarations: context.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        })),
      }]
    }

    return body
  }

  /** 构建 Gemini 格式的消息列表 */
  private buildContents(context: ModelContext) {
    const contents: Record<string, unknown>[] = []

    for (const msg of context.messages) {
      if (msg.role === 'user') {
        // 用户消息 → Gemini 的 user 角色
        const content = typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n')

        contents.push({
          role: 'user',
          parts: [{ text: content }],
        })
      } else if (msg.role === 'assistant') {
        // 助手消息 → Gemini 的 model 角色
        const parts: Record<string, unknown>[] = [{ text: msg.content }]

        // 如果有工具调用，添加到 parts
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args,
              },
            })
          }
        }

        contents.push({
          role: 'model',
          parts,
        })
      } else if (msg.role === 'toolResult') {
        // 工具结果 → Gemini 的 function 角色
        contents.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: msg.toolCallId,
              response: {
                name: msg.toolCallId,
                content: msg.content,
              },
            },
          }],
        })
      }
    }

    return contents
  }

  /** 解析 SSE 行数据 */
  private parseSSELine(line: string): LLMEvent | null {
    if (!line || line.startsWith(':')) return null
    if (!line.startsWith('data: ')) return null

    const jsonStr = line.slice(6).trim()
    if (!jsonStr) return null

    try {
      const data = JSON.parse(jsonStr)
      return this.convertGeminiEvent(data)
    } catch {
      return null
    }
  }

  /** 将 Gemini API 事件转成我们的标准 LLMEvent 格式 */
  private convertGeminiEvent(data: Record<string, unknown>): LLMEvent | null {
    // Gemini 流式响应结构：
    // {
    //   candidates: [{
    //     content: {
    //       parts: [{ text: "..." }] 或 [{ functionCall: { name: "...", args: {...} } }]
    //     }
    //   }]
    // }

    const candidates = data.candidates as Array<Record<string, unknown>> | undefined
    if (!candidates || candidates.length === 0) return null

    const candidate = candidates[0]
    const content = candidate.content as Record<string, unknown> | undefined
    if (!content) return null

    const parts = content.parts as Array<Record<string, unknown>> | undefined
    if (!parts) return null

    // 处理每个 part
    for (const part of parts) {
      if (part.text) {
        // 文本增量
        return { type: 'text_delta', delta: part.text as string }
      }

      if (part.functionCall) {
        // 工具调用
        const fc = part.functionCall as Record<string, unknown>
        return {
          type: 'tool_call_start',
          id: `gemini-${fc.name}`,  // Gemini 不提供 tool_call_id，我们生成一个
          name: fc.name as string,
          args: fc.args as Record<string, unknown>,
        }
      }
    }

    return null
  }
}
```

### 4.2 在统一导出中注册

编辑 `src/ai/index.ts`，添加导出：

```typescript
// src/ai/index.ts
export * from './types.js'
export * from './registry.js'
export * from './retry.js'
export * from './errors.js'
export { AnthropicProvider } from './providers/anthropic.js'
export { DeepSeekProvider } from './providers/deepseek.js'
export { OpenAIProvider } from './providers/openai.js'
export { GeminiProvider } from './providers/gemini.js'    // ← 新增行
```

### 4.3 在 ModelRegistry 中注册

编辑 `src/cli.ts`，在 ModelRegistry 注册部分添加 GeminiProvider：

```typescript
// src/cli.ts 的 import 部分
import { ModelRegistry, AnthropicProvider, DeepSeekProvider, OpenAIProvider, GeminiProvider } from './ai/index.js'

// ModelRegistry 注册处（约第 128-131 行）
const registry = new ModelRegistry()
registry.setProvider('anthropic', AnthropicProvider)
registry.setProvider('deepseek', DeepSeekProvider)
registry.setProvider('openai', OpenAIProvider)
registry.setProvider('gemini', GeminiProvider)    // ← 新增行
```

### 4.4 配置 Gemini API Key

Gemini 使用 Google AI Studio 的 API Key。配置方式：

```bash
# 环境变量方式
export GEMINI_API_KEY=your-gemini-api-key-here

# 或配置文件方式（~/.piagent/config.json）
{
  "defaultProvider": "gemini",
  "defaultModel": "gemini-2.0-flash",
  "apiKeys": {
    "gemini": "your-gemini-api-key-here"
  }
}
```

注意：`ConfigManager` 的 `getApiKey` 方法需要更新以支持 gemini：

```typescript
// src/config/settings.ts 中修改 getApiKey 方法
getApiKey(provider: string): string | undefined {
  const envMap: Record<string, string> = {
    deepseek: 'DEEPSEEK_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',      // ← 新增
  }
  // ...
}
```

## 5. 运行与验证

### 5.1 编译项目

```bash
npm run build
```

### 5.2 命令行切换测试

```bash
# 使用 Gemini 提供商和默认模型
export GEMINI_API_KEY=your-api-key
npm start -- --provider gemini --model gemini-2.0-flash -m "你好，请问你是谁？"

# 或保持默认提供商，指定模型
npm start -- --provider gemini --model gemini-2.0-flash -m "Hello"
```

### 5.3 验证模型列表

```bash
node -e "
const { GeminiProvider } = require('./dist/ai/providers/gemini.js');
const instance = GeminiProvider.create({ apiKey: 'test' });
console.log('可用模型:', instance.listModels().map(m => m.id));
"
```

## 6. 小结

通过本教程，你已经学会了如何为 piagent 接入一个新的 LLM 提供商。整个过程可以概括为：

1. **创建 Provider 文件**：实现 `ProviderFactory` 和 `Model` 接口
2. **实现消息格式转换**：将 piagent 的统一消息格式转为目标 API 的格式
3. **实现流式 SSE 解析**：将目标 API 的流式响应转为统一的 `LLMEvent`
4. **注册 Provider**：在 `ModelRegistry` 中注册，在 `ConfigManager` 中添加 API Key 支持
5. **验证**：通过 CLI 的 `--provider` 参数切换测试

### 关键要点

- **ProviderFactory** 负责创建 Provider 实例和列出模型
- **Model** 的 `stream` 方法使用 `async *` generator 语法，产出 `LLMEvent`
- 消息格式转换是 Provider 实现中最复杂的部分，需要仔细处理每种角色（user/assistant/toolResult）
- 不同的 API 可能有不同的认证方式（Bearer Token、API Key 查询参数等）
- 流式响应的格式也各不相同（SSE、JSONL、纯文本流等）

### 思考题

1. 为什么 piagent 要设计 `ProviderFactory` 和 `Model` 两层抽象？直接一个接口不行吗？
2. 如果接入的 LLM API 不支持流式响应，应该怎么处理？（提示：可以模拟流式）
3. 查看 `src/ai/providers/deepseek.ts` 的代码，它与 `openai.ts` 高度相似。为什么 DeepSeek 不直接复用 OpenAI 的 Provider？
4. 如果要接入 Moonshot（月之暗面），它的 API 兼容 OpenAI 格式，最简单的接入方式是什么？