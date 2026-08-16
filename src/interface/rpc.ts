// ============================================================
// RPC 模式 — stdin/stdout JSONL 协议
//
// 允许其他程序（Python、Go 等）通过标准输入输出与 my-easy-pi 通信。
//
// 输入格式（stdin）：
//   {"type":"message","content":"hello"}
//   {"type":"exit"}
//
// 输出格式（stdout）：
//   {"type":"message_update","message":{"content":"你"}}
//   {"type":"message_update","message":{"content":"你好"}}
//   {"type":"message_end","message":{...}}
//   {"type":"agent_end","messages":[...]}
//
// 错误输出（stderr）：
//   人类可读的日志，不影响 JSONL 协议
// ============================================================

import * as readline from 'readline'
import type { Agent, AgentEvent } from '../agent/index.js'

/**
 * 启动 RPC 模式
 *
 * exit 消息不会立即退出：若 Agent 正在流式响应中，先等它 idle（agent_end），
 * 保证上一条 message 的完整事件流已写到 stdout，再退出。避免 exit 抢在
 * async agent.prompt 之前触发 process.exit 导致响应丢失。
 */
export function startRPC(agent: Agent): void {
  // 所有事件输出到 stdout（JSONL）
  agent.subscribe((event: AgentEvent) => {
    const json = JSON.stringify(event) + '\n'
    process.stdout.write(json)
  })

  // 从 stdin 读取消息
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // 提示信息输出到 stderr，不污染 JSONL
    prompt: '',
  })

  let exiting = false

  /** 安全退出：等 Agent 空闲后再退，避免截断进行中的流式响应 */
  async function gracefulExit(): Promise<void> {
    if (exiting) return
    exiting = true
    rl.close()
    await agent.waitForIdle()
    process.exit(0)
  }

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    try {
      const msg = JSON.parse(trimmed)

      switch (msg.type) {
        case 'message':
          if (msg.content) {
            await agent.prompt(msg.content)
          }
          break

        case 'exit':
          await gracefulExit()
          break

        default:
          process.stderr.write(`未知消息类型: ${msg.type}\n`)
      }
    } catch (error) {
      process.stderr.write(`解析失败: ${error}\n`)
    }
  })

  rl.on('close', () => {
    // stdin EOF：同样走 graceful 退出，避免在响应中途被关流截断
    void gracefulExit()
  })
}