// ============================================================
// TUI Editor — 全屏交互式输入
// ============================================================

import * as readline from 'readline'
import type { Agent } from '../../agent/index.js'
import { printThinking, printPrompt, printUserInput } from './renderer.js'
import { dim, gray } from './theme.js'

export interface EditorOptions {
  agent: Agent
  onExit: () => void
}

export function startEditor(options: EditorOptions): void {
  const { agent } = options
  printPrompt()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  })

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) { printPrompt(); return }
    if (['/exit', '/quit'].includes(trimmed)) { rl.close(); return }

    if (agent.state.isStreaming) {
      agent.followUp(trimmed)
      process.stdout.write(`\r${dim(gray('→ 已加入队列'))}\n\n`)
      printPrompt()
      return
    }

    printUserInput(trimmed)
    printThinking()

    try {
      await agent.prompt(trimmed)
    } catch (error) {
      process.stdout.write(`\n错误: ${error instanceof Error ? error.message : String(error)}\n`)
    }

    printPrompt()
  })

  rl.on('close', () => { console.log(''); options.onExit() })
  rl.on('SIGINT', () => rl.close())
}