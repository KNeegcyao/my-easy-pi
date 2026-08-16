import type { Component } from '../component.js'

/** 布局方向 */
export type StackDirection = 'vertical' | 'horizontal'

/** 布局使用权：未指定 grow 时按内容高度（VStack）/宽度（HStack） */
export interface StackChild {
  component: Component
  /** flex-grow 风格的整数权重；0/undefined = 按内容自然尺寸 */
  grow?: number
  /** 最小高度/宽度（行/列） */
  min?: number
  /** 最大高度/宽度 */
  max?: number
}

/** 子组件可接受的视口高度（duck-type；ScrollView 实现） */
interface ViewportAware {
  setViewportHeight?(h: number): void
}

/**
 * Stack — VStack/HStack 的公共骨架。
 *
 * Phase 5 实现：把容器内剩余空间按 grow 权重分配给 grow 子，
 * 固定子（grow=0/undefined）按自然高度。min/max clamp。
 * VStack 的子若是 ScrollView（有 setViewportHeight），分配前先传 height。
 */
export class Stack implements Component {
  protected children: StackChild[] = []
  protected direction: StackDirection
  /** 由 renderer 在每帧前设置（alt-screen 模式）；HStack 用 width 维度 */
  private viewportHeight: number | null = null
  private cachedForWidth: number | null = null
  private cachedForViewport: number | null = null
  private cachedLines: string[] | null = null

  constructor(direction: StackDirection = 'vertical', children: StackChild[] = []) {
    this.direction = direction
    this.children = children
  }

  add(child: StackChild): void {
    this.children.push(child)
    this.invalidate()
  }

  remove(c: Component): void {
    this.children = this.children.filter(ch => ch.component !== c)
    this.invalidate()
  }

  clear(): void {
    this.children = []
    this.invalidate()
  }

  /** renderer 在每帧前调（VStack 用高度做 flex） */
  setViewportHeight(h: number): void {
    if (h !== this.viewportHeight) {
      this.viewportHeight = h
      this.invalidate()
    }
  }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
    this.cachedForViewport = null
    for (const c of this.children) c.component.invalidate?.()
  }

  getChildren(): readonly StackChild[] { return this.children }

  render(width: number): string[] {
    const vh = this.viewportHeight ?? 0
    // HStack 本期不实现（my-easy-pi TUI 只用 VStack）；直接拼自然行
    if (this.direction === 'horizontal') {
      return this.renderHorizontal(width)
    }
    // VStack 不缓存自身聚合（同 Container/AssistantTurn：子组件内容变化
    // 无法向上通知 parent 失效缓存）。子组件 Markdown/Text/ScrollView 各自缓存。
    return this.renderVertical(width, vh)
  }

  // ── VStack flex 分配 ──
  private renderVertical(width: number, viewport: number): string[] {
    if (this.children.length === 0) return viewport > 0 ? Array(viewport).fill('') : []

    // Phase 1: 测量固定子（grow<=0）的自然高度；grow 子暂记 0
    const naturalHeights: number[] = []
    let fixedSum = 0
    let growSum = 0
    for (let i = 0; i < this.children.length; i++) {
      const ch = this.children[i]
      if ((ch.grow ?? 0) > 0) {
        naturalHeights[i] = 0
        growSum += ch.grow!
      } else {
        const lines = ch.component.render(width)
        naturalHeights[i] = lines.length
        fixedSum += lines.length
      }
    }

    // Phase 2: 分配
    const allocated: number[] = []
    if (viewport <= 0) {
      // 无 viewport 约束：每个子取自然高度，grow 子也得 0（caller 应在 alt-screen 设 viewport）
      for (let i = 0; i < this.children.length; i++) {
        allocated[i] = clampNatural(naturalHeights[i], this.children[i])
      }
    } else {
      const leftover = Math.max(0, viewport - fixedSum)
      for (let i = 0; i < this.children.length; i++) {
        const ch = this.children[i]
        if ((ch.grow ?? 0) > 0) {
          const share = growSum > 0 ? Math.floor(leftover * (ch.grow! / growSum)) : 0
          allocated[i] = clampMin(Math.max(0, share), ch)
        } else {
          allocated[i] = clampNatural(naturalHeights[i], ch)
        }
      }
      // 补尾差：floor 可能丢 1-2 行，加到最后一个 grow 子
      const used = allocated.reduce((a, b) => a + b, 0)
      if (used < viewport) {
        for (let i = this.children.length - 1; i >= 0; i--) {
          if ((this.children[i].grow ?? 0) > 0) {
            allocated[i] += viewport - used
            break
          }
        }
      }
    }

    // Phase 3: 渲染 + 裁切/补齐到 allocated
    const out: string[] = []
    for (let i = 0; i < this.children.length; i++) {
      const ch = this.children[i]
      const h = allocated[i]
      // 若子接受 viewport（ScrollView），传分配高度
      const va = ch.component as unknown as ViewportAware
      va.setViewportHeight?.(h)
      const lines = ch.component.render(width)
      for (let j = 0; j < h; j++) {
        out.push(j < lines.length ? lines[j] : '')
      }
    }

    // 若有 viewport 但总行不足，补空行到底（alt-screen 满屏）
    if (viewport > 0) {
      while (out.length < viewport) out.push('')
    }
    return out
  }

  /** HStack 简化：单行，各子 render(width) 取首行拼接（本期 my-easy-pi 不用，占位） */
  private renderHorizontal(_width: number): string[] {
    const out: string[] = []
    for (const ch of this.children) {
      const lines = ch.component.render(_width)
      out.push(...lines)
    }
    return out
  }
}

function clampNatural(natural: number, ch: StackChild): number {
  let h = natural
  if (ch.min !== undefined) h = Math.max(h, ch.min)
  if (ch.max !== undefined) h = Math.min(h, ch.max)
  return h
}
function clampMin(h: number, ch: StackChild): number {
  if (ch.min !== undefined) h = Math.max(h, ch.min)
  if (ch.max !== undefined) h = Math.min(h, ch.max)
  return h
}

export class VStack extends Stack {
  constructor(children: StackChild[] = []) { super('vertical', children) }
}

export class HStack extends Stack {
  constructor(children: StackChild[] = []) { super('horizontal', children) }
}