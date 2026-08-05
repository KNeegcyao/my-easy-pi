// ============================================================
// TUI Renderer — 流式渲染器
//
// 流式渲染 AI 回复，覆盖 "thinking..." 行。
// ============================================================

import { EOL } from 'os'
import type { Agent, AgentEvent } from '../../agent/index.js'
import { dim, green, yellow, red, italic, gray } from './theme.js'

/** 清除当前行 */
function clearLine(): void {
  process.stdout.write('\x1b[2K\r')
}

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
          // 第一条数据到达时，清除 "thinking..." 行
          if (!hasReceivedContent && content.length > 0) {
            clearLine()
            hasReceivedContent = true
          }
          const newPart = content.slice(lastContentLength)
          if (newPart) process.stdout.write(newPart)
          lastContentLength = content.length
        }
        break
      }

      case 'tool_execution_start':
        clearLine()
        process.stdout.write(`  ${dim(yellow('→'))} ${event.toolName}` + EOL)
        break

      case 'tool_execution_end':
        process.stdout.write(`  ${dim(green('✓'))} 完成` + EOL)
        break

      case 'error':
        clearLine()
        process.stdout.write(`  ${red('✗')} ${event.message}` + EOL)
        break
    }
  })
}