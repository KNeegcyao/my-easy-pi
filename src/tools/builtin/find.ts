// ============================================================
// Find 工具 — factory + default instance
//
// 使用 execFile 而不是 exec 来避免命令注入。
// execFile 不经过 shell，参数作为独立数组传递。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations } from '../operations.js'
import { defaultOperations } from '../operations.js'
import type { ToolDefinition } from '../../agent/types.js'

export function createFindTool(ops: Operations): ToolDefinition {
  return {
    name: 'find',
    label: 'Find',
    description: '按名称模式查找文件和目录（支持通配符 *）',
    category: 'file',
    dangerLevel: 'safe',
    icon: '🔎',
    parameters: Type.Object({
      pattern: Type.String({ description: '文件名模式（如 "*.ts"、"main*"）' }),
      path: Type.Optional(Type.String({ description: '搜索起点目录（默认当前目录）' })),
    }),

    async execute(toolCallId, params) {
      const pattern = params.pattern as string
      const path = (params.path as string) || '.'
      try {
        const stdout = await ops.findFiles(pattern, path)
        const lines = stdout.split('\n').slice(0, 50).join('\n')
        return { content: [{ type: 'text', text: lines || '(无匹配文件)' }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `查找失败: ${error instanceof Error ? error.message : String(error)}` }],
        }
      }
    },
  }
}

export const findTool = createFindTool(defaultOperations)