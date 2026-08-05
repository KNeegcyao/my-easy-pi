// ============================================================
// TUI Editor — 全屏交互式输入
// ============================================================

import * as readline from 'readline'
import { printThinking, printPrompt, printUserInput } from './renderer.js'

export interface EditorOptions {
  onInput: (input: string) => Promise<void>
  onExit: () => void
}

export function startEditor(options: EditorOptions): void {
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

    printUserInput(trimmed)
    printThinking()

    try {
      await options.onInput(trimmed)
    } catch (error) {
      process.stdout.write(`\n错误: ${error instanceof Error ? error.message : String(error)}\n`)
    }

    printPrompt()
  })

  rl.on('close', () => { console.log(''); options.onExit() })
  rl.on('SIGINT', () => rl.close())
}