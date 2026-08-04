// ============================================================
// Print 模式 — 简单的命令行输出接口
//
// 订阅 Agent 事件，把 LLM 的流式输出打印到终端。
// 这是最简单的交互方式，适合管道场景：
//   echo "Hello" | piagent -p "翻译成中文"
// ============================================================

import { EOL } from 'os'
import type { Agent, AgentEvent } from '../agent/index.js'

/** 创建打印接口：订阅 Agent 事件并将输出打印到终端 */
export function createPrintInterface(agent: Agent): void {
  // 记录已打印的内容长度，用于增量输出
  let lastContentLength = 0

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        // 新一轮消息开始，重置记录
        lastContentLength = 0
        break

      case 'message_update': {
        const content = event.message.content
        if (content) {
          // 只打印新增的部分（delta），而不是重写全部内容
          const newPart = content.slice(lastContentLength)
          if (newPart) {
            process.stdout.write(newPart)
          }
          lastContentLength = content.length
        }
        break
      }

      case 'message_end': {
        const msg = event.message
        if (msg.role === 'assistant') {
          // 完成一条 assistant 消息，换行
          process.stdout.write(EOL + EOL)

          // 如果有工具调用，显示调用信息
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            for (const tc of msg.toolCalls) {
              process.stdout.write(`[工具调用] ${tc.name}(${JSON.stringify(tc.args)})${EOL}`)
            }
            process.stdout.write(EOL)
          }
        }
        break
      }

      case 'tool_execution_end':
        // 工具执行完成
        process.stdout.write(`[工具结果] (已完成)${EOL}`)
        break

      case 'error':
        process.stderr.write(`[错误] ${event.message}${EOL}`)
        break
    }
  })
}