// ============================================================
// Read 工具 — factory + default instance
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations } from '../operations.js'
import { defaultOperations } from '../operations.js'
import type { ToolDefinition } from '../../agent/types.js'

export function createReadTool(ops: Operations): ToolDefinition {
  return {
    name: 'read',
    label: 'Read',
    description: '读取指定文件的完整内容',
    category: 'file',
    dangerLevel: 'safe',
    icon: '📖',
    parameters: Type.Object({
      path: Type.String({ description: '文件路径' }),
      limit: Type.Optional(Type.Number({ description: '最大读取行数（默认全部）' })),
    }),

    async execute(toolCallId, params) {
      const path = params.path as string
      try {
        const content = await ops.readFile(path)
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
}

export const readTool = createReadTool(defaultOperations)