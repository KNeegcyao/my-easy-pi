// ============================================================
// TUI Renderer — 全屏渲染器
//
// 管理消息区域的渲染，使用 alternate screen。
// ============================================================

import type { Agent, AgentEvent } from '../../agent/index.js'
import { dim, gray, green, red, clearLine } from './theme.js'

let lastContentLength = 0
let hasReceivedContent = false

export function createTUIRenderer(agent: Agent): void {
  lastContentLength = 0
  hasReceivedContent = false

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        lastContentLength = 0
        hasReceivedContent = false
        break

      case 'message_update': {
        const content = event.message.content
        if (content) {
          if (!hasReceivedContent && content.length > 0) {
            process.stdout.write('\r' + clearLine() + '\r')
            hasReceivedContent = true
          }
          const newPart = content.slice(lastContentLength)
          if (newPart) process.stdout.write(newPart)
          lastContentLength = content.length
        }
        break
      }

      case 'message_end':
        if (event.message.role === 'assistant' && lastContentLength > 0) {
          process.stdout.write('\n')
        }
        break

      case 'tool_execution_start':
        process.stdout.write('\r' + clearLine() + '\r')
        process.stdout.write(`  ${dim('→')} ${event.toolName}` + '\n')
        break

      case 'tool_execution_end':
        process.stdout.write(`  ${green('✓')} 完成\n`)
        break

      case 'error':
        process.stdout.write('\r' + clearLine() + '\r')
        process.stdout.write(`  ${red('✗')} ${event.message}\n`)
        break
    }
  })
}

export function printThinking(): void {
  process.stdout.write(`\r${clearLine()}\r\x1b[90m\x1b[3mpiagent is thinking...\x1b[23m\x1b[0m`)
}

export function printPrompt(): void {
  process.stdout.write(`\n\x1b[32m> \x1b[0m`)
}

export function printUserInput(input: string): void {
  process.stdout.write(`\r${clearLine()}\r\x1b[90m> \x1b[0m${input}\n`)
}