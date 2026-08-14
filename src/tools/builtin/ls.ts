// ============================================================
// Ls 工具 — factory + default instance
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations } from '../operations.js'
import { defaultOperations } from '../operations.js'
import type { ToolDefinition } from '../../agent/types.js'

export function createLsTool(ops: Operations): ToolDefinition {
  return {
    name: 'ls',
    label: 'List',
    description: '列出指定目录下的文件和子目录',
    category: 'file',
    dangerLevel: 'safe',
    icon: '📁',
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: '目录路径（默认当前目录）' })),
    }),

    async execute(toolCallId, params) {
      const path = (params.path as string) || '.'
      try {
        const entries = await ops.listDir(path)
        const result = entries.map(e => {
          const prefix = e.isDirectory ? '📁' : '📄'
          return `${prefix} ${e.name}`
        }).join('\n')
        return { content: [{ type: 'text', text: result || '(空目录)' }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `列出目录失败: ${error instanceof Error ? error.message : String(error)}` }],
        }
      }
    },
  }
}

export const lsTool = createLsTool(defaultOperations)