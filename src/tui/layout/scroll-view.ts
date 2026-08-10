import type { Component } from '../component.js'

export interface ScrollViewOptions {
  /** 是否贴底（新内容到来时自动滚动到底部） */
  stickyBottom?: boolean
  /** 初始视口高度（行）；0 = 由外部约束 */
  height?: number
}

/**
 * ScrollView — 单方向滚动容器（仅垂直）。
 * 阶段 5 实现：维护 offset + viewport 高度，渲染时裁切 child.render() 的结果。
 */
export class ScrollView implements Component {
  private child: Component | null = null
  private opts: ScrollViewOptions
  private offset = 0            // 0 = 顶部
  private viewportHeight = 0    // 由渲染器或父布局告知
  private cachedForWidth: number | null = null
  private cachedLines: string[] | null = null

  constructor(opts: ScrollViewOptions = {}) {
    this.opts = opts
  }

  setChild(c: Component | null): void {
    this.child = c
    this.invalidate()
  }

  setViewportHeight(height: number): void {
    this.viewportHeight = height
    this.invalidate()
  }

  scrollBy(delta: number): void {
    this.offset = Math.max(0, this.offset + delta)
    this.invalidate()
  }

  scrollTo(offset: number): void {
    this.offset = Math.max(0, offset)
    this.invalidate()
  }

  scrollToEnd(): void {
    // TODO Phase 5: 计算 child 的总行数后设置 offset
    this.invalidate()
  }

  getOffset(): number { return this.offset }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) return this.cachedLines
    // TODO Phase 5: 从 child.render(width) 的总行集合中视口裁切
    const childLines = this.child ? this.child.render(width) : []
    this.cachedLines = childLines
    this.cachedForWidth = width
    return this.cachedLines
  }
}
