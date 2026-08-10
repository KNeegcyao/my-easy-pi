import type { Component, Focusable } from '../component.js'

/**
 * Editor — 行编辑器（仅骨架；阶段 3 实现 raw mode 输入、历史、剪贴板、Shift+Enter 多行）
 *
 * 关键约定：Editor 不直接读写 stdin/stdout；
 * 它实现 handleInput(data) 接收 raw STDIN 片段，
 * 通过 onSubmit / onChange 等订阅器（由业务侧注入）通知外部。
 */
export interface EditorOptions {
  /** 提示符（渲染前缀） */
  prompt?: string
  /** 提交回调（Enter） */
  onSubmit?: (text: string) => void
  /** 取消回调（Ctrl+C / Esc，可选） */
  onCancel?: () => void
  /** 历史 */
  history?: string[]
}

export class Editor implements Component, Focusable {
  private opts: EditorOptions
  private text = ''
  private cursorPos = 0
  private focused = false
  private cachedLines: string[] | null = null

  constructor(opts: EditorOptions = {}) {
    this.opts = opts
  }

  // ── Focusable ──
  get hasFocus(): boolean { return this.focused }
  focus(): void { this.focused = true; this.invalidate() }
  blur(): void { this.focused = false; this.invalidate() }

  // ── 内容 API ──
  setText(text: string): void {
    this.text = text
    this.cursorPos = text.length
    this.invalidate()
  }
  getText(): string { return this.text }
  clear(): void { this.setText('') }

  // ── Component ──
  invalidate(): void { this.cachedLines = null }

  render(_width: number): string[] {
    if (this.cachedLines) return this.cachedLines
    // TODO Phase 3: 渲染 prompt + text + 光标 block（inverse 字符）+ 多行 wrap
    const prompt = this.opts.prompt ?? '> '
    this.cachedLines = [`${prompt}${this.text}`]
    return this.cachedLines
  }

  handleInput(_data: string): void {
    // TODO Phase 3: 解析按键（printable / Enter / Backspace / Ctrl+A,E,U,K / 方向键 / 历史）
    // 这里只接收数据，不做任何 I/O
  }
}
