// ============================================================
// TUI Renderer — 全屏渲染器
//
// 管理消息区域的渲染，使用 alternate screen。
// 自动将 Markdown 渲染为 ANSI 终端格式。
// ============================================================

import type { Agent, AgentEvent } from '../../agent/index.js'
import { dim, gray, green, red, clearLine, clearBelow } from './theme.js'
import { renderMarkdown } from '../markdown-renderer.js'

let renderedContent = ''
let hasReceivedContent = false

export function createTUIRenderer(agent: Agent): void {
  renderedContent = ''
  hasReceivedContent = false

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        renderedContent = ''
        hasReceivedContent = false
        break

      case 'message_update': {
        const content = event.message.content
        if (content && content !== renderedContent) {
          // 首次收到内容时，清除"thinking..."行
          if (!hasReceivedContent) {
            process.stdout.write('\r' + clearLine() + '\r')
            hasReceivedContent = true
          }

          // 清除之前渲染的内容，重新输出完整内容
          // 注意：这里假设输出始终在终端底部，使用 clearBelow 清除光标下方
          const prefix = clearBelow()
          process.stdout.write('\r' + prefix + '\r')
          renderMarkdown(content)
          renderedContent = content
        }
        break
      }

      case 'message_end':
        if (event.message.role === 'assistant' && renderedContent) {
          process.stdout.write('\n')
        }
        break

      case 'tool_execution_start':
        process.stdout.write('\r' + clearLine() + '\r')
        process.stdout.write(`  ${dim('→')} ${green(event.toolName)}`)
        break

      case 'tool_execution_end':
        process.stdout.write(` ${green('✓')}\n`)
        break

      case 'error':
        process.stdout.write('\r' + clearLine() + '\r')
        process.stdout.write(`  ${red('✗')} ${event.message}\n`)
        break
    }
  })
}

export function printThinking(): void {
  process.stdout.write(
    `\r${clearLine()}\r${dim(gray('piagent is thinking...'))}`
  )
}

export function printPrompt(): void {
  process.stdout.write(`\n${green('> ')}`)
}

export function printUserInput(input: string): void {
  process.stdout.write(`\r${clearLine()}\r${gray('> ')}${input}\n`)
}