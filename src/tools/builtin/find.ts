// ============================================================
// Find 工具 — 查找文件/目录
//
// 使用 execFile 而不是 exec 来避免命令注入。
// execFile 不经过 shell，参数作为独立数组传递。
// ============================================================

import { execFile } from 'child_process'
import { promisify } from 'util'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

const execFileAsync = promisify(execFile)

export const findTool: AgentTool = {
  name: 'find',
  label: 'Find',
  description: '按名称模式查找文件和目录（支持通配符 *）',
  parameters: Type.Object({
    pattern: Type.String({ description: '文件名模式（如 "*.ts"、"main*"）' }),
    path: Type.Optional(Type.String({ description: '搜索起点目录（默认当前目录）' })),
  }),

  async execute(toolCallId, params) {
    const pattern = params.pattern as string
    const path = (params.path as string) || '.'
    try {
      // execFile 不经过 shell，参数作为独立数组传递，无法注入
      const { stdout } = await execFileAsync('find', [path, '-name', pattern], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      })
      // 限制输出行数
      const lines = stdout.split('\n').slice(0, 50).join('\n')
      return { content: [{ type: 'text', text: lines || '(无匹配文件)' }] }
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
      if (err.stdout) {
        const lines = err.stdout.split('\n').slice(0, 50).join('\n')
        return { content: [{ type: 'text', text: lines }] }
      }
      return {
        content: [{ type: 'text', text: `查找失败: ${err.message || String(error)}` }],
      }
    }
  },
}