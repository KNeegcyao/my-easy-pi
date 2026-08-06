// ============================================================
// TUI Commands — Slash 命令系统
//
// /help   /model   /cost   /clear   /exit
// ============================================================

import type { Agent } from '../../agent/index.js'
import { green, yellow, dim, gray } from './theme.js'

export interface CommandResult {
  handled: boolean
  output: string
}

export interface TokenStats {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  callCount: number
}

let tokenStats: TokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 }

export function recordTokenUsage(prompt: number, completion: number): void {
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
          `  ${green('/help')}      ${gray('显示帮助')}`,
          `  ${green('/model')}     ${gray('显示当前模型')}`,
          `  ${green('/cost')}      ${gray('Token 用量')}`,
          `  ${green('/clear')}     ${gray('清屏')}`,
          `  ${green('/exit')}      ${gray('退出')}`,
          '',
        ].join('\n'),
      }

    case '/model':
      return {
        handled: true,
        output: `  ${green('当前模型:')} ${agent.state.model.provider}/${agent.state.model.id}`,
      }

    case '/cost':
      return {
        handled: true,
        output: [
          `  ${yellow('Token 统计:')}`,
          `  ${dim('├─')} 调用次数:  ${tokenStats.callCount}`,
          `  ${dim('├─')} 提示 Token: ${tokenStats.promptTokens}`,
          `  ${dim('├─')} 生成 Token: ${tokenStats.completionTokens}`,
          `  ${dim('└─')} 总计:      ${tokenStats.totalTokens}`,
        ].join('\n'),
      }

    case '/clear':
      process.stdout.write('\x1b[2J\x1b[H')
      return { handled: true, output: '' }

    case '/exit':
    case '/quit':
      return { handled: true, output: '' }

    default:
      return null
  }
}

export function resetTokenStats(): void {
  tokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 }
}