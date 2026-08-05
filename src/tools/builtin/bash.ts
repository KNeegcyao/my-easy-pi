// ============================================================
// Bash 工具
//
// 让 LLM 可以执行 shell 命令。
// 支持 Docker 沙箱执行（自动检测，不可用时回退到本地）。
// 支持超时和中断。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../ai/types.js'
import { getSandbox } from '../../sandbox/index.js'

/** 创建 bash 工具 */
export const bashTool: AgentTool = {
  name: 'bash',
  label: 'Shell',
  description: '执行 shell 命令，获取输出结果',
  parameters: Type.Object({
    command: Type.String({ description: '要执行的 shell 命令' }),
    timeout: Type.Optional(Type.Number({ description: '超时时间（毫秒），默认 30000' })),
  }),

  async execute(toolCallId, params, signal, onUpdate) {
    const command = params.command as string
    const timeout = (params.timeout as number) || 30000

    // 获取沙箱实例
    const sandbox = getSandbox()
    const isSandbox = await sandbox.isAvailable()

    onUpdate?.({
      content: [{
        type: 'text',
        text: isSandbox ? `🔒 在沙箱中执行: ${command}` : `执行: ${command}`,
      }],
    })

    try {
      const result = await sandbox.execute(command, timeout, signal)

      const output = result.stdout || result.stderr || '(无输出)'
      const runtimeInfo = result.runtime === 'docker' ? ' [沙箱]' : ' [本地]'

      return {
        content: [{ type: 'text', text: output + runtimeInfo }],
        details: { command, exitCode: result.exitCode, runtime: result.runtime },
      }
    } catch (error: unknown) {
      const err = error as Error
      return {
        content: [{ type: 'text', text: err.message || String(error) }],
        details: { command, exitCode: 1 },
      }
    }
  },
}