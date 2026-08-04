// ============================================================
// ToolRegistry — 工具注册表
//
// 管理所有 Agent 可用的工具。
// 支持注册、注销、查询和列出工具。
// ============================================================

import type { AgentTool } from '../ai/types.js'

export class ToolRegistry {
  /** 存储所有已注册的工具 */
  private tools = new Map<string, AgentTool>()

  /** 注册一个工具
   * @param tool - 要注册的工具
   */
  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool)
  }

  /** 注销一个工具
   * @param name - 工具名称
   */
  unregisterTool(name: string): void {
    this.tools.delete(name)
  }

  /** 获取指定名称的工具 */
  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name)
  }

  /** 列出所有已注册的工具 */
  listTools(): AgentTool[] {
    return Array.from(this.tools.values())
  }
}