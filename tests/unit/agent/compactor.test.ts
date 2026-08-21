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

  test('超过阈值的消息被压缩为可进上下文的 user 摘要', () => {
    const compactor = new Compactor({ threshold: 10, keepRecent: 5 })
    const messages = Array.from({ length: 15 }, (_, i) => makeMsg(`m${i}`, 'user', `msg${i}`))
    const result = compactor.compact(messages)
    expect(result.length).toBeLessThan(15)
    // 压缩产物必须是能被 LLM 上下文消费的 user 角色（而非被过滤的 notification）
    expect(result[0].role).toBe('user')
  })

  test('压缩摘要携带旧内容要点而非固定占位文案', () => {
    const compactor = new Compactor({ threshold: 4, keepRecent: 2 })
    const messages = [
      makeMsg('a', 'user', '帮我写一个排序函数'),
      makeMsg('b', 'assistant', '好的，这是排序实现：function sort...'),
      makeMsg('c', 'user', '再加个测试'),
      makeMsg('d', 'assistant', '已补充单元测试。'),
      makeMsg('e', 'user', '现在用中文解释'),
      makeMsg('f', 'assistant', '该排序算法时间复杂度为 O(n log n)。'),
    ]
    const result = compactor.compact(messages) as AgentMessage[]
    expect(result[0].role).toBe('user')
    const summary = result[0].content
    // 摘要含旧对话要点（用户请求/结论）而非仅一句"已被压缩"
    expect(summary).toContain('排序函数')
    expect(summary).toContain('排序实现')
    // 且能作为 user 消息进入 LLM 上下文（不被默认转换过滤）
    expect(summary).toContain('[上下文压缩]')
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