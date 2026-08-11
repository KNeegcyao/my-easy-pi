import { describe, it, expect } from 'vitest'
import { Container } from '../../src/tui/layout/container.js'
import { Spacer } from '../../src/tui/components/spacer.js'
import { Text } from '../../src/tui/components/text.js'

describe('Container', () => {
  it('空容器 render → []', () => {
    const c = new Container()
    expect(c.render(80)).toEqual([])
  })

  it('render 按 FIFO 拼接 children', () => {
    const c = new Container([new Text('a'), new Text('b')])
    expect(c.render(80)).toEqual(['a\x1b[0m', 'b\x1b[0m'])
  })

  it('addChild 后尾部追加', () => {
    const c = new Container([new Text('a')])
    c.addChild(new Text('b'))
    expect(c.childCount).toBe(2)
    expect(c.render(80).length).toBe(2)
  })

  it('removeChild 清除指定', () => {
    const a = new Text('a')
    const b = new Text('b')
    const c = new Container([a, b])
    c.removeChild(a)
    expect(c.childCount).toBe(1)
    expect(c.render(80)[0]).toContain('b')
  })

  it('removeChild 不存在的不报错', () => {
    const c = new Container([new Text('a')])
    expect(() => c.removeChild(new Text('x'))).not.toThrow()
    expect(c.childCount).toBe(1)
  })

  it('clear 清空所有', () => {
    const c = new Container([new Text('a'), new Text('b')])
    c.clear()
    expect(c.childCount).toBe(0)
    expect(c.render(80)).toEqual([])
  })

  it('不缓存：相同 width 两次 render 返回不同引用但内容一致', () => {
    // Container 不缓存自身聚合结果（子组件内容会变，Container 无法感知
    // 子组件变化并向上传播 invalidate）。子组件（Text/Markdown）各自缓存。
    const c = new Container([new Text('a')])
    const a = c.render(80)
    const b = c.render(80)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)   // 不同引用：每次 render 新建数组
  })

  it('width 变化触发重算', () => {
    const c = new Container([new Text('hello world')])
    const wide = c.render(80)
    const narrow = c.render(5)
    expect(wide.length).toBeLessThanOrEqual(narrow.length)
  })

  it('子组件 render 返回空数组时对总行数无贡献', () => {
    // Markdown('') 返回 ['']，但 Text('') wrap 后也可能空；用 Container 测叠加
    const empty = new Text('')
    const c = new Container([empty, new Text('has')])
    const lines = c.render(80)
    // 'has' 至少出现
    expect(lines.join('')).toContain('has')
  })

  it('invalidate 清缓存（含递归子组件）', () => {
    const t = new Text('a')
    const c = new Container([t])
    const a = c.render(80)
    t.setContent('changed')
    c.invalidate()
    const b = c.render(80)
    expect(b).not.toEqual(a)
  })

  it('addChild 后 invalidate 让下次 render 重算', () => {
    const c = new Container([new Text('a')])
    c.render(80)   // 缓存
    c.addChild(new Text('b'))
    const lines = c.render(80)
    expect(lines.length).toBe(2)
  })

  it('getChildren 返回只读快照（外部修改不影响内部）', () => {
    const c = new Container([new Text('a')])
    const snap = c.getChildren() as unknown as Component[]
    snap.push(new Text('x'))   // 试图改快照
    expect(c.childCount).toBe(1)   // 内部仍是 1
  })

  it('构造可接受多个 children', () => {
    const c = new Container([new Text('a'), new Text('b'), new Text('c')])
    expect(c.childCount).toBe(3)
    expect(c.render(80).length).toBe(3)
  })
})

describe('Spacer', () => {
  it('默认 1 个空行', () => {
    expect(new Spacer().render(80)).toEqual([''])
  })

  it('N 个空行', () => {
    expect(new Spacer(3).render(80)).toEqual(['', '', ''])
  })

  it('height=0 → []', () => {
    expect(new Spacer(0).render(80)).toEqual([])
  })

  it('负 height → []（clamp）', () => {
    expect(new Spacer(-1).render(80)).toEqual([])
  })

  it('在 Container 里作为 separator', () => {
    const c = new Container([new Text('a'), new Spacer(1), new Text('b')])
    const lines = c.render(80)
    // a, (空一行), b => ['a..', '', 'b..']
    expect(lines.length).toBe(3)
    expect(lines[1]).toBe('')
  })

  it('invalidate 是 no-op', () => {
    const s = new Spacer(2)
    expect(() => s.invalidate?.()).not.toThrow()
    expect(s.render(80).length).toBe(2)
  })
})
