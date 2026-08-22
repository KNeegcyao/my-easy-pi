import type { Component } from '../component.js'

/**
 * FixedHeightBox — 固定高度槽组件。
 *
 * 用途：slash/@ 补全列表的展示槽。无论内容多少，render 始终返回固定行数，
 * 不足补空行、超出截断，从而保证所在布局（bottomDock）总高度恒定，
 * 输入框不会因补全出现而上下移动（叠层显示、不改布局高度）。
 *
 * 使用方式：
 *   const slot = new FixedHeightBox(6)
 *   slot.setContent(selectorOrNull)   // 有补全时塞选择器；无补全传 null
 */
export class FixedHeightBox implements Component {
  private child: Component | null = null
  private height: number

  constructor(height: number) {
    this.height = height
  }

  setContent(c: Component | null): void {
    this.child = c
    this.invalidate()
  }

  get hasContent(): boolean {
    return this.child !== null
  }

  get fixedHeight(): number {
    return this.height
  }

  setHeight(h: number): void {
    if (h !== this.height) {
      this.height = h
      this.invalidate()
    }
  }

  invalidate(): void {
    this.child?.invalidate?.()
  }

  render(width: number): string[] {
    const content = this.child ? this.child.render(width) : []
    const lines = content.slice(0, this.height)
    while (lines.length < this.height) lines.push('')
    return lines
  }
}
