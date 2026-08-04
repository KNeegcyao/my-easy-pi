// ============================================================
// 消息队列 — Steering / Follow-up 队列
//
// Steering 队列（高优先级）：用户在 Agent 运行中输入的中途指令
// Follow-up 队列（低优先级）：用户想追加的后续任务
//
// 决策逻辑：
//   当前 turn 结束
//   ├→ 有 tool_call? → 执行工具 → 继续下一轮
//   └→ 无 tool_call?
//       ├→ Steering 队列有消息？→ 注入 → 继续下一轮
//       └→ Follow-up 队列有消息？→ 注入 → 继续下一轮
//           └→ 都空 → agent_end
// ============================================================

import type { AgentMessage } from '../ai/types.js'

export class MessageQueue {
  /** 高优先级：运行中插入的指令 */
  private steering: AgentMessage[] = []
  /** 低优先级：追加的任务 */
  private followUpQueue: AgentMessage[] = []

  /** 向 Steering 队列添加消息（运行中插入） */
  steer(message: string): void {
    this.steering.push({
      id: `steer-${Date.now()}-${this.steering.length}`,
      parentId: null,
      role: 'user',
      content: message,
      createdAt: Date.now(),
    })
  }

  /** 向 Follow-up 队列添加消息（任务完成后追加） */
  followUp(message: string): void {
    this.followUpQueue.push({
      id: `follow-${Date.now()}-${this.followUpQueue.length}`,
      parentId: null,
      role: 'user',
      content: message,
      createdAt: Date.now(),
    })
  }

  /** 获取下一条要处理的消息（按优先级） */
  next(): AgentMessage | null {
    // Steering 优先
    if (this.steering.length > 0) {
      return this.steering.shift()!
    }
    // Follow-up 其次
    if (this.followUpQueue.length > 0) {
      return this.followUpQueue.shift()!
    }
    return null
  }

  /** 检查是否有待处理的消息 */
  hasPending(): boolean {
    return this.steering.length > 0 || this.followUpQueue.length > 0
  }

  /** 清空 Steering 队列 */
  clearSteering(): void {
    this.steering = []
  }

  /** 清空 Follow-up 队列 */
  clearFollowUp(): void {
    this.followUpQueue = []
  }

  /** 全部清空 */
  clearAll(): void {
    this.steering = []
    this.followUpQueue = []
  }
}