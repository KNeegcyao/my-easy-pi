// ============================================================
// Edit 工具 — factory + default instance
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations } from '../operations.js'
import { defaultOperations } from '../operations.js'
import type { ToolDefinition } from '../../agent/types.js'

export function createEditTool(ops: Operations): ToolDefinition {
  return {
    name: 'edit',
    label: 'Edit',
    description: '在指定文件中查找并替换文本（只替换第一个匹配）',
    category: 'file',
    dangerLevel: 'dangerous',
    icon: '🔧',
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
        const ok = await ops.replaceInFile(path, oldStr, newStr)
        if (!ok) {
          return { content: [{ type: 'text', text: `替换失败：在 ${path} 中未找到匹配的文本` }] }
        }
        return { content: [{ type: 'text', text: `已替换 ${path} 中的内容` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `替换失败: ${error instanceof Error ? error.message : String(error)}` }],
        }
      }
    },
  }
}

export const editTool = createEditTool(defaultOperations)