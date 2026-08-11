import type { Component } from '../component.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export interface LoaderOptions {
  /** 颜色（默认 dim）；传入 'yellow'/'green' 等 ansi key 或自定义函数 */
  color?: (s: string) => string
  /** 初始文本；'working' 或 'deepseek 正在编写…' 等 */
  text?: string
}

/** 旋转指示器（业务侧通过 tick() + requestRender 定时驱动） */
export class Loader implements Component {
  private frame = 0
  private text: string
  private colorize: (s: string) => string
  private cachedLines: string[] | null = null

  constructor(textOrOptions: string | LoaderOptions = 'working') {
    if (typeof textOrOptions === 'string') {
      this.text = textOrOptions
      this.colorize = s => s
    } else {
      this.text = textOrOptions.text ?? 'working'
      this.colorize = textOrOptions.color ?? (s => s)
    }
  }

  /** 推进一帧；外部 requestRender 驱动 */
  tick(): void {
    this.frame = (this.frame + 1) % SPINNER_FRAMES.length
    this.invalidate()
  }

  setText(text: string): void {
    if (text !== this.text) {
      this.text = text
      this.invalidate()
    }
  }

  /** 当前是第几帧（测试用） */
  get currentFrame(): number { return this.frame }

  invalidate(): void { this.cachedLines = null }

  render(_width: number): string[] {
    if (this.cachedLines) return this.cachedLines
    const spinner = this.colorize(SPINNER_FRAMES[this.frame])
    this.cachedLines = this.text ? [`${spinner} ${this.text}`] : [spinner]
    return this.cachedLines
  }
}
