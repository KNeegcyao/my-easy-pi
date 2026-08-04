# 简易 Pi Agent 架构设计

> 本架构参考 [earendil-works/pi](https://github.com/earendil-works/pi) 的设计哲学与代码结构提炼而成，适合作为开发简易 AI Coding Agent 的蓝本。

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [分层架构详解](#2-分层架构详解)
   - [2.1 AI 层 — pi-ai](#21-ai-层--pi-ai)
   - [2.2 Agent 层 — pi-agent-core](#22-agent-层--pi-agent-core)
   - [2.3 工具层 — pi-tools](#23-工具层--pi-tools)
   - [2.4 会话层 — pi-session](#24-会话层--pi-session)
   - [2.5 扩展层 — pi-extension](#25-扩展层--pi-extension)
   - [2.6 接口层 — pi-interface](#26-接口层--pi-interface)
3. [核心数据流](#3-核心数据流)
4. [关键接口定义](#4-关键接口定义)
5. [开发路线图](#5-开发路线图)

---

## 1. 整体架构概览

```
┌══════════════════════════════════════════════════════════════┐
║                    用户界面层 (Interface)                      ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ║
║  │ TUI 终端  │  │ Print    │  │ JSON     │  │ RPC (stdin/  │  ║
║  │ 交互界面  │  │ 单次输出  │  │ 事件流    │  │ stdout 协议)  │  ║
║  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  ║
╚═══════╪══════════════╪═════════════╪═══════════════╪══════════╝
        │              │             │               │
        └──────────────┴──────┬──────┴───────────────┘
                              │  AgentMessage 事件流
                              ▼
┌══════════════════════════════════════════════════════════════┐
║                   Agent 运行时 (Agent Core)                    ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐  ║
║  │                   Agent Loop (核心循环)                   │  ║
║  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │  ║
║  │  │ 消息队列   │  │ 上下文    │  │ Tool     │  │ 事件   │  │  ║
║  │  │ Steering │  │ 转换/    │  │ 执行引擎  │  │ 发射器  │  │  ║
║  │  │ Followup │  │ 压缩     │  │ (并行/   │  │        │  │  ║
║  │  │          │  │          │  │ 串行)    │  │        │  │  ║
║  │  └──────────┘  └──────────┘  └──────────┘  └────────┘  │  ║
║  └─────────────────────────────────────────────────────────┘  ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐  ║
║  │                   Agent State                           │  ║
║  │  systemPrompt | model | tools | messages | isStreaming   │  ║
║  │  thinkingLevel | errorMessage | pendingToolCalls         │  ║
║  └─────────────────────────────────────────────────────────┘  ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐  ║
║  │               Hook 系统 (beforeToolCall/afterToolCall)   │  ║
║  └─────────────────────────────────────────────────────────┘  ║
╚══════════════════════════╦═══════════════════════════════════╝
                           ║
                           ║ convertToLlm() 消息转换
                           ▼
┌══════════════════════════════════════════════════════════════┐
║               LLM 提供者抽象层 (AI Layer)                      ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐  ║
║  │                    Model 抽象接口                        │  ║
║  │  stream(): AsyncIterable<LLMEvent>                      │  ║
║  └─────────────────────────────────────────────────────────┘  ║
║         ║                ║                ║                  ║
║    ┌────┴────┐     ┌────┴────┐     ┌────┴────┐             ║
║    │Anthropic│     │ OpenAI  │     │ DeepSeek│   ...        ║
║    │Provider │     │Provider │     │Provider │             ║
║    └─────────┘     └─────────┘     └─────────┘             ║
╚══════════════════════════════════════════════════════════════╝

┌══════════════════════════════════════════════════════════════┐
║                       扩展系统 (Extension)                     ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ║
║  │ 自定义工具  │  │ 自定义命令  │  │ 事件钩子   │  │ UI 自定义    │  ║
║  │ register  │  │ register  │  │ on('xxx')│  │ 主题/编辑器   │  ║
║  │ Tool()   │  │Command()  │  │          │  │             │  ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  ║
╚══════════════════════════════════════════════════════════════╝

┌══════════════════════════════════════════════════════════════┐
║                    基础设施层 (Infrastructure)                 ║
║  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐   ║
║  │ 会话存储      │  │ 配置管理     │  │ 容器化/沙箱 (可选)  │   ║
║  │ JSONL/文件系统 │  │ settings.json│  │ Docker/sandbox    │   ║
║  └─────────────┘  └─────────────┘  └────────────────────┘   ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 2. 分层架构详解

### 2.1 AI 层 — pi-ai

职责：屏蔽不同 LLM 提供商的 API 差异，提供统一调用接口。

```
┌────────────────────────────────────────────────────────┐
│                    ModelRegistry                        │
│  - providers: Map<string, ProviderFactory>              │
│  - setProvider(name, factory)                          │
│  - getModel(provider, modelId): Model | null           │
│  - listModels(provider?): ModelInfo[]                  │
└────────────────────────┬───────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
     ┌────────▼────────┐   ┌────────▼────────┐
     │ 创建 Provider     │   │  获取 Model      │
     └────────┬─────────┘   └────────┬─────────┘
              │                      │
              ▼                      ▼
     ┌──────────────────────────────────────────────┐
     │                  Model<T>                     │
     │  - id: string                                │
     │  - provider: string                          │
     │  - stream(context, options): AsyncStream     │
     │  - supportsTools(): boolean                  │
     │  - supportsThinking(): boolean               │
     └──────────────────────────────────────────────┘
```

#### 核心类型定义

```typescript
// ──── 统一消息格式 ────
type LLMMessage =
  | { role: 'user'; content: string | ContentBlock[] }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'toolResult'; toolCallId: string; content: string; isError?: boolean }

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string }

// ──── 流式事件 ────
type LLMEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start'; id: string; name: string; args: unknown }
  | { type: 'tool_call_delta'; id: string; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'error'; message: string }
  | { type: 'done'; stopReason?: 'end_turn' | 'tool_use' | 'stop_sequence' }

// ──── Provider 接口 ────
interface ProviderFactory {
  create(config: ProviderConfig): {
    name: string
    listModels(): ModelInfo[]
    createModel(modelId: string): Model
  }
}

interface Model {
  id: string
  provider: string
  stream(context: ModelContext, options: StreamOptions): AsyncIterable<LLMEvent>
  supportsTools(): boolean
  supportsThinking(): boolean
}
```

#### 消息转换规则

不同的 LLM 提供商对消息格式要求不同，需要做适配：

```
┌──────────────┐     convertToLlm()     ┌──────────────┐
│ AgentMessage │ ──────────────────────→ │  LLMMessage  │
│ - user       │    过滤+转换             │  - user      │
│ - assistant  │                        │  - assistant  │
│ - toolResult │                        │  - toolResult │
│ - notification│ → 过滤掉                │              │
│ - thinking   │ → 特殊处理              │              │
└──────────────┘                        └──────────────┘
```

**关键规则**：
- `notification`、`thinking` 等 UI 消息在发送给 LLM 前过滤掉
- 不同提供商的 tool_call 格式差异在 Provider 内部消化
- Google 的 `functionCall` → 转成标准 `tool_call` 格式
- 流式事件统一标准化

### 2.2 Agent 层 — pi-agent-core

职责：管理 Agent 的生命周期，驱动 LLM 调用和工具执行。

```
┌────────────────────────────────────────────────────────────┐
│                        Agent                                │
│                                                             │
│  属性:                                                     │
│  ├── state: AgentState                                     │
│  │   ├── systemPrompt: string                              │
│  │   ├── model: Model                                      │
│  │   ├── thinkingLevel: 'off' | 'low' | 'medium' | 'high'  │
│  │   ├── tools: AgentTool[]                                 │
│  │   ├── messages: AgentMessage[]                          │
│  │   ├── isStreaming: boolean                              │
│  │   ├── streamingMessage?: AgentMessage                   │
│  │   ├── pendingToolCalls: Set<string>                     │
│  │   └── errorMessage?: string                             │
│  │                                                         │
│  ├── steeringMode: 'one-at-a-time' | 'all'                 │
│  ├── followUpMode: 'one-at-a-time' | 'all'                 │
│  ├── toolExecution: 'parallel' | 'sequential'              │
│  ├── sessionId?: string                                    │
│  └── thinkingBudgets?: Record<string, number>               │
│                                                             │
│  方法:                                                     │
│  ├── prompt(text, images?)                                 │
│  ├── continue()                                            │
│  ├── steer(message)              ← 运行中插入指令           │
│  ├── followUp(message)           ← 任务完成后追加           │
│  ├── abort()                     ← 取消当前操作             │
│  ├── reset()                     ← 重置状态                 │
│  ├── waitForIdle()               ← 等待完成                 │
│  └── subscribe(listener)         ← 订阅事件                 │
│                                                             │
│  钩子:                                                     │
│  ├── beforeToolCall({toolCall, args, context})             │
│  └── afterToolCall({toolCall, result, isError, context})   │
└────────────────────────────────────────────────────────────┘
```

#### Agent Loop 执行流程

```
用户输入 prompt("帮我读 config.json")
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌→ agent_start (开始)                                           │
│  │                                                               │
│  ├→ turn_start (开始新一轮)                                      │
│  │  ├→ 将用户消息加入 messages                                    │
│  │  ├→ transformContext(messages)          ← 可自定义压缩/裁剪    │
│  │  ├→ convertToLlm(messages)              ← 过滤 UI 消息        │
│  │  ├→ model.stream(context, options)      ← 调用 LLM            │
│  │  │                                                             │
│  │  │ 循环接收流式事件:                                           │
│  │  │  ├→ message_start (assistant 开始回复)                     │
│  │  │  ├→ message_update (text_delta / tool_call_delta)          │
│  │  │  ├→ message_end   (assistant 回复完成)                     │
│  │  │                                                             │
│  │  ├→ 检查 assistant 是否有 tool_call                             │
│  │  │  ├→ 无: turn_end → agent_end (结束)                        │
│  │  │  └→ 有: 进入工具执行阶段                                    │
│  │  │                                                             │
│  │  ├→ 工具预检 (beforeToolCall 钩子)                              │
│  │  │  ├→ 遍历所有 tool_call                                       │
│  │  │  └→ 可阻止执行: return { block: true }                      │
│  │  │                                                             │
│  │  ├→ 工具执行 (并行/串行)                                        │
│  │  │  ├→ tool_execution_start                                     │
│  │  │  ├→ tool_execution_update (可选流式)                          │
│  │  │  └→ tool_execution_end                                       │
│  │  │                                                             │
│  │  ├→ 将 toolResult 加入 messages                                │
│  │  │                                                             │
│  │  ├→ afterToolCall 钩子 (可返回 terminate: true)                  │
│  │  │                                                             │
│  │  ├→ 检查是否所有工具都返回 terminate: true                        │
│  │  │  ├→ 是: turn_end → agent_end (提前结束)                     │
│  │  │  └→ 否:                                                     │
│  │  │      ├→ 检查 steering 队列 → 有则注入 → 继续下一轮            │
│  │  │      └→ 无 steering → 自动继续下一轮 (turn_start)            │
│  │  │         ├→ LLM 看到 toolResult → 产生最终回答                 │
│  │  │         └→ turn_end → agent_end                              │
│  │                                                                  │
│  └→ agent_end (结束)                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

#### 消息队列机制

```
┌──────────────────────────────────────────────────┐
│                  Agent 内部队列                     │
│                                                    │
│  Steering 队列 (高优先级)                          │
│  ┌─────┐  ┌─────┐  ┌─────┐                      │
│  │ msg │  │ msg │  │ msg │  ← 用户运行中输入      │
│  └─────┘  └─────┘  └─────┘                      │
│  注入时机: 当前 turn 的工具执行完后                  │
│                                                    │
│  Follow-up 队列 (低优先级)                         │
│  ┌─────┐  ┌─────┐                                 │
│  │ msg │  │ msg │  ← 用户想追加的任务               │
│  └─────┘  └─────┘                                 │
│  注入时机: 没有 tool_call 且 steering 队列为空时     │
└──────────────────────────────────────────────────┘

决策逻辑:
┌─ 当前 turn 结束 ─┐
│                   │
├→ 有 tool_call?    │
│  ├→ 是 → 执行工具 → 转下一轮
│  └→ 否 → 检查 steering 队列
│          ├→ 有 → 注入 → 转下一轮
│          └→ 无 → 检查 follow-up 队列
│                  ├→ 有 → 注入 → 转下一轮
│                  └→ 无 → agent_end
└───────────────────┘
```

### 2.3 工具层 — pi-tools

职责：定义工具的注册、发现和执行机制。

```
┌────────────────────────────────────────────────────────────┐
│                      ToolRegistry                           │
│  - tools: Map<string, AgentTool>                            │
│  - registerTool(tool)                                      │
│  - unregisterTool(name)                                    │
│  - getTool(name): AgentTool | undefined                    │
│  - listTools(): AgentTool[]                                │
└────────────────────────────────────────────────────────────┘
```

#### 工具定义

```typescript
interface AgentTool {
  name: string                    // 工具名 (LLM 调用时使用)
  label?: string                  // 显示名 (UI)
  description: string             // 描述 (LLM 理解用途)
  parameters: JSONSchema          // 参数 schema (TypeBox / Zod)
  executionMode?: 'parallel' | 'sequential'  // 执行模式
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate?: (update: ToolUpdate) => void
  ): Promise<ToolResult>
}

interface ToolResult {
  content: ContentBlock[]
  details?: Record<string, unknown>
  terminate?: boolean             // 是否终止后续 LLM 调用
}

interface ToolUpdate {
  content: ContentBlock[]
  details?: Record<string, unknown>
}
```

#### 内置工具列表

```
┌────────────────────────────────────────────────────────────┐
│                   内置工具 (Built-in Tools)                  │
│                                                             │
│  read(path)        → 读取文件内容                            │
│  write(path, content) → 写入文件                             │
│  edit(path, old, new) → 精确替换文件内容                      │
│  bash(command)     → 执行 shell 命令                         │
│  grep(pattern, path?) → 文本搜索                             │
│  find(pattern, path?) → 文件搜索                             │
│  ls(path?)         → 列出目录                                 │
└────────────────────────────────────────────────────────────┘
```

#### 工具执行流程

```
收到 tool_calls 列表
        │
        ▼
┌─────────────────────────────┐
│  顺序预检 (beforeToolCall)   │  ← 可在此做权限检查
│  遍历所有 tool_call          │
│  逐一调用 beforeToolCall     │
│  收集 block 结果             │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  分组执行                    │
│                             │
│  executionMode: 'parallel'  │
│  → 所有工具并发执行          │
│                             │
│  executionMode: 'sequential'│
│  → 逐个执行                  │
│                             │
│  若存在任一 sequential 工具   │
│  → 全部串行执行              │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  收集结果 + afterToolCall    │
│  检查 terminate 标记         │
│  按 assistant 原始顺序       │
│  生成 toolResult 消息        │
└─────────────────────────────┘
```

### 2.4 会话层 — pi-session

职责：管理会话的存储、恢复和分支。

```
┌────────────────────────────────────────────────────────────┐
│                    SessionManager                           │
│                                                             │
│  方法:                                                    │
│  ├── createSession(name?): Session                         │
│  ├── loadSession(id | path): Session                       │
│  ├── deleteSession(id): void                               │
│  ├── listSessions(): SessionSummary[]                      │
│  └── recentSessions(limit?): SessionSummary[]               │
│                                                             │
│  Session 对象:                                             │
│  ├── id: string                                            │
│  ├── name: string                                          │
│  ├── cwd: string                                           │
│  ├── createdAt: number                                     │
│  ├── messages: AgentMessage[]                              │
│  ├── addMessage(msg)                                       │
│  ├── fork(fromMsgId): Session  ← 从某条消息创建分支         │
│  ├── getActiveBranch(): Message[]                           │
│  └── compact(summaryFn)   ← 压缩历史                        │
└────────────────────────────────────────────────────────────┘
```

#### 会话存储格式 (JSONL)

```
// 每个会话是一个 JSONL 文件
// 每行一个 JSON 对象
// 通过 id 和 parentId 形成树形结构

{ "id": "msg-1", "parentId": null, "role": "user", "content": "Hello" }
{ "id": "msg-2", "parentId": "msg-1", "role": "assistant", "content": "Hi!" }
{ "id": "msg-3", "parentId": "msg-2", "role": "user", "content": "帮我读文件" }
{ "id": "msg-4", "parentId": "msg-3", "role": "assistant", "content": "..." }
                                                              ← 分支点
{ "id": "msg-5", "parentId": "msg-2", "role": "user", "content": "换个方式" }
{ "id": "msg-6", "parentId": "msg-5", "role": "assistant", "content": "..." }
```

**分支结构示意**:

```
会话文件: session-abc.jsonl

msg-1 (user: "Hello")
  └→ msg-2 (assistant: "Hi!")
       ├→ msg-3 (user: "帮我读文件")
       │    └→ msg-4 (assistant: "...")     ← 分支 A (当前激活)
       │
       └→ msg-5 (user: "换个方式")
            └→ msg-6 (assistant: "...")     ← 分支 B
```

#### 上下文压缩 (Compaction)

```
┌────────────────────────────────────────────────────────────┐
│                    压缩策略                                  │
│                                                             │
│  触发条件:                                                  │
│  ├── 手动触发: /compact                                     │
│  ├── 自动触发: 上下文超限时恢复重试                            │
│  └── 主动触发: 接近上下文窗口限制时预先压缩                     │
│                                                             │
│  压缩过程:                                                  │
│  ┌─────────────────────────────────────────────────┐        │
│  │  messages (原始)                                │        │
│  │  [msg1, msg2, msg3, ..., msg8, msg9, msg10]    │        │
│  │         ↓                                       │        │
│  │  保留最近 N 条 + 压缩之前的消息                    │        │
│  │  [summary, msg8, msg9, msg10]                  │        │
│  │         ↑                                       │        │
│  │  调用 LLM 生成的摘要: "用户问了A，助手回答了B..."  │        │
│  └─────────────────────────────────────────────────┘        │
│                                                             │
│  注意: 压缩有损，完整历史仍在 JSONL 文件中                     │
└────────────────────────────────────────────────────────────┘
```

### 2.5 扩展层 — pi-extension

职责：提供插件化扩展能力，让用户在不修改内核的情况下添加功能。

```
┌────────────────────────────────────────────────────────────┐
│                    ExtensionAPI                             │
│                                                             │
│  方法:                                                    │
│  ├── registerTool(tool: AgentTool): void                   │
│  ├── unregisterTool(name: string): void                    │
│  ├── registerCommand(name: string, command: Command): void │
│  ├── on(event: string, handler: EventHandler): void        │
│  └── registerUI(name: string, component: UIComponent): void│
│                                                             │
│  事件列表:                                                 │
│  ├── 'agent_start'                                          │
│  ├── 'agent_end'                                            │
│  ├── 'turn_start'                                           │
│  ├── 'turn_end'                                             │
│  ├── 'message_start'                                        │
│  ├── 'message_update'                                       │
│  ├── 'message_end'                                          │
│  ├── 'tool_execution_start'                                 │
│  ├── 'tool_execution_update'                                │
│  ├── 'tool_execution_end'                                   │
│  └── 'project_trust'                                        │
└────────────────────────────────────────────────────────────┘
```

#### 扩展示例

```typescript
// my-extension.ts
export default function (api: ExtensionAPI) {
  // 注册自定义工具
  api.registerTool({
    name: 'deploy',
    label: '部署',
    description: '部署当前项目到指定环境',
    parameters: Type.Object({
      env: Type.String({ enum: ['staging', 'production'] }),
    }),
    execute: async (id, params) => {
      // 部署逻辑...
      return { content: [{ type: 'text', text: '部署成功' }] }
    },
  })

  // 注册自定义命令
  api.registerCommand('stats', {
    description: '显示项目统计信息',
    execute: () => {
      // ...
    },
  })

  // 监听事件
  api.on('tool_execution_start', (event) => {
    console.log('工具开始执行:', event.toolName)
  })
}
```

#### 扩展发现机制

```
扩展加载优先级:
1. CLI 参数指定: pi -e ./my-ext.ts
2. 全局目录:     ~/.pi-agent/extensions/*.ts
3. 项目目录:     .pi/extensions/*.ts
4. 包管理安装:   通过 pi install 安装的包

触发的钩子顺序:
   beforeToolCall → 工具执行 → afterToolCall
        ↑                          ↑
  扩展可拦截并阻止            扩展可修改返回值
```

### 2.6 接口层 — pi-interface

职责：提供多种交互方式，适配不同使用场景。

```
┌────────────────────────────────────────────────────────────┐
│                      Interface Layer                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Event Stream                      │  │
│  │  Agent → subscribe(event) → [interface]              │  │
│  └──────────────────────────────────────────────────────┘  │
│                    ║        ║        ║                    │
│         ┌──────────╨────────╨────────╨──────────┐         │
│         │           │        │                  │         │
│         ▼           ▼        ▼                  ▼         │
│  ┌─────────┐ ┌──────────┐ ┌──────┐ ┌──────────────────┐  │
│  │  TUI    │ │  Print   │ │ JSON │ │       RPC        │  │
│  │ 终端界面  │ │ 模式     │ │ 模式  │ │ stdin/stdout     │  │
│  │         │ │          │ │      │ │ JSONL 协议       │  │
│  │ 全键盘   │ │ -p 参数   │ │      │ │                  │  │
│  │ 操作     │ │ 管道输入  │ │      │ │ 非 Node.js 嵌入  │  │
│  └─────────┘ └──────────┘ └──────┘ └──────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 3. 核心数据流

### 3.1 完整的请求处理链路

```
用户输入 "读取 config.json 并总结"
        │
        ▼
┌────────────────────────────────────────────┐
│  1. Interface 层                           │
│     接收输入 → 构造 AgentMessage           │
│     调用 agent.prompt(message)             │
└────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────┐
│  2. Agent Core                             │
│     触发 agent_start 事件                   │
│     触发 turn_start 事件                    │
│     将用户消息加入 messages                 │
│     调用 transformContext()                 │
│     调用 convertToLlm()                    │
│     获取 Model 并调用 stream()              │
└────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────┐
│  3. AI Layer                               │
│     AnthropicProvider.stream()             │
│     向 Anthropic API 发送请求               │
│     返回流式事件                           │
└────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────┐
│  4. Agent Core (接收流式事件)               │
│     text_delta → message_update 事件        │
│     tool_call_start → 记录 tool call        │
│     done → message_end 事件                │
│                                             │
│     检查是否有 tool_call:                    │
│     ├→ 无 → turn_end → agent_end            │
│     └→ 有 → 进入工具执行                    │
└────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────┐
│  5. 工具执行                                │
│     触发 tool_execution_start 事件          │
│     调用 beforeToolCall 钩子               │
│     并行/串行执行工具                       │
│     触发 tool_execution_end 事件            │
│     调用 afterToolCall 钩子                │
│     生成 toolResult 消息                   │
│                                             │
│     检查终止条件 + 队列状态 → 是否继续       │
└────────────────────────────────────────────┘
│ (继续第二轮)
        ▼
┌────────────────────────────────────────────┐
│  6. 第二轮 Agent Loop                       │
│     触发 turn_start                         │
│     LLM 看到 toolResult → 产生最终回答       │
│     text_delta → 输出结果                    │
│     turn_end → agent_end                    │
└────────────────────────────────────────────┘
```

### 3.2 事件订阅模式

```
Agent 实例
    │
    ├── subscriber 1 (日志记录)
    │   └→ 所有事件 → 写入日志文件
    │
    ├── subscriber 2 (UI 渲染)
    │   ├→ agent_start         → 显示 "thinking..."
    │   ├→ message_update      → 追加文本
    │   ├→ tool_execution_start → 显示工具调用
    │   ├→ tool_execution_end  → 显示工具结果
    │   └→ agent_end           → 显示完成
    │
    └── subscriber 3 (扩展钩子)
        └→ tool_execution_start → 权限检查
```

### 3.3 错误处理

```
┌──────────────────────────────────────┐
│          错误处理策略                  │
│                                       │
│  工具执行中的错误:                     │
│  execute() 抛出 Error                │
│       ↓                              │
│  Agent 捕获 → 标记 isError: true     │
│       ↓                              │
│  将错误信息作为 toolResult 返回 LLM   │
│       ↓                              │
│  LLM 自行决定如何向用户解释           │
│                                       │
│  LLM 调用中的错误:                    │
│  API 超时 / 速率限制 / 认证失败       │
│       ↓                              │
│  触发 error 事件                     │
│       ↓                              │
│  Agent 可选择重试或报错               │
│                                       │
│  规则: 不要返回错误消息作为正常内容     │
│  用 throw / isError 表达错误          │
└──────────────────────────────────────┘
```

---

## 4. 关键接口定义

### 4.1 模块清单

```
src/
├── ai/                    # AI 层
│   ├── types.ts           # 核心类型定义
│   ├── registry.ts        # ModelRegistry
│   ├── providers/
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   └── deepseek.ts
│   └── index.ts
│
├── agent/                 # Agent 层
│   ├── agent.ts           # Agent 类
│   ├── loop.ts            # Agent Loop 核心循环
│   ├── state.ts           # AgentState
│   ├── queue.ts           # Steering / Follow-up 队列
│   ├── hooks.ts           # Hook 系统
│   └── index.ts
│
├── tools/                 # 工具层
│   ├── registry.ts        # ToolRegistry
│   ├── builtin/
│   │   ├── read.ts
│   │   ├── write.ts
│   │   ├── edit.ts
│   │   ├── bash.ts
│   │   ├── grep.ts
│   │   ├── find.ts
│   │   └── ls.ts
│   └── index.ts
│
├── session/               # 会话层
│   ├── manager.ts         # SessionManager
│   ├── session.ts         # Session 类
│   ├── storage.ts         # JSONL 存储
│   ├── compaction.ts      # 上下文压缩
│   └── index.ts
│
├── extension/             # 扩展层
│   ├── api.ts             # ExtensionAPI
│   ├── loader.ts          # 扩展加载器
│   └── index.ts
│
├── interface/             # 接口层
│   ├── tui/               # TUI 实现
│   │   ├── renderer.ts
│   │   ├── editor.ts
│   │   ├── commands.ts
│   │   └── theme.ts
│   ├── print.ts           # Print 模式
│   ├── json.ts            # JSON 模式
│   ├── rpc.ts             # RPC 模式
│   └── index.ts
│
├── config/                # 配置管理
│   ├── settings.ts
│   └── trust.ts
│
└── cli.ts                 # CLI 入口
```

### 4.2 Agent 完整接口

```typescript
// agent/agent.ts

export class Agent {
  // ── 状态 ──
  state: AgentState

  // ── 配置 ──
  steeringMode: 'one-at-a-time' | 'all'
  followUpMode: 'one-at-a-time' | 'all'
  toolExecution: 'parallel' | 'sequential'
  sessionId?: string
  thinkingBudgets?: Record<string, number>

  // ── 钩子 ──
  beforeToolCall?: (ctx: ToolCallContext) => Promise<BlockResult | undefined>
  afterToolCall?: (ctx: ToolCallResultContext) => Promise<AfterToolCallResult | undefined>

  constructor(config: {
    initialState: {
      systemPrompt: string
      model: Model
      thinkingLevel?: ThinkingLevel
      tools?: AgentTool[]
      messages?: AgentMessage[]
    }
    streamFn: StreamFunction
    transformContext?: (messages: AgentMessage[], signal: AbortSignal) => Promise<AgentMessage[]>
    convertToLlm: (messages: AgentMessage[]) => LLMMessage[]
    steeringMode?: 'one-at-a-time' | 'all'
    followUpMode?: 'one-at-a-time' | 'all'
    toolExecution?: 'parallel' | 'sequential'
    sessionId?: string
    getApiKey?: (provider: string) => Promise<string>
    thinkingBudgets?: Record<string, number>
    beforeToolCall?: (ctx: ToolCallContext) => Promise<BlockResult | undefined>
    afterToolCall?: (ctx: ToolCallResultContext) => Promise<AfterToolCallResult | undefined>
  })

  // ── 核心方法 ──
  prompt(text: string, images?: ImageBlock[]): Promise<void>
  continue(): Promise<void>
  steer(message: AgentMessage): void
  followUp(message: AgentMessage): void
  abort(): void
  reset(): void
  waitForIdle(): Promise<void>

  // ── 事件订阅 ──
  subscribe(listener: AgentEventListener): UnsubscribeFn

  // ── 队列管理 ──
  clearSteeringQueue(): void
  clearFollowUpQueue(): void
  clearAllQueues(): void
}

// ── 事件类型 ──
type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: AgentMessage[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: AgentMessage; toolResults: ToolResult[] }
  | { type: 'message_start'; message: AgentMessage }
  | { type: 'message_update'; message: Partial<AgentMessage>; assistantMessageEvent: AssistantMessageEvent }
  | { type: 'message_end'; message: AgentMessage }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_execution_update'; toolCallId: string; partialResult: ToolUpdate }
  | { type: 'tool_execution_end'; toolCallId: string; result: ToolResult }

type AgentEventListener = (event: AgentEvent, signal: AbortSignal) => Promise<void> | void
type UnsubscribeFn = () => void

// ── Agent状态 ──
interface AgentState {
  systemPrompt: string
  model: Model
  thinkingLevel: ThinkingLevel
  tools: AgentTool[]
  messages: AgentMessage[]
  readonly isStreaming: boolean
  readonly streamingMessage?: AgentMessage
  readonly pendingToolCalls: ReadonlySet<string>
  readonly errorMessage?: string
}
```

### 4.3 Agent Loop 底层 API

```typescript
// agent/loop.ts

// 低级循环 — 不包装为 Agent 类，直接控制
async function agentLoop(
  newMessages: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  signal?: AbortSignal,
  streamFn: StreamFunction
): AsyncIterable<AgentEvent>

// 从现有上下文继续
async function agentLoopContinue(
  context: AgentContext,
  config: AgentLoopConfig,
  signal?: AbortSignal,
  streamFn: StreamFunction
): AsyncIterable<AgentEvent>

interface AgentContext {
  systemPrompt: string
  messages: AgentMessage[]
  tools: AgentTool[]
}

interface AgentLoopConfig {
  model: Model
  convertToLlm: (messages: AgentMessage[]) => LLMMessage[]
  toolExecution?: 'parallel' | 'sequential'
  beforeToolCall?: (ctx: ToolCallContext) => Promise<BlockResult | undefined>
  afterToolCall?: (ctx: ToolCallResultContext) => Promise<AfterToolCallResult | undefined>
  shouldStopAfterTurn?: (ctx: TurnEndContext) => Promise<boolean>
}
```

---

## 5. 开发路线图

### Phase 1 — 最小可行 (MVP)

**目标**: 能跑通 用户输入 → LLM → 输出 的完整链路

```
Week 1-2:
├── src/ai/
│   ├── types.ts          ← 定义核心类型
│   ├── registry.ts       ← ModelRegistry
│   └── providers/
│       └── anthropic.ts  ← 先只支持 Anthropic
│
├── src/agent/
│   ├── loop.ts           ← Agent Loop 核心循环
│   └── state.ts          ← 简单的状态管理
│
├── src/tools/
│   └── builtin/
│       └── bash.ts       ← 只实现 bash 工具
│
├── src/interface/
│   └── print.ts          ← 先只支持 print 模式
│
└── src/cli.ts            ← 命令行入口
```

验收标准:
- `echo "Hello" | myagent -p "翻译成中文"` 能工作
- 支持 bash 工具调用
- 基本的消息流式输出

### Phase 2 — 交互完善

**目标**: 把"能在命令行里用"的 Agent 升级为"能交互、能记住历史、能中途打断"的完整产品。

#### 2.1 补齐内置工具（Week 3 — 前 2 天）

> Phase 1 只实现了 `bash`。现在把 `read / write / edit / grep / find / ls` 全部实现。这些工具是 LLM 完成任何代码任务的**手脚**——没有它们，LLM 只能"想"不能"做"。

```
src/tools/builtin/
├── read.ts    → fs.readFile，支持指定行范围（GNU "nl" 格式输出）
├── write.ts   → fs.writeFile，自动创建父目录，返回文件大小
├── edit.ts    → 精确字符串替换（"老王"→"老李"），替换失败报错
├── grep.ts    → child_process.execSync("grep -n")，返回匹配行+行号
├── find.ts    → child_process.execSync("find") 或 glob 库
└── ls.ts      → fs.readdir，支持递归，区分文件/目录
```

**每个工具的三要素**:
1. **Schema 描述**（TypeBox/Zod）—— LLM 需要知道参数名、类型、描述
2. **错误处理**—— 文件不存在、权限不足、命令超时，统一 `throw Error`
3. **结果格式**—— 返回 `{ content: [{ type: 'text', text: '...' }], details: { path, size } }`

**验收**: 启动 Agent，说"帮我看下 src/ai/ 目录下有哪些文件"，LLM 自动调用 `ls` 并列出结果。

#### 2.2 消息队列实现（Week 3 — 第 3-4 天）

> Phase 1 的 Agent Loop 是**线性的**：用户说一句 → LLM 回一句 → 结束。但现在 Agent 可能在跑 5 分钟的测试时用户突然想换方向——你要让 Agent 能**边跑边听**。

```
src/agent/queue.ts
```

**核心逻辑**（回忆 Pi 源码 `PendingMessageQueue`）：

```typescript
class PendingMessageQueue {
  private messages: AgentMessage[] = []
  mode: 'one-at-a-time' | 'all' = 'one-at-a-time'

  enqueue(msg) { this.messages.push(msg) }     // 用户输入 → 进队列

  drain(): AgentMessage[] {
    if (this.mode === 'all') {                 // 批量模式
      const all = this.messages.slice()
      this.messages = []
      return all
    }
    // 默认：一次只取一条，避免多条矛盾消息搞晕 LLM
    const first = this.messages.shift()        // 一条一条处理
    return first ? [first] : []
  }
}
```

**集成到 Loop 中**（修改 `src/agent/loop.ts`）:

每轮结束时的注入逻辑：
```
本轮结束 ──→ 有 tool_call?
   ├─ 是 → 执行工具 → 加回结果 → 继续下一轮
   └─ 否 → steeringQueue.drain() → 有消息?
            ├─ 是 → 注入为 user 消息 → 继续下一轮
            └─ 否 → followUpQueue.drain() → 有消息?
                     ├─ 是 → 注入 → 继续下一轮
                     └─ 否 → agent_end
```

**两个队列的语义**:
| 队列 | 英文 | 类比 | 何时消费 |
|------|------|------|---------|
| `steeringQueue` | ⚡ 打断 | "停！先做这个！" | 每轮 tool calls 执行完后立即检查 |
| `followUpQueue` | 📋 追加 | "做完后帮我总结" | Agent 即将空闲时才检查 |

**验收**:
1. Agent 正在跑一条长命令（如 `bash('sleep 10')`）时，输入"等等先看看别的"
2. Agent 完成当前工具后，下一轮把 steering 消息注入，调整方向
3. Agent 跑完后，说"做完帮我总结一下" → followUp 生效

#### 2.3 会话持久化（Week 3 — 第 5-6 天）

> 现在 Agent 的 `messages` 数组在进程退出后就没了。你要让它记住"上次聊到哪了"，用户可以 `pi -c` 继续上次对话。

```
src/session/
├── session.ts    → Session 类：id, name, messages[], cwd, createdAt
├── manager.ts    → SessionManager：创建/加载/删除/列会话
└── storage.ts    → JSONL 存储：追加写、读取最新 N 行、按 parentId 找分支
```

**JSONL 存储格式**（简化自 Pi）：

```jsonl
{"id":"m1","parentId":null,"role":"user","content":"Hello","ts":1752691200000}
{"id":"m2","parentId":"m1","role":"assistant","content":"Hi!","ts":1752691201000}
{"id":"m3","parentId":"m2","role":"user","content":"读config.json","ts":1752691202000}
{"id":"m4","parentId":"m3","role":"assistant","content":"好的，我来读...","ts":1752691203000}
```

**为什么用 JSONL 而不是 JSON 数组？**
- 追加写（append-only）——每次消息直接 `fs.appendFile`，不读完整文件
- 支持大文件（10 万行对话）——不需要一次全读入内存
- 树形结构（parentId）——支持分支

**CLI 入口更新**（`src/cli.ts`）:
```bash
pi                  # 新建会话
pi "帮我重构src"    # 带初始提示
pi -c               # 继续上次会话
pi -r               # 从历史会话中选择继续
pi --no-session     # 不保存本次会话
```

**验收**:
1. `pi "写个hello world"` → 退出 → `pi -c` → Agent 记得刚才做了什么
2. `pi -r` → 列出历史会话 → 选择一条 → 恢复
3. 会话文件在 `~/.pi-agent/sessions/` 下以 JSONL 格式存在

#### 2.4 简单 TUI（Week 4）

> 有了 CLI 的 print 模式后，现在做一个**基础的可交互终端界面**。先做一个能读多行输入、能看流式输出的界面。

```
src/interface/tui/
├── index.ts      → TUI 入口：接管 stdin/stdout
├── editor.ts     → 多行输入编辑器（方向键移动、Tab 补全、Ctrl+C 取消）
└── renderer.ts   → 消息渲染（user 蓝色、assistant 白色、tool 灰色）
```

**基础能力**:
| 按键 | 功能 |
|------|------|
| Enter | 发送当前输入 |
| Shift+Enter | 换行（不发送） |
| Ctrl+C | 取消当前操作 |
| Tab | 文件路径补全 |
| 上/下方向键 | 浏览历史消息 |

**渲染效果示意**:
```
┌─ Pi Agent v0.2 ──────────────────────────────┐
│                                              │
│ 👤 帮我重构 src/agent/loop.ts                │
│                                              │
│ 🤖 好的，让我先读取文件                        │
│                                              │
│  ⚙ bash: cat src/agent/loop.ts | head -30   │
│  ┌─ 结果 ───────────────────────────────┐    │
│  │ import { AgentState } from '../state'│    │
│  │ export async function agentLoop(...) │    │
│  │ ...                                  │    │
│  └──────────────────────────────────────┘    │
│                                              │
│ 🤖 看到了 loop.ts 的内容，我来分析结构         │
│                                              │
│ █ 输入: _                                    │
└──────────────────────────────────────────────┘
```

**验收**:
1. 进入 `pi` → 看到 TUI 界面 → 输入消息 → LLM 流式回复 → 工具调用可见
2. Ctrl+C 取消 → Agent 停止 → 回到输入状态

**Phase 2 完成标志**:
- [ ] 全部 7 个内置工具可用
- [ ] 消息队列（steering/follow-up）正常工作
- [ ] 会话持久化到 JSONL 文件
- [ ] `pi -c` 能继续上次会话
- [ ] 基础 TUI 可用（输入/流式输出/工具结果展示）
- [ ] 这是一个"能用的"Coding Agent ✨

---

### Phase 3 — 扩展生态 + 多模式

**目标**: Agent 不再是一个封闭系统。用户可以写插件扩展它，可以切换多个 LLM 提供商，可以通过 JSON/RPC 模式被其他程序调用。

#### 3.1 扩展系统（Week 5 — 前 3 天）

> 这是将你的 Agent 从"工具"变成"平台"的关键一步。所有你不想写进内核的功能（权限门控、自定义工具、MCP 集成、通知推送）都通过扩展实现。

```
src/extension/
├── api.ts     → ExtensionAPI 接口定义
└── loader.ts  → 扩展发现 + 动态加载（用 jiti 即时编译 TS）
```

**ExtensionAPI 接口**:
```typescript
interface ExtensionAPI {
  registerTool(tool: AgentTool): void
  unregisterTool(name: string): void
  registerCommand(name: string, cmd: { description: string, execute: () => void }): void
  on(event: string, handler: (event: AgentEvent) => void): void
  addBeforeToolCall(hook: BeforeToolCallHook): void
  addAfterToolCall(hook: AfterToolCallHook): void
}
```

**扩展文件格式**:
```typescript
// ~/.pi-agent/extensions/my-ext.ts
export default function (api: ExtensionAPI) {
  api.registerTool({
    name: 'deploy',
    label: '部署',
    description: '部署当前项目',
    parameters: Type.Object({ env: Type.String() }),
    execute: async (id, params) => {
      return { content: [{ type: 'text', text: `部署到${params.env}成功` }] }
    },
  })

  api.on('tool_execution_start', (event) => {
    console.log('工具开始:', event.toolName)
  })
}
```

**扩展发现优先级**:
```
1. CLI 指定:     pi -e ./deploy-tool.ts
2. 全局目录:     ~/.pi-agent/extensions/*.ts
3. 项目目录:     .pi/extensions/*.ts
```

**loader.ts 核心实现**:
```typescript
import { createJiti } from 'jiti'
const jiti = createJiti(import.meta.url)

async function loadExtension(path: string, api: ExtensionAPI) {
  const mod = jiti(path)           // 即时编译 TS
  const factory = mod.default      // export default function(api)
  await factory(api)               // 传入 ExtensionAPI
}
```

**验收**:
1. 写一个 `hello-ext.ts`，注册一个 `hello` 工具
2. `pi -e ./hello-ext.ts` → Agent 启动 → LLM 能调用 `hello` 工具
3. 扩展里监听 `tool_execution_start` 事件 → 每次工具执行前打印日志

#### 3.2 多提供商切换（Week 5 — 第 4-6 天）

> Phase 1 只接了 Anthropic。用户说"我想用 DeepSeek（便宜）"或"我想用 OpenAI（快）"，你要让他们能一键切换。

```
src/ai/providers/
├── anthropic.ts  ← Phase 1 已实现
├── openai.ts     ← 新增
└── deepseek.ts   ← 新增
```

**Provider 差异对比**:

| | Anthropic | OpenAI | DeepSeek |
|---|---|---|---|
| 请求格式 | `content: [{ type: 'text' }]` | 相同 | 相同（OpenAI 兼容） |
| tool_call | `tool_use` content block | `tool_calls` field | 同 OpenAI |
| 流式事件 | SSE: content_block_delta | SSE: delta.content[] | SSE（OpenAI 兼容） |
| thinking | `thinking` block | `reasoning_content` | 不支持 |

**通用 LLMEvent 接口**（Provider 内部分别适配）:
```typescript
type LLMEvent =
  | { type: 'text_delta', delta: string }
  | { type: 'tool_call_start', id: string, name: string, args: unknown }
  | { type: 'tool_call_delta', id: string, delta: string }
  | { type: 'thinking_delta', delta: string }
  | { type: 'error', message: string }
  | { type: 'done', stopReason: string }
```

**CLI 切换**:
```bash
pi --provider openai --model gpt-4o "帮我重构"
pi --provider deepseek --model deepseek-chat "便宜的方案"
/model                    # 交互中列出可用模型
/model openai/gpt-4o      # 交互中切换
```

**验收**:
1. `pi --provider openai` → Agent 用 GPT-4o 正常工作
2. `pi --provider deepseek` → Agent 用 DeepSeek 正常工作
3. 在同一会话中 `/model` 切换模型 → Agent 继续对话（不丢失历史）

#### 3.3 多模式接口（Week 6 — 前 2 天）

> 目前只有 print 模式。你要加上 JSON 模式（给脚本/CI 用）和 RPC 模式（给其他语言嵌入用）。

```
src/interface/
├── json.ts  → 新增
└── rpc.ts   → 新增
```

**JSON 模式**（`pi --mode json`）:
```bash
echo "列出src目录" | pi --mode json
```
输出 JSONL 事件流，每行一个 JSON：
```jsonl
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"user","content":"列出src目录"}}
{"type":"tool_execution_start","toolName":"ls","args":{"path":"./src"}}
{"type":"tool_execution_end","result":{"content":[{"type":"text","text":"ai/\nagent/\ntools/"}]}}
{"type":"agent_end"}
```

**RPC 模式**（`pi --mode rpc`）:
```bash
# stdin 接收 JSON 请求，stdout 输出 JSON 响应
# 非 Node.js 程序（Python/Go/Rust）可通过子进程集成

# 请求
{"method":"prompt","params":{"text":"帮我重构loop.ts"},"id":1}

# 响应（逐行）
{"type":"event","data":{"type":"message_update","content":"好的..."},"id":1}
{"type":"event","data":{"type":"agent_end"},"id":1}
{"type":"result","id":1}
```

**验收**:
1. `pi --mode json` → 输出正确的 JSONL 事件流，`jq` 可解析
2. Python 程序启动 `pi --mode rpc` 子进程 → 发送 JSON → 接收响应

#### 3.4 配置文件系统（Week 6 — 后 3 天）

```
src/config/
└── settings.ts
```

**配置优先级**（后盖前）:
```
1. 默认值（代码内）
2. 全局配置    ~/.pi-agent/settings.json
3. 项目配置    .pi/settings.json
4. CLI 参数    --model gpt-4o
5. 环境变量    ANTHROPIC_API_KEY
```

**settings.json 示例**:
```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "thinkingLevel": "medium",
  "steeringMode": "one-at-a-time",
  "toolExecution": "parallel",
  "contextFiles": true,
  "telemetry": false
}
```

**验收**:
1. 创建 `~/.pi-agent/settings.json` → Agent 启动自动读取
2. CLI 参数覆盖配置文件（`--model gpt-4o` 覆盖 settings.json 中的 model）
3. 项目 `.pi/settings.json` 覆盖全局配置

**Phase 3 完成标志**:
- [ ] 扩展系统可用（jiti 动态加载 .ts 文件）
- [ ] Anthropic / OpenAI / DeepSeek 三提供商正常工作
- [ ] JSON 模式和 RPC 模式可用
- [ ] 配置文件系统工作正常
- [ ] 这是一个"可扩展的、多提供商的、可嵌入的"Agent ✨

### Phase 4 — 生产加固

**目标**: 权限系统、会话压缩、供应链安全

```
Week 7-8:
├── 权限 / 沙箱系统
│   ├── 容器化支持 (Docker)
│   └── beforeToolCall 权限拦截
│
├── 会话压缩 (compaction)
│   └── 自动 / 手动压缩策略
│
├── 供应链安全
│   ├── shrinkwrap 锁定
│   └── 依赖审计脚本
│
└── 全面测试
    ├── unit tests (80%+)
    ├── integration tests
    └── E2E tests
```

---

## 附录

### A. 关键设计原则总结

| 原则 | 说明 |
|------|------|
| **内核极简** | 只做最少的事，把选择权留给扩展 |
| **事件驱动** | 所有交互通过事件流进行，UI 和逻辑解耦 |
| **消息标准化** | 统一消息格式，Provider 差异在内部消化 |
| **工具即函数** | 工具就是有 schema 描述的异步函数 |
| **扩展优先** | 扩展是一等公民，不是事后补丁 |
| **错误即 throw** | 用异常表达失败，不用正常返回值伪装错误 |

### B. 技术栈建议

| 模块 | 建议 |
|------|------|
| 语言 | TypeScript (5.x+) |
| Runtime | Node.js 22+ / Bun |
| Schema 验证 | TypeBox (Pi 的选择) 或 Zod |
| 测试 | Vitest |
| TUI | 可选: Ink / React Terminal / 手写 |
| 包管理 | npm + package.json |

---

> 文档版本: v1.0
> 最后更新: 2026-07-30
> 基于: [earendil-works/pi](https://github.com/earendil-works/pi) v0.83.0