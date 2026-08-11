import type { Component } from '../component.js'
import { visibleWidth, truncateAnsi } from './text.js'

export interface BoxOptions {
  /** 边框字符；默认使用细线 ─ │ ┌ ┐ └ ┘ */
  border?: BoxChars
  /** 内边距（列数）；默认 1 */
  padding?: number
  /** 标题（贴在顶边）；可选 */
  title?: string
  /** 边框颜色 ANSI 包装函数；可选 */
  borderColor?: (s: string) => string
}

export interface BoxChars {
  topLeft: string; topRight: string
  bottomLeft: string; bottomRight: string
  horizontal: string; vertical: string
}

const THIN_BORDER: BoxChars = {
  topLeft: '┌', topRight: '┐',
  bottomLeft: '└', bottomRight: '┘',
  horizontal: '─', vertical: '│',
}

/** 简单边框容器：渲染 ╔═╗ 风格的盒子。 */
export class Box implements Component {
  private child: Component | null = null
  private opts: Required<Omit<BoxOptions, 'title' | 'borderColor'>> & {
    title: string | undefined
    borderColor: ((s: string) => string) | undefined
    border: BoxChars
  }
  private cachedForWidth: number | null = null
  private cachedLines: string[] | null = null

  constructor(opts: BoxOptions = {}) {
    this.opts = {
      border: opts.border ?? THIN_BORDER,
      padding: opts.padding ?? 1,
      title: opts.title,
      borderColor: opts.borderColor,
    }
  }

  setChild(c: Component | null): void {
    this.child = c
    this.invalidate()
  }

  setTitle(title: string | undefined): void {
    this.opts.title = title
    this.invalidate()
  }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
    if (this.child?.invalidate) this.child.invalidate()
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) return this.cachedLines

    const b = this.opts.border
    const pad = this.opts.padding
    const innerWidth = Math.max(0, width - 2 - pad * 2)  // 减去左右竖线 + padding
    const contentWidth = Math.max(0, width - 2)            // 内容总宽（含 padding）

    const colorize = this.opts.borderColor ?? (s => s)

    // 顶边：┌────[ title ]────┐
    const topRaw = b.topLeft + b.horizontal.repeat(Math.max(0, contentWidth)) + b.topRight
    let top = topRaw
    if (this.opts.title) {
      const t = ` ${this.opts.title} `
      const tWidth = visibleWidth(t)
      if (tWidth <= contentWidth) {
        const insertAt = 1 + Math.floor((contentWidth - tWidth) / 2)
        top = topRaw.slice(0, insertAt) + t + topRaw.slice(insertAt + tWidth)
      }
    }
    top = colorize(top)

    // 底边：└────────────────┘
    const bottom = colorize(
      b.bottomLeft + b.horizontal.repeat(Math.max(0, contentWidth)) + b.bottomRight,
    )

    // 中间：│ <child line, padded & truncated> │
    const childLines = this.child ? this.child.render(innerWidth) : []
    const middle = childLines.map(line => {
      const left = colorize(b.vertical)
      const right = colorize(b.vertical)
      const lw = visibleWidth(line)
      const padStr = ' '.repeat(Math.max(0, innerWidth - lw))
      const truncated = truncateAnsi(line, innerWidth)
      const padLeft = ' '.repeat(pad)
      const padRight = ' '.repeat(pad)
      return `${left}${padLeft}${truncated}${padStr}${padRight}${right}`
    })

    this.cachedLines = [top, ...middle, bottom]
    this.cachedForWidth = width
    return this.cachedLines
  }
}