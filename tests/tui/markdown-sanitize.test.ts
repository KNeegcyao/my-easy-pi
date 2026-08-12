import { describe, it, expect } from 'vitest'
import { sanitizeStreamingMarkdown, isTableLine } from '../../src/tui/components/markdown.js'

describe('sanitizeStreamingMarkdown', () => {
  it('空 source 原样返回', () => {
    expect(sanitizeStreamingMarkdown('')).toBe('')
  })

  it('偶数 ``` 不动', () => {
    const s = '```js\nconsole.log(1)\n```'
    expect(sanitizeStreamingMarkdown(s)).toBe(s)
  })

  it('奇数 ``` 末尾补一个 ```（未闭合围栏）', () => {
    const s = '```js\nconsole.log(1)\n后续内容'
    const out = sanitizeStreamingMarkdown(s)
    expect(out.endsWith('```')).toBe(true)
    // 补的位置在末行
    expect(out.split('```').length % 2).toBe(1)   // 现在偶数对
  })

  it('半截表格行不删（pi 策略：让 marked 自己渲染，删了会闪烁）', () => {
    const s = '| 模块 | 功能 |\n| --- | --- |\n| agent | 循环\n| tools | 工具'
    const out = sanitizeStreamingMarkdown(s)
    // 不删半截行——流式期间表格逐步生长，删了会消失/重现闪烁
    expect(out).toContain('| tools | 工具')
    expect(out).toContain('| agent | 循环')
  })

  it('完整的表格行不动（有收尾 |）', () => {
    const s = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    expect(sanitizeStreamingMarkdown(s)).toBe(s)
  })

  it('普通列表项不被误删（不以 | 开头）', () => {
    const s = '- 项目一\n- 项目二'
    expect(sanitizeStreamingMarkdown(s)).toBe(s)
  })

  it('分隔行 |---| 不被当半截表格删除（前缀 |- 保护）', () => {
    const s = '| a | b |\n| --- |'
    const out = sanitizeStreamingMarkdown(s)
    // 末行 | --- | 以 |- 开头，按分隔行保护不删；围栏不触发
    expect(out).toContain('| --- |')
    expect(out).toContain('| a | b |')
  })
})

describe('isTableLine', () => {
  it('含 ≥2 个 │ → 是表格行', () => {
    expect(isTableLine('│ a │ b │')).toBe(true)
    expect(isTableLine('  │ agent │ 循环 │')).toBe(true)
  })

  it('分隔行 |---| → 是表格行', () => {
    expect(isTableLine('| --- | --- |')).toBe(true)
    expect(isTableLine('| --- |')).toBe(true)
  })

  it('普通文本行 → 非表格行', () => {
    expect(isTableLine('hello world')).toBe(false)
    expect(isTableLine('- 列表项')).toBe(false)
  })

  it('含 ANSI 的表格行也被识别', () => {
    expect(isTableLine('\x1b[32m│ a │\x1b[0m')).toBe(true)
  })

  it('单个 │ 不算表格行（避免误判）', () => {
    expect(isTableLine('a | b')).toBe(false)   // 普通文本含 1 个 |
  })
})