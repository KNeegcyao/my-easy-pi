// ============================================================
// Bash 工具 — factory + default instance
//
// createBashTool(ops) 接受 Operations 注入，返回 ToolDefinition。
// default 实例使用 LocalOperations 兜底。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations, ExecResult } from '../operations.js'
import { defaultOperations } from '../operations.js'
import type { ToolDefinition } from '../../agent/types.js'
import { logger } from '../../config/index.js'

export function createBashTool(ops: Operations): ToolDefinition {
  return {
    name: 'bash',
    label: 'Shell',
    description: '执行 shell 命令，获取输出结果',
    category: 'system',
    dangerLevel: 'normal',
    icon: '⚡',
    parameters: Type.Object({
      command: Type.String({ description: '要执行的 shell 命令' }),
      timeout: Type.Optional(Type.Number({ description: '超时时间（毫秒），默认 30000' })),
    }),

    async execute(toolCallId, params, signal, onUpdate) {
      const command = params.command as string
      const timeout = (params.timeout as number) || 30000

      // 把 onUpdate(ToolUpdate) 适配成 ExecUpdateCallback(string)，
      // 让 ops.exec 的流式 chunk 逐段发射到 Agent loop → TUI
      const streamChunk: import('../operations.js').ExecUpdateCallback | undefined =
        onUpdate ? (chunk: string) => onUpdate({ content: [{ type: 'text', text: chunk }] }) : undefined

      let result: ExecResult
      try {
        result = await ops.exec(command, timeout, signal, streamChunk)
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: msg }],
          isError: true,
        }
      }

      const output = result.stdout || result.stderr || '(无输出)'
      const runtimeInfo = result.runtime === 'sandbox' ? ' [沙箱]' : ' [本地]'

      logger.audit('tool_execution', {
        tool: 'bash', command, exitCode: result.exitCode, runtime: result.runtime,
      })

      return {
        content: [{ type: 'text', text: output + runtimeInfo }],
        details: { command, exitCode: result.exitCode, runtime: result.runtime },
      }
    },
  }
}

/** 默认 bash 工具实例（使用 LocalOperations） */
export const bashTool = createBashTool(defaultOperations)