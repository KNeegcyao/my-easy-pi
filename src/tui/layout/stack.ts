import type { Component } from '../component.js'

/** 布局方向 */
export type StackDirection = 'vertical' | 'horizontal'

/** 布局权重：未指定时均分剩余空间 */
export interface StackChild {
  component: Component
  /** flex-grow 风格的整数权重；0 = 按内容 */
  grow?: number
  /** 最小高度/宽度（行/列） */
  min?: number
  /** 最大高度/宽度 */
  max?: number
}

/**
 * Stack — VStack/HStack 的公共骨架。
 * 阶段 5 实现：把容器内剩余空间按 grow 权重分配，裁剪 child.render() 的结果。
 */
export class Stack implements Component {
  protected children: StackChild[] = []
  protected direction: StackDirection
  private cachedForWidth: number | null = null
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

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
  }

  getChildren(): readonly StackChild[] { return this.children }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) return this.cachedLines
    // TODO Phase 5
    this.cachedLines = []
    this.cachedForWidth = width
    return this.cachedLines
  }
}

export class VStack extends Stack {
  constructor(children: StackChild[] = []) { super('vertical', children) }
}

export class HStack extends Stack {
  constructor(children: StackChild[] = []) { super('horizontal', children) }
}
