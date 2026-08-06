// ============================================================
// Write 工具 — 写入/覆盖文件内容
// ============================================================

import { writeFile } from 'fs/promises'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

export const writeTool: AgentTool = {
  name: 'write',
  label: 'Write',
  description: '写入内容到指定文件（会覆盖已有内容）',
  parameters: Type.Object({
    path: Type.String({ description: '文件路径' }),
    content: Type.String({ description: '要写入的内容' }),
  }),

  async execute(toolCallId, params) {
    const path = params.path as string
    const content = params.content as string
    try {
      await writeFile(path, content, 'utf-8')
      return { content: [{ type: 'text', text: `已写入 ${path}（${content.length} 字符）` }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `写入失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}