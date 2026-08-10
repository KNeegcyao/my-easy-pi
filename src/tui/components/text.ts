import type { Component } from '../component.js'

/** 简单文本组件：一个字符串，可选着色（装饰符已含 ANSI） */
export class Text implements Component {
  private content: string
  private cachedLines: string[] | null = null

  constructor(content: string = '') {
    this.content = content
  }

  setContent(content: string): void {
    if (content !== this.content) {
      this.content = content
      this.invalidate()
    }
  }

  getContent(): string { return this.content }

  invalidate(): void { this.cachedLines = null }

  render(width: number): string[] {
    if (this.cachedLines) return this.cachedLines
    // TODO Phase 3: 按 width wrap（先用一次性 wrap，避免依赖外部库）
    this.cachedLines = this.wrapText(this.content, width)
    return this.cachedLines
  }

  private wrapText(text: string, _width: number): string[] {
    // 占位实现：暂不 wrap，Phase 3 再引入 word-wrap + EastAsianWidth
    return text.split('\n')
  }
}
