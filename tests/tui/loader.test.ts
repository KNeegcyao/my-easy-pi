import { describe, it, expect } from 'vitest'
import { Loader } from '../../src/tui/components/loader.js'

describe('Loader', () => {
  it('tick 推进帧', () => {
    const loader = new Loader('working')
    expect(loader.currentFrame).toBe(0)
    loader.tick()
    expect(loader.currentFrame).toBe(1)
    loader.tick()
    expect(loader.currentFrame).toBe(2)
  })

  it('tick 循环回到 0', () => {
    const loader = new Loader('working')
    for (let i = 0; i < 10; i++) loader.tick()
    expect(loader.currentFrame).toBe(0)
    loader.tick()
    expect(loader.currentFrame).toBe(1)
  })

  it('render 产生单行带 spinner 和文本', () => {
    const loader = new Loader('working')
    const lines = loader.render(80)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('⠋')
    expect(lines[0]).toContain('working')
  })

  it('空文本时只渲染 spinner', () => {
    const loader = new Loader('')
    const lines = loader.render(80)
    expect(lines[0]).toBe('⠋')
  })

  it('setText 触发 invalidate，下次 render 用新文本', () => {
    const loader = new Loader('old')
    const before = loader.render(80)
    expect(before[0]).toContain('old')
    loader.setText('new')
    const after = loader.render(80)
    expect(after[0]).toContain('new')
  })

  it('tick 后 render 用新帧', () => {
    const loader = new Loader('x')
    const f0 = loader.render(80)[0]
    loader.tick()
    const f1 = loader.render(80)[0]
    expect(f0).not.toBe(f1)
  })

  it('支持自定义 colorizer', () => {
    const loader = new Loader({ text: 'x', color: s => `<${s}>` })
    const lines = loader.render(80)
    expect(lines[0]).toContain('<⠋>')
  })
})
