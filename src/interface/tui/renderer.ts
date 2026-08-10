// ============================================================
// TUI Renderer — 全屏渲染器
//
// 管理消息区域的渲染，使用 alternate screen。
// 流式增量输出，自动剥离 Markdown 标记。
// ============================================================

import type { Agent, AgentEvent } from '../../agent/index.js'
import { dim, gray, green, red, clearLine } from './theme.js'
import { stripMarkdown } from '../markdown-renderer.js'

export function createTUIRenderer(agent: Agent): void {
  let lastContentLength = 0
  let hasReceivedContent = false

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
            // 清除"thinking..."行
            process.stdout.write('\r' + clearLine() + '\r')
            hasReceivedContent = true
          }
          // 增量输出 — 只写入新增的字符
          const newPart = content.slice(lastContentLength)
          if (newPart) {
            process.stdout.write(stripMarkdown(newPart))
          }
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