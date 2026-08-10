import type { Component } from '../component.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** 旋转指示器（业务侧负责通过 requestRender 定时驱动 tick） */
export class Loader implements Component {
  private frame = 0
  private text: string
  private cachedLines: string[] | null = null

  constructor(text: string = 'working') {
    this.text = text
  }

  tick(): void {
    this.frame = (this.frame + 1) % SPINNER_FRAMES.length
    this.invalidate()
  }

  setText(text: string): void {
    this.text = text
    this.invalidate()
  }

  invalidate(): void { this.cachedLines = null }

  render(_width: number): string[] {
    if (this.cachedLines) return this.cachedLines
    this.cachedLines = [`${SPINNER_FRAMES[this.frame]} ${this.text}`]
    return this.cachedLines
  }
}
