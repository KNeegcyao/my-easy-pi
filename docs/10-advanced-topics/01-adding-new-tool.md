---
对应源码: src/tools/builtin/*.ts, src/tools/registry.ts, src/agent/types.ts, src/cli.ts
最后更新: 2026-08-08
适用版本: 0.1.0
---

# 实践：添加一个自定义工具

## 1. 本节目标

本教程将手把手教你为 piagent 添加一个自定义工具。我们将以 **curl 工具**（让 LLM 可以发送 HTTP 请求）为例，完整演示从创建文件到注册测试的全过程。

## 2. 前置知识

- 熟悉 TypeScript 接口和类型
- 了解 `@sinclair/typebox` 的基本用法（用于定义参数 Schema）
- 了解 piagent 的工具注册机制（`ToolRegistry`）

## 3. 核心概念

### 工具的本质

在 piagent 中，一个工具就是一个实现了 `AgentTool` 接口的对象：

```typescript
// src/agent/types.ts
export interface AgentTool extends Tool {
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate?: (update: ToolUpdate) => void
  ): Promise<ToolResult>
}
```

其中 `Tool` 接口定义了工具的"外观"（LLM 看到的部分）：

```typescript
export interface Tool {
  name: string          // 工具名（LLM 调用时用的标识）
  label?: string        // 显示名（UI 展示用）
  description: string   // 描述（LLM 理解工具用途）
  parameters: JSONSchema // 参数 Schema
  executionMode?: 'parallel' | 'sequential'
}
```

### 工具的工作流程

1. **LLM 决定调用工具**：LLM 根据 `name`、`description`、`parameters` 决定是否调用该工具，并生成参数
2. **Agent 执行工具**：Agent 收到 LLM 的 tool_call 指令后，调用工具的 `execute` 方法
3. **结果返回 LLM**：工具执行结果以 `ToolResult` 的形式返回给 LLM，LLM 据此生成最终回答

## 4. 代码实现

### 4.1 创建工具文件

在 `src/tools/builtin/` 目录下创建 `curl.ts`：

```typescript
// ============================================================
// Curl 工具 — 发送 HTTP 请求
//
// 让 LLM 可以获取网页内容、调用 REST API 等。
// 支持 GET/POST 请求，自定义请求头和超时。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

// 定义 curl 工具
export const curlTool: AgentTool = {
  // ── 工具元信息（LLM 会读取这些字段） ──
  name: 'curl',                                    // 工具名称，LLM 通过此名称调用
  label: 'HTTP Request',                           // 显示名称，UI 展示用
  description: '发送 HTTP 请求获取网页内容或调用 REST API',  // 描述，LLM 据此判断何时使用

  // ── 参数 Schema（使用 TypeBox 定义，LLM 据此生成参数） ──
  parameters: Type.Object({
    url: Type.String({ description: '请求的 URL 地址' }),           // 必填参数：URL
    method: Type.Optional(                          // 可选参数：HTTP 方法，默认 GET
      Type.String({ description: 'HTTP 方法（GET/POST/PUT/DELETE）' }),
    ),
    headers: Type.Optional(                         // 可选参数：请求头
      Type.Record(Type.String(), Type.String(), { description: '请求头键值对' }),
    ),
    body: Type.Optional(                            // 可选参数：请求体（POST 时使用）
      Type.String({ description: '请求体内容（JSON 字符串）' }),
    ),
    timeout: Type.Optional(                         // 可选参数：超时时间
      Type.Number({ description: '超时时间（毫秒），默认 10000' }),
    ),
  }),

  // ── 工具执行方法 ──
  async execute(toolCallId, params, signal, onUpdate) {
    // 1. 提取参数（带类型转换）
    const url = params.url as string
    const method = (params.method as string) || 'GET'
    const headers = (params.headers as Record<string, string>) || {}
    const body = params.body as string | undefined
    const timeout = (params.timeout as number) || 10000

    // 2. 发送进度更新（可选，用于 UI 展示）
    onUpdate?.({
      content: [{
        type: 'text',
        text: `正在请求: ${method} ${url}`,
      }],
    })

    // 3. 构建 fetch 请求参数
    const fetchOptions: RequestInit = {
      method,
      headers: {
        // 设置默认请求头
        'User-Agent': 'piagent-curl/1.0',
        ...headers,
      },
      // 支持中断（用户取消操作时自动中止请求）
      signal,
    }

    // 如果是 POST/PUT，添加请求体
    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = body
    }

    try {
      // 4. 发起 HTTP 请求（使用 AbortSignal 实现超时）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      // 将外部 signal 与超时 signal 结合
      const combinedSignal = signal
        ? combineAbortSignals(signal, controller.signal)
        : controller.signal

      const response = await fetch(url, { ...fetchOptions, signal: combinedSignal })
      clearTimeout(timeoutId)

      // 5. 读取响应内容
      const responseText = await response.text()
      const contentType = response.headers.get('content-type') || ''

      // 6. 格式化输出
      const output = [
        `状态码: ${response.status} ${response.statusText}`,
        `内容类型: ${contentType}`,
        `内容长度: ${responseText.length} 字符`,
        '',
        responseText.slice(0, 5000),  // 限制输出长度，避免 Token 浪费
      ].join('\n')

      // 7. 返回执行结果
      return {
        content: [{ type: 'text', text: output }],
        details: { status: response.status, contentType, contentLength: responseText.length },
      }
    } catch (error) {
      // 8. 错误处理（返回错误信息而不是抛出异常）
      const err = error as Error
      return {
        content: [{ type: 'text', text: `请求失败: ${err.message || String(error)}` }],
        details: { error: err.message },
      }
    }
  },
}

// ── 辅助函数：合并两个 AbortSignal ──
// 当任一 signal 被 abort 时，合并后的 signal 也会被 abort
function combineAbortSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  const controller = new AbortController()

  const onAbort = () => controller.abort()
  s1.addEventListener('abort', onAbort)
  s2.addEventListener('abort', onAbort)

  // 如果任一 signal 已经中止，立即中止
  if (s1.aborted || s2.aborted) {
    controller.abort()
  }

  return controller.signal
}
```

### 4.2 在统一导出中注册

编辑 `src/tools/index.ts`，添加导出：

```typescript
// src/tools/index.ts
export * from './registry.js'
export { bashTool } from './builtin/bash.js'
export { readTool } from './builtin/read.js'
export { writeTool } from './builtin/write.js'
export { editTool } from './builtin/edit.js'
export { grepTool } from './builtin/grep.js'
export { findTool } from './builtin/find.js'
export { lsTool } from './builtin/ls.js'
export { curlTool } from './builtin/curl.js'    // ← 新增行
```

### 4.3 在 CLI 入口注册工具

编辑 `src/cli.ts`，在工具注册部分添加 curlTool：

```typescript
// src/cli.ts 的 import 部分
import { ToolRegistry, bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool, curlTool } from './tools/index.js'

// 工具注册处（约第 140 行）
const toolRegistry = new ToolRegistry()
for (const t of [bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool, curlTool]) {
  toolRegistry.registerTool(t)
}
```

### 4.4 完整代码解读

让我们逐行分析关键部分：

**参数 Schema 定义**：
```typescript
parameters: Type.Object({
  url: Type.String({ description: '请求的 URL 地址' }),
  method: Type.Optional(Type.String({ description: 'HTTP 方法' })),
  // ...
})
```
- `Type.Object({...})` 定义一个 JSON 对象 Schema
- `Type.String()` 定义一个字符串类型的字段
- `Type.Optional(...)` 表示该字段可选
- `description` 字段会被 LLM 读取，帮助 LLM 理解如何生成参数

**execute 方法**：
```typescript
async execute(toolCallId, params, signal, onUpdate) {
```
- `toolCallId`：工具调用 ID，用于关联工具调用和结果
- `params`：LLM 生成的参数，类型为 `Record<string, unknown>`
- `signal`：`AbortSignal`，用户取消操作时触发
- `onUpdate`：可选的回调函数，用于发送中间进度更新

**错误处理**：
```typescript
} catch (error) {
  return {
    content: [{ type: 'text', text: `请求失败: ${err.message}` }],
  }
}
```
- 工具执行失败时**不要抛出异常**，而是返回包含错误信息的 `ToolResult`
- 这样 LLM 可以读到错误信息并决定如何处理（重试或向用户解释）

## 5. 运行与验证

### 5.1 编译项目

```bash
npm run build
```

确保没有编译错误。

### 5.2 验证工具注册

可以通过以下方式验证工具是否成功注册：

```bash
# 启动交互模式
npm start
```

在交互中，如果 LLM 认为需要获取网页内容，它会自动调用 curl 工具。你也可以在代码中添加调试日志来验证：

```bash
# 或在代码中临时添加验证
node -e "
const { ToolRegistry } = require('./dist/tools/registry.js');
const { curlTool } = require('./dist/tools/builtin/curl.js');
const registry = new ToolRegistry();
registry.registerTool(curlTool);
console.log(registry.listTools().map(t => t.name));
// 输出应包含 'curl'
"
```

### 5.3 测试示例

你也可以编写一个简单的测试来验证工具的执行：

```typescript
// tests/unit/tools/curl.test.ts
import { describe, test, expect } from 'vitest'
import { curlTool } from '../../../src/tools/builtin/curl.js'

describe('curlTool', () => {
  test('工具定义正确', () => {
    expect(curlTool.name).toBe('curl')
    expect(curlTool.description).toBeTruthy()
    expect(curlTool.parameters).toBeDefined()
    expect(curlTool.execute).toBeInstanceOf(Function)
  })

  test('参数验证：url 是必填的', () => {
    // TypeBox 生成的 Schema 应包含 url 字段
    const schema = curlTool.parameters as any
    expect(schema.properties?.url).toBeDefined()
    expect(schema.required).toContain('url')
  })
})
```

## 6. 小结

通过本教程，你已经学会了如何为 piagent 添加一个自定义工具。整个过程可以概括为：

1. **创建工具文件**：实现 `AgentTool` 接口，定义元信息、参数 Schema 和 `execute` 方法
2. **导出工具**：在 `src/tools/index.ts` 中添加导出
3. **注册工具**：在 `cli.ts` 中将工具注册到 `ToolRegistry`
4. **验证**：编译、测试，确保工具可被 LLM 调用

### 关键要点

- `description` 字段至关重要：LLM 通过它决定何时调用工具
- 参数 Schema 使用 TypeBox 定义，确保类型安全
- 工具执行失败时返回 `ToolResult` 而非抛出异常
- 使用 `onUpdate` 回调可以提供中间进度反馈

### 思考题

1. 如果要实现一个 weather 工具（查询天气），需要哪些参数？参数 Schema 应该如何定义？
2. 为什么工具的 `execute` 方法不应该抛出异常？如果抛出了异常，Agent 会怎么处理？
3. 如何让工具支持流式输出（如逐行返回结果）？提示：你看 `onUpdate` 回调。