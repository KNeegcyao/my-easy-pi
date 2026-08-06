// ============================================================
// Agent 层类型定义 — 在底层 Tool 基础上扩展
//
// 遵循"类型递进扩展"模式：
//   ai/types.ts   → Tool（纯类型，无运行时行为）
//   agent/types.ts → AgentTool extends Tool（添加 execute）
// ============================================================

import type { Tool, ToolUpdate, ToolResult, JSONSchema } from '../ai/types.js'

/** Agent 工具定义（在 Tool 基础上加上执行能力） */
export interface AgentTool extends Tool {
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate?: (update: ToolUpdate) => void
  ): Promise<ToolResult>
}

export type { Tool, ToolUpdate, ToolResult, JSONSchema }