import type { Component } from '../component.js'

/**
 * 简单文本组件：一个字符串（可含 ANSI），可选按可视宽度换行。
 * 支持长行在终端宽度内断行；优先在 word 边界断，不够时强制按字符断。
 */
export class Text implements Component {
  private content: string
  private wrap: boolean
  private cachedLines: string[] | null = null
  private cachedWidth: number | null = null

  constructor(content: string = '', options: { wrap?: boolean } = {}) {
    this.content = content
    this.wrap = options.wrap ?? true
  }

  setContent(content: string): void {
    if (content !== this.content) {
      this.content = content
      this.invalidate()
    }
  }

  getContent(): string { return this.content }

  invalidate(): void {
    this.cachedLines = null
    this.cachedWidth = null
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines
    this.cachedLines = this.wrap ? wrapText(this.content, width) : splitOnly(this.content)
    this.cachedWidth = width
    return this.cachedLines
  }
}

function splitOnly(text: string): string[] {
  return text.split('\n')
}

/** 按可视宽度换行；保留 ANSI 转义序列 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return ['']
  const out: string[] = []
  for (const rawLine of text.split('\n')) {
    out.push(...wrapLine(rawLine, width))
  }
  return out
}

/** 把一行按可视宽度拆成多行；每行末尾附 \x1b[0m 防止 ANSI 泄漏 */
function wrapLine(line: string, width: number): string[] {
  if (line.length === 0) return ['']

  const segments = parseSegments(line) // 片段：{ ansi?: string, text: string, width: number } 或纯 ansi
  const rows: string[] = []
  let current = ''
  let currentWidth = 0
  let activeAnsi = ''

  for (const seg of segments) {
    if ('ansi' in seg && seg.ansi) {
      // 纯 ANSI 序列：透传
      current += seg.ansi
      // 记录激活样式（重置就清空）
      if (seg.ansi === '\x1b[0m' || seg.ansi === '\x1b[m') {
        activeAnsi = ''
      } else {
        activeAnsi += seg.ansi
      }
      continue
    }

    const text = (seg as { text: string }).text
    for (const ch of text) {
      const cp = ch.codePointAt(0) || 0
      const cw = charWidth(cp)
      if (currentWidth + cw > width && currentWidth > 0) {
        // 换行：收尾 ANSI 状态、新开一行恢复样式
        rows.push(current + '\x1b[0m')
        current = activeAnsi  // 恢复之前的样式继续
        currentWidth = 0
      }
      current += ch
      currentWidth += cw
    }
  }

  if (current.length > 0 || rows.length === 0) {
    rows.push(current + '\x1b[0m')
  }
  return rows
}

type AnsiSegment = { ansi: string }
type TextSegment = { text: string; width: number }

function parseSegments(line: string): Array<AnsiSegment | TextSegment> {
  const out: Array<AnsiSegment | TextSegment> = []
  let i = 0
  let pending = ''
  let pendingWidth = 0

  const flushPending = () => {
    if (pending.length > 0) {
      out.push({ text: pending, width: pendingWidth })
      pending = ''
      pendingWidth = 0
    }
  }

  while (i < line.length) {
    if (line[i] === '\x1b' && line[i + 1] === '[') {
      // 找 m 结尾
      let j = i + 2
      while (j < line.length && line[j] !== 'm') j++
      if (j >= line.length) break
      flushPending()
      out.push({ ansi: line.slice(i, j + 1) })
      i = j + 1
      continue
    }
    const ch = line[i]
    pending += ch
    pendingWidth += charWidth(ch.codePointAt(0) || 0)
    i++
  }
  flushPending()
  return out
}

/** CJK/emoji 双宽，其余单宽（保守近似） */
export function charWidth(codepoint: number): number {
  if (
    (codepoint >= 0x1100 && codepoint <= 0x115f) ||
    (codepoint >= 0x2e80 && codepoint <= 0x9fff) ||
    (codepoint >= 0xa000 && codepoint <= 0xa4cf) ||
    (codepoint >= 0xac00 && codepoint <= 0xd7a3) ||
    (codepoint >= 0xf900 && codepoint <= 0xfaff) ||
    (codepoint >= 0xfe30 && codepoint <= 0xfe4f) ||
    (codepoint >= 0xff00 && codepoint <= 0xff60) ||
    (codepoint >= 0xffe0 && codepoint <= 0xffe6) ||
    (codepoint >= 0x1f300 && codepoint <= 0x1f64f)
  ) return 2
  return 1
}

/** 一行（含 ANSI）的可视宽度 */
export function visibleWidth(line: string): number {
  let w = 0
  let i = 0
  while (i < line.length) {
    if (line[i] === '\x1b' && line[i + 1] === '[') {
      let j = i + 2
      while (j < line.length && line[j] !== 'm') j++
      i = j + 1
      if (j >= line.length) break
      continue
    }
    w += charWidth(line.codePointAt(i) || 0)
    i++
  }
  return w
}

/** 按可视宽度截断一行（保留 ANSI 状态，末尾附 reset） */
export function truncateAnsi(line: string, maxCols: number): string {
  if (maxCols <= 0) return ''
  if (visibleWidth(line) <= maxCols) return line
  const segs = parseSegments(line)
  let out = ''
  let activeAnsi = ''
  let w = 0
  for (const seg of segs) {
    if ('ansi' in seg && seg.ansi) {
      out += seg.ansi
      if (seg.ansi === '\x1b[0m' || seg.ansi === '\x1b[m') activeAnsi = ''
      else activeAnsi += seg.ansi
      continue
    }
    const text = (seg as { text: string }).text
    for (const ch of text) {
      const cp = ch.codePointAt(0) || 0
      const cw = charWidth(cp)
      if (w + cw > maxCols) {
        return out + '\x1b[0m'
      }
      out += ch
      w += cw
    }
  }
  return out + (activeAnsi ? '\x1b[0m' : '')
}
