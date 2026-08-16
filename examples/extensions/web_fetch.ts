// ============================================================
// web_fetch 扩展 — 自定义工具教学案例
//
// 这是"自定义工具"的官方示例：演示如何不改内核、通过扩展机制
// 给 Agent 添加一个全新工具（让 LLM 直接读取网页内容）。
//
// 设计思想（借鉴 pi 的"自扩展"哲学）：
//   - 内置工具住在 src/tools/builtin/，随内核编译
//   - 自定义工具写成"扩展文件"，由 ExtensionLoader 在运行时发现并注册
//   - 因此加一个新工具不需要动任何核心代码
//
// 使用方式：
//   1. 把本文件复制到 .pi/extensions/（项目级）或 ~/.my-easy-pi/extensions/（全局）
//   2. 启动 my-easy-pi，ExtensionLoader 会自动扫描并加载
//   3. LLM 就能像使用内置工具一样调用 web_fetch
//
// 参考 pi: packages/coding-agent/examples/extensions/hello.ts
// ============================================================

import { Type } from '@sinclair/typebox'
import type { Operations } from '../../src/tools/operations.js'
import { defaultOperations } from '../../src/tools/operations.js'
import type { ExtensionAPI } from '../../src/extension/api.js'
import type { ToolDefinition } from '../../src/agent/types.js'

// ------------------------------------------------------------------
// 1) 工具本体：与内置工具一样，返回一个 ToolDefinition（AgentTool）
//
// 使用 factory 模式，便于测试时注入 mock 的 Operations。
// 只支持 GET 请求，返回纯文本内容；使用 Node 内置 fetch，无第三方依赖。
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// 2) 扩展入口：默认导出一个函数，接收 ExtensionAPI
//
// ExtensionLoader 发现本文件后会调用 default(api)，
// 我们在这里把自定义工具注册进 ToolRegistry。
// 这也是整个扩展机制唯一的"接线点"。
// ------------------------------------------------------------------
export default function registerWebFetchExtension(api: ExtensionAPI): void {
  api.registerTool(createWebFetchTool(defaultOperations))
}
