import { describe, it, expect } from 'vitest'
import { VStack } from '../../src/tui/layout/stack.js'
import { Text } from '../../src/tui/components/text.js'
import { ScrollView } from '../../src/tui/layout/scroll-view.js'

/** 剥 ANSI（Text render 每行带 \x1b[0m reset） */
const plain = (lines: string[]): string[] => lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''))

describe('VStack flex 分配', () => {
  it('无 viewport：各子按自然高度拼接', () => {
    const v = new VStack([
      { component: new Text('a\nb\nc') },
      { component: new Text('x\ny') },
    ])
    expect(plain(v.render(80))).toEqual(['a', 'b', 'c', 'x', 'y'])
  })

  it('固定子 + grow 子：grow 吃剩余高度', () => {
    const grow = new ScrollView()
    grow.setChild(new Text('1\n2\n3\n4\n5\n6\n7\n8\n9\n10'))
    const v = new VStack([
      { component: grow, grow: 1, min: 1 },     // 吃剩余
      { component: new Text('fixed'), grow: 0 }, // 自然 1 行
    ])
    v.setViewportHeight(10)
    const lines = plain(v.render(80))
    expect(lines.length).toBe(10)            // 满屏
    expect(lines[9]).toContain('fixed')      // 末行是固定子
    // grow 子占了前 9 行（ScrollView stickyBottom 看末 9 行，offset=1）
    expect(lines[0]).toContain('2')
  })

  it('min 约束：grow 子至少 min 行', () => {
    const grow = new ScrollView()
    grow.setChild(new Text('only'))
    const v = new VStack([
      { component: grow, grow: 1, min: 3 },
      { component: new Text('f'), grow: 0 },
    ])
    v.setViewportHeight(6)
    const lines = plain(v.render(80))
    expect(lines.length).toBe(6)
    expect(lines[5]).toContain('f')
  })

  it('setViewportHeight 变化触发重算', () => {
    const v = new VStack([{ component: new Text('a'), grow: 1, min: 1 }])
    v.setViewportHeight(3)
    expect(v.render(80).length).toBe(3)
    v.setViewportHeight(5)
    expect(v.render(80).length).toBe(5)
  })

  it('ScrollView 子接收 setViewportHeight（duck-type）', () => {
    const sv = new ScrollView({ stickyBottom: true })
    sv.setChild(new Text('1\n2\n3\n4\n5'))
    const v = new VStack([{ component: sv, grow: 1, min: 1 }])
    v.setViewportHeight(2)
    expect(plain(v.render(80))).toEqual(['4', '5'])
  })

  it('多 grow 子按权重分', () => {
    const g1 = new ScrollView(); g1.setChild(new Text('a1\na2\na3\na4\na5\na6'))
    const g2 = new ScrollView(); g2.setChild(new Text('b1\nb2\nb3\nb4\nb5\nb6'))
    const v = new VStack([
      { component: g1, grow: 1, min: 1 },
      { component: g2, grow: 1, min: 1 },
    ])
    v.setViewportHeight(6)
    const lines = plain(v.render(80))
    expect(lines.length).toBe(6)
    expect(lines.slice(0, 3)).toEqual(['a4', 'a5', 'a6'])
    expect(lines.slice(3, 6)).toEqual(['b4', 'b5', 'b6'])
  })

  it('viewport=0 且无 grow：纯自然拼接', () => {
    const v = new VStack([{ component: new Text('a\nb') }])
    expect(plain(v.render(80))).toEqual(['a', 'b'])
  })

  it('不缓存：子组件变化能反映（同 Container 策略）', () => {
    const v = new VStack([{ component: new Text('a') }])
    v.setViewportHeight(2)
    const a = v.render(80)
    // VStack 不缓存聚合，每次 render 新建数组
    const b = v.render(80)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})