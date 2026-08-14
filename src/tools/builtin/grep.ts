// ============================================================
// Grep 工具 — factory + default instance
//
// 使用 execFile 而不是 exec 来避免命令注入。
// execFile 不经过 shell，参数作为独立数组传递。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations } from '../operations.js'
import { defaultOperations } from '../operations.js'
import type { ToolDefinition } from '../../agent/types.js'

export function createGrepTool(ops: Operations): ToolDefinition {
  return {
    name: 'grep',
    label: 'Grep',
    description: '在文件中搜索关键词（支持正则），返回匹配的行',
    category: 'file',
    dangerLevel: 'safe',
    icon: '🔍',
    parameters: Type.Object({
      pattern: Type.String({ description: '要搜索的关键词或正则表达式' }),
      path: Type.Optional(Type.String({ description: '搜索路径或文件（默认当前目录）' })),
    }),

    async execute(toolCallId, params) {
      const pattern = params.pattern as string
      const path = (params.path as string) || '.'
      try {
        const stdout = await ops.grep(pattern, path)
        return { content: [{ type: 'text', text: stdout || '(无匹配结果)' }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `搜索失败: ${error instanceof Error ? error.message : String(error)}` }],
        }
      }
    },
  }
}

export const grepTool = createGrepTool(defaultOperations)