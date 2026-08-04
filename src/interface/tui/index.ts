// ============================================================
// TUI 入口 — 终端交互界面
//
// 提供交互式对话界面，用户可以连续输入多轮对话。
// ============================================================

import type { Agent } from '../../agent/index.js'
import { createTUIRenderer } from './renderer.js'
import { startEditor } from './editor.js'

export function startTUI(agent: Agent): void {
  // 连接渲染器
  createTUIRenderer(agent)

  console.log('╔══════════════════════════════════════╗')
  console.log('║   piagent — AI 编程助手              ║')
  console.log('║   输入 /exit 退出                     ║')
  console.log('╚══════════════════════════════════════╝')
  console.log('')

  // 启动输入编辑器
  startEditor({
    prompt: '> ',
    onInput: async (input) => {
      await agent.prompt(input)
    },
    onExit: () => {
      process.exit(0)
    },
  })
}