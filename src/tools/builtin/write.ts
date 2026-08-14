// ============================================================
// Write 工具 — factory + default instance
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations } from '../operations.js'
import { defaultOperations } from '../operations.js'
import type { ToolDefinition } from '../../agent/types.js'

export function createWriteTool(ops: Operations): ToolDefinition {
  return {
    name: 'write',
    label: 'Write',
    description: '写入内容到指定文件（会覆盖已有内容）',
    category: 'file',
    dangerLevel: 'dangerous',
    icon: '✏️',
    parameters: Type.Object({
      path: Type.String({ description: '文件路径' }),
      content: Type.String({ description: '要写入的内容' }),
    }),

    async execute(toolCallId, params) {
      const path = params.path as string
      const content = params.content as string
      try {
        await ops.writeFile(path, content)
        return { content: [{ type: 'text', text: `已写入 ${path}（${content.length} 字符）` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `写入失败: ${error instanceof Error ? error.message : String(error)}` }],
        }
      }
    },
  }
}

export const writeTool = createWriteTool(defaultOperations)