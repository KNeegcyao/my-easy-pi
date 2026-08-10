// ============================================================
// Web Fetch 工具
//
// 让 LLM 可以直接读取网页内容（支持 raw.githubusercontent.com、
// GitHub API、文档站点等），无需先 git clone。
//
// 使用 Node.js 内置的 fetch API，不依赖第三方库。
// 只支持 GET 请求，返回纯文本内容。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

/** 创建 web_fetch 工具 */
export const webFetchTool: AgentTool = {
  name: 'web_fetch',
  label: 'Web Fetch',
  description: '读取网页内容，支持 GitHub raw 文件、API 响应、文档页面等',
  parameters: Type.Object({
    url: Type.String({ description: '要读取的网页 URL（如 https://raw.githubusercontent.com/xxx/README.md）' }),
  }),

  async execute(toolCallId, params, signal) {
    const url = params.url as string

    try {
      const response = await fetch(url, { signal })

      if (!response.ok) {
        return {
          content: [{
            type: 'text',
            text: `HTTP ${response.status}: ${response.statusText}\n${await response.text().catch(() => '(无法读取响应体)')}`,
          }],
          isError: true,
        }
      }

      const text = await response.text()
      const truncated = text.length > 100_000
        ? text.slice(0, 100_000) + `\n\n...（内容已截断，共 ${text.length} 字符，仅显示前 100K）`
        : text

      return {
        content: [{ type: 'text', text: truncated }],
        details: { url, contentType: response.headers.get('content-type'), size: text.length },
      }
    } catch (error: unknown) {
      const err = error as Error
      return {
        content: [{ type: 'text', text: `请求失败: ${err.message}` }],
        isError: true,
      }
    }
  },
}