// ============================================================
// Find 工具 — 查找文件/目录
// ============================================================

import { exec } from 'child_process'
import { promisify } from 'util'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

const execAsync = promisify(exec)

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
      const { stdout } = await execAsync(`find "${path}" -name "${pattern}" 2>/dev/null | head -50 || true`, { timeout: 10000 })
      return { content: [{ type: 'text', text: stdout || '(无匹配文件)' }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `查找失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}