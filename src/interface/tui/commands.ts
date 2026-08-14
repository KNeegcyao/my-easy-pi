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
import type { ThinkingLevel } from '../../ai/types.js'
import { green, yellow, cyan, dim, gray, red, bold } from './theme.js'

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
          `  ${green('/theme')}     ${gray('检测终端主题（深浅色）')}`,
          `  ${green('/keymap')}    ${gray('切换 Vim/默认键位模式')}`,
          `  ${green('/tools')}     ${gray('列出所有可用工具')}`,
          `  ${green('/session')}   ${gray('查看会话信息')}`,
          `  ${green('/sessions')}  ${gray('列出所有会话')}`,
          `  ${green('/delete')}    ${gray('删除指定会话')}`,
          `  ${green('/stats')}     ${gray('对话统计（消息数/模型/思考级别）')}`,
          `  ${green('/thinking')}  ${gray('查看或设置思考级别')}`,
          `  ${green('/system')}    ${gray('查看或修改系统提示词')}`,
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

    case '/stats': {
      const msgs = agent.state.messages
      const userCount = msgs.filter(m => m.role === 'user').length
      const asstCount = msgs.filter(m => m.role === 'assistant').length
      const toolCallCount = msgs.filter(m => m.role === 'toolResult').length
      return {
        handled: true,
        output: [
          '',
          `  ${yellow('对话统计:')}`,
          `  ${dim('├─')} ${gray('消息总数:')}  ${cyan(String(msgs.length))}`,
          `  ${dim('├─')} ${gray('用户消息:')}  ${cyan(String(userCount))}`,
          `  ${dim('├─')} ${gray('模型回复:')}  ${cyan(String(asstCount))}`,
          `  ${dim('├─')} ${gray('工具结果:')}  ${cyan(String(toolCallCount))}`,
          `  ${dim('├─')} ${gray('当前模型:')}  ${cyan(agent.state.model.provider + '/' + agent.state.model.id)}`,
          `  ${dim('├─')} ${gray('思考级别:')}  ${cyan(agent.state.thinkingLevel)}`,
          `  ${dim('├─')} ${gray('流式状态:')}  ${agent.state.isStreaming ? yellow('处理中') : green('空闲')}`,
          `  ${dim('└─')} ${gray('API 调用:')}  ${cyan(String(tokenStats.callCount))}`,
          '',
        ].join('\n'),
      }
    }

    case '/thinking': {
      const validLevels: ThinkingLevel[] = ['off', 'low', 'medium', 'high']
      const arg = parts[1]?.toLowerCase() as ThinkingLevel | undefined
      if (!arg) {
        return {
          handled: true,
          output: `  ${yellow('当前思考级别:')} ${bold(cyan(agent.state.thinkingLevel))}\n  ${dim(gray('用法: /thinking <off|low|medium|high>'))}\n`,
        }
      }
      if (!validLevels.includes(arg)) {
        return {
          handled: true,
          output: `  ${red('✗')} 无效级别: ${arg}${dim(gray(' (可选: off, low, medium, high)'))}\n`,
        }
      }
      agent.state.thinkingLevel = arg
      return {
        handled: true,
        output: `  ${green('✓')} 思考级别已设为 ${bold(cyan(arg))}\n`,
      }
    }

    case '/system': {
      if (parts.length === 1) {
        const prompt = agent.state.systemPrompt
        const truncated = prompt.length > 300 ? prompt.slice(0, 300) + dim(gray('…')) : prompt
        return {
          handled: true,
          output: `  ${yellow('当前系统提示词:')}\n  ${dim(gray(truncated))}\n  ${dim(gray('(' + String(prompt.length) + ' 字符)'))}\n`,
        }
      }
      const newPrompt = parts.slice(1).join(' ')
      agent.state.systemPrompt = newPrompt
      return {
        handled: true,
        output: `  ${green('✓')} 系统提示词已更新 ${dim(gray('(' + String(newPrompt.length) + ' 字符)'))}\n`,
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

