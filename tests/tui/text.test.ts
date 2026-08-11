import { describe, it, expect } from 'vitest'
import { Text, wrapText, visibleWidth, charWidth, truncateAnsi } from '../../src/tui/components/text.js'

describe('charWidth', () => {
  it('ASCII 字符宽度 1', () => {
    expect(charWidth('a'.codePointAt(0)!)).toBe(1)
    expect(charWidth('1'.codePointAt(0)!)).toBe(1)
  })

  it('CJK 字符宽度 2', () => {
    expect(charWidth('中'.codePointAt(0)!)).toBe(2)
    expect(charWidth('日'.codePointAt(0)!)).toBe(2)
    expect(charWidth('한'.codePointAt(0)!)).toBe(2)
  })

  it('全角标点宽度 2', () => {
    expect(charWidth('，'.codePointAt(0)!)).toBe(2)
    expect(charWidth('！'.codePointAt(0)!)).toBe(2)
  })

  it('emoji 宽度 2（保守近似）', () => {
    expect(charWidth('😊'.codePointAt(0)!)).toBe(2)
  })
})

describe('visibleWidth', () => {
  it('纯文本：按字符宽度求和', () => {
    expect(visibleWidth('hello')).toBe(5)
    expect(visibleWidth('你好')).toBe(4)  // 2 + 2
    expect(visibleWidth('a中b')).toBe(4)  // 1 + 2 + 1
  })

  it('ANSI 序列不计入宽度', () => {
    const colored = '\x1b[32mhello\x1b[0m'
    expect(visibleWidth(colored)).toBe(5)
  })

  it('混合 ANSI + CJK 宽度正确', () => {
    const msg = '\x1b[32m你好\x1b[0m world'
    expect(visibleWidth(msg)).toBe(4 + 6)  // 你(2)+好(2) + ' world'(6)
  })
})

describe('wrapText', () => {
  it('空文本 → 单行空', () => {
    expect(wrapText('', 80)).toEqual([''])
  })

  it('短行不换', () => {
    expect(wrapText('hello', 80)).toEqual(['hello\x1b[0m'])
  })

  it('长行在 width 处断行（默认 wrap=true）', () => {
    const lines = wrapText('hello world', 5)
    expect(lines.length).toBeGreaterThan(1)
    // 每一行的可视宽度应 <= 5
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(5)
    }
  })

  it('换行符作为硬分隔', () => {
    const lines = wrapText('a\nb\nc', 80)
    expect(lines.length).toBe(3)
  })

  it('ANSI 序列跨行不泄漏', () => {
    const colored = '\x1b[32mhello world this is a long line\x1b[0m'
    const lines = wrapText(colored, 10)
    for (const line of lines) {
      // 每行都以 reset 结尾
      expect(line.endsWith('\x1b[0m')).toBe(true)
    }
  })

  it('宽度 0：不崩溃', () => {
    expect(wrapText('hello', 0)).toEqual([''])
  })
})

describe('truncateAnsi', () => {
  it('短于上限：原样返回', () => {
    expect(truncateAnsi('hello', 10)).toBe('hello')
  })

  it('超长：截断到 maxCols 可视宽度', () => {
    const truncated = truncateAnsi('hello world', 5)
    expect(visibleWidth(truncated)).toBe(5)
  })

  it('保留 ANSI 颜色状态', () => {
    const truncated = truncateAnsi('\x1b[32mhello world\x1b[0m', 5)
    expect(truncated).toContain('\x1b[32m')
    expect(truncated).toContain('\x1b[0m')  // 收尾 reset
    expect(visibleWidth(truncated)).toBe(5)
  })

  it('CJK 按双宽截断', () => {
    // 你好 = 4 列；maxCols=3 应只截到「你」（2 列），勉强无法再放「好」（4>3）
    const truncated = truncateAnsi('你好世界', 3)
    expect(visibleWidth(truncated)).toBeLessThanOrEqual(3)
    expect(truncated).toContain('你')
    expect(truncated).not.toContain('世')
  })

  it('maxCols<=0 返回空串', () => {
    expect(truncateAnsi('hello', 0)).toBe('')
    expect(truncateAnsi('hello', -1)).toBe('')
  })
})

describe('Text 组件', () => {
  it('setContent 触发 invalidate', () => {
    const t = new Text('hello')
    const lines1 = t.render(80)
    t.setContent('world')
    const lines2 = t.render(80)
    expect(lines1).not.toEqual(lines2)
  })

  it('缓存：相同 width 重复渲染返回相同数组', () => {
    const t = new Text('hello')
    const a = t.render(80)
    const b = t.render(80)
    expect(a).toBe(b)  // 相同引用，缓存生效
  })

  it('宽度变化触发重算', () => {
    const t = new Text('hello world')
    const narrow = t.render(5)
    const wide = t.render(80)
    expect(narrow.length).toBeGreaterThan(1)
    expect(wide.length).toBe(1)
  })

  it('wrap=false 时保留 \\n 分割但不强制换行', () => {
    const t = new Text('hello world', { wrap: false })
    const lines = t.render(5)
    expect(lines).toEqual(['hello world'])
  })
})
