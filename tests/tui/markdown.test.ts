import { describe, it, expect } from 'vitest'
import { Markdown } from '../../src/tui/components/markdown.js'
import { visibleWidth } from '../../src/tui/components/text.js'

describe('Markdown 组件', () => {
  it('空 source → 单行空', () => {
    const m = new Markdown('')
    expect(m.render(80)).toEqual([''])
  })

  it('短 markdown 正常渲染（含加粗/着色）', () => {
    const m = new Markdown('**hello** world')
    const lines = m.render(80)
    expect(lines.length).toBe(1)
    // 含 bold ANSI
    expect(lines[0]).toContain('\x1b[1m')
  })

  it('超长行被 wrapText 二次换行到 width', () => {
    const longText = 'a'.repeat(200)
    const m = new Markdown(longText)
    const lines = m.render(20)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(20)
    }
  })

  it('CJK 超长行按双宽 wrap', () => {
    const m = new Markdown('中'.repeat(50))
    const lines = m.render(10)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(10)
    }
  })

  it('多段落 → 多行（按 \\n 分隔）', () => {
    const m = new Markdown('para one\n\npara two')
    const lines = m.render(80)
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  it('缓存：相同 width 返回相同引用', () => {
    const m = new Markdown('hello')
    const a = m.render(80)
    const b = m.render(80)
    expect(a).toBe(b)
  })

  it('setSource 触发重算', () => {
    const m = new Markdown('hello')
    const a = m.render(80)
    m.setSource('world')
    const b = m.render(80)
    expect(a).not.toEqual(b)
    expect(b.join('')).toContain('world')
  })

  it('width 变化触发重新 wrap', () => {
    const m = new Markdown('a'.repeat(50))
    const wide = m.render(80)
    const narrow = m.render(10)
    expect(wide.length).toBeLessThan(narrow.length)
  })

  it('代码块超宽也 wrap（不破坏 ANSI 状态）', () => {
    const m = new Markdown('```\n' + 'x'.repeat(100) + '\n```')
    const lines = m.render(20)
    for (const line of lines) {
      // 每行可视宽度 <= 20
      expect(visibleWidth(line)).toBeLessThanOrEqual(20)
      // ANSI 状态应在每行末尾 reset（wrapText 保证）
      expect(line.endsWith('\x1b[0m')).toBe(true)
    }
  })
})