// ============================================================
// Compactor — 会话压缩
//
// 当对话历史太长时，对早期消息进行压缩，防止超出 LLM 上下文窗口。
//
// 压缩策略：
//   1. 保留最近 N 条消息完整不变
//   2. 将之前的消息折叠成一条「摘要」消息（role: user）
//   3. 摘要以 [上下文压缩] 前缀开头，携带旧对话的可观测要点
//      （最近用户的请求 + assistant 的结论摘录），而非固定占位文案
//
// 为什么用 role: 'user'：
//   defaultConvertToLlm 会过滤 notification/thinking 纯 UI 消息，
//   user 角色既能落盘，又能作为真正的上下文发送给模型——
//  否则压缩即便是摘要也会被过滤，等于没压缩。
//  教学侧重点：压缩的意义在于「带旧内容要点进入后续对话」。
//
// 触发条件：
//   - 自动：消息总数超过阈值时
//   - 手动：调用 compact() 方法
// ============================================================

import type { AgentMessage } from '../ai/types.js'

export interface CompactorOptions {
  /** 触发压缩的消息阈值（默认 20） */
  threshold?: number
  /** 保留的最近消息数（默认 10） */
  keepRecent?: number
}

export class Compactor {
  private threshold: number
  private keepRecent: number

  constructor(options?: CompactorOptions) {
    this.threshold = options?.threshold ?? 20
    this.keepRecent = options?.keepRecent ?? 10
  }

  /** 检查是否需要压缩，需要则返回压缩后的消息列表 */
  compact(messages: AgentMessage[]): AgentMessage[] {
    if (messages.length <= this.threshold) return messages
    return this.truncate(messages)
  }

  /** 折叠策略：保留最近 N 条，之前的消息合并为一条摘要 */
  private truncate(messages: AgentMessage[]): AgentMessage[] {
    const recent = messages.slice(-this.keepRecent)
    const cutoffIndex = messages.length - this.keepRecent
    const olderMessages = messages.slice(0, cutoffIndex)

    if (olderMessages.length === 0) return messages

    const summary = this.createSummary(olderMessages)
    return [summary, ...recent]
  }

  /** 从旧消息生成摘要（确定性摘录，不调 LLM，避免额外调用成本） */
  private createSummary(olderMessages: AgentMessage[]): AgentMessage {
    const turnCount = Math.ceil(olderMessages.length / 2)

    // 提取要点：最近的用户请求 + assistant 结论摘录
    const chunks: string[] = []
    let lastUser: string | null = null

    for (const m of olderMessages) {
      if (m.role === 'user' && typeof m.content === 'string') {
        lastUser = m.content
      } else if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
        const head = m.content.trim().slice(0, 80)
        if (lastUser) {
          chunks.push(`问:${lastUser.slice(0, 80)} ⇒ 答:${head}`)
        } else {
          chunks.push(`答:${head}`)
        }
        lastUser = null
      }
    }
    if (lastUser) chunks.push(`问:${lastUser.slice(0, 80)}`)

    // 只保留末尾若干条要点，避免摘要本身过长
    const detail = chunks.slice(-5).join('\n')

    return {
      id: `compact-${Date.now()}`,
      parentId: null,
      role: 'user',
      content: [
        `[上下文压缩] 前面 ${turnCount} 轮对话已被折叠为摘要，保留的最近 ${this.keepRecent} 条消息完整。`,
        `最早的消息从 ${new Date(olderMessages[0].createdAt).toLocaleString('zh-CN')} 开始。`,
        ...(detail ? ['', `摘要要点：\n${detail}`] : []),
        '以上为历史上下文，继续当前任务时需基于此摘要而非已折叠的原始消息。',
      ].join('\n'),
      createdAt: Date.now(),
    }
  }

  setThreshold(threshold: number): void { this.threshold = threshold }
  setKeepRecent(keep: number): void { this.keepRecent = keep }
}