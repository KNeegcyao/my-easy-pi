// ============================================================
// TUI Renderer — 消息渲染器
//
// 将 Agent 的输出渲染为结构化、带颜色的终端消息。
// ============================================================

import { EOL } from 'os'
import type { Agent, AgentEvent } from '../../agent/index.js'
import { AI_LABEL, TOOL_LABEL, ERROR_LABEL, dim, green } from './theme.js'

export function createTUIRenderer(agent: Agent): void {
  let lastContentLength = 0

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        lastContentLength = 0
        break

      case 'message_update': {
        const content = event.message.content
        if (content) {
          const newPart = content.slice(lastContentLength)
          if (newPart) process.stdout.write(newPart)
          lastContentLength = content.length
        }
        break
      }

      case 'message_end': {
        const msg = event.message
        if (msg.role === 'assistant') {
          process.stdout.write(EOL + EOL)
        }
        break
      }

      case 'tool_execution_start':
        process.stdout.write(EOL + `  ${TOOL_LABEL} ${event.toolName}(${JSON.stringify(event.args)})` + EOL)
        break

      case 'tool_execution_end':
        process.stdout.write(`  ${dim(green('✓'))} 完成` + EOL + EOL)
        break

      case 'error':
        process.stdout.write(EOL + `  ${ERROR_LABEL} ${event.message}` + EOL)
        break
    }
  })
}

/** 打印用户输入 header */
export function printUserInput(input: string): void {
  process.stdout.write(EOL + `  ${AI_LABEL} `)
}