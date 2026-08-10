// ============================================================
// TUI Renderer — 全屏渲染器
//
// 简洁、干净的消息展示。
// 不做 Markdown 渲染（流式分块无法正确处理），直接输出原始内容。
// 只格式化 UI 边框元素（工具调用、结果、用户输入等）。
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
          // 首次收到内容时，清除 thinking 行
          if (!hasReceivedContent && content.length > 0) {
            process.stdout.write('\r' + clearLine() + '\r')
            hasReceivedContent = true
          }
          // 增量输出原始内容（不做 Markdown 转换）
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
        const args = event.args as Record<string, unknown>
        const argText = Object.entries(args)
          .map(([k, v]) => {
            const s = String(v)
            return s.length > 80 ? `${k}: ${s.slice(0, 80)}...` : `${k}: ${s}`
          })
          .join(', ')
        process.stdout.write(`\r${clearLine()}\r  ${dim('→')} ${yellow(event.toolName)} ${dim(gray(`(${argText})`))}`)
        break
      }

      case 'tool_execution_end': {
        const name = toolNameMap.get(event.toolCallId) || 'tool'
        toolNameMap.delete(event.toolCallId)
        const textContent = event.result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map(c => c.text)
          .join('\n')
          .split('\n')
          .filter(Boolean)
          .slice(0, 3)
          .join(' ')
        process.stdout.write(`\r${clearLine()}\r  ${green('✓')} ${green(name)} ${textContent ? dim(gray(textContent.slice(0, 100))) : ''}\n`)
        break
      }

      case 'error':
        process.stdout.write(`\r${clearLine()}\r  ${red('✗')} ${event.message}\n`)
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
  // 简单的分隔线 + 用户输入
  process.stdout.write(`\r${clearLine()}\r${dim(gray('❯'))} ${italic(gray(input))}\n`)
}