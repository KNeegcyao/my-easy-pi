// ============================================================
// ExtensionAPI — 扩展 API
//
// 扩展通过 api 参数可以：
//   - registerTool()   注册自定义工具
//   - unregisterTool() 注销工具
//   - registerCommand() 注册自定义命令
//   - on()             监听 Agent 事件
// ============================================================

import type { ToolDefinition } from '../agent/types.js'
import type { AgentEventListener } from '../ai/types.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { Agent } from '../agent/index.js'

export interface Command {
  description: string
  execute(args: string[]): Promise<void> | void
}

export class ExtensionAPI {
  private commands = new Map<string, Command>()

  constructor(
    private toolRegistry: ToolRegistry,
    private agent: Agent,
  ) {}

  /** 注册自定义工具（ToolDefinition 携带 UI/扩展元数据） */
  registerTool(tool: ToolDefinition): void {
    this.toolRegistry.registerTool(tool)
  }

  /** 注销工具 */
  unregisterTool(name: string): void {
    this.toolRegistry.unregisterTool(name)
  }

  /** 注册自定义命令 */
  registerCommand(name: string, command: Command): void {
    this.commands.set(name, command)
  }

  /** 监听 Agent 事件 */
  on(event: string, handler: AgentEventListener): void {
    this.agent.subscribe(handler)
  }

  /** 查找命令（给 CLI 使用） */
  getCommand(name: string): Command | undefined {
    return this.commands.get(name)
  }

  /** 列出所有命令 */
  listCommands(): string[] {
    return Array.from(this.commands.keys())
  }
}