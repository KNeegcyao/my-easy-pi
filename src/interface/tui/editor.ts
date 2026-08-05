// ============================================================
// TUI Editor — 文本输入编辑器
//
// 使用 readline 实现交互式输入。
// ============================================================

import * as readline from 'readline'
import { USER_LABEL, PROMPT_SYMBOL } from './theme.js'

export interface EditorOptions {
  onInput: (input: string) => Promise<void>
  onExit: () => void
}

export function startEditor(options: EditorOptions): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `  ${USER_LABEL} ${PROMPT_SYMBOL} `,
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      rl.prompt()
      return
    }

    if (['/exit', '/quit'].includes(trimmed)) {
      rl.close()
      return
    }

    rl.pause()

    try {
      process.stdout.write(`  `)
      await options.onInput(trimmed)
    } catch (error) {
      console.error('\n错误:', error instanceof Error ? error.message : String(error))
    }

    rl.resume()
    rl.prompt()
  })

  rl.on('close', () => {
    console.log('\n再见！')
    options.onExit()
  })

  rl.on('SIGINT', () => rl.close())
}