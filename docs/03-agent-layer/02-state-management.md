---
source: src/agent/state.ts
last_updated: 2026-08-08
version: 1.0.0
---

# 状态管理

> AgentState 是 Agent 的"仪表盘"，记录了 Agent 运行时的所有关键信息。

## 1. 本节目标

- 理解 AgentState 接口的每个字段的含义
- 掌握 `createAgentState` 工厂函数的使用
- 理解 `generateId` 的工作原理
- 了解状态在整个 Agent 生命周期中的流转

## 2. 前置知识

- 了解 Agent Loop 的基本流程（见 [01-agent-loop.md](01-agent-loop.md)）
- 了解 AI 层的 Model、AgentMessage 类型
- 了解 AgentTool 类型

## 3. 核心概念

### 3.1 类比：飞机的仪表盘

AgentState 就像飞机的仪表盘：

| 状态字段 | 仪表盘类比 | 说明 |
|---------|-----------|------|
| `systemPrompt` | 飞行计划 | 定义了 Agent 的"性格"和行为准则 |
| `model` | 发动机 | 当前使用的 LLM 模型 |
| `messages` | 飞行日志 | 记录了所有对话和工具调用的历史 |
| `isStreaming` | 飞行中指示灯 | 正在处理中的标志 |
| `pendingToolCalls` | 待办任务清单 | 正在执行但未完成的工具调用 |
| `errorMessage` | 警告灯 | 发生错误时的提示信息 |
| `thinkingLevel` | 思考深度档位 | 控制 LLM 的思考深度 |

### 3.2 状态的生命周期

```mermaid
flowchart TD
    A[创建 Agent] --> B[createAgentState<br/>初始状态<br/>messages: [], isStreaming: false]
    B --> C[agent.prompt<br/>isStreaming = true<br/>messages 追加用户消息]
    C --> D[runLoop 循环<br/>messages 不断追加 assistant/toolResult 消息<br/>pendingToolCalls 增删]
    D --> E[prompt 结束<br/>isStreaming = false]
    E --> F[agent.reset<br/>回到初始状态<br/>清空所有]
```

## 4. 代码实现

### 4.1 AgentState 接口

```typescript
// src/agent/state.ts 第 15-25 行
export interface AgentState {
  systemPrompt: string           // 系统提示词 — Agent 的行为准则
  model: Model                   // 当前使用的 LLM 模型实例
  thinkingLevel: ThinkingLevel   // 思考级别: 'off' | 'low' | 'medium' | 'high'
  tools: AgentTool[]             // 已注册的工具列表
  messages: AgentMessage[]       // 消息历史（对话 + 工具调用）
  isStreaming: boolean           // 是否正在流式处理中
  streamingMessage?: AgentMessage  // 当前正在流式输出的消息（可选）
  pendingToolCalls: Set<string>  // 待完成的工具调用 ID 集合
  errorMessage?: string          // 错误信息（可选）
}
```

**字段详解：**

| 字段 | 类型 | 用途 | 谁修改 |
|------|------|------|--------|
| `systemPrompt` | `string` | Agent 的"人格设定"，由构造时传入，运行时不变 | 构造时设置 |
| `model` | `Model` | LLM 模型实例，所有 LLM 调用都通过它 | 构造时设置 |
| `thinkingLevel` | `ThinkingLevel` | 控制 LLM 的思考深度，影响 `budgetTokens` | 可运行时修改 |
| `tools` | `AgentTool[]` | 已注册的工具列表，传给 LLM 的 tool 定义 | 构造时设置 |
| `messages` | `AgentMessage[]` | 完整的消息历史，是 Agent 的"记忆" | 每次循环追加 |
| `isStreaming` | `boolean` | 并发控制锁，防止重复调用 `prompt()` | `prompt()` 开始/结束 |
| `streamingMessage` | `AgentMessage?` | 当前正在流式输出的消息，UI 层可据此更新 | LLM 流式过程中 |
| `pendingToolCalls` | `Set<string>` | 正在执行的工具 ID，用于外部查询状态 | 工具执行前后 |
| `errorMessage` | `string?` | LLM 出错时的错误信息 | `processLLMStream()` |

### 4.2 createAgentState — 工厂函数

```typescript
// src/agent/state.ts 第 28-44 行
/** 创建一个初始的 Agent 状态 */
export function createAgentState(config: {
  systemPrompt: string
  model: Model
  thinkingLevel?: ThinkingLevel
  tools?: AgentTool[]
  messages?: AgentMessage[]
}): AgentState {
  return {
    systemPrompt: config.systemPrompt,
    model: config.model,
    thinkingLevel: config.thinkingLevel || 'off',  // 默认关闭思考模式
    tools: config.tools || [],
    messages: config.messages || [],
    isStreaming: false,           // 初始不在流式处理中
    pendingToolCalls: new Set(),  // 初始无待办工具调用
  }
}
```

**为什么使用工厂函数而不是直接 `new AgentState()`？**
1. **提供默认值**：`thinkingLevel` 默认为 `'off'`，`tools` 和 `messages` 默认为空数组
2. **隐藏实现细节**：`AgentState` 是一个接口（interface），不是类，不能被实例化
3. **集中初始化逻辑**：所有字段的默认值在一个地方管理

### 4.3 generateId — ID 生成器

```typescript
// src/agent/state.ts 第 47-49 行
let counter = 0
export function generateId(): string {
  return `msg-${Date.now()}-${++counter}`
}
```

**设计要点：**
- 使用 `msg-` 前缀，方便在日志中区分消息 ID 和其他 ID
- `Date.now()` 提供时间戳，确保跨毫秒的唯一性
- 模块级 `counter` 变量确保同一毫秒内的消息也有唯一 ID
- 计数器从 1 开始（`++counter`），避免与初始值 0 混淆

**为什么不用 UUID/Crypto.randomUUID？**
- 更简洁，生成的 ID 也足够唯一
- 带时间戳的 ID 天然有序，方便调试时按时间排序
- 避免额外依赖

### 4.4 状态在 Agent 中的使用

状态在 Agent 类的各个方法中流转：

```typescript
// prompt() 中 — 修改流式状态
this.state.messages.push(userMessage)    // 追加用户消息
this.state.isStreaming = true             // 标记为流式处理中

// runLoop() 中 — 修改消息历史
this.state.messages = await this.transformContextFn(this.state.messages)  // 压缩上下文
this.state.messages.push(assistantMessage)  // 追加 assistant 消息
this.state.messages.push(toolResultMessage) // 追加工具结果消息

// processLLMStream() 中 — 记录错误
this.state.errorMessage = event.message    // 记录 LLM 错误

// executeToolCalls() 中 — 管理待办集合
this.state.pendingToolCalls.add(tc.id)     // 添加待办
this.state.pendingToolCalls.delete(tc.id)  // 完成待办

// prompt() finally 中 — 清理
this.state.isStreaming = false             // 标记为已完成

// reset() 中 — 完全重置
this.state.messages = []                   // 清空消息
this.state.errorMessage = undefined        // 清空错误
this.state.isStreaming = false             // 重置流式状态
this.state.pendingToolCalls.clear()        // 清空待办
```

## 5. 运行与验证

### 5.1 观察状态变化

```typescript
import { createAgentState, generateId } from './src/agent/state.js'

// 创建初始状态
const state = createAgentState({
  systemPrompt: '你是一个助手。',
  model: myModel,
  tools: [myTool],
})

console.log(state.isStreaming)  // false
console.log(state.messages)     // []

// 模拟添加消息
state.messages.push({
  id: generateId(),
  parentId: null,
  role: 'user',
  content: '你好',
  createdAt: Date.now(),
})

console.log(state.messages.length)  // 1
console.log(state.messages[0].id)   // msg-1700000000000-1
```

### 5.2 验证 ID 唯一性

```typescript
const ids = new Set<string>()
for (let i = 0; i < 1000; i++) {
  ids.add(generateId())
}
console.log(ids.size)  // 1000（无重复）
```

## 6. 小结

### 学到的核心概念

1. **AgentState 是 Agent 的"仪表盘"**，集中管理所有运行时状态
2. **工厂函数模式**提供默认值，方便初始化
3. **`generateId`** 使用时间戳+计数器，简洁高效
4. **状态贯穿 Agent 整个生命周期**，从创建到重置

### 思考题

1. `messages` 数组会随着对话不断增长，如果用户进行了 100 轮对话，消息数组会包含 300+ 条消息。这样会不会导致内存问题？应该怎么解决？
2. `pendingToolCalls` 是一个 `Set<string>`，如果某个工具调用被 `beforeToolCall` 阻止了，它的 ID 是否会被加入这个集合？查看 `executeToolCalls()` 的代码来分析。
3. 如果要在 Agent 运行时动态修改 `thinkingLevel`，应该怎么做？需要注意什么？
4. `generateId` 使用了模块级计数器，如果多个 Agent 实例共享同一个模块，ID 会不会冲突？

> ← [上一节](./01-agent-loop.md) · [下一节](./03-message-queue.md) →
>
> [📚 返回章节首页](../03-agent-layer/README.md)