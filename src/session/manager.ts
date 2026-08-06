// ============================================================
// SessionManager — 会话管理器
//
// 负责创建、加载、删除、列出会话。
// 每个会话对应一个 JSONL 文件。
// ============================================================

import * as storage from './storage.js'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { AgentMessage } from '../ai/types.js'

const LAST_SESSION_PATH = join(homedir(), '.piagent', 'last-session')

export interface SessionSummary {
  id: string
  name: string
  messageCount: number
  createdAt: string
}

export class SessionManager {
  /** 创建新会话 */
  async createSession(name?: string): Promise<string> {
    const id = `session-${Date.now()}`
    // 存入一条元数据消息作为会话名称
    await storage.appendMessage(id, {
      id: 'meta',
      parentId: null,
      role: 'notification',
      content: name || `会话 ${new Date().toLocaleString('zh-CN')}`,
      createdAt: Date.now(),
    })
    return id
  }

  /** 加载会话的所有消息 */
  async loadSession(id: string): Promise<AgentMessage[]> {
    const messages = await storage.readMessages(id)
    // 过滤掉元数据消息
    return messages.filter(m => m.role !== 'notification' || m.id === 'meta')
  }

  /** 删除会话 */
  async deleteSession(id: string): Promise<void> {
    await storage.deleteSession(id)
  }

  /** 列出所有会话 */
  async listSessions(): Promise<SessionSummary[]> {
    const ids = await storage.listSessions()
    const summaries: SessionSummary[] = []

    for (const id of ids) {
      const messages = await storage.readMessages(id)
      const meta = messages.find(m => m.id === 'meta')
      summaries.push({
        id,
        name: meta?.content || id,
        messageCount: messages.filter(m => m.id !== 'meta').length,
        createdAt: meta?.createdAt
          ? new Date(meta.createdAt).toLocaleString('zh-CN')
          : 'unknown',
      })
    }

    return summaries
  }

  /** 保存最后活跃的会话 ID */
  async saveLastSession(sessionId: string): Promise<void> {
    try {
      const dir = join(homedir(), '.piagent')
      if (!existsSync(dir)) await mkdir(dir, { recursive: true })
      await writeFile(LAST_SESSION_PATH, sessionId, 'utf-8')
    } catch { /* 不影响主流程 */ }
  }

  /** 获取最后活跃的会话 ID */
  async getLastSession(): Promise<string | null> {
    try {
      if (!existsSync(LAST_SESSION_PATH)) return null
      return await readFile(LAST_SESSION_PATH, 'utf-8') || null
    } catch { return null }
  }

  /** 保存消息到会话 */
  async saveMessage(sessionId: string, message: AgentMessage): Promise<void> {
    if (message.role === 'notification') return // 不保存纯 UI 消息
    await storage.appendMessage(sessionId, message)
  }

  /** 从消息列表中获取活跃分支（从根部到最新消息的直线路径） */
  getActiveBranch(messages: AgentMessage[]): AgentMessage[] {
    if (messages.length === 0) return []

    // 找到最后一条消息，回溯到根
    const branch: AgentMessage[] = []
    const map = new Map<string, AgentMessage>()
    for (const msg of messages) {
      map.set(msg.id, msg)
    }

    let current = messages[messages.length - 1]
    while (current) {
      branch.unshift(current)
      current = current.parentId ? map.get(current.parentId)! : null as unknown as AgentMessage
    }

    return branch
  }
}