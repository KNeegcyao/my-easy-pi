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
  /** 上一次渲染时已知的内容总行数（用于 stickyBottom 跟随） */
  private lastTotalLines = 0
  // 注：ScrollView 不缓存聚合（同 Container/VStack 策略）—— child 内容变化
  // 无法向上通知 parent 失效缓存，缓存会挡住流式更新。offset 作为状态保留。

  constructor(opts: ScrollViewOptions = {}) {
    this.opts = {
      stickyBottom: opts.stickyBottom ?? true,
      height: opts.height ?? 0,
    }
    this.pinnedBottom = this.opts.stickyBottom  // 默认钉底
  }

  setChild(c: Component | null): void {
    this.child = c
    this.invalidate()
  }

  /** 外层布局给定可用高度；0 表示不裁切 */
  setViewportHeight(height: number): void {
    if (height !== this.opts.height) {
      // 首次设置高度时激活 pinnedBottom（默认自动跟随）；
      // resize 不重置 pinnedBottom，保留用户的滚动位置。
      if (this.opts.height === 0) {
        this.pinnedBottom = this.opts.stickyBottom
      }
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
    if (this.child?.invalidate) this.child.invalidate()
  }

  render(width: number, explicitViewport?: number): string[] {
    const viewport = explicitViewport ?? this.opts.height
    const allLines = this.child ? this.child.render(width) : []
    const total = allLines.length
    this.lastTotalLines = total

    // stickyBottom：当 pinnedBottom=true（默认）时自动钉到底。
    // 用户 scrollBy/scrollTo 手动滚动后解除 pinnedBottom；
    // 若 offset 已自然到达底部（内容增长），自动重新激活。
    if (this.opts.stickyBottom && viewport > 0) {
      if (this.pinnedBottom) {
        this.offset = Math.max(0, total - viewport)
      } else {
        const maxOffset = Math.max(0, total - viewport)
        if (this.offset >= maxOffset) {
          this.offset = maxOffset
          this.pinnedBottom = true
        }
      }
    }

    // 通用 clamp：无论 stickyBottom 是否启用，offset 超出最大有效值
    // （total-viewport）时 clamp 回来，防止 scrollTo 设了非法值导致空白视口。
    if (viewport > 0) {
      const maxOffset = Math.max(0, total - viewport)
      if (this.offset > maxOffset) this.offset = maxOffset
    }

    if (viewport <= 0) {
      return allLines.slice()
    }
    const lines = allLines.slice(this.offset, this.offset + viewport)
    while (lines.length < viewport) lines.push('')
    return lines
  }
}