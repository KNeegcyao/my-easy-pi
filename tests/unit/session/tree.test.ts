import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { SessionManager } from '../../../src/session/manager.js'
import * as storage from '../../../src/session/storage.js'
import { existsSync } from 'fs'
import type { AgentMessage } from '../../../src/ai/types.js'

function makeMsg(id: string, parentId: string | null, role: AgentMessage['role'], content: string): AgentMessage {
  return { id, parentId, role, content, createdAt: Date.now() }
}

describe('SessionManager 会话树 API — getTree', () => {
  const sm = new SessionManager()

  test('空会话返回空数组', () => {
    expect(sm.getTree([])).toEqual([])
  })

  test('线性树按深度递增', () => {
    const msgs = [
      makeMsg('u1', null, 'user', '你好'),
      makeMsg('a1', 'u1', 'assistant', '你好！'),
      makeMsg('u2', 'a1', 'user', '帮我写代码'),
    ]
    const tree = sm.getTree(msgs)
    expect(tree).toHaveLength(3)
    expect(tree.map((n) => n.depth)).toEqual([0, 1, 2])
    expect(tree[0].role).toBe('user')
  })

  test('分叉节点标记 isBranchPoint', () => {
    // a1 有两个子节点 → 分叉点
    const msgs = [
      makeMsg('u1', null, 'user', '选哪个方案'),
      makeMsg('a1', 'u1', 'assistant', '方案A'),
      makeMsg('u2a', 'a1', 'user', '用方案A'),
      makeMsg('u2b', 'a1', 'user', '用方案B'),
    ]
    const tree = sm.getTree(msgs)
    const a1Node = tree.find((n) => n.id === 'a1')!
    expect(a1Node.isBranchPoint).toBe(true)
  })

  test('标记当前活动叶 isActiveLeaf', () => {
    const msgs = [
      makeMsg('u1', null, 'user', 'hi'),
      makeMsg('a1', 'u1', 'assistant', 'hello'),
    ]
    const tree = sm.getTree(msgs)
    const leaf = tree.find((n) => n.isActiveLeaf)
    expect(leaf?.id).toBe('a1')
  })

  test('isLastChild 与 shortId 正确填充', () => {
    const msgs = [
      makeMsg('u1', null, 'user', '选哪个'),
      makeMsg('a1', 'u1', 'assistant', '方案'),
      makeMsg('u2a', 'a1', 'user', 'A'),
      makeMsg('u2b', 'a1', 'user', 'B'),
    ]
    const tree = sm.getTree(msgs)
    // a1 的两个孩子：u2a 非末，u2b 末
    const u2a = tree.find((n) => n.id === 'u2a')!
    const u2b = tree.find((n) => n.id === 'u2b')!
    expect(u2a.isLastChild).toBe(false)
    expect(u2b.isLastChild).toBe(true)
    // shortId 为 8 字符
    expect(u2a.shortId).toBe('u2a'.slice(0, 8))
  })

  test('notification 节点不进树', () => {
    const meta = makeMsg('meta', null, 'notification', '会话名')
    const u1 = makeMsg('u1', null, 'user', 'hi')
    const a1 = makeMsg('a1', 'u1', 'assistant', 'hey')
    const tree = sm.getTree([meta, u1, a1])
    expect(tree).toHaveLength(2)
    expect(tree.find((n) => n.role === 'notification')).toBeUndefined()
  })
})

describe('SessionManager — getPathToNode', () => {
  const sm = new SessionManager()

  test('返回根到节点的路径', () => {
    const msgs = [
      makeMsg('u1', null, 'user', 'a'),
      makeMsg('a1', 'u1', 'assistant', 'b'),
      makeMsg('u2', 'a1', 'user', 'c'),
    ]
    const path = sm.getPathToNode(msgs, 'u2')
    expect(path.map((m) => m.id)).toEqual(['u1', 'a1', 'u2'])
  })

  test('不存在节点返回空', () => {
    expect(sm.getPathToNode([makeMsg('u1', null, 'user', 'x')], 'nope')).toEqual([])
  })

  test('根节点路径仅含自身', () => {
    const msgs = [makeMsg('u1', null, 'user', 'root')]
    expect(sm.getPathToNode(msgs, 'u1')).toHaveLength(1)
  })
})

describe('SessionManager — forkSession', () => {
  const sm = new SessionManager()
  let sourceId: string

  beforeEach(async () => {
    sourceId = await sm.createSession('test-source')
    await sm.saveMessage(sourceId, makeMsg('u1', null, 'user', '你好'))
    await sm.saveMessage(sourceId, makeMsg('a1', 'u1', 'assistant', '你好！'))
    await sm.saveMessage(sourceId, makeMsg('u2', 'a1', 'user', '帮我写代码'))
  })

  afterEach(async () => {
    try { await sm.deleteSession(sourceId) } catch { /* ignore */ }
  })

  test('从指定节点分叉出新会话', async () => {
    const newId = await sm.forkSession(sourceId, 'a1', 'fork-test')
    expect(newId).not.toBe(sourceId)
    const forked = await sm.loadSession(newId)
    // 路径：u1 → a1（meta 不计入 loadSession 过滤后的内容，loadSession 保留 meta）
    const contentIds = forked.filter((m) => m.id !== 'meta').map((m) => m.id)
    expect(contentIds).toEqual(['u1', 'a1'])
    // 新会话名
    const meta = forked.find((m) => m.id === 'meta')
    expect(meta?.content).toBe('fork-test')
    await sm.deleteSession(newId)
  })

  test('原会话不变', async () => {
    const before = await sm.loadSession(sourceId)
    await sm.forkSession(sourceId, 'a1')
    const after = await sm.loadSession(sourceId)
    expect(after.length).toBe(before.length)
  })

  test('不存在节点抛错', async () => {
    await expect(sm.forkSession(sourceId, 'nonexistent')).rejects.toThrow()
  })
})