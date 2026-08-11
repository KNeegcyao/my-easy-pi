import type { Component } from '../component.js'

export interface ScrollViewOptions {
  /** 是否贴底（新内容到来时自动滚动到底部）；默认 true */
  stickyBottom?: boolean
  /** 显式视口高度；0 = 跟随外部约束（默认 0） */
  height?: number
}

/**
 * ScrollView — 垂直滚动容器。
 *
 * 维护 offset（顶部行号）+ viewport 高度。render() 时：
 *   1. 取 child.render(width) 的全部行
 *   2. 按 [offset, offset + viewport) 裁切
 *   3. stickyBottom=true 且 offset 在底部时，新内容到来自动跟随到底
 */
export class ScrollView implements Component {
  private child: Component | null = null
  private opts: Required<ScrollViewOptions>
  /** 顶部行号（0-based） */
  private offset = 0
  /** 是否钉在底部（跟随新内容）；undefined=未设定 */
  private pinnedBottom: boolean | undefined = undefined
  private cachedForWidth: number | null = null
  private cachedLines: string[] | null = null
  private cachedViewport: number | null = null
  /** 上一次渲染时已知的内容总行数（用于 stickyBottom 跟随） */
  private lastTotalLines = 0

  constructor(opts: ScrollViewOptions = {}) {
    this.opts = {
      stickyBottom: opts.stickyBottom ?? true,
      height: opts.height ?? 0,
    }
  }

  setChild(c: Component | null): void {
    this.child = c
    this.invalidate()
  }

  /** 外层布局给定可用高度；0 表示不裁切 */
  setViewportHeight(height: number): void {
    if (height !== this.opts.height) {
      this.opts.height = height
      this.invalidate()
    }
  }

  setStickyBottom(v: boolean): void {
    this.opts.stickyBottom = v
    this.pinnedBottom = v  // 立即钉到底，下次 render 跟随
    this.invalidate()
  }

  scrollBy(delta: number): void {
    this.pinnedBottom = false  // 用户主动滚动 → 解除钉底
    this.offset = Math.max(0, this.offset + delta)
    this.invalidate()
  }

  scrollTo(offset: number): void {
    this.pinnedBottom = false
    this.offset = Math.max(0, offset)
    this.invalidate()
  }

  /** 钉到底部；之后内容增长自动跟随 */
  scrollToEnd(): void {
    this.pinnedBottom = true
    this.invalidate()
  }

  getOffset(): number { return this.offset }
  get isPinnedBottom(): boolean { return this.pinnedBottom === true }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
    this.cachedViewport = null
    if (this.child?.invalidate) this.child.invalidate()
  }

  render(width: number, explicitViewport?: number): string[] {
    const viewport = explicitViewport ?? this.opts.height
    if (
      this.cachedLines &&
      this.cachedForWidth === width &&
      this.cachedViewport === viewport
    ) {
      return this.cachedLines
    }

    const allLines = this.child ? this.child.render(width) : []
    const total = allLines.length
    this.lastTotalLines = total

    // stickyBottom + pinnedBottom：跟随到最底
    if (this.opts.stickyBottom && this.pinnedBottom && viewport > 0) {
      this.offset = Math.max(0, total - viewport)
    } else if (this.opts.stickyBottom && this.pinnedBottom === undefined) {
      // 首次未显式设定：默认 pinned（与 stickyBottom 一致）
      this.pinnedBottom = true
      this.offset = Math.max(0, total - viewport)
    }

    // clamp offset 到合法范围
    const maxOffset = Math.max(0, total - Math.max(0, viewport))
    if (this.offset > maxOffset) this.offset = maxOffset

    if (viewport <= 0) {
      this.cachedLines = allLines.slice()
    } else {
      this.cachedLines = allLines.slice(this.offset, this.offset + viewport)
      while (this.cachedLines.length < viewport) {
        this.cachedLines.push('')
      }
    }

    this.cachedForWidth = width
    this.cachedViewport = viewport
    return this.cachedLines
  }
}