// ============================================================
// TUI Renderer — 全屏渲染器
//
// 简洁、稳定的消息展示。
// 不用 \r 覆盖方案（跨终端不可靠），改用换行分隔。
// ============================================================

import type { Agent, AgentEvent } from '../../agent/index.js'
import { dim, gray, green, yellow, cyan, red, clearLine, italic } from './theme.js'

export function createTUIRenderer(agent: Agent): void {
  let lastContentLength = 0
  let hasReceivedContent = false
  const toolNameMap = new Map<string, string>()

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        lastContentLength = 0
        hasReceivedContent = false
        break

      case 'message_update': {
        const content = event.message.content
        if (content) {
          // 首次内容：换行清除 thinking 占用行
          if (!hasReceivedContent && content.length > 0) {
            process.stdout.write('\n')
            hasReceivedContent = true
          }
          // 增量输出
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

      case 'tool_execution_start': {
        toolNameMap.set(event.toolCallId, event.toolName)
        process.stdout.write('\r' + clearLine() + '\r')
        const args = event.args as Record<string, unknown>
        const argText = Object.entries(args)
          .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
          .join(', ')
        process.stdout.write(`  ${dim('→')} ${yellow(event.toolName)}${argText ? ` ${dim(gray(argText))}` : ''}\n`)
        break
      }

      case 'tool_execution_end':
        toolNameMap.delete(event.toolCallId)
        break

      case 'error':
        process.stdout.write(`  ${red('✗')} ${event.message}\n`)
        break
    }
  })
}

export function printThinking(): void {
  process.stdout.write(`  ${dim(gray('piagent is thinking...'))}`)
}

export function printPrompt(): void {
  process.stdout.write(`\n${green('> ')}`)
}

export function printUserInput(input: string): void {
  process.stdout.write(`\r${clearLine()}\r${dim(gray('>'))} ${italic(gray(input))}\n`)
}