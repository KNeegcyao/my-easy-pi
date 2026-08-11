import type { Component } from '../component.js'
import { renderToLines } from '../../interface/markdown-renderer.js'
import { wrapText } from './text.js'

/**
 * Markdown 组件：包装 markdown-renderer.renderToLines()，
 * 再用 wrapText 做可视宽度二次换行（CJK 双宽 + ANSI 安全）。
 *
 * 旧 interface/tui/renderer.ts 靠 physicalRows() 在光标位移时补救超宽行；
 * 新方案从源头 wrap，避免行级 diff 错位。
 */
export class Markdown implements Component {
  private source: string
  private cachedForWidth: number | null = null
  private cachedLines: string[] | null = null

  constructor(source: string = '') {
    this.source = source
  }

  setSource(source: string): void {
    if (source !== this.source) {
      this.source = source
      this.invalidate()
    }
  }

  getSource(): string { return this.source }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) {
      return this.cachedLines
    }
    // renderToLines 返回含 ANSI 的行，可能超宽；wrapText 二次换行到 width
    const raw = renderToLines(this.source)
    const wrapped = raw.length === 0
      ? ['']
      : raw.flatMap(line => wrapText(line, width))
    this.cachedLines = wrapped
    this.cachedForWidth = width
    return wrapped
  }
}