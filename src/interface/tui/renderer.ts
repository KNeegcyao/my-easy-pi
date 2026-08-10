// ============================================================
// TUI Renderer — 全屏渲染器
//
// 流式 Markdown 渲染策略：
//   每次 message_update 收到完整内容，用 marked 重新解析，
//   计算出新的行数。如果行数变化，用 ANSI 移动光标覆盖旧内容。
//   这解决了流式分块导致的 Markdown 标记不完整问题。
// ============================================================

import type { Agent, AgentEvent } from '../../agent/index.js'
import { dim, gray, green, yellow, red, clearLine, clearBelow } from './theme.js'
import { renderToLines } from '../markdown-renderer.js'

// 用于覆盖旧输出的 ANSI 序列
const CURSOR_UP = (n: number) => `\x1b[${n}A`

/** 剥离 ANSI 转义序列，获取可见字符长度 */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

/** 终端可见列宽（非 TTY 退化为 80） */
function terminalColumns(): number {
  return process.stdout.columns || 80
}

/**
 * 计算一行文本（含其结尾的换行）在终端中占据的物理行数。
 * 长行会按终端宽度自动换行，因此必须按物理行而非逻辑行计数，
 * 否则光标上移时无法覆盖已换行的残留内容。
 * 采用「延迟换行」模型（macOS Terminal/iTerm 默认行为）：
 * 写满一整行的最后一个字符后，光标仍停在该行末列，直到下一个
 * 可打印字符才会真正换行，因此 `overflow` 行不计入额外物理行。
 */
function physicalRows(text: string, cols: number): number {
  const len = stripAnsi(text).length
  if (len === 0) return 1
  return Math.ceil(len / cols)
}

export function createTUIRenderer(agent: Agent): void {
  let renderedRows = 0         // 已渲染的「物理行数」（用于精确覆盖）
  let bufferedContent = ''     // 累积的完整内容
  let hasReceivedContent = false
  const toolNameMap = new Map<string, string>()

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        renderedRows = 0
        bufferedContent = ''
        hasReceivedContent = false
        break

      case 'message_update': {
        const newContent = event.message.content
        if (!newContent || newContent === bufferedContent) break

        if (!hasReceivedContent) {
          // 首次内容：清除 thinking 行（光标停在该行）
          process.stdout.write('\r' + clearLine() + '\r')
          hasReceivedContent = true
        } else if (renderedRows > 0) {
          // 后续更新：光标上移到上一次内容的顶部，并清除下方所有残留
          process.stdout.write(CURSOR_UP(renderedRows) + '\r' + clearBelow())
        }

        const cols = terminalColumns()
        const lines = renderToLines(newContent)
        let rows = 0

        // 输出每一行，并累加物理行数
        for (const line of lines) {
          process.stdout.write(line + '\n')
          rows += physicalRows(line, cols)
        }

        renderedRows = rows
        bufferedContent = newContent
        break
      }

      case 'message_end': {
        const msg = event.message
        if (msg.role === 'assistant' && bufferedContent) {
          process.stdout.write('\n')
        }
        // 重置状态：message_start 从未由 loop 发射，统一在此重置，
        // 确保下一轮 prompt 的 thinking 行能被首次 message_update 清除。
        bufferedContent = ''
        renderedRows = 0
        hasReceivedContent = false
        break
      }

      case 'tool_execution_start': {
        toolNameMap.set(event.toolCallId, event.toolName)
        // message_end 已将 renderedRows 归零，且其副作用已把光标移至新行，
        // 这里无需任何光标位移——旧的多余位移会留下空白行。
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

// printUserInput 已移除 —— 旧行为是"回显后再写一份灰色归档副本"，
// 视觉上等同打印两次。现在用户输入仅由 readline 回显负责。