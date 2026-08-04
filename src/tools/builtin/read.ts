// ============================================================
// Read 工具 — 读取文件内容
// ============================================================

import { readFile } from 'fs/promises'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../ai/types.js'

export const readTool: AgentTool = {
  name: 'read',
  label: 'Read',
  description: '读取指定文件的完整内容',
  parameters: Type.Object({
    path: Type.String({ description: '文件路径' }),
    limit: Type.Optional(Type.Number({ description: '最大读取行数（默认全部）' })),
  }),

  async execute(toolCallId, params) {
    const path = params.path as string
    try {
      const content = await readFile(path, 'utf-8')
      const lines = content.split('\n')
      const limit = params.limit as number | undefined
      const result = limit ? lines.slice(0, limit).join('\n') : content
      return { content: [{ type: 'text', text: result || '(空文件)' }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `读取失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}