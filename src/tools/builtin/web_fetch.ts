// ============================================================
// Web Fetch 工具 — factory + default instance
//
// 让 LLM 可以直接读取网页内容（支持 raw.githubusercontent.com、
// GitHub API、文档站点等），无需先 git clone。
//
// 使用 Node.js 内置的 fetch API，不依赖第三方库。
// 只支持 GET 请求，返回纯文本内容。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations } from '../operations.js'
import { defaultOperations } from '../operations.js'
import type { ToolDefinition } from '../../agent/types.js'

export function createWebFetchTool(ops: Operations): ToolDefinition {
  return {
    name: 'web_fetch',
    label: 'Web Fetch',
    description: '读取网页内容，支持 GitHub raw 文件、API 响应、文档页面等',
    category: 'network',
    dangerLevel: 'safe',
    icon: '🌐',
    parameters: Type.Object({
      url: Type.String({ description: '要读取的网页 URL（如 https://raw.githubusercontent.com/xxx/README.md）' }),
    }),

    async execute(toolCallId, params, signal) {
      const url = params.url as string

      try {
        const text = await ops.fetchUrl(url, signal)
        const truncated = text.length > 100_000
          ? text.slice(0, 100_000) + `\n\n...（内容已截断，共 ${text.length} 字符，仅显示前 100K）`
          : text

        return {
          content: [{ type: 'text', text: truncated }],
          details: { url, size: text.length },
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: `请求失败: ${msg}` }],
          isError: true,
        }
      }
    },
  }
}

export const webFetchTool = createWebFetchTool(defaultOperations)