// ============================================================
// PermissionManager — 权限管理器
//
// 用于在执行危险工具前要求确认，提供安全防线。
//
// 关键设计：通过依赖注入与 UI 解耦
//   本模块不再直接 import readline / 写 stderr，
//   而是通过构造时传入的 confirm 回调向外部请求用户确认。
//   这样 TUI、CLI、测试环境可以提供各自合适的确认方式，
//   agent 层完全不感知输出通道。
//
// 使用方式：
//   const pm = new PermissionManager({
//     confirm: async ({ command, risk }) => {
//       // 这里弹 TUI overlay / readline / 测试 mock
//       return true  // 'yes'
//     },
//   })
//   agent.beforeToolCall = (ctx) => pm.check(ctx)
// ============================================================

import type { ToolCallContext, BlockResult } from './loop.js'

/** 工具风险等级 */
export enum RiskLevel {
  SAFE = 'safe',
  NORMAL = 'normal',
  DANGEROUS = 'danger',
}

/** 权限规则 */
export interface PermissionRule {
  pattern: RegExp | string
  risk: RiskLevel
  reason?: string
}

/** 请求用户确认的入参 */
export interface ConfirmationRequest {
  command: string
  risk: RiskLevel
  reason?: string
}

/** 用户确认回调：由 UI 层（TUI overlay / CLI readline / 测试 mock）实现 */
export type ConfirmFn = (req: ConfirmationRequest) => Promise<boolean>

const DEFAULT_RULES: PermissionRule[] = [
  { pattern: /^rm\s+-[rf]/, risk: RiskLevel.DANGEROUS, reason: '强制删除文件' },
  { pattern: /^rm\s+/, risk: RiskLevel.NORMAL, reason: '删除文件' },
  { pattern: /^(sudo|su)\s+/, risk: RiskLevel.DANGEROUS, reason: '提权操作' },
  { pattern: /^(chmod|chown|chattr)\s+/, risk: RiskLevel.NORMAL, reason: '修改文件权限' },
  { pattern: /^(mkfs|fdisk|dd|format)\s+/, risk: RiskLevel.DANGEROUS, reason: '磁盘操作' },
  { pattern: /^kill\s+/, risk: RiskLevel.NORMAL, reason: '终止进程' },
  { pattern: /^(wget|curl)\s+.*\||.*(?:curl|wget).*\|/, risk: RiskLevel.DANGEROUS, reason: '远程执行脚本' },
  { pattern: /^>\s+/, risk: RiskLevel.NORMAL, reason: '覆盖文件' },
  { pattern: /^>>\s+/, risk: RiskLevel.NORMAL, reason: '追加文件' },
]

export interface PermissionManagerOptions {
  /** 自定义规则；不传用默认规则 */
  rules?: PermissionRule[]
  /** 用户确认回调；不传则在需要确认时 fail-closed（返回 false） */
  confirm?: ConfirmFn
}

export class PermissionManager {
  private rules: PermissionRule[]
  private confirmFn?: ConfirmFn
  private approved = new Set<string>()

  constructor(options?: PermissionManagerOptions | PermissionRule[]) {
    // 兼容旧构造：new PermissionManager(rules)
    if (Array.isArray(options)) {
      this.rules = options
      this.confirmFn = undefined
    } else {
      this.rules = options?.rules || DEFAULT_RULES
      this.confirmFn = options?.confirm
    }
  }

  /** 替换/注入确认回调（便于 TUI 启动后再挂载） */
  setConfirm(confirm: ConfirmFn | undefined): void {
    this.confirmFn = confirm
  }

  /** 检查工具调用是否允许执行 */
  async check(ctx: ToolCallContext): Promise<BlockResult | undefined> {
    if (ctx.toolCall.name !== 'bash') return undefined

    const command = (ctx.args.command as string) || ''
    const risk = this.evaluateRisk(command)

    if (risk === RiskLevel.SAFE) return undefined

    const key = command.trim()
    if (this.approved.has(key)) return undefined

    // 非交互环境且无确认回调：fail-closed
    if (!process.stdin.isTTY && !this.confirmFn) {
      return { block: true, reason: `非交互环境，已自动拒绝: ${command.slice(0, 100)}` }
    }

    // 没有确认回调：fail-closed，避免静默执行高危命令
    if (!this.confirmFn) {
      return { block: true, reason: `无确认通道，已自动拒绝: ${command.slice(0, 100)}` }
    }

    const reasonText = this.explainRisk(command, risk)
    const confirmed = await this.confirmFn({ command, risk, reason: reasonText })
    if (confirmed) {
      this.approved.add(key)
      return undefined
    }

    return {
      block: true,
      reason: `用户拒绝了命令执行: ${command.slice(0, 100)}`,
    }
  }

  /** 评估命令的风险等级 */
  private evaluateRisk(command: string): RiskLevel {
    const trimmed = command.trim()

    // 🛡️ 检测多行注入：如果命令包含换行符，LLM 可能在绕过检查
    if (trimmed.includes('\n')) {
      const lines = trimmed.split('\n').filter(l => l.trim())
      let maxRisk = RiskLevel.SAFE
      for (const line of lines) {
        const lineRisk = this.evaluateSingleCommand(line.trim())
        if (lineRisk === RiskLevel.DANGEROUS) return RiskLevel.DANGEROUS
        if (lineRisk === RiskLevel.NORMAL) maxRisk = RiskLevel.NORMAL
      }
      return maxRisk
    }

    return this.evaluateSingleCommand(trimmed)
  }

  private evaluateSingleCommand(command: string): RiskLevel {
    const safeCommands = ['ls', 'cat', 'head', 'tail', 'echo', 'pwd', 'whoami',
      'date', 'which', 'type', 'wc', 'sort', 'uniq', 'grep',
      'find', 'diff', 'git status']
    if (safeCommands.some(c => command.startsWith(c))) {
      return RiskLevel.SAFE
    }
    for (const rule of this.rules) {
      if (rule.pattern instanceof RegExp) {
        if (rule.pattern.test(command)) return rule.risk
      }
    }
    return RiskLevel.NORMAL
  }

  private explainRisk(_command: string, risk: RiskLevel): string {
    return risk === RiskLevel.DANGEROUS ? '高风险' : '普通风险'
  }

  clearApproved(): void { this.approved.clear() }
}
