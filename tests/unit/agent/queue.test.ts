import { describe, test, expect } from 'vitest'
import { MessageQueue } from '../../../src/agent/queue.js'

describe('MessageQueue', () => {
  test('新队列没有待处理消息', () => {
    const queue = new MessageQueue()
    expect(queue.hasPending()).toBe(false)
    expect(queue.next()).toBeNull()
  })

  test('steer 添加的消息优先于 followUp', () => {
    const queue = new MessageQueue()
    queue.followUp('普通任务')
    queue.steer('紧急插入')
    const first = queue.next()
    expect(first?.content).toBe('紧急插入')
    const second = queue.next()
    expect(second?.content).toBe('普通任务')
  })

  test('队列为空后返回 null', () => {
    const queue = new MessageQueue()
    queue.steer('测试')
    queue.next()
    expect(queue.next()).toBeNull()
    expect(queue.hasPending()).toBe(false)
  })

  test('清空所有队列', () => {
    const queue = new MessageQueue()
    queue.steer('A')
    queue.followUp('B')
    queue.clearAll()
    expect(queue.hasPending()).toBe(false)
  })

  test('清空 Steering 队列不影响 Follow-up', () => {
    const queue = new MessageQueue()
    queue.steer('紧急')
    queue.followUp('普通')
    queue.clearSteering()
    expect(queue.next()?.content).toBe('普通')
  })
})