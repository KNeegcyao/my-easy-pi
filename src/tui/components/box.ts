import type { Component } from '../component.js'

/** 简单边框容器 */
export class Box implements Component {
  private child: Component | null = null
  private cachedForWidth: number | null = null
  private cachedLines: string[] | null = null

  setChild(c: Component | null): void {
    this.child = c
    this.invalidate()
  }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
    // 不递归 invalidate 子组件——child 自己负责
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) {
      return this.cachedLines
    }
    // TODO Phase 3: 绘制 border、padding，child 渲染内容 width-2
    const childLines = this.child ? this.child.render(width - 2) : []
    const top = '┌' + '─'.repeat(Math.max(0, width - 2)) + '┐'
    const bottom = '└' + '─'.repeat(Math.max(0, width - 2)) + '┘'
    const middle = childLines.map(line => `│ ${line.slice(0, Math.max(0, width - 4))} │`)
    this.cachedLines = [top, ...middle, bottom]
    this.cachedForWidth = width
    return this.cachedLines
  }
}
