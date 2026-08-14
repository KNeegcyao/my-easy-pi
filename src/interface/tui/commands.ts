// ============================================================
// TUI Commands — Slash 命令系统
//
// 可用命令：
//   /help            显示帮助
//   /model           显示当前模型
//   /tools           列出可用工具
//   /session         会话信息
//   /cost            Token 用量统计
//   /clear           清屏
//   /exit            退出
// ============================================================

import type { Agent } from '../../agent/index.js'
import { green, yellow, cyan, dim, gray } from './theme.js'

export interface CommandResult {
  handled: boolean
  output: string
  /** /clear：要求 host 重启渲染区（不直接写 stdout） */
  clear?: boolean
}

export interface TokenStats {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  callCount: number
  /** 是否有任何一次调用拿到了真实 usage；false 时 /cost 显示 N/A 而非 0 */
  hasRealUsage: boolean
}

let tokenStats: TokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0, hasRealUsage: false }

export function recordTokenUsage(prompt: number, completion: number): void {
  if (prompt > 0 || completion > 0) tokenStats.hasRealUsage = true
  tokenStats.promptTokens += prompt
  tokenStats.completionTokens += completion
  tokenStats.totalTokens += prompt + completion
  tokenStats.callCount++
}

export function executeCommand(input: string, agent: Agent): CommandResult | null {
  const parts = input.trim().split(/\s+/)
  const cmd = parts[0].toLowerCase()

  switch (cmd) {
    case '/help':
      return {
        handled: true,
        output: [
          '',
          `${gray('可用命令:')}`,
          `  ${green('/help')}      ${gray('显示本帮助')}`,
          `  ${green('/model')}     ${gray('显示当前模型信息')}`,
          `  ${green('/tools')}     ${gray('列出所有可用工具')}`,
          `  ${green('/session')}   ${gray('查看会话信息')}`,
          `  ${green('/sessions')}  ${gray('列出所有会话')}`,
          `  ${green('/delete')}    ${gray('删除指定会话')}`,
          `  ${green('/cost')}      ${gray('查看 Token 用量统计')}`,
          `  ${green('/clear')}     ${gray('清屏')}`,
          `  ${green('/exit')}      ${gray('退出程序')}`,
          '',
        ].join('\n'),
      }

    case '/model':
      return {
        handled: true,
        output: [
          ``,
          `  ${yellow('模型信息:')}`,
          `  ${dim('├─')} ${gray('提供方:')}  ${cyan(agent.state.model.provider)}`,
          `  ${dim('├─')} ${gray('模型 ID:')} ${cyan(agent.state.model.id)}`,
          `  ${dim('├─')} ${gray('工具调用:')} ${agent.state.model.supportsTools() ? green('✓ 支持') : red('✗ 不支持')}`,
          `  ${dim('└─')} ${gray('思考能力:')} ${agent.state.model.supportsThinking() ? green('✓ 支持') : gray('不支持')}`,
          '',
        ].join('\n'),
      }

    case '/tools':
      return {
        handled: true,
        output: [
          ``,
          `  ${yellow('可用工具:')}`,
          ...agent.state.tools.map((t, i) => {
            const isLast = i === agent.state.tools.length - 1
            const prefix = isLast ? '└─' : '├─'
            return `  ${dim(prefix)} ${green(t.name)}  ${gray(t.description)}`
          }),
          '',
        ].join('\n'),
      }

    case '/session': {
      const msgCount = agent.state.messages.length
      return {
        handled: true,
        output: [
          ``,
          `  ${yellow('会话信息:')}`,
          `  ${dim('├─')} ${gray('消息总数:')} ${cyan(String(msgCount))}`,
          `  ${dim('├─')} ${gray('流式状态:')} ${agent.state.isStreaming ? yellow('处理中') : green('空闲')}`,
          `  ${dim('├─')} ${gray('待调工具:')} ${agent.state.pendingToolCalls.size > 0 ? yellow(String(agent.state.pendingToolCalls.size)) : gray('0')}`,
          `  ${dim('└─')} ${gray('系统提示:')} ${gray(agent.state.systemPrompt.slice(0, 60) + '...')}`,
          '',
        ].join('\n'),
      }
    }

    case '/cost': {
      const na = gray('N/A (provider 未上报)')
      return {
        handled: true,
        output: [
          ``,
          `  ${yellow('Token 统计:')}`,
          `  ${dim('├─')} ${gray('调用次数:')}  ${String(tokenStats.callCount)}`,
          `  ${dim('├─')} ${gray('提示 Token:')} ${tokenStats.hasRealUsage ? String(tokenStats.promptTokens) : na}`,
          `  ${dim('├─')} ${gray('生成 Token:')} ${tokenStats.hasRealUsage ? String(tokenStats.completionTokens) : na}`,
          `  ${dim('└─')} ${gray('总计:')}      ${tokenStats.hasRealUsage ? String(tokenStats.totalTokens) : na}`,
          '',
        ].join('\n'),
      }
    }

    case '/clear':
      // 不直接写 stdout（docs 约束：命令不直接操作终端）。
      // host 见 clear 标志后会重启渲染区。
      return { handled: true, output: '', clear: true }

    case '/exit':
    case '/quit':
      return { handled: true, output: '' }

    default:
      return null
  }
}

export function resetTokenStats(): void {
  tokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0, hasRealUsage: false }
}

// 避免 commands.ts 中引用未导入的 red
function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`
}