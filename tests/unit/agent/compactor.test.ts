import { describe, test, expect } from 'vitest'
import { Compactor } from '../../../src/session/compaction.js'
import type { AgentMessage } from '../../../src/ai/types.js'

function makeMsg(id: string, role: AgentMessage['role'], content: string): AgentMessage {
  return { id, parentId: null, role, content, createdAt: Date.now() }
}

describe('Compactor', () => {
  test('少于阈值的消息不被压缩', () => {
    const compactor = new Compactor({ threshold: 20 })
    const messages = Array.from({ length: 15 }, (_, i) => makeMsg(`m${i}`, 'user', `msg${i}`))
    const result = compactor.compact(messages)
    expect(result).toHaveLength(15)
  })

  test('超过阈值的消息被压缩', () => {
    const compactor = new Compactor({ threshold: 10, keepRecent: 5 })
    const messages = Array.from({ length: 15 }, (_, i) => makeMsg(`m${i}`, 'user', `msg${i}`))
    const result = compactor.compact(messages)
    expect(result.length).toBeLessThan(15)
    expect(result[0].role).toBe('notification')
  })

  test('保留最近 N 条消息完整', () => {
    const compactor = new Compactor({ threshold: 8, keepRecent: 3 })
    const messages = Array.from({ length: 10 }, (_, i) => makeMsg(`m${i}`, 'user', `msg${i}`))
    const result = compactor.compact(messages)
    const recentMsgs = result.slice(1)
    expect(recentMsgs).toHaveLength(3)
    expect(recentMsgs[0].content).toBe('msg7')
  })

  test('可自定义阈值', () => {
    const compactor = new Compactor({ threshold: 5 })
    expect(compactor['threshold']).toBe(5)
    compactor.setThreshold(10)
    expect(compactor['threshold']).toBe(10)
  })

  test('可自定义保留条数', () => {
    const compactor = new Compactor({ keepRecent: 3 })
    expect(compactor['keepRecent']).toBe(3)
    compactor.setKeepRecent(8)
    expect(compactor['keepRecent']).toBe(8)
  })
})