// ============================================================
// TUI 入口
// ============================================================

import type { Agent } from '../../agent/index.js'
import { createTUIRenderer } from './renderer.js'
import { startEditor } from './editor.js'
import { green, dim, gray } from './theme.js'

export function startTUI(agent: Agent): void {
  createTUIRenderer(agent)

  const model = agent.state.model
  const welcome = [
    green('piagent'),
    dim(` — ${model.provider}/${model.id}`),
    '',
    gray('  /exit 退出 · 直接输入开始对话'),
  ].join('\n')

  console.log('\n' + welcome + '\n')
  startEditor({
    onInput: async (input) => { await agent.prompt(input) },
    onExit: () => process.exit(0),
  })
}