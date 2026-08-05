// ============================================================
// TUI 入口 — 终端交互界面
//
// 提供交互式对话界面，风格类似 Claude Code。
// ============================================================

import type { Agent } from '../../agent/index.js'
import { createTUIRenderer } from './renderer.js'
import { startEditor } from './editor.js'
import { cyan, dim, green, bold } from './theme.js'

export function startTUI(agent: Agent): void {
  createTUIRenderer(agent)

  const model = agent.state.model
  const header = [
    '',
    bold(cyan('  ╭─────────────────────────────────────────────╮')),
    bold(cyan('  │') + '           ' + bold(green('piagent')) + ' — AI 编程助手          ' + bold(cyan('│'))),
    bold(cyan('  │') + '    ' + dim(`Model: ${model.provider}/${model.id}`) + '    ' + bold(cyan('│'))),
    bold(cyan('  │') + '    ' + dim('/exit 退出 · 直接输入开始对话') + '    ' + bold(cyan('│'))),
    bold(cyan('  ╰─────────────────────────────────────────────╯')),
    '',
  ].join('\n')

  console.log(header)
  startEditor({
    onInput: async (input) => { await agent.prompt(input) },
    onExit: () => process.exit(0),
  })
}