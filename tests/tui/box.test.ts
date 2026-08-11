import { describe, it, expect } from 'vitest'
import { Box } from '../../src/tui/components/box.js'
import { Text } from '../../src/tui/components/text.js'

describe('Box', () => {
  it('无子组件：只渲染上下边框（共 3 行）', () => {
    const box = new Box()
    const lines = box.render(10)
    expect(lines).toHaveLength(2)  // top + bottom（无中间）
    expect(lines[0]).toContain('┌')
    expect(lines[1]).toContain('└')
  })

  it('有子组件：[top, ...child 中间行, bottom]', () => {
    const box = new Box()
    box.setChild(new Text('hi'))
    const lines = box.render(20)
    expect(lines.length).toBe(3)  // top + 1 child + bottom
    expect(lines[1]).toContain('hi')
    expect(lines[1]).toContain('│')
  })

  it('子内容被截断到 inner width', () => {
    const box = new Box({ padding: 1 })
    box.setChild(new Text('hello world this is very long', { wrap: false }))
    const lines = box.render(10)
    // inner width = 10 - 2(border) - 2(padding) = 6
    // 中间行格式：│ <6 chars> │
    expect(lines.length).toBe(3)
    expect(lines[1]).toContain('│')
    // 应被截到 6 字符
    expect(lines[1]).not.toContain('world')
  })

  it('标题居中渲染在顶边', () => {
    const box = new Box({ title: 'TITLE' })
    const lines = box.render(20)
    expect(lines[0]).toContain('TITLE')
  })

  it('缓存：相同 width 不重算', () => {
    const box = new Box()
    box.setChild(new Text('hi'))
    const a = box.render(20)
    const b = box.render(20)
    expect(a).toBe(b)
  })

  it('不同 width 触发重算', () => {
    const box = new Box()
    box.setChild(new Text('hi'))
    const a = box.render(20)
    const b = box.render(30)
    expect(a).not.toBe(b)
    expect(a[0].length).toBeLessThan(b[0].length)
  })

  it('invalidate 清缓存（含递归子组件）', () => {
    const text = new Text('hi')
    const box = new Box()
    box.setChild(text)
    const a = box.render(20)
    text.setContent('changed')
    box.invalidate()  // 业务侧通知 Box 子内容变了
    const b = box.render(20)
    expect(b).not.toEqual(a)
    expect(b[1]).toContain('changed')
  })
  // 注：当 Text 内容变化时，Box 自身缓存不会自动失效。
  // 实际使用中应由 Box.invalidate() 或父级 requestRender 触发整树重算。
  // 这与 React 的 setState → reconcile 模型一致。

  it('borderColor 给边框上色', () => {
    const box = new Box({ borderColor: s => `\x1b[32m${s}\x1b[0m` })
    const lines = box.render(10)
    expect(lines[0]).toContain('\x1b[32m')
    expect(lines[1]).toContain('\x1b[32m')
  })

  it('极小宽度不崩溃', () => {
    const box = new Box()
    box.setChild(new Text('hi'))
    const lines = box.render(2)
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })
})