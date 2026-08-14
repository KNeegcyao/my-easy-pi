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

/**
 * 产品层工具定义（在 AgentTool 基础上加上 UI/扩展元数据）。
 *
 * 遵循"类型递进扩展"模式：
 *   ai/types.ts   → Tool（纯类型，无运行时行为）
 *   agent/types.ts → AgentTool extends Tool（添加 execute）
 *   ↑ 此为第三层：ToolDefinition extends AgentTool（添加产品/扩展属性）
 *
 * 当工具注册到 Extension 系统时使用此类型，
 * 以便 UI 层展示 icon、category、dangerLevel 等信息。
 */
export interface ToolDefinition extends AgentTool {
  /** 工具分类（如 "file"、"network"、"system"） */
  category?: string
  /** 风险等级（UI 权限提示用；默认继承自 permission 规则） */
  dangerLevel?: 'safe' | 'normal' | 'dangerous'
  /** 图标 emoji（UI 工具行/列表展示） */
  icon?: string
  /** 是否在工具列表中隐藏（内部工具） */
  hidden?: boolean
}

export type { Tool, ToolUpdate, ToolResult, JSONSchema }