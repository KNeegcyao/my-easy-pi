import type { Component } from '../component.js'
import { renderToLines } from '../../interface/markdown-renderer.js'

/** Markdown 组件：包装现有 markdown-renderer.renderToLines()，加 source 缓存 */
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
    // 现有 renderToLines() 不感知宽度（返回完整渲染结果），缓存仅按宽度失效
    const lines = renderToLines(this.source)
    this.cachedLines = lines
    this.cachedForWidth = width
    return lines
  }
}
