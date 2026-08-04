// ============================================================
// Compactor — 会话压缩
//
// 当对话历史太长时，对早期消息进行压缩，防止超出 LLM 上下文窗口。
//
// 压缩策略：
//   1. 保留最近 N 条消息完整不变
//   2. 将之前的消息压缩成一条摘要
//   3. 摘要由 LLM 生成（如果有 model）或用简单截断
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

  /** 截断策略：保留最近 N 条，之前的消息合并为一条摘要 */
  private truncate(messages: AgentMessage[]): AgentMessage[] {
    const recent = messages.slice(-this.keepRecent)
    const cutoffIndex = messages.length - this.keepRecent
    const olderMessages = messages.slice(0, cutoffIndex)

    if (olderMessages.length === 0) return messages

    const summary = this.createSummary(olderMessages)
    return [summary, ...recent]
  }

  /** 从旧消息生成摘要 */
  private createSummary(olderMessages: AgentMessage[]): AgentMessage {
    const turnCount = Math.ceil(olderMessages.length / 2)
    return {
      id: `compact-${Date.now()}`,
      parentId: null,
      role: 'notification',
      content: `[上下文压缩] 前面 ${turnCount} 轮对话已被压缩为摘要。` +
        `最早的消息从 ${new Date(olderMessages[0].createdAt).toLocaleString('zh-CN')} 开始。`,
      createdAt: Date.now(),
    }
  }

  setThreshold(threshold: number): void { this.threshold = threshold }
  setKeepRecent(keep: number): void { this.keepRecent = keep }
}