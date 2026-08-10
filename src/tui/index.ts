// ============================================================
// @piagent/tui — 极简终端 UI 框架（骨架，阶段 0 产出）
//
// 设计文档：docs/tui-strategy.md
// ============================================================

export type { Component, TUI, Focusable, OverlayHandle, OverlayOptions } from './component.js'
export { isFocusable } from './component.js'

export { Terminal, type TerminalCapabilities } from './terminal.js'
export { ScreenBuffer, type RowUpdate } from './screen-buffer.js'
export { Csi2026 } from './csi2026.js'

export { TuiMainScreen } from './renderer-main.js'
export { TuiAltScreen } from './renderer-alt.js'

export * from './layout/index.js'
export * from './components/index.js'

// ANSI 工具单独路径导出，避免污染命名空间
export * as ansi from './ansi.js'
