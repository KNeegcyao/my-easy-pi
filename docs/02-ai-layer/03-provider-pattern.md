---
对应源码: 'src/ai/providers/anthropic.ts, src/ai/providers/deepseek.ts, src/ai/providers/openai.ts, src/ai/types.ts'
最后更新: 2026-08-08
适用版本: piagent v0.1+
---

# 策略模式：ProviderFactory

## 1. 本节目标

理解策略模式在 AI 层的应用，以及三个 Provider 实现的差异对比。

## 2. 前置知识

- 了解策略模式（Strategy Pattern）的基本概念
- 了解 Anthropic Messages API、OpenAI Chat Completions API 的基本格式
- 了解 SSE（Server-Sent Events）协议

## 3. 核心概念

### 3.1 策略模式

策略模式定义了一系列算法，把它们一个个封装起来，并且使它们可以相互替换。在 AI 层中，不同的 LLM 提供商就是不同的"策略"，它们都实现同一个 `ProviderFactory` 接口：

```typescript
export interface ProviderFactory {
  create(config: ProviderConfig): {
    name: string
    listModels(): ModelInfo[]
    createModel(modelId: string): Model | null
  }
}
```

### 3.2 策略模式在这里的应用

```
上层代码（ModelRegistry / Agent）
      │
      │ 调用 create() / listModels() / createModel()
      ▼
┌─────────────────────────────────────────────────────────┐
│              ProviderFactory 接口                        │
│  (定义策略的"形状"，不关心具体实现)                         │
└─────────────────────────────────────────────────────────┘
      │                    │                    │
      ▼                    ▼                    ▼
┌─────────────┐  ┌──────────────┐  ┌────────────────┐
│AnthropicProvider││DeepSeekProvider││OpenAIProvider  │
│              │  │              │  │                │
│ Messages API │  │ OpenAI 格式  │  │ Chat Completions│
│ content_block│  │ SSE 流式解析  │  │ SSE 流式解析    │
│ thinking_delta│  │ 无 thinking  │  │ 无 thinking     │
└─────────────┘  └──────────────┘  └────────────────┘
```

### 3.3 各 Provider 的差异对比

| 特性 | Anthropic | OpenAI | DeepSeek |
|------|-----------|--------|----------|
| API 端点 | `/v1/messages` | `/v1/chat/completions` | `/v1/chat/completions` |
| 认证方式 | `x-api-key` 头 | `Authorization: Bearer` | `Authorization: Bearer` |
| System Prompt | 独立 `system` 字段 | `messages` 数组中 `role: system` | 同 OpenAI |
| 消息格式 | 多层嵌套（content 为数组） | 扁平结构 | 同 OpenAI |
| 工具调用 | `tool_use` 内容块 | `tool_calls` 字段 | 同 OpenAI |
| 思考过程 | `thinking_delta` 事件 | 不支持 | 不支持（R1 模型理论上支持） |
| 流式事件 | `content_block_start/delta/stop` | `choices[0].delta` | 同 OpenAI |

## 4. 代码实现

### 4.1 Anthropic Provider

```typescript
export const AnthropicProvider: ProviderFactory = {
  create(config) {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl || ANTHROPIC_BASE_URL

    return {
      name: 'anthropic',

      listModels(): ModelInfo[] {
        return [
          { id: 'claude-sonnet-4-20250514', provider: 'anthropic', description: 'Claude Sonnet 4' },
          { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', description: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-haiku-20240307', provider: 'anthropic', description: 'Claude 3 Haiku' },
        ]
      },

      createModel(modelId: string): Model | null {
        // 检验模型是否在支持列表中
        const supported = this.listModels().find(m => m.id === modelId)
        if (!supported && !modelId.startsWith('claude-')) return null
        return new AnthropicModel(modelId, apiKey, baseUrl)
      },
    }
  },
}
```

**Anthropic 独有的特点：**

1. **认证方式不同** — Anthropic 使用 `x-api-key` 请求头，而不是 `Authorization: Bearer`
2. **System Prompt 独立** — Anthropic 使用独立的 `system` 字段，而不是 `messages` 数组中的 `role: system`
3. **消息格式不同** — Anthropic 的 `content` 是数组，支持多种内容块类型
4. **支持思考过程** — Anthropic 的 `thinking` 功能通过 `content_block_delta.thinking_delta` 事件输出

### 4.2 DeepSeek Provider

```typescript
export const DeepSeekProvider: ProviderFactory = {
  create(config) {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl || DEEPSEEK_BASE_URL

    return {
      name: 'deepseek',

      listModels(): ModelInfo[] {
        return [
          { id: 'deepseek-chat', provider: 'deepseek', description: 'DeepSeek V3 (通用对话)' },
          { id: 'deepseek-reasoner', provider: 'deepseek', description: 'DeepSeek R1 (深度推理)' },
        ]
      },

      createModel(modelId: string): Model | null {
        const supported = this.listModels().find(m => m.id === modelId)
        if (!supported) return null
        return new DeepSeekModel(modelId, apiKey, baseUrl)
      },
    }
  },
}
```

**DeepSeek 独有的特点：**

1. **兼容 OpenAI 格式** — DeepSeek API 完全兼容 OpenAI 的 Chat Completions 格式，因此 buildRequestBody 和 parseSSELine 的逻辑与 OpenAI 基本相同
2. **模型能力区分** — `deepseek-chat`（V3）支持工具调用，`deepseek-reasoner`（R1）支持思考过程，但两者不能同时支持
3. **工具调用在单个 chunk 完成** — DeepSeek 有时会在同一个 SSE chunk 中传完所有工具调用参数，需要特殊处理

### 4.3 OpenAI Provider

```typescript
export const OpenAIProvider: ProviderFactory = {
  create(config) {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl || OPENAI_BASE_URL

    return {
      name: 'openai',

      listModels(): ModelInfo[] {
        return [
          { id: 'gpt-4o', provider: 'openai', description: 'GPT-4o 多模态模型' },
          { id: 'gpt-4o-mini', provider: 'openai', description: 'GPT-4o 轻量版' },
          { id: 'gpt-4-turbo', provider: 'openai', description: 'GPT-4 Turbo' },
          { id: 'gpt-3.5-turbo', provider: 'openai', description: 'GPT-3.5 Turbo' },
        ]
      },

      createModel(modelId: string): Model | null {
        const supported = this.listModels().find(m => m.id === modelId)
        if (!supported) return null
        return new OpenAIModel(modelId, apiKey, baseUrl)
      },
    }
  },
}
```

### 4.4 消息格式转换

每个 Provider 都需要将统一的 `LLMMessage` 格式转换为各自 API 的格式。以下是三种格式的对比：

**统一格式（LLMMessage）：**
```typescript
{ role: 'user', content: '你好' }
{ role: 'assistant', content: '你好！', toolCalls: [{ id: 'call_1', name: 'search', args: { q: '天气' } }] }
{ role: 'toolResult', toolCallId: 'call_1', content: '晴，25°C' }
```

**OpenAI 格式：**
```json
{"role": "user", "content": "你好"}
{"role": "assistant", "content": "你好！", "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "search", "arguments": "{\"q\":\"天气\"}"}}]}
{"role": "tool", "tool_call_id": "call_1", "content": "晴，25°C"}
```

**Anthropic 格式：**
```json
{"role": "user", "content": "你好"}
{"role": "assistant", "content": [{"type": "text", "text": "你好！"}, {"type": "tool_use", "id": "call_1", "name": "search", "input": {"q": "天气"}}]}
{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "call_1", "content": "晴，25°C"}]}
```

关键差异点：

1. **工具调用格式** — OpenAI 在 `assistant` 消息中增加 `tool_calls` 字段；Anthropic 将工具调用作为 `content` 数组中的 `tool_use` 内容块
2. **工具结果格式** — OpenAI 使用 `role: 'tool'` 消息；Anthropic 使用 `role: 'user'` 消息，内容为 `tool_result` 类型
3. **参数序列化** — OpenAI 的 `arguments` 是 JSON 字符串；Anthropic 的 `input` 是原生对象

### 4.5 SSE 流式解析对比

三个 Provider 都使用 SSE（Server-Sent Events）协议，但事件格式不同：

**Anthropic 事件流：**
```
event: message_start
data: {"type": "message_start", ...}

event: content_block_start
data: {"type": "content_block_start", "content_block": {"type": "text", "text": "你好"}}

event: content_block_delta
data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "！"}}

event: message_stop
data: {"type": "message_stop"}
```

**OpenAI 事件流：**
```
data: {"id": "...", "choices": [{"delta": {"content": "你好"}, "index": 0}]}

data: {"id": "...", "choices": [{"delta": {"content": "！"}, "index": 0}]}

data: {"id": "...", "choices": [{"delta": {}, "finish_reason": "stop"}]}

data: [DONE]
```

**DeepSeek 事件流：** 与 OpenAI 完全相同。

尽管底层事件格式不同，但通过 `parseSSELine()` 和 `convertEvent()`/`convertAnthropicEvent()` 方法，三者都转换为统一的 `LLMEvent` 格式。

## 5. 运行与验证

```bash
# 查看各 Provider 的导出
grep "export const" src/ai/providers/*.ts

# 检查类型一致性
npx tsc --noEmit
```

## 6. 小结

策略模式让 AI 层可以轻松地添加新的 LLM 提供商。每个 Provider 只需要实现 `ProviderFactory` 接口，关注自己的 API 差异，上层代码无需任何修改。三个 Provider 的代码结构高度一致，反映了统一的架构设计。

### 思考题

1. 如果要新增一个 Google Gemini Provider，需要实现哪些方法？最大的挑战可能是什么？
2. `AnthropicProvider` 的 `createModel()` 中使用了 `!modelId.startsWith('claude-')` 作为后备匹配条件，这样做有什么好处和风险？
3. 为什么 OpenAI 和 DeepSeek 的 Provider 代码高度相似，却没有合并为一个"OpenAI 兼容 Provider"？