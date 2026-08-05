// ============================================================
// Print 模式 — 命令行输出接口
//
// 流式输出，适合管道场景：
//   echo "Hello" | piagent -p "翻译成中文"
// ============================================================

import { EOL } from 'os'
import type { Agent, AgentEvent } from '../agent/index.js'

export function createPrintInterface(agent: Agent): void {
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

      case 'message_end':
        if (event.message.role === 'assistant') {
          process.stdout.write(EOL + EOL)
        }
        break

      case 'error':
        process.stderr.write(`[error] ${event.message}${EOL}`)
        break
    }
  })
}