// ============================================================
// TUI Renderer — 全屏渲染器（@deprecated，被 src/tui/ 取代）
//
// 流式 Markdown 渲染策略：
//   每次 message_update 收到完整内容，用 marked 重新解析，
//   计算出新的行数。如果行数变化，用 ANSI 移动光标覆盖旧内容。
//   这解决了流式分块导致的 Markdown 标记不完整问题。
//
// @deprecated 已被 src/tui/host.ts + 组件框架取代，仅保留供参考/回滚。
//   新入口:startTUI (src/tui/index.ts)
// ============================================================

import type { Agent, AgentEvent } from '../../agent/index.js'
import { dim, gray, green, yellow, red, clearLine, italic } from './theme.js'
import { renderToLines } from '../markdown-renderer.js'

// 用于覆盖旧输出的 ANSI 序列
const CURSOR_UP = (n: number) => `\x1b[${n}A`
const CURSOR_DOWN = (n: number) => `\x1b[${n}B`

export function createTUIRenderer(agent: Agent): void {
  let renderedLines = 0       // 已渲染的行数（用于覆盖）
  let bufferedContent = ''    // 累积的完整内容
  let hasReceivedContent = false
  const toolNameMap = new Map<string, string>()

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        renderedLines = 0
        bufferedContent = ''
        hasReceivedContent = false
        break

      case 'message_update': {
        const newContent = event.message.content
        if (!newContent || newContent === bufferedContent) break

        if (!hasReceivedContent) {
          // 首次内容：清除 thinking 行
          process.stdout.write('\r' + clearLine() + '\r')
          hasReceivedContent = true
        } else if (renderedLines > 0) {
          // 后续更新：光标上移覆盖旧内容
          process.stdout.write(CURSOR_UP(renderedLines))
        }

        // 用 marked 解析并渲染为 ANSI 行
        const lines = renderToLines(newContent)
        renderedLines = lines.length

        // 输出每一行
        for (const line of lines) {
          if (line === '') {
            process.stdout.write('\n')
          } else {
            process.stdout.write(line + '\n')
          }
        }

        bufferedContent = newContent
        break
      }

      case 'message_end': {
        const msg = event.message
        if (msg.role === 'assistant' && bufferedContent) {
          process.stdout.write('\n')
        }
        bufferedContent = ''
        renderedLines = 0
        break
      }

      case 'tool_execution_start': {
        toolNameMap.set(event.toolCallId, event.toolName)
        const prevLines = renderedLines
        // 如果有正在输出的内容，先移到新行
        if (prevLines > 0) {
          process.stdout.write(CURSOR_DOWN(prevLines - 1) + '\n')
        }
        renderedLines = 0
        const args = event.args as Record<string, unknown>
        const argText = Object.entries(args)
          .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
          .join(', ')
        process.stdout.write(`  ${dim('→')} ${yellow(event.toolName)}${argText ? ` ${dim(gray(argText))}` : ''}\n`)
        break
      }

      case 'tool_execution_end': {
        toolNameMap.delete(event.toolCallId)
        // 工具执行完成，刷新表示已完成
        break
      }

      case 'error':
        process.stdout.write(`\r${clearLine()}\r  ${red('✗')} ${event.message}\n`)
        break
    }
  })
}

export function printThinking(): void {
  // 不用 \r 清除，让它在单独一行
  process.stdout.write(`${dim(gray('piagent is thinking...'))}`)
}

export function printPrompt(): void {
  process.stdout.write(`\n${green('> ')}`)
}

export function printUserInput(input: string): void {
  process.stdout.write(`\r${clearLine()}\r${dim(gray('>'))} ${italic(gray(input))}\n`)
}