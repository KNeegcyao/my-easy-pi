// ============================================================
// AgentState — Agent 状态管理
//
// 管理 Agent 的运行时状态，包括：
//   - 系统提示词 (systemPrompt)
//   - 当前使用的模型
//   - 消息历史
//   - 思考级别
//   - 流式状态
// ============================================================

import type { Model, AgentMessage, ThinkingLevel } from '../ai/types.js'
import type { AgentTool } from './types.js'

export interface AgentState {
  systemPrompt: string
  model: Model
  thinkingLevel: ThinkingLevel
  tools: AgentTool[]
  messages: AgentMessage[]
  isStreaming: boolean
  streamingMessage?: AgentMessage
  pendingToolCalls: Set<string>
  errorMessage?: string
}

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
    thinkingLevel: config.thinkingLevel || 'off',
    tools: config.tools || [],
    messages: config.messages || [],
    isStreaming: false,
    pendingToolCalls: new Set(),
  }
}

// ── 简单的 ID 生成器 ──
let counter = 0
export function generateId(): string {
  return `msg-${Date.now()}-${++counter}`
}