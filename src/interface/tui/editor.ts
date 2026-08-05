// ============================================================
// TUI Editor — 交互式输入
//
// 类似 Claude Code 的交互体验：
//   > 输入你的问题
//   piagent is thinking...
//   AI 的回答内容...
//   >
// ============================================================

import * as readline from 'readline'
import { INPUT_PROMPT, THINKING } from './theme.js'

export interface EditorOptions {
  onInput: (input: string) => Promise<void>
  onExit: () => void
}

export function startEditor(options: EditorOptions): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  })

  // 显示初始提示
  process.stdout.write(INPUT_PROMPT)

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      process.stdout.write(INPUT_PROMPT)
      return
    }

    if (['/exit', '/quit'].includes(trimmed)) {
      rl.close()
      return
    }

    process.stdout.write(THINKING + '\n')

    try {
      await options.onInput(trimmed)
    } catch (error) {
      console.error('\n错误:', error instanceof Error ? error.message : String(error))
    }

    process.stdout.write('\n' + INPUT_PROMPT)
  })

  rl.on('close', () => {
    console.log('')
    options.onExit()
  })

  rl.on('SIGINT', () => rl.close())
}