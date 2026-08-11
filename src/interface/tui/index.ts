// ============================================================
// TUI 入口 — 全屏终端界面
//
// 类似 Claude Code 的全屏交互体验。
// 包含全局错误处理，防止意外退出。
//
// @deprecated Phase 4 起，-i 模式默认改用 src/tui/host.ts (startTUI)。
//   本文件保留作旧实现参考，不再被 cli.ts 引用。
//   新实现：src/tui/ 组件框架 + host.ts 事件接入（raw mode + parseKeys +
//   CSI 2026 + commitTranscript 二元划分）。设计依据见 docs/tui-strategy.md。
// ============================================================

import type { Agent } from '../../agent/index.js'
import { createTUIRenderer } from './renderer.js'
import { startEditor } from './editor.js'
import { enterAltScreen, exitAltScreen, hideCursor, showCursor } from './theme.js'
import { isAppError } from '../../ai/errors.js'

export function startTUI(agent: Agent): void {
  process.stdout.write(enterAltScreen() + hideCursor())

  const cleanup = () => {
    process.stdout.write(showCursor() + exitAltScreen())
  }

  // 全局错误处理 — 防止未捕获异常导致进程退出
  process.on('uncaughtException', (err) => {
    const msg = isAppError(err) ? `[${err.code}] ${err.message}` : err.message
    process.stderr.write(`\n  ⚠ ${msg}\n`)
  })
  process.on('unhandledRejection', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`\n  ⚠ ${msg}\n`)
  })

  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  // 创建事件渲染器
  createTUIRenderer(agent)

  // 启动编辑器（包含启动信息、输入循环）
  startEditor({
    agent,
    onExit: () => { cleanup(); process.exit(0) },
  })
}