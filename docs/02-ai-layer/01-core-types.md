---
对应源码: 'src/ai/types.ts'
最后更新: 2026-08-08
适用版本: piagent v0.1+
---

# 核心类型

## 1. 本节目标

理解 piagent 中所有与 LLM 调用相关的核心类型定义，以及这些类型背后的设计思路。

## 2. 前置知识

- TypeScript 的 `type` 和 `interface` 关键字
- 联合类型（Union Type）和交叉类型
- 泛型基本用法

## 3. 核心概念

### 3.1 为什么需要这么多类型？

LLM 调用涉及多个环节：

1. **描述模型** — 模型是什么、由谁提供（ModelInfo）
2. **构建请求** — 发给 LLM 的消息格式（LLMMessage、ModelContext）
3. **接收响应** — 流式返回的事件（LLMEvent）
4. **内部流转** — Agent 内部使用的消息格式（AgentMessage）
5. **工具调用** — LLM 调用工具的参数（ToolCall、Tool、ToolResult）

每个环节都有对应的类型，职责清晰，互不混淆。

### 3.2 类型分层架构

```
底层通用类型（与提供商无关）
  └─ ModelInfo, ContentBlock, ToolCall, ModelTool
       └─ LLMMessage（发给 LLM 的消息格式）
            └─ ModelContext（完整的 LLM 调用上下文）
                 └─ LLMEvent（LLM 返回的流式事件）
上层扩展类型（Agent 层使用）
  └─ AgentMessage（比 LLMMessage 多了 UI 相关角色）
       └─ AgentEvent（Agent 生命周期事件）
```

## 4. 代码实现

### 4.1 模型信息 — `ModelInfo`

```typescript
/** 描述一个 LLM 模型的基本信息 */
export interface ModelInfo {
  id: string          // 模型 ID，如 "claude-sonnet-4-20250514"
  provider: string    // 提供商名称，如 "anthropic"
  description?: string
}
```

`ModelInfo` 是最简单的类型，用于在注册表中列出所有可用模型。`id` 是调用 API 时使用的模型标识，`provider` 用于路由到对应的 Provider 工厂。

### 4.2 内容块 — `ContentBlock`

```typescript
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string }
```

`LLMMessage` 的 `content` 字段可以是字符串或 `ContentBlock[]`。当消息包含图片时，必须使用数组形式。`ContentBlock` 使用**可辨识联合类型**（Discriminated Union），通过 `type` 字段区分不同的内容类型。

### 4.3 工具调用 — `ToolCall`

```typescript
export interface ToolCall {
  id: string
  name: string
  args: unknown
}
```

当 LLM 决定调用一个工具时，返回 `ToolCall` 对象。`id` 用于关联工具调用和工具结果，`name` 是工具名称，`args` 是工具参数（JSON 格式）。

### 4.4 统一消息格式 — `LLMMessage`

```typescript
export type LLMMessage =
  | { role: 'user'; content: string | ContentBlock[] }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'toolResult'; toolCallId: string; content: string; isError?: boolean }
```

`LLMMessage` 是发给 LLM 的消息格式，只有三种角色：

- **user** — 用户消息
- **assistant** — 助手回复（可包含工具调用）
- **toolResult** — 工具执行结果

> 为什么没有 system 角色？因为 system prompt 放在 `ModelContext.systemPrompt` 中，由 Provider 在构建请求体时处理。不同提供商对 system prompt 的处理方式不同（Anthropic 用独立的 `system` 字段，OpenAI 用 `messages` 数组中的 `system` 角色），统一在 Provider 内部消化。

### 4.5 流式事件 — `LLMEvent`

```typescript
export type LLMEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start'; id: string; name: string; args: unknown }
  | { type: 'tool_call_delta'; id: string; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'error'; message: string }
  | { type: 'done'; stopReason?: 'end_turn' | 'tool_use' | 'stop_sequence' }
```

`LLMEvent` 是 AI 层最核心的类型之一，它将不同 LLM 提供商的流式事件统一为六种类型：

| 事件类型 | 含义 | 对应 Provider 事件 |
|---------|------|-------------------|
| `text_delta` | 文本增量 | Anthropic 的 `content_block_delta.text_delta`，OpenAI 的 `choices[0].delta.content` |
| `tool_call_start` | 工具调用开始 | Anthropic 的 `content_block_start.tool_use`，OpenAI 的 `choices[0].delta.tool_calls[0]` |
| `tool_call_delta` | 工具参数增量 | Anthropic 的 `content_block_delta.input_json_delta`，OpenAI 第二个及之后的 `tool_calls` chunk |
| `thinking_delta` | 思考过程增量 | Anthropic 的 `content_block_delta.thinking_delta` |
| `error` | 错误信息 | 各 Provider 的 `error` 事件或 HTTP 错误 |
| `done` | 流结束 | Anthropic 的 `message_stop`，OpenAI 的 `finish_reason` |

### 4.6 Agent 内部消息格式 — `AgentMessage`

```typescript
export type AgentMessageRole = 'user' | 'assistant' | 'toolResult' | 'notification' | 'thinking'

export interface AgentMessage {
  id: string
  parentId: string | null
  role: AgentMessageRole
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  isError?: boolean
  createdAt: number
}
```

`AgentMessage` 是 Agent 内部流转的消息格式，比 `LLMMessage` 多了：

- **notification** 角色 — 系统通知消息（如"正在执行工具 X"），这些消息不需要发给 LLM
- **thinking** 角色 — Agent 的思考过程，只在 UI 展示，不发给 LLM
- **id / parentId** — 消息 ID 和父消息 ID，用于构建消息树
- **createdAt** — 时间戳

> 为什么 `LLMMessage` 和 `AgentMessage` 要分开？因为职责不同。`LLMMessage` 是**传输格式**，只包含 LLM 需要看到的内容；`AgentMessage` 是**内部存储格式**，包含 UI 展示所需的所有信息。发送给 LLM 之前，`notification` 和 `thinking` 类型的消息会被过滤掉。

### 4.7 模型上下文 — `ModelContext`

```typescript
export interface ModelContext {
  systemPrompt: string
  messages: LLMMessage[]
  tools?: ModelTool[]
  thinking?: {
    type: 'enabled'
    budgetTokens: number
  }
}

export interface ModelTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}
```

`ModelContext` 是调用 LLM 时需要提供的完整上下文，包含系统提示词、消息历史、工具定义和思考预算。Provider 根据这些信息构建 API 请求体。

### 4.8 Provider 配置和工厂 — `ProviderConfig` / `ProviderFactory`

```typescript
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  [key: string]: unknown
}

export interface ProviderFactory {
  create(config: ProviderConfig): {
    name: string
    listModels(): ModelInfo[]
    createModel(modelId: string): Model | null
  }
}
```

`ProviderFactory` 是**策略模式**的抽象接口，每个 LLM 提供商实现这个接口。`create()` 方法接收配置，返回一个包含 `listModels()` 和 `createModel()` 方法的对象。

### 4.9 Model 抽象接口

```typescript
export interface Model {
  id: string
  provider: string
  stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent>
  supportsTools(): boolean
  supportsThinking(): boolean
}
```

`Model` 是所有 LLM 模型都要实现的接口，核心方法是 `stream()`，它返回 `AsyncIterable<LLMEvent>`，让调用方可以用 `for await...of` 消费流式事件。

## 5. 运行与验证

查看类型定义文件：

```bash
# 查看 types.ts 的完整内容
cat src/ai/types.ts

# 使用 TypeScript 编译器检查类型正确性
npx tsc --noEmit src/ai/types.ts
```

验证类型的使用方式：

```typescript
// 一个完整的 LLM 调用示例
import type { ModelContext, LLMEvent } from './types.js'

const context: ModelContext = {
  systemPrompt: '你是一个有帮助的助手',
  messages: [
    { role: 'user', content: '你好！' },
  ],
}

// 消费流式事件
async function consumeEvents(events: AsyncIterable<LLMEvent>) {
  for await (const event of events) {
    switch (event.type) {
      case 'text_delta':
        process.stdout.write(event.delta)
        break
      case 'tool_call_start':
        console.log(`\n[调用工具] ${event.name}`)
        break
      case 'done':
        console.log('\n[完成]')
        break
      case 'error':
        console.error(`\n[错误] ${event.message}`)
        break
    }
  }
}
```

## 6. 小结

本章介绍了 piagent AI 层的核心类型定义。这些类型是理解和扩展整个系统的基础，每个类型都有明确的职责边界：

- **LLMMessage** 是传输格式，只包含 LLM 能理解的内容
- **AgentMessage** 是存储格式，包含 UI 展示所需的信息
- **LLMEvent** 统一了不同提供商的流式事件格式
- **Model** 和 **ProviderFactory** 是策略模式的核心抽象

### 思考题

1. `AgentMessage` 中的 `parentId` 字段有什么作用？在什么场景下会用到它？
2. 如果 DeepSeek 也支持了 thinking 输出，`LLMEvent` 需要新增事件类型吗？为什么？
3. `ContentBlock` 中的 `tool_use` 和 `tool_result` 类型与 `ToolCall` 有什么关系和区别？