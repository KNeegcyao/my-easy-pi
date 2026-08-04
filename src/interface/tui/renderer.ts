// ============================================================
// TUI Renderer — 消息渲染器
//
// 将 Agent 的输出消息渲染到终端。
// ============================================================

import { EOL } from 'os'
import type { Agent, AgentEvent } from '../../agent/index.js'

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
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            for (const tc of msg.toolCalls) {
              process.stdout.write(`  🔧 ${tc.name}(${JSON.stringify(tc.args)})${EOL}`)
            }
            process.stdout.write(EOL)
          }
        }
        break
      }

      case 'tool_execution_end':
        process.stdout.write(`  ⚡ 完成${EOL}`)
        break

      case 'error':
        process.stderr.write(`  ❌ ${event.message}${EOL}`)
        break
    }
  })
}