// ============================================================
// TUI Editor — 全屏交互式输入（支持 Slash 命令）
// ============================================================

import * as readline from 'readline'
import type { Agent } from '../../agent/index.js'
import { printThinking, printPrompt } from './renderer.js'
import { dim, gray } from './theme.js'
import { executeCommand } from './commands.js'

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

    // 处理 Slash 命令
    if (trimmed.startsWith('/')) {
      const result = executeCommand(trimmed, agent)
      if (result) {
        if (result.output) process.stdout.write(result.output + '\n')
        if (trimmed === '/exit' || trimmed === '/quit') {
          rl.close()
          return
        }
        printPrompt()
        return
      }
    }

    // Agent 忙时排入队列
    if (agent.state.isStreaming) {
      agent.followUp(trimmed)
      process.stdout.write(`\r${dim(gray('→ 已加入队列'))}\n\n`)
      printPrompt()
      return
    }

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