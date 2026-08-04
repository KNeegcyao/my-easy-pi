// ============================================================
// Grep 工具 — 在文件中搜索文本
// ============================================================

import { exec } from 'child_process'
import { promisify } from 'util'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../ai/types.js'

const execAsync = promisify(exec)

export const grepTool: AgentTool = {
  name: 'grep',
  label: 'Grep',
  description: '在文件中搜索关键词（支持正则），返回匹配的行',
  parameters: Type.Object({
    pattern: Type.String({ description: '要搜索的关键词或正则表达式' }),
    path: Type.Optional(Type.String({ description: '搜索路径或文件（默认当前目录）' })),
  }),

  async execute(toolCallId, params) {
    const pattern = params.pattern as string
    const path = (params.path as string) || '.'
    try {
      const { stdout } = await execAsync(`grep -rn "${pattern}" "${path}" 2>/dev/null || true`, { timeout: 10000 })
      return { content: [{ type: 'text', text: stdout || '(无匹配结果)' }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `搜索失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}