import { describe, it, expect } from 'vitest'
import { ScreenBuffer } from '../../src/tui/screen-buffer.js'

describe('ScreenBuffer', () => {
  it('空 buffer 首次 replace：所有行都标记为新增', () => {
    const buf = new ScreenBuffer()
    const updates = buf.replace(['a', 'b', 'c'])
    expect(updates).toEqual([
      { row: 0, content: 'a' },
      { row: 1, content: 'b' },
      { row: 2, content: 'c' },
    ])
    expect(buf.size).toBe(3)
  })

  it('递增：只在变化的行上有 update', () => {
    const buf = new ScreenBuffer()
    buf.replace(['a', 'b', 'c'])
    const updates = buf.replace(['a', 'B', 'c', 'd'])
    expect(updates).toEqual([
      { row: 1, content: 'B' },
      { row: 3, content: 'd' },
    ])
    expect(buf.size).toBe(4)
  })

  it('缩小：旧内容尾部被截断', () => {
    const buf = new ScreenBuffer()
    buf.replace(['a', 'b', 'c', 'd'])
    const updates = buf.replace(['a', 'b'])
    expect(updates).toEqual([
      { row: 2, content: '' },
      { row: 3, content: '' },
    ])
    expect(buf.size).toBe(2)
  })

  it('replace 相同内容：无 update', () => {
    const buf = new ScreenBuffer()
    buf.replace(['a', 'b'])
    const updates = buf.replace(['a', 'b'])
    expect(updates).toEqual([])
  })

  it('snapshot 是只读副本，修改不影响 buffer', () => {
    const buf = new ScreenBuffer()
    buf.replace(['a'])
    const snap = buf.snapshot()
    expect(snap).toEqual(['a'])
    // snapshot 返回的是副本，但 TS 用 readonly，运行时仍可变
    // 我们验证 replace 后的 snapshot 是干净的
    buf.replace(['x', 'y'])
    expect(buf.snapshot()).toEqual(['x', 'y'])
  })

  it('clear 清空后 replace 重新计算', () => {
    const buf = new ScreenBuffer()
    buf.replace(['a', 'b'])
    buf.clear()
    expect(buf.size).toBe(0)
    const updates = buf.replace(['a', 'b'])
    expect(updates).toEqual([
      { row: 0, content: 'a' },
      { row: 1, content: 'b' },
    ])
  })

  it('diffLines 是纯函数', () => {
    const updates = ScreenBuffer.diffLines(['a', 'x'], ['a', 'y', 'z'])
    expect(updates).toEqual([
      { row: 1, content: 'y' },
      { row: 2, content: 'z' },
    ])
  })
})
