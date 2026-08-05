// ============================================================
// TUI 入口 — 全屏终端界面
//
// 类似 Claude Code 的全屏交互体验。
// ============================================================

import type { Agent } from '../../agent/index.js'
import { createTUIRenderer } from './renderer.js'
import { startEditor } from './editor.js'
import { green, gray, enterAltScreen, exitAltScreen, hideCursor, showCursor } from './theme.js'

export function startTUI(agent: Agent): void {
  process.stdout.write(enterAltScreen() + hideCursor())

  const cleanup = () => {
    process.stdout.write(showCursor() + exitAltScreen())
  }
  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  createTUIRenderer(agent)

  const model = agent.state.model
  process.stdout.write(
    `  ${green('piagent')} — ${gray(`${model.provider}/${model.id}`)}\n\n`
  )

  startEditor({
    agent,
    onExit: () => { cleanup(); process.exit(0) },
  })
}