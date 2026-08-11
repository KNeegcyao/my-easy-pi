import { describe, it, expect } from 'vitest'
import { ScrollView } from '../../src/tui/layout/scroll-view.js'
import { Text } from '../../src/tui/components/text.js'

/** 多行文本 helper */
function multiLineText(lines: string[]): Text {
  return new Text(lines.join('\n'), { wrap: false })
}

describe('ScrollView', () => {
  it('viewport=0：不裁切，渲染所有行', () => {
    const sv = new ScrollView()
    sv.setChild(multiLineText(['a', 'b', 'c']))
    const lines = sv.render(20)
    expect(lines).toEqual(['a', 'b', 'c'])
  })

  it('viewport=N stickyBottom 默认钉底 → 渲染最后 N 行', () => {
    const sv = new ScrollView({ stickyBottom: true })
    sv.setChild(multiLineText(['a', 'b', 'c', 'd']))
    const lines = sv.render(20, 2)
    expect(lines).toEqual(['c', 'd'])
  })

  it('stickyBottom=false：从顶部渲染前 N 行', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(multiLineText(['a', 'b', 'c', 'd']))
    const lines = sv.render(20, 2)
    expect(lines).toEqual(['a', 'b'])
  })

  it('scrollBy 正向滚动后解除钉底', () => {
    const sv = new ScrollView({ stickyBottom: false, height: 0 })
    sv.setChild(multiLineText(['a', 'b', 'c', 'd', 'e']))
    sv.scrollBy(2)
    expect(sv.isPinnedBottom).toBe(false)
    const lines = sv.render(20, 2)
    expect(lines).toEqual(['c', 'd'])
  })

  it('scrollBy 不会超出顶部（负值 clamp 到 0）', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(multiLineText(['a', 'b']))
    sv.scrollBy(-10)
    expect(sv.getOffset()).toBe(0)
  })

  it('scrollTo 跳到指定位置', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(multiLineText(['a', 'b', 'c', 'd']))
    sv.scrollTo(2)
    const lines = sv.render(20, 2)
    expect(lines).toEqual(['c', 'd'])
  })

  it('scrollTo 负值 clamp 到 0', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.scrollTo(-5)
    expect(sv.getOffset()).toBe(0)
  })

  it('stickyBottom=true：内容增长自动跟随到底', () => {
    const sv = new ScrollView({ stickyBottom: true, height: 0 })
    const text = multiLineText(['a', 'b'])
    sv.setChild(text)
    // 初始 2 行，viewport=2，钉底 → a b
    expect(sv.render(20, 2)).toEqual(['a', 'b'])

    // 内容增长到 4 行；ScrollView 在 child 变化时需要被通知（与 Box 同理）
    text.setContent('a\nb\nc\nd')
    sv.invalidate()
    expect(sv.render(20, 2)).toEqual(['c', 'd'])
  })

  it('viewport 内不足时补空行（固定高度）', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(multiLineText(['a']))  // 只有 1 行
    const lines = sv.render(20, 3)
    expect(lines).toEqual(['a', '', ''])
  })

  it('setViewportHeight 触发重渲染', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(multiLineText(['a', 'b', 'c']))
    sv.setViewportHeight(3)
    expect(sv.render(20)).toHaveLength(3)
    sv.setViewportHeight(2)
    expect(sv.render(20)).toHaveLength(2)
  })

  it('setStickyBottom(true) 后跟随到底', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(multiLineText(['a', 'b', 'c', 'd', 'e']))
    sv.scrollBy(2)  // offset=2, 看到 c d；pinned=false
    expect(sv.render(20, 2)).toEqual(['c', 'd'])

    sv.setStickyBottom(true)
    expect(sv.isPinnedBottom).toBe(true)
    expect(sv.render(20, 2)).toEqual(['d', 'e'])
  })

  it('用户 scrollBy 后内容增长不自动跟随（已解除钉底）', () => {
    const sv = new ScrollView({ stickyBottom: true })
    const text = multiLineText(['a', 'b', 'c', 'd'])
    sv.setChild(text)
    sv.render(20, 2)  // 钉底 → c d
    sv.scrollBy(-1)   // 用户上滚 → offset=1, b c, pinned=false
    expect(sv.render(20, 2)).toEqual(['b', 'c'])

    // 内容增长
    text.setContent('a\nb\nc\nd\ne')
    // 用户已解除钉底，不跟随
    expect(sv.render(20, 2)).toEqual(['b', 'c'])
  })

  it('offset 超出 maxOffset 时被 clamp', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(multiLineText(['a', 'b', 'c']))
    sv.scrollTo(10)  // 远超
    sv.render(20, 2)
    // maxOffset = 3 - 2 = 1
    expect(sv.getOffset()).toBe(1)
  })

  it('不缓存：相同 width+viewport 返回同内容不同引用（同 Container 策略）', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(multiLineText(['a', 'b']))
    const a = sv.render(20, 2)
    const b = sv.render(20, 2)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('width 变化触发重算', () => {
    const sv = new ScrollView({ stickyBottom: false })
    sv.setChild(new Text('hello world'))
    const a = sv.render(5)
    const b = sv.render(20)
    expect(a).not.toEqual(b)
  })
})