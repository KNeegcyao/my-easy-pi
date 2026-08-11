import type { Component } from '../component.js'

/**
 * Container — pi `packages/tui/src/tui.ts:211-245` 的对应。
 *
 * 顺序容器：children 按 addChild 顺序 FIFO 拼接 render(width) 的行数组，
 * 不带 layout/separator/padding（这些由 Spacer/Box 等子组件自行表达）。
 *
 * 这是重构后的核心容器 —— chatContainer / statusContainer / footerContainer
 * 都是它的实例。**session 期间常驻 register 一次**，子节点内容靠
 * addChild/removeChild/clear 改变（对齐 pi 的 "children 只增不减除 rebuild" 模型）。
 */
export class Container implements Component {
  protected children: Component[] = []
  private cachedLines: string[] | null = null
  private cachedForWidth: number | null = null

  constructor(children: Component[] = []) {
    this.children = [...children]
  }

  addChild(child: Component): void {
    this.children.push(child)
    this.invalidate()
  }

  removeChild(child: Component): void {
    const idx = this.children.indexOf(child)
    if (idx >= 0) {
      this.children.splice(idx, 1)
      this.invalidate()
    }
  }

  clear(): void {
    this.children = []
    this.invalidate()
  }

  getChildren(): readonly Component[] {
    // 返回副本快照，防止外部直接修改内部 children 数组
    return this.children.slice()
  }

  /** 子节点数量（测试用） */
  get childCount(): number {
    return this.children.length
  }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
    // 递归 invalidate 子节点 —— 若 child 自身有缓存（如 Markdown）
    for (const c of this.children) {
      c.invalidate?.()
    }
  }

  /**
   * 渲染：按 FIFO 顺序拼接每个子组件 render(width) 的行。
   * 若一个子组件返回空数组，对总行数无贡献（不留空行）。
   *
   * **不缓存**：Container 不缓存聚合结果，因为子组件（如 Markdown、
   * AssistantTurn）的内容会变化，但 Container 自己无法感知（invalidate
   * 只向**下**传播到 children，不向**上**通知 parent）。pi 的渲染性能靠
   * ScreenBuffer 行级 diff 与 16ms 节流，不依赖 Container 自身缓存。
   * 子组件（Markdown/Text）各自缓存，避免每次 render 重算。
   */
  render(width: number): string[] {
    const out: string[] = []
    for (const c of this.children) {
      const lines = c.render(width)
      for (const line of lines) out.push(line)
    }
    return out
  }
}
