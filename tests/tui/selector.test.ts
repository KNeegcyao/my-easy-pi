import { describe, it, expect } from 'vitest'
import { Selector } from '../../src/tui/components/selector.js'

describe('Selector', () => {
  const opts = [
    { label: 'Yes', value: 'y' },
    { label: 'No', value: 'n' },
  ]

  it('初始选中第一项', () => {
    const s = new Selector(opts)
    expect(s.selectedIndex).toBe(0)
  })

  it('↓ 后移', () => {
    const s = new Selector(opts)
    s.handleKey('\x1b[B')
    expect(s.selectedIndex).toBe(1)
  })

  it('↑ 回到顶部', () => {
    const s = new Selector(opts)
    s.handleKey('\x1b[B') // 1
    s.handleKey('\x1b[A') // 0
    expect(s.selectedIndex).toBe(0)
  })

  it('不超出边界', () => {
    const s = new Selector(opts)
    s.handleKey('\x1b[A') // 已在 0，不动
    expect(s.selectedIndex).toBe(0)
    s.handleKey('\x1b[B') // 1
    s.handleKey('\x1b[B') // 已在末尾，不动
    expect(s.selectedIndex).toBe(1)
  })

  it('Enter 触发 onSelect', () => {
    const s = new Selector(opts)
    let selected: string | null = null
    s.onSelect = (opt) => { selected = opt.value }
    s.handleKey('\r')
    expect(selected).toBe('y')  // 第一项
  })

  it('Esc 触发 onCancel', () => {
    const s = new Selector(opts)
    let cancelled = false
    s.onCancel = () => { cancelled = true }
    s.handleKey('\x1b')
    expect(cancelled).toBe(true)
  })

  it('render 产生行', () => {
    const s = new Selector(opts, '测试')
    const lines = s.render(80)
    expect(lines.length).toBeGreaterThan(2)
    expect(lines.join('')).toContain('测试')
    expect(lines.join('')).toContain('Yes')
    expect(lines.join('')).toContain('No')
  })

  it('j/k 导航', () => {
    const s = new Selector(opts)
    s.handleKey('j')
    expect(s.selectedIndex).toBe(1)
    s.handleKey('k')
    expect(s.selectedIndex).toBe(0)
  })

  it('y/n 快速选择', () => {
    const s = new Selector(opts)
    let val = ''
    s.onSelect = (opt) => { val = opt.value }
    s.handleKey('y')
    expect(val).toBe('y')
  })
})