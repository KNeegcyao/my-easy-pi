import type { Component } from '../component.js'

/**
 * Spacer — pi 的空行隔断组件。
 *
 * render(width) 返回 N 个空行，用于 Container 内不同子块之间的视觉留白。
 * 例如：
 *   chatContainer.addChild(new Spacer(1))   // turn 之间的空行
 *   chatContainer.addChild(assistantTurn)
 */
export class Spacer implements Component {
  constructor(private readonly height: number = 1) {}

  invalidate(): void {
    // 无状态，无需 invalidate
  }

  render(_width: number): string[] {
    return Array.from({ length: Math.max(0, this.height) }, () => '')
  }
}
