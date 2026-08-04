// ============================================================
// Edit 工具 — 精确替换文件中的内容
//
// 在文件中找到 old 字符串，替换成 new 字符串。
// 类似 sed 但更安全——只替换第一个匹配。
// ============================================================

import { readFile, writeFile } from 'fs/promises'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../ai/types.js'

export const editTool: AgentTool = {
  name: 'edit',
  label: 'Edit',
  description: '在指定文件中查找并替换文本（只替换第一个匹配）',
  parameters: Type.Object({
    path: Type.String({ description: '文件路径' }),
    old: Type.String({ description: '要被替换的原文（必须完整匹配）' }),
    new: Type.String({ description: '替换后的新内容' }),
  }),

  async execute(toolCallId, params) {
    const path = params.path as string
    const oldStr = params.old as string
    const newStr = params.new as string

    try {
      const content = await readFile(path, 'utf-8')
      if (!content.includes(oldStr)) {
        return { content: [{ type: 'text', text: `替换失败：在 ${path} 中未找到匹配的文本` }] }
      }
      const result = content.replace(oldStr, newStr)
      await writeFile(path, result, 'utf-8')
      return { content: [{ type: 'text', text: `已替换 ${path} 中的内容` }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `替换失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}