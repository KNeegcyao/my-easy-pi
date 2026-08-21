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

/**
 * 内置 slash 命令清单（无前导 '/'，名称→描述）。
 * 作为 /help、/ 自动补全 与 校验 的单一事实源，避免命令列表在多处漂移。
 */
export const SLASH_COMMANDS: Readonly<Record<string, string>> = {
  help: '显示本帮助',
  model: '显示当前模型信息',
  session: '查看会话信息',
  sessions: '列出所有会话',
  delete: '删除指定会话',
  stats: '对话统计（消息数/模型/思考级别）',
  thinking: '查看或设置思考级别',
  system: '查看或修改系统提示词',
  theme: '检测终端主题（深浅色）',
  keymap: '切换 Vim/默认键位模式',
  tools: '列出所有可用工具',
  cost: '查看 Token 用量统计',
  clear: '清屏',
  exit: '退出程序',
  quit: '退出程序',
}

/** 匹配前缀的命令名列表（升序），如 "h" → ["help"]；空前缀 → 全部命令 */
export function matchSlashCommands(prefix: string): string[] {
  const p = prefix.toLowerCase()
  return Object.keys(SLASH_COMMANDS)
    .filter((name) => name.startsWith(p))
    .sort()
}

/** 生成 /help 输出文本（基于 SLASH_COMMANDS，动态生成命令行） */
function listHelpLines(resolver?: ExtensionCommandResolver): string {
  const lines: string[] = ['', `${gray('可用命令:')}`]
  const names = Object.keys(SLASH_COMMANDS).filter((n) => n !== 'quit').sort()
  const width = Math.max(...names.map((n) => n.length + 1))
  for (const name of names) {
    const pad = ' '.repeat(width - name.length)
    lines.push(`  ${green('/' + name)}${pad}  ${gray(SLASH_COMMANDS[name])}`)
  }
  if (resolver) {
    lines.push(...extensionHelpLines(resolver))
  }
  lines.push('')
  return lines.join('\n')
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

// ── 扩展命令路由 ──
// 通过依赖注入把扩展命令查询器挂进来，避免 commands 模块直接依赖 extension 层。
// 由 CLI 装配时调用 setExtensionCommandResolver(extensionApi) 注入；
// 未注入时扩展命令路由优雅失效（返回 undefined），不影响内置命令。
export interface ExtensionCommandResolver {
  find(name: string): { description: string; execute(args: string[]): Promise<void> | void } | undefined
  list(): string[]
}

let extensionResolver: ExtensionCommandResolver | undefined

/** 注入扩展命令查询器（CLI 装配时调用；传 undefined 可解除） */
export function setExtensionCommandResolver(resolver: ExtensionCommandResolver | undefined): void {
  extensionResolver = resolver
}

/** 查看当前扩展命令查询器（常见于测试/诊断） */
export function getExtensionCommandResolver(): ExtensionCommandResolver | undefined {
  return extensionResolver
}

/** 生成 /help 里扩展命令的展示行（未注入 resolver 时返回空数组） */
function extensionHelpLines(resolver: ExtensionCommandResolver): string[] {
  const names = resolver.list()
  if (names.length === 0) return [`  ${yellow('扩展命令:')}  ${gray('（无）')}`]
  const lines = [`  ${yellow('扩展命令:')}`]
  for (const name of names) {
    const cmd = resolver.find(name)
    const desc = cmd?.description ?? ''
    const pad = name.length < 5 ? ' '.repeat(5 - name.length) : ''
    lines.push(`  ${green(`/${name}`)}${pad}  ${gray(desc)}`)
  }
  return lines
}

export function recordTokenUsage(prompt: number, completion: number): void {
  if (prompt > 0 || completion > 0) tokenStats.hasRealUsage = true
  tokenStats.promptTokens += prompt
  tokenStats.completionTokens += completion
  tokenStats.totalTokens += prompt + completion
  tokenStats.callCount++
}

/**
 * 解析扩展命令：斜杠（/命令名）或首词精确命中（命令名）触发。
 * 仅当清除前缀后的命令名精确命中已注册扩展命令时返回结果；否则返回 null。
 * 供 executeCommand 的 default 分支与 TUI 首词触发共用。
 */
export function tryExtensionCommand(input: string): CommandResult | null {
  if (!extensionResolver) return null
  const parts = input.trim().split(/\s+/)
  const first = parts[0] ?? ''
  const normalized = first.startsWith('/') ? first.slice(1) : first
  const command = extensionResolver.find(normalized)
  if (!command) return null
  const args = parts.slice(1)
  void (async () => {
    try {
      await command.execute(args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`  ${red('✗')} 扩展命令执行错误: ${msg}\n`)
    }
  })()
  return { handled: true, output: '' }
}

export function executeCommand(input: string, agent: Agent): CommandResult | null {
  const parts = input.trim().split(/\s+/)
  const cmd = parts[0].toLowerCase()

  switch (cmd) {
    case '/help':
      return {
        handled: true,
        output: listHelpLines(extensionResolver),
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
      // 扩展命令路由（斜杠前缀 /命令名 或首词精确命中），未命中返回 null
      return tryExtensionCommand(input)
  }
}

export function resetTokenStats(): void {
  tokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0, hasRealUsage: false }
}

