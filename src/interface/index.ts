// 接口层统一导出
// 说明：TUI 主入口（startTUI）统一从 src/tui/index.ts 导出，旧实现（src/interface/tui/index.ts）已清理。
export { createPrintInterface } from './print.js'
export { createJSONInterface } from './json.js'
export { startRPC } from './rpc.js'
export { renderToLines, stripMarkdown } from './markdown-renderer.js'