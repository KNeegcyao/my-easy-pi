// ============================================================
// TUI Editor — 全屏交互式输入（支持 Slash 命令）
//
// 交互流程：
//   1. 显示 > 提示符等待输入
//   2. 用户输入文本，显示输入边框
//   3. 显示 "piagent is thinking..."
//   4. LLM 流式输出回复内容
//   5. 回到步骤 1
//
// @deprecated Phase 4 起改用 src/tui/components/editor.ts (Editor + parseKeys)。
// 旧实现基于 node readline；新实现基于 raw mode + parseKeys，按 code point
// 移动光标、支持反白光标块渲染与历史浏览。本文件保留作参考。
// ============================================================

import * as readline from 'readline'
import type { Agent } from '../../agent/index.js'
import { printThinking, printPrompt } from './renderer.js'
import { dim, gray, green } from './theme.js'
import { executeCommand } from './commands.js'

export interface EditorOptions {
  agent: Agent
  onExit: () => void
}

export function startEditor(options: EditorOptions): void {
  const { agent } = options

  // 显示启动信息 + 输入提示
  printStartupInfo(agent)
  printPrompt()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  })

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) { printPrompt(); return }

    // 用户输入已实时回显到终端，这里不再重复打印归档行。
    // （旧行为：printUserInput 会再写一行灰色斜体副本，导致视觉重复）

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
      process.stdout.write(`  ${dim(gray('→ 已加入队列'))}\n\n`)
      printPrompt()
      return
    }

    printThinking()

    try {
      await agent.prompt(trimmed)
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      process.stdout.write(`\n  ${green('✗')} 错误: ${errMsg}\n`)
    }

    printPrompt()
  })

  rl.on('close', () => { console.log(''); options.onExit() })
  rl.on('SIGINT', () => rl.close())
}

/** 显示启动信息 */
function printStartupInfo(agent: Agent): void {
  const model = agent.state.model
  const toolCount = agent.state.tools.length
  process.stdout.write(
    `  ${green('piagent')} ${dim(gray('v0.1.0 ·'))} ${dim(gray(`${model.provider}/${model.id}`))}\n` +
    `  ${dim(gray(`${toolCount} 个工具可用 · 输入 /help 查看帮助`))}\n\n`
  )
}