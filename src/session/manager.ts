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

const LAST_SESSION_PATH = join(homedir(), '.my-easy-pi', 'last-session')

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

  /** 重命名会话 */
  async renameSession(id: string, name: string): Promise<void> {
    const meta: AgentMessage = {
      id: 'meta',
      parentId: null,
      role: 'notification',
      content: name,
      createdAt: Date.now(),
    }
    // 读取所有消息，替换 meta，重新写入
    const allMessages = await storage.readMessages(id)
    const filtered = allMessages.filter(m => m.id !== 'meta')
    filtered.unshift(meta)
    await storage.writeMessages(id, filtered)
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
      const dir = join(homedir(), '.my-easy-pi')
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

    // 建立 id → message 映射
    const map = new Map<string, AgentMessage>()
    for (const msg of messages) {
      map.set(msg.id, msg)
    }

    // 从尾部找最后一条未撤回的消息
    let current: AgentMessage | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].revoked) {
        current = messages[i]
        break
      }
    }
    if (!current) return []

    // 沿 parentId 回溯到根（跳过撤回的消息）
    const branch: AgentMessage[] = []
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      branch.unshift(current)
      const parent: AgentMessage | undefined = current.parentId ? map.get(current.parentId) : undefined
      current = parent && !parent.revoked ? parent : null
    }

    return branch
  }

  // ── 会话树导航 API ──

  /** 树形节点（供 UI 渲染） */
  getTree(messages: AgentMessage[]): Array<{
    id: string
    role: string
    summary: string
    depth: number
    isBranchPoint: boolean
    isActiveLeaf: boolean
    /** 在兄弟节点中是否为最后一个（UI 用 └─ / ├─ 区分） */
    isLastChild: boolean
    /** 短 id（8 字符，供 /fork 使用） */
    shortId: string
  }> {
    if (messages.length === 0) return []

    const map = new Map<string, AgentMessage>()
    for (const m of messages) map.set(m.id, m)

    // 找当前活动叶（最后一条未撤回消息）
    let activeLeafId: string | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].revoked) { activeLeafId = messages[i].id; break }
    }

    // 构建 children 索引
    const childrenOf = new Map<string | null, AgentMessage[]>()
    for (const m of messages) {
      if (m.role === 'notification') continue
      const parentKey = m.parentId
      const list = childrenOf.get(parentKey) ?? []
      list.push(m)
      childrenOf.set(parentKey, list)
    }

    // 深度优先遍历，产出缩进树
    const result: ReturnType<SessionManager['getTree']> = []
    const walk = (parentId: string | null, depth: number) => {
      const children = childrenOf.get(parentId) ?? []
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        const isBranch = (childrenOf.get(child.id)?.length ?? 0) > 1
        const isLastChild = i === children.length - 1
        const summary = (child.content || '').slice(0, 40).replace(/\n/g, ' ')
        result.push({
          id: child.id,
          role: child.role,
          summary: summary || '(空)',
          depth,
          isBranchPoint: isBranch,
          isActiveLeaf: child.id === activeLeafId,
          isLastChild,
          shortId: child.id.slice(0, 8),
        })
        walk(child.id, depth + 1)
      }
    }
    walk(null, 0)
    return result
  }

  /** 返回从根到指定节点的路径（含该节点） */
  getPathToNode(messages: AgentMessage[], nodeId: string): AgentMessage[] {
    const map = new Map<string, AgentMessage>()
    for (const m of messages) map.set(m.id, m)
    const target = map.get(nodeId)
    if (!target) return []

    const path: AgentMessage[] = []
    let current: AgentMessage | undefined = target
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      path.unshift(current)
      current = current.parentId ? map.get(current.parentId) : undefined
    }
    return path
  }

  /** 从指定节点分叉出一个新会话（新 JSONL 文件） */
  async forkSession(sourceId: string, nodeId: string, name?: string): Promise<string> {
    const messages = await this.loadSession(sourceId)
    const path = this.getPathToNode(messages, nodeId)
    if (path.length === 0) throw new Error(`节点不存在: ${nodeId}`)

    const newId = `session-${Date.now()}`
    const meta: AgentMessage = {
      id: 'meta',
      parentId: null,
      role: 'notification',
      content: name || `Fork of ${sourceId}`,
      createdAt: Date.now(),
    }
    await storage.appendMessage(newId, meta)
    for (const m of path) {
      await storage.appendMessage(newId, m)
    }
    return newId
  }
}