import type { Component } from '../component.js'

/**
 * FixedHeightBox — 可折叠的补全展示槽。
 *
 * 用途：slash/@ 补全、/tree 导航的展示槽。
 * - 无内容时 `render` 返回 0 行 → 不占用布局高度（平时不空占空间）。
 * - 有内容时按实际内容行数撑开，超出则截断至上限 `maxHeight`。
 *
 * 这样补全/树出现时输入框被上推一小段（符合直觉），关闭即恢复 0 行空白。
 *
 * 使用方式：
 *   const slot = new FixedHeightBox(8)   // 8 = 最大高度
 *   slot.setContent(selectorOrNull)       // 有补全时塞选择器；无补全传 null
 */
export class FixedHeightBox implements Component {
  private child: Component | null = null
  private maxHeight: number

  constructor(maxHeight: number) {
    this.maxHeight = maxHeight
  }

  setContent(c: Component | null): void {
    this.child = c
    this.invalidate()
  }

  get hasContent(): boolean {
    return this.child !== null
  }

  /** 最大高度（上限） */
  get fixedHeight(): number {
    return this.maxHeight
  }

  setMaxHeight(h: number): void {
    if (h !== this.maxHeight) {
      this.maxHeight = h
      this.invalidate()
    }
  }

  /** 兼容旧名（setMaxHeight 的别名） */
  setHeight(h: number): void { this.setMaxHeight(h) }

  invalidate(): void {
    this.child?.invalidate?.()
  }

  render(width: number): string[] {
    // 无内容：折叠为 0 行，不占布局高度
    if (!this.child) return []
    const content = this.child.render(width)
    // 有内容：按实际行数撑开，超出上限截断
    if (content.length <= this.maxHeight) return content.slice()
    return content.slice(0, this.maxHeight)
  }
}