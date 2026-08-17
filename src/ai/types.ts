// ============================================================
// AI 层 — 核心类型定义
// 这是整个 Agent 系统的"语言"基础，所有模块都依赖这些类型
// ============================================================

// ── LLM 模型信息 ──
/** 描述一个 LLM 模型的基本信息 */
export interface ModelInfo {
  id: string          // 模型 ID，如 "claude-sonnet-4-20250514"
  provider: string    // 提供商名称，如 "anthropic"
  description?: string
}

// ── 内容块 ──
// LLM 消息的内容可以是文本、图片、工具调用等多种格式
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string }

// ── 工具调用 ──
/** LLM 请求调用一个工具 */
export interface ToolCall {
  id: string
  name: string
  args: unknown
}

// ── 统一消息格式 ──
// 这是发给 LLM 的消息格式（不同提供商的格式差异在 Provider 内部消化）
export type LLMMessage =
  | { role: 'user'; content: string | ContentBlock[] }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'toolResult'; toolCallId: string; content: string; isError?: boolean }

// ── 流式事件 ──
// LLM 的响应是流式的，这些事件描述了流中的各种数据块
export type LLMEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start'; id: string; name: string; args: unknown }
  | { type: 'tool_call_delta'; id: string; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'error'; message: string }
  | { type: 'done'; stopReason?: 'end_turn' | 'tool_use' | 'stop_sequence' }

// ── Agent 内部消息格式 ──
// 比 LLMMessage 多了 notification/thinking 等 UI 相关类型
// 这些类型在发送给 LLM 之前会被过滤掉
export type AgentMessageRole = 'user' | 'assistant' | 'toolResult' | 'notification' | 'thinking'

export interface AgentMessage {
  id: string
  parentId: string | null
  role: AgentMessageRole
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  isError?: boolean
  revoked?: boolean       // true = 已撤回；getActiveBranch 跳过，LLM 上下文不包含
  createdAt: number
}

// ── 图片块（用户输入时附带） ──
export interface ImageBlock {
  data: string    // base64 编码的图片数据
  mimeType: string // 图片 MIME 类型，如 "image/png"
}

// ── 思考级别 ──
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high'

// ── 模型上下文 ──
// 调用 LLM 时需要提供的完整上下文
export interface ModelContext {
  systemPrompt: string
  messages: LLMMessage[]
  tools?: ModelTool[]
  thinking?: {
    type: 'enabled'
    budgetTokens: number
  }
}

// ── LLM 能看到的工具定义（简化版） ──
export interface ModelTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// ── 流式选项 ──
export interface StreamOptions {
  signal?: AbortSignal
  maxTokens?: number
}

// ── Provider 配置 ──
export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  [key: string]: unknown
}

// ── Provider 工厂 ──
// 每个 LLM 提供商实现这个接口
export interface ProviderFactory {
  /** 用配置创建一个 Provider 实例 */
  create(config: ProviderConfig): {
    name: string
    listModels(): ModelInfo[]
    createModel(modelId: string): Model | null
  }
}

// ── Model 抽象接口 ──
// 所有 LLM 模型都实现这个接口，上层代码无需关心底层 API 差异
export interface Model {
  id: string
  provider: string
  /** 流式调用 LLM，返回异步事件流 */
  stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent>
  supportsTools(): boolean
  supportsThinking(): boolean
}

// ── 工具相关类型 ──

/** 工具的 JSON Schema 参数定义 */
export type JSONSchema = Record<string, unknown>

/** 工具执行的中间更新（可选流式输出） */
export interface ToolUpdate {
  content: ContentBlock[]
  details?: Record<string, unknown>
}

/** 工具执行结果 */
export interface ToolResult {
  content: ContentBlock[]
  details?: Record<string, unknown>
  /** 设为 true 会终止后续 LLM 调用 */
  terminate?: boolean
  /** 设为 true 表示工具执行出错 */
  isError?: boolean
}

/** 基础工具定义（纯类型，无运行时行为）
 *  定义工具"长什么样"——LLM 根据这个决定是否调用 */
export interface Tool {
  name: string          // 工具名（LLM 调用时用的标识）
  label?: string        // 显示名（UI 展示用）
  description: string   // 描述（LLM 理解工具用途）
  parameters: JSONSchema // 参数 Schema
  executionMode?: 'parallel' | 'sequential'
}

/** Agent 工具定义定义在 agent/types.ts 中（AgentTool extends Tool）
 *  保持 Tool 为纯类型，不包含运行时行为 */

// ── Agent 事件类型 ──
// Agent 生命周期中的各种事件，供 UI/日志/扩展订阅

export type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: AgentMessage[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: AgentMessage; toolResults: ToolResult[]; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }
  | { type: 'message_start'; message: AgentMessage }
  | { type: 'message_update'; message: Partial<AgentMessage> }
  | { type: 'message_end'; message: AgentMessage }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_execution_update'; toolCallId: string; partialResult: ToolUpdate }
  | { type: 'tool_execution_end'; toolCallId: string; result: ToolResult; isError?: boolean }
  | { type: 'error'; message: string }

export type AgentEventListener = (event: AgentEvent, signal: AbortSignal) => Promise<void> | void
export type UnsubscribeFn = () => void