import { describe, it, expect } from 'vitest'
import { FixedHeightBox } from '../../src/tui/layout/fixed-height.js'
import type { Component } from '../../src/tui/component.js'

/** 假组件：固定返回 N 行 */
function fakeLines(lines: string[]): Component {
  return {
    render: () => lines.slice(),
    invalidate: () => {},
  }
}

describe('FixedHeightBox — 可折叠补全槽', () => {
  it('无内容时折叠为 0 行', () => {
    const box = new FixedHeightBox(8)
    expect(box.render(80)).toEqual([])
  })

  it('有内容时按实际行数撑开（≤max）', () => {
    const box = new FixedHeightBox(8)
    box.setContent(fakeLines(['a', 'b', 'c']))
    const out = box.render(80)
    expect(out).toEqual(['a', 'b', 'c'])
    expect(out).toHaveLength(3)
  })

  it('超出 max 截断', () => {
    const box = new FixedHeightBox(2)
    box.setContent(fakeLines(['a', 'b', 'c', 'd']))
    expect(box.render(80)).toEqual(['a', 'b'])
  })

  it('关闭后立即回 0 行', () => {
    const box = new FixedHeightBox(8)
    box.setContent(fakeLines(['a']))
    expect(box.render(80)).toHaveLength(1)
    box.setContent(null)
    expect(box.render(80)).toEqual([])
    expect(box.hasContent).toBe(false)
  })

  it('hasContent 反映挂载状态', () => {
    const box = new FixedHeightBox(8)
    expect(box.hasContent).toBe(false)
    box.setContent(fakeLines(['a']))
    expect(box.hasContent).toBe(true)
  })

  it('只渲染一行时不留多余空行', () => {
    const box = new FixedHeightBox(8)
    box.setContent(fakeLines(['only']))
    expect(box.render(80)).toHaveLength(1)
  })
})