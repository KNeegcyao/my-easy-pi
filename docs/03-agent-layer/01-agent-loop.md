---
source: src/agent/loop.ts
last_updated: 2026-08-08
version: 1.0.0
---

# ⭐ Agent Loop 核心循环

> 这是整个 piagent 项目中最重要的文档。Agent Loop 是 Agent 的"心脏"，理解它你就理解了整个项目的一半。

## 1. 本节目标

- 理解 Agent 类的构造和属性设计
- 掌握 `prompt()` → `runLoop()` → `processLLMStream()` → `executeToolCalls()` 的完整流程
- 理解事件发射机制和钩子系统的作用
- 能够独立画出 Agent Loop 的完整流程图

## 2. 前置知识

在阅读本节前，请确保已了解：

- **AI 层核心类型**：Model、LLMMessage、ToolCall、LLMEvent、ModelContext
- **TypeScript 基础**：类、泛型、async/await、AsyncIterable（异步迭代器）
- **AgentTool 类型**：在 Tool 基础上添加了 `execute()` 方法
- **ToolRegistry**：工具注册表，管理工具的注册和查询

## 3. 核心概念

### 3.1 类比：餐厅的运作流程

Agent Loop 就像一家餐厅的运作流程：

| Agent 概念 | 餐厅类比 | 说明 |
|-----------|---------|------|
| 用户输入 | 顾客点单 | 用户说"帮我写一个排序算法" |
| LLM | 厨师长 | 思考需要哪些步骤，决定调用什么工具 |
| 工具调用 | 让帮厨切菜 | LLM 说"我需要先创建文件" |
| 工具执行 | 帮厨切菜 | 实际执行文件创建操作 |
| 工具结果 | 切好的菜 | 文件创建成功的结果 |
| 循环 | 继续烹饪 | 把结果给厨师长，看他是否还需要下一步 |
| Agent 完成 | 上菜 | 所有步骤完成，给出最终结果 |

### 3.2 核心循环流程

```
用户输入
    │
    ▼
┌─────────────────────┐
│  prompt()           │
│  - 创建用户消息     │
│  - 设置 streaming   │
│  - 发射 agent_start │
│  - 调用 runLoop()   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  runLoop()          │  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  (while true)       │                                                  │
│                     │                                                  │
│  1. 发射 turn_start │                                                  │
│  2. 转换上下文      │                                                  │
│  3. 转 LLM 消息格式 │                                                  │
│  4. 构建 context    │                                                  │
│  5. 调用 LLM 流     │                                                  │
│  6. 创建 assistant  │                                                  │
│     消息            │                                                  │
│                     │                                                  │
│  ┌─ 有 tool_call? ──┤                                                  │
│  │        │         │                                                  │
│  │  是    │  否     │                                                  │
│  │        │         │                                                  │
│  │        ▼         ▼                                                  │
│  │  executeTool     │                                                  │
│  │  Calls()         │ 检查队列                                         │
│  │        │         │    │                                             │
│  │        │         │ 有消息?  ─────────────────────────────────────────┘
│  │        │         │    │
│  │        │         │ 无消息
│  │        │         │    │
│  │        │         │    ▼
│  │        │         │  break (结束)
│  │        │         │
│  │        ▼         │
│  │  all terminate?  │
│  │    │      │      │
│  │  是    否 │      │
│  │    │      │      │
│  │    ▼      │      │
│  │  break    └──────┘
│  │          继续循环
│  └──────────────────
│
▼
┌─────────────────────┐
│  prompt() 收尾      │
│  - 发射 agent_end   │
│  - 设置 isStreaming │
│     = false          │
│  - 触发 idleResolve │
└─────────────────────┘
```

## 4. 代码实现

### 4.1 AgentLoopConfig — 配置接口

```typescript
// src/agent/loop.ts 第 25-38 行
export interface AgentLoopConfig {
  systemPrompt: string          // 系统提示词
  model: Model                  // LLM 模型实例
  tools: AgentTool[]            // 可用工具列表
  toolExecution?: 'parallel' | 'sequential'  // 工具执行模式（默认 parallel）

  // 可选：消息转换/压缩
  convertToLlm?: (messages: AgentMessage[]) => LLMMessage[]
  transformContext?: (messages: AgentMessage[]) => Promise<AgentMessage[]>

  // 钩子：在工具调用前后插入自定义逻辑
  beforeToolCall?: (ctx: ToolCallContext) => Promise<BlockResult | undefined>
  afterToolCall?: (ctx: ToolCallResultContext) => Promise<AfterToolCallResult | undefined>
}
```

`AgentLoopConfig` 是 Agent 的"配置清单"。你只需要提供系统提示词、模型和工具列表，Agent 就能自动运转。可选配置项（钩子、转换器）让你能插入自定义逻辑。

### 4.2 Agent 类 — 构造函数

```typescript
// src/agent/loop.ts 第 69-102 行
export class Agent {
  state: AgentState                           // 运行时状态（公开可读）
  toolExecution: 'parallel' | 'sequential'    // 工具执行模式
  private toolRegistry: ToolRegistry          // 工具注册表
  private queue: MessageQueue                 // 消息队列（steering/follow-up）
  private listeners: Set<AgentEventListener>  // 事件监听器集合
  private abortController: AbortController | null  // 取消控制器
  private idlePromise: Promise<void> | null    // 空闲等待 promise
  private idleResolve: (() => void) | null     // 空闲 promise 的 resolve
  private convertToLlmFn: ...                  // 消息转换函数
  private transformContextFn?: ...             // 上下文转换函数
  private beforeToolCallFn?: ...               // 工具调用前钩子
  private afterToolCallFn?: ...                // 工具调用后钩子

  constructor(config: AgentLoopConfig) {
    // 1. 创建工具注册表并注册所有工具
    this.toolRegistry = new ToolRegistry()
    for (const tool of config.tools) {
      this.toolRegistry.registerTool(tool)
    }

    // 2. 初始化状态
    this.state = createAgentState({
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
    })

    // 3. 设置执行模式和可选函数
    this.toolExecution = config.toolExecution || 'parallel'
    this.convertToLlmFn = config.convertToLlm || defaultConvertToLlm
    this.transformContextFn = config.transformContext
    this.beforeToolCallFn = config.beforeToolCall
    this.afterToolCallFn = config.afterToolCall
    this.queue = new MessageQueue()
  }
  // ...
}
```

**构造函数做了什么？**
1. 用 `ToolRegistry` 注册所有工具，后续通过工具名查找
2. 用 `createAgentState` 创建初始状态
3. 保存配置项，为可选函数提供默认值
4. 创建消息队列实例

### 4.3 prompt() — 完整入口

```typescript
// src/agent/loop.ts 第 123-161 行
async prompt(text: string): Promise<void> {
  // 如果已经在流式处理中，抛出错误
  if (this.state.isStreaming) {
    throw AGENT_ALREADY_STREAMING()
  }

  // 创建新的 AbortController
  this.abortController = new AbortController()

  // 创建用户消息对象（带 id、parentId、时间戳）
  const userMessage: AgentMessage = {
    id: generateId(),
    parentId: this.state.messages.length > 0
      ? this.state.messages[this.state.messages.length - 1].id
      : null,
    role: 'user',
    content: text,
    createdAt: Date.now(),
  }

  // 加入消息历史，标记为流式处理中
  this.state.messages.push(userMessage)
  this.state.isStreaming = true

  // 创建 idle promise（waitForIdle 会等待这个 promise）
  this.idlePromise = new Promise((resolve) => {
    this.idleResolve = resolve
  })

  try {
    // 发射 agent_start 事件
    await this.emit({ type: 'agent_start' })
    // 进入核心循环
    await this.runLoop([userMessage])
    // 发射 agent_end 事件（携带最终消息列表）
    await this.emit({
      type: 'agent_end',
      messages: [...this.state.messages],
    })
  } finally {
    // 无论如何，结束时清除流式状态
    this.state.isStreaming = false
    this.idleResolve?.()
  }
}
```

**关键点：**
- `prompt()` 是 Agent 的**唯一公开入口**，外部调用者只需调用 `agent.prompt("你好")`
- 使用 `isStreaming` 标志防止并发调用
- `finally` 块确保无论如何都会清理状态，避免"死锁"
- `agent_end` 事件携带 `[...this.state.messages]` 的副本，外部可以拿到完整消息历史

### 4.4 runLoop() — 核心循环逻辑

这是整个 Agent 最核心的方法，实现了"思考-行动-观察"循环：

```typescript
// src/agent/loop.ts 第 164-257 行
private async runLoop(newMessages: AgentMessage[]): Promise<void> {
  let turnMessages = newMessages

  while (true) {
    // ── 步骤 1: 发射 turn_start 事件 ──
    await this.emit({ type: 'turn_start' })

    // ── 步骤 2: 可选地转换/压缩上下文 ──
    if (this.transformContextFn) {
      this.state.messages = await this.transformContextFn(this.state.messages)
    }

    // ── 步骤 3: 将 Agent 消息转为 LLM 消息格式 ──
    const llmMessages = this.convertToLlmFn(this.state.messages)

    // ── 步骤 4: 构建 LLM 上下文 ──
    const context: ModelContext = {
      systemPrompt: this.state.systemPrompt,
      messages: llmMessages,
      tools: this.state.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Record<string, unknown>,
      })),
    }

    // ── 步骤 5: 调用 LLM 并处理流式响应 ──
    const { content, toolCalls } = await this.processLLMStream(context)

    // ── 步骤 6: 创建 assistant 消息 ──
    const assistantMessage: AgentMessage = {
      id: generateId(),
      parentId: this.state.messages[this.state.messages.length - 1]?.id || null,
      role: 'assistant',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      createdAt: Date.now(),
    }
    this.state.messages.push(assistantMessage)
    await this.emit({ type: 'message_end', message: assistantMessage })

    // ── 步骤 7: 判断是否有工具调用 ──
    if (toolCalls.length === 0) {
      // 没有工具调用 → 这一轮 LLM 直接回答了
      await this.emit({
        type: 'turn_end',
        message: assistantMessage,
        toolResults: [],
      })

      // 检查队列中是否有待处理消息
      const nextMsg = this.queue.next()
      if (nextMsg) {
        this.state.messages.push(nextMsg)
        continue  // 有队列消息 → 继续下一轮
      }

      break  // 队列为空 → 结束循环
    }

    // ── 步骤 8: 执行工具调用 ──
    const toolResults = await this.executeToolCalls(toolCalls)

    await this.emit({
      type: 'turn_end',
      message: assistantMessage,
      toolResults: toolResults.map(r => ({
        content: [{ type: 'text' as const, text: r.content }],
        terminate: r.terminate,
      })),
    })

    // ── 步骤 9: 检查是否所有工具都标记 terminate ──
    const allTerminate = toolResults.every(r => r.terminate)
    if (allTerminate) break

    // ── 步骤 10: 将 toolResult 加入消息列表，继续下一轮 ──
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i]
      const result = toolResults[i]
      this.state.messages.push({
        id: generateId(),
        parentId: assistantMessage.id,
        role: 'toolResult',
        content: result.content,
        toolCallId: tc.id,
        isError: result.isError,
        createdAt: Date.now(),
      })
    }

    turnMessages = []
  }
}
```

**循环退出条件（三种）：**
1. LLM 没有调用工具，且消息队列为空 → 正常结束
2. LLM 没有调用工具，但队列有消息 → 注入队列消息，继续循环
3. 所有工具执行后都返回 `terminate: true` → 主动终止

### 4.5 processLLMStream() — 流式响应处理

```typescript
// src/agent/loop.ts 第 261-343 行
private async processLLMStream(context: ModelContext): Promise<{
  content: string
  toolCalls: ToolCall[]
}> {
  let content = ''                          // 累积文本内容
  const toolCalls: ToolCall[] = []          // 收集工具调用
  let currentToolCall: Partial<ToolCall> | null = null  // 当前正在构造的工具调用
  let toolCallArgs = ''                     // 工具调用参数（JSON 字符串）

  const streamOptions: StreamOptions = {
    signal: this.abortController?.signal,   // 可取消
  }

  // 使用 for-await-of 遍历 LLM 的异步事件流
  for await (const event of this.state.model.stream(context, streamOptions)) {
    switch (event.type) {
      case 'text_delta':
        // LLM 返回了一段文本增量
        content += event.delta
        // 实时通知订阅者
        await this.emit({
          type: 'message_update',
          message: { content },
        })
        break

      case 'tool_call_start':
        // LLM 开始调用一个工具
        currentToolCall = { id: event.id, name: event.name }
        toolCallArgs = ''
        // 非流式工具调用（如 Anthropic 的 tool_use）直接有完整 args
        if (event.args && typeof event.args === 'object' && Object.keys(event.args).length > 0) {
          toolCalls.push({
            id: event.id,
            name: event.name,
            args: event.args,
          })
          currentToolCall = null
        }
        break

      case 'tool_call_delta':
        // 流式工具调用参数（如 OpenAI 的流式 tool_calls）
        toolCallArgs += event.delta
        break

      case 'thinking_delta':
        // LLM 的思考过程（暂时忽略，可扩展为特殊事件）
        break

      case 'error':
        // LLM 调用出错
        this.state.errorMessage = event.message
        await this.emit({
          type: 'message_update',
          message: { content: `错误: ${event.message}` },
        })
        break

      case 'done':
        // LLM 流结束，处理未完成的工具调用
        if (currentToolCall && toolCallArgs) {
          try {
            const parsed = JSON.parse(toolCallArgs)
            toolCalls.push({
              id: currentToolCall.id!,
              name: currentToolCall.name!,
              args: parsed,
            })
          } catch {
            // JSON 解析失败则保存原始字符串
            toolCalls.push({
              id: currentToolCall.id!,
              name: currentToolCall.name!,
              args: toolCallArgs,
            })
          }
          currentToolCall = null
          toolCallArgs = ''
        }
        break
    }
  }

  return { content, toolCalls }
}
```

**关键设计：**
- 使用 `AsyncIterable`（异步迭代器）处理流式响应，兼容所有 LLM 提供商
- `text_delta` 实时发射 `message_update` 事件，让 UI 可以实现打字机效果
- 工具调用支持两种模式：**非流式**（Anthropic 风格，直接带完整 args）和**流式**（OpenAI 风格，逐步拼接 JSON）
- `done` 事件处理未完成的流式工具调用，进行 JSON 解析

### 4.6 executeToolCalls() — 工具执行引擎

```typescript
// src/agent/loop.ts 第 346-450 行
private async executeToolCalls(toolCalls: ToolCall[]): Promise<AgentToolResult[]> {
  // ── 阶段 1: 预检 — 调用 beforeToolCall 钩子 ──
  for (const tc of toolCalls) {
    if (this.beforeToolCallFn) {
      const blockResult = await this.beforeToolCallFn({
        toolCall: tc,
        args: tc.args as Record<string, unknown>,
        messages: [...this.state.messages],
      })

      if (blockResult?.block) {
        // 工具被阻止 → 创建一个 toolResult 标记为错误
        this.state.messages.push({
          id: generateId(),
          parentId: this.state.messages[this.state.messages.length - 1]?.id || null,
          role: 'toolResult',
          content: blockResult.reason || '工具调用被阻止',
          toolCallId: tc.id,
          isError: true,
          createdAt: Date.now(),
        })
        continue
      }
    }
    // 注册 pending tool call（用于外部查询）
    this.state.pendingToolCalls.add(tc.id)
  }

  // ── 阶段 2: 执行 — 逐个执行工具调用 ──
  const results: AgentToolResult[] = []

  for (const tc of toolCalls) {
    // 从注册表查找工具
    const tool = this.toolRegistry.getTool(tc.name)
    if (!tool) {
      // 工具不存在 → 返回错误结果
      const err = TOOL_NOT_FOUND(tc.name)
      results.push({
        content: `${err.message}${err.suggestion ? ` — ${err.suggestion}` : ''}`,
        isError: true,
        terminate: false,
      })
      this.state.pendingToolCalls.delete(tc.id)
      continue
    }

    try {
      // 发射 tool_execution_start 事件
      await this.emit({
        type: 'tool_execution_start',
        toolCallId: tc.id,
        toolName: tc.name,
        args: tc.args,
      })

      // 执行工具（传入 AbortSignal 支持取消）
      const result = await tool.execute(
        tc.id,
        tc.args as Record<string, unknown>,
        this.abortController?.signal || new AbortController().signal,
      )

      // 提取文本内容
      const textContent = result.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map(c => c.text)
        .join('\n')

      results.push({
        content: textContent,
        isError: false,
        terminate: result.terminate || false,
      })

      // 发射 tool_execution_end 事件
      await this.emit({
        type: 'tool_execution_end',
        toolCallId: tc.id,
        result,
      })
    } catch (error) {
      // 工具执行异常 → 捕获并返回错误
      const errorMsg = error instanceof Error ? error.message : String(error)
      results.push({
        content: errorMsg,
        isError: true,
        terminate: false,
      })
    }

    this.state.pendingToolCalls.delete(tc.id)
  }

  // ── 阶段 3: 后处理 — 调用 afterToolCall 钩子 ──
  for (let i = 0; i < toolCalls.length; i++) {
    if (this.afterToolCallFn) {
      const afterResult = await this.afterToolCallFn({
        toolCall: toolCalls[i],
        result: results[i],
        messages: [...this.state.messages],
      })

      if (afterResult?.terminate) {
        results[i].terminate = true
      }
    }
  }

  return results
}
```

**三阶段执行模型：**
1. **预检阶段**：`beforeToolCall` 钩子可以阻止工具执行（如权限系统检查）
2. **执行阶段**：逐个执行工具，每个结果包含 `content`、`isError`、`terminate`
3. **后处理阶段**：`afterToolCall` 钩子可以修改结果（如设置 terminate）

### 4.7 事件发射机制

```typescript
// src/agent/loop.ts 第 105-120 行
/** 订阅 Agent 事件 */
subscribe(listener: AgentEventListener): () => void {
  this.listeners.add(listener)
  return () => this.listeners.delete(listener)
}

/** 触发事件（通知所有订阅者） */
private async emit(event: AgentEvent): Promise<void> {
  const signal = new AbortController().signal
  for (const listener of this.listeners) {
    try {
      await listener(event, signal)
    } catch {
      // 单个监听器出错不影响其他监听器
    }
  }
}
```

**设计要点：**
- `subscribe` 返回一个取消订阅函数，方便在 React 的 `useEffect` 中清理
- `emit` 是异步的，会等待所有监听器完成
- 单个监听器的异常被捕获，不会影响其他监听器
- 使用 `Set<AgentEventListener>` 存储，防止重复订阅

### 4.8 钩子系统

两个钩子提供了"切面编程"能力：

```typescript
// beforeToolCall: 在工具执行前调用，可以阻止执行
beforeToolCall?: (ctx: ToolCallContext) => Promise<BlockResult | undefined>

// afterToolCall: 在工具执行后调用，可以修改终止行为
afterToolCall?: (ctx: ToolCallResultContext) => Promise<AfterToolCallResult | undefined>
```

**钩子的典型用途：**
- `beforeToolCall` → 权限检查、命令审计、日志记录
- `afterToolCall` → 结果分析、自动终止条件判断

### 4.9 辅助方法

```typescript
// src/agent/loop.ts 第 452-496 行

/** 等待当前操作完成 */
async waitForIdle(): Promise<void> {
  if (!this.state.isStreaming) return
  await this.idlePromise
}

/** 取消当前操作 */
abort(): void {
  this.abortController?.abort()
  this.state.isStreaming = false
}

/** 重置状态 */
reset(): void {
  this.state.messages = []
  this.state.errorMessage = undefined
  this.state.isStreaming = false
  this.state.pendingToolCalls.clear()
  this.abortController = null
  this.queue.clearAll()
}

// ── 队列方法 ──
steer(message: string): void { this.queue.steer(message) }
followUp(message: string): void { this.queue.followUp(message) }
clearSteeringQueue(): void { this.queue.clearSteering() }
clearFollowUpQueue(): void { this.queue.clearFollowUp() }
clearAllQueues(): void { this.queue.clearAll() }
```

### 4.10 默认消息转换函数

```typescript
// src/agent/loop.ts 第 505-527 行
function defaultConvertToLlm(messages: AgentMessage[]): LLMMessage[] {
  return messages
    // 过滤掉 UI 类型消息（notification、thinking）
    .filter(m => m.role !== 'notification' && m.role !== 'thinking')
    .map(m => {
      if (m.role === 'user') {
        return { role: 'user', content: m.content }
      }
      if (m.role === 'assistant') {
        return {
          role: 'assistant',
          content: m.content,
          toolCalls: m.toolCalls,
        }
      }
      // toolResult
      return {
        role: 'toolResult',
        toolCallId: m.toolCallId!,
        content: m.content,
        isError: m.isError,
      }
    })
}
```

AgentMessage 有 5 种角色（`user`、`assistant`、`toolResult`、`notification`、`thinking`），但 LLM 只认识 3 种（`user`、`assistant`、`toolResult`）。这个函数负责过滤和转换。

## 5. 运行与验证

### 5.1 基本使用

```typescript
import { Agent } from './src/agent/index.js'
import { createModel } from './src/ai/index.js'

// 1. 创建模型
const model = createModel('deepseek', { apiKey: 'sk-xxx' })

// 2. 创建 Agent
const agent = new Agent({
  systemPrompt: '你是一个有用的助手。',
  model,
  tools: [],  // 后续章节会添加工具
})

// 3. 订阅事件
agent.subscribe((event) => {
  if (event.type === 'message_update') {
    process.stdout.write(event.message.content)
  }
})

// 4. 发送消息
await agent.prompt('你好！请介绍一下你自己。')

// 5. 等待完成
await agent.waitForIdle()
```

### 5.2 验证事件流

运行以下代码观察事件发射顺序：

```typescript
agent.subscribe((event) => {
  console.log('[事件]', event.type)
})

await agent.prompt('1+1=?')
// 输出顺序应为:
// [事件] agent_start
// [事件] turn_start
// [事件] message_update (多次)
// [事件] message_end
// [事件] turn_end
// [事件] agent_end
```

### 5.3 测试钩子

```typescript
const agent = new Agent({
  systemPrompt: '你是一个助手。',
  model,
  tools: [myTool],
  beforeToolCall: async (ctx) => {
    console.log(`准备调用工具: ${ctx.toolCall.name}`)
    return undefined  // 不阻止
  },
  afterToolCall: async (ctx) => {
    console.log(`工具结果: ${ctx.result.content}`)
    return undefined
  },
})
```

### 4.11 状态变化一览表

以下是 `AgentState` 每个字段在 Agent 生命周期各阶段的值变化。理解这张表，你就理解了 Agent 的"状态机"本质。

| 字段 | 初始值 (new Agent) | prompt() 开始 | runLoop 循环中 | prompt() 结束 | reset() 后 |
|------|--------------------|---------------|---------------|-------------|----------|
| `systemPrompt` | 构造函数传入值 | 不变 | 不变 | 不变 | 不变 |
| `model` | 构造函数传入值 | 不变 | 不变 | 不变 | 不变 |
| `thinkingLevel` | `'off'` 或构造函数传入值 | 不变 | 不变 | 不变 | 不变 |
| `tools` | 构造函数传入的工具列表 | 不变 | 不变 | 不变 | 不变 |
| `messages` | `[]` (空数组) | `[userMessage]` | 持续追加 user→assistant→toolResult... | 完整消息历史 | `[]` 清空 |
| `isStreaming` | `false` | `true` | `true` | `false` | `false` |
| `streamingMessage` | `undefined` | `undefined` | 当前正在构建的 assistant 消息 | `undefined` | `undefined` |
| `pendingToolCalls` | `Set{}` (空) | `Set{}` | 正在执行的 toolCall.id 集合 | `Set{}` | `Set{}` 清空 |
| `errorMessage` | `undefined` | `undefined` | 遇 LLM 错误时置为错误文本 | `undefined` (未清除!) | `undefined` 清空 |

**变化规律总结：**

- **只读字段**：`systemPrompt`、`model`、`thinkingLevel`、`tools` 在构造函数中确定后不再改变 —— 它们定义 Agent 的"身份"和"能力边界"
- **增长字段**：`messages` 只增不减（除非调用 `reset()`），每轮循环追加 user → assistant → toolResult 消息链
- **开关字段**：`isStreaming` 像一把"互斥锁"，在 `prompt()` 入口上锁、出口释放，防止并发调用
- **临时字段**：`streamingMessage` 和 `pendingToolCalls` 只在循环中短暂存在，任务结束后自动清理
- **错误字段**：`errorMessage` 在遇到 LLM 流错误时设置，但 `prompt()` 结束**不会自动清除**——这是刻意设计的，让外部在 `agent_end` 事件中可以读取到错误信息

## 6. 小结

### 学到的核心概念

1. **Agent Loop 是 Agent 的中枢神经系统**，它驱动了"思考-行动-观察"的完整循环
2. **`prompt()` 是唯一入口**，`runLoop()` 是核心循环，`processLLMStream()` 处理流式 LLM 响应，`executeToolCalls()` 执行工具
3. **事件机制**让 Agent 的运行过程完全透明，UI 可以实时展示进度
4. **钩子系统**提供了非侵入式扩展点，权限系统就是通过 `beforeToolCall` 实现的
5. **三种循环退出条件**确保 Agent 不会无限循环

### 思考题

1. 如果 LLM 连续 10 轮都调用工具（从未直接回答），会发生什么？现有的代码能处理这种情况吗？
2. `processLLMStream()` 中的 `thinking_delta` 事件目前被忽略了。如果要支持"显示 LLM 思考过程"的功能，应该怎么改？
3. 现有代码中 `toolExecution` 配置了 `'parallel'` 但实际执行时是逐个串行的。如果要改成真正的并行执行，需要注意哪些问题？
4. `beforeToolCall` 钩子可以阻止工具执行。如果 `beforeToolCall` 也抛出了异常，当前的错误处理机制是否足够健壮？

> ← [上一节](./README.md) · [下一节](./02-state-management.md) →
>
> [📚 返回章节首页](../03-agent-layer/README.md)