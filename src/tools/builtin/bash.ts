// ============================================================
// Bash 工具
//
// 让 LLM 可以执行 shell 命令。
// 使用 Node.js 的 child_process.exec 实现，
// 支持超时和中断。
// ============================================================

import { exec } from 'child_process'
import { promisify } from 'util'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../ai/types.js'

const execAsync = promisify(exec)

/** 创建 bash 工具 */
export const bashTool: AgentTool = {
  name: 'bash',
  label: 'Shell',
  description: '执行 shell 命令，获取输出结果',
  // 使用 TypeBox 定义参数 schema
  parameters: Type.Object({
    command: Type.String({ description: '要执行的 shell 命令' }),
    timeout: Type.Optional(Type.Number({ description: '超时时间（毫秒），默认 10000' })),
  }),

  async execute(toolCallId, params, signal, onUpdate) {
    const command = params.command as string
    const timeout = (params.timeout as number) || 10000

    // 可选：发送执行中的状态
    onUpdate?.({
      content: [{ type: 'text', text: `正在执行: ${command}` }],
    })

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        signal,
        maxBuffer: 10 * 1024 * 1024, // 10MB 输出限制
      })

      const result = stdout || stderr || '(无输出)'

      return {
        content: [{ type: 'text', text: result }],
        details: { command, exitCode: 0 },
      }
    } catch (error: unknown) {
      // 错误处理：将错误信息返回给 LLM，让 LLM 决定如何处理
      const err = error as Error & { code?: number; stdout?: string; stderr?: string }
      const errorOutput = err.stderr || err.message || String(error)

      return {
        content: [{ type: 'text', text: errorOutput }],
        details: { command, exitCode: err.code || 1 },
      }
    }
  },
}