// ============================================================
// Grep 工具 — 在文件中搜索文本
//
// 使用 execFile 而不是 exec 来避免命令注入。
// execFile 不经过 shell，参数作为独立数组传递。
// ============================================================

import { execFile } from 'child_process'
import { promisify } from 'util'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

const execFileAsync = promisify(execFile)

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
      // execFile 不经过 shell，参数作为独立数组传递，无法注入
      const { stdout } = await execFileAsync('grep', ['-rn', pattern, path], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      })
      return { content: [{ type: 'text', text: stdout || '(无匹配结果)' }] }
    } catch (error) {
      // grep 返回非零退出码（无匹配）也会抛异常，捕获后正常返回
      const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
      if (err.stdout) {
        return { content: [{ type: 'text', text: err.stdout }] }
      }
      return {
        content: [{ type: 'text', text: `搜索失败: ${err.message || String(error)}` }],
      }
    }
  },
}