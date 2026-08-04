// ============================================================
// PermissionManager — 权限管理器
//
// 让用户在执行危险工具前确认，增加安全防线。
//
// 工作方式：
//   1. 拦截 bash 等高危工具调用
//   2. 显示命令内容和风险提示
//   3. 等待用户输入 y/n 确认
//   4. 同一会话中已确认的命令不再重复询问
//
// 使用方式：
//   const pm = new PermissionManager()
//   agent.beforeToolCall = (ctx) => pm.check(ctx)
// ============================================================

import * as readline from 'readline'
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

/** 默认的危险命令规则 */
const DEFAULT_RULES: PermissionRule[] = [
  { pattern: /^rm\s+-[rf]/, risk: RiskLevel.DANGEROUS, reason: '强制删除文件' },
  { pattern: /^rm\s+/, risk: RiskLevel.NORMAL, reason: '删除文件' },
  { pattern: /^(sudo|su)\s+/, risk: RiskLevel.DANGEROUS, reason: '提权操作' },
  { pattern: /^(chmod|chown|chattr)\s+/, risk: RiskLevel.NORMAL, reason: '修改文件权限' },
  { pattern: /^(mkfs|fdisk|dd|format)\s+/, risk: RiskLevel.DANGEROUS, reason: '磁盘操作' },
  { pattern: /^kill\s+/, risk: RiskLevel.NORMAL, reason: '终止进程' },
  { pattern: /^rm\s+-[rf]/, risk: RiskLevel.DANGEROUS, reason: '强制删除' },
  { pattern: /^(wget|curl)\s+.*\||.*(?:curl|wget).*\|/, risk: RiskLevel.DANGEROUS, reason: '远程执行脚本' },
  { pattern: /^>\s+/, risk: RiskLevel.NORMAL, reason: '覆盖文件' },
  { pattern: /^>>\s+/, risk: RiskLevel.NORMAL, reason: '追加文件' },
]

export class PermissionManager {
  private rules: PermissionRule[]
  private approved = new Set<string>()

  constructor(rules?: PermissionRule[]) {
    this.rules = rules || DEFAULT_RULES
  }

  /** 检查工具调用是否允许执行 */
  async check(ctx: ToolCallContext): Promise<BlockResult | undefined> {
    if (ctx.toolCall.name !== 'bash') return undefined

    const command = (ctx.args.command as string) || ''
    const risk = this.evaluateRisk(command)

    if (risk === RiskLevel.SAFE) return undefined

    const key = command.trim()
    if (this.approved.has(key)) return undefined

    // 非交互环境（测试/CI/管道）直接拒绝
    if (!process.stdin.isTTY) {
      return { block: true, reason: `非交互环境，已自动拒绝: ${command.slice(0, 100)}` }
    }

    const confirmed = await this.promptUser(command, risk)
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
    const safeCommands = ['ls', 'cat', 'head', 'tail', 'echo', 'pwd', 'whoami',
      'date', 'which', 'type', 'wc', 'sort', 'uniq', 'grep',
      'find', 'diff', 'git status']
    if (safeCommands.some(c => trimmed.startsWith(c))) {
      return RiskLevel.SAFE
    }
    for (const rule of this.rules) {
      if (rule.pattern instanceof RegExp) {
        if (rule.pattern.test(trimmed)) return rule.risk
      }
    }
    return RiskLevel.NORMAL
  }

  /** 提示用户确认 */
  private promptUser(command: string, risk: RiskLevel): Promise<boolean> {
    const riskLabel = risk === RiskLevel.DANGEROUS ? '🔴 高风险' : '🟡 普通风险'
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
      })
      process.stderr.write(`\n${'='.repeat(50)}\n`)
      process.stderr.write(`${riskLabel} 操作需要确认\n`)
      process.stderr.write(`命令: ${command}\n`)
      process.stderr.write(`${'='.repeat(50)}\n`)
      process.stderr.write('是否允许执行？(y/N) ')
      const timeout = setTimeout(() => {
        rl.close()
        resolve(false)
      }, 30_000)
      rl.on('line', (line) => {
        clearTimeout(timeout)
        rl.close()
        resolve(['y', 'yes'].includes(line.trim().toLowerCase()))
      })
      rl.on('SIGINT', () => { clearTimeout(timeout); rl.close(); resolve(false) })
    })
  }

  clearApproved(): void { this.approved.clear() }
}