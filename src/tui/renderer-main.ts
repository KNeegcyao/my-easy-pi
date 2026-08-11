// ============================================================
// TuiMainScreen — 主屏渲染器
//
// 保留终端原生 scrollback；transcript 里"已完成"的内容永久打印；
// 只对尾部（loader + editor）做帧内 diff 更新。
//
// Phase 2：实现与现有 interface/tui/ 等价的核心渲染：
//   - 维护"渲染区"：上一次渲染到屏幕的行集合
//   - 每次 requestRender 重新计算并 diff，只重写变化行
//   - CSI 2026 包裹整帧（支持时）防闪烁
//
// Phase 4 再加：docking、Overlay、scrollback 归档。
// ============================================================

import type { Component, TUI, OverlayHandle, OverlayOptions } from './component.js'
import { Terminal } from './terminal.js'
import { ScreenBuffer } from './screen-buffer.js'
import { Csi2026 } from './csi2026.js'

export class TuiMainScreen implements TUI {
  private terminal: Terminal
  private buffer: ScreenBuffer
  private frame: Csi2026
  private components: Component[] = []
  private dockTop: Component[] = []
  private dockBottom: Component[] = []
  private main: Component | null = null
  private started = false
  /** 上一次渲染写到屏幕的行数（不含末尾换行） */
  private lastRenderedLineCount = 0
  private width: number

  constructor(terminal?: Terminal) {
    this.terminal = terminal ?? new Terminal()
    this.buffer = new ScreenBuffer()
    this.frame = new Csi2026({ supported: this.terminal.capabilities.syncOutput })
    this.width = this.terminal.columns

    // 自动跟随终端 resize（可选关闭：见 dispose）
    this.disposeResize = this.terminal.onResize(() => this.onResize())
  }

  private disposeResize: (() => void) | null = null

  /** 释放监听（测试用，或 TUI 资源回收时） */
  dispose(): void {
    this.disposeResize?.()
    this.disposeResize = null
  }

  registerComponent(c: Component): void {
    this.components.push(c)
    // 上层在合适时调 requestRender；这里不强制触发，避免高频扰屏
  }

  unregisterComponent(c: Component): void {
    this.components = this.components.filter(x => x !== c)
  }

  dock(position: 'top' | 'bottom', c: Component): void {
    ;(position === 'top' ? this.dockTop : this.dockBottom).push(c)
  }

  setMain(c: Component): void {
    this.main = c
  }

  /** 把所有注册的组件按顺序渲染成行集 */
  private renderAreaLines(): string[] {
    const out: string[] = []
    const pushComponent = (c: Component) => {
      const lines = c.render(this.width)
      for (const line of lines) out.push(line)
    }
    for (const c of this.dockTop) pushComponent(c)
    if (this.main) pushComponent(this.main)
    for (const c of this.components) pushComponent(c)
    for (const c of this.dockBottom) pushComponent(c)
    return out
  }

  /**
   * 触发一次重渲染（可以高频调用）。
   *
   * 约定：调用前光标在"渲染区之后的光标行"（例如 prompt 后的输入行）。
   * 渲染完成后光标仍在"渲染区之后的光标行"，
   * 这是与现有 interface/tui/ 的 contract 保持一致。
   */
  requestRender(): void {
    if (!this.started) return

    const lines = this.renderAreaLines()
    const updates = this.buffer.replace(lines)
    const lineCountChanged = lines.length !== this.lastRenderedLineCount

    if (updates.length === 0 && !lineCountChanged) return

    const write = (s: string) => this.terminal.write(s)

    this.frame.frame(write, () => {
      // 1. 若之前有渲染内容，回到渲染区起点
      if (this.lastRenderedLineCount > 0) {
        write(`\x1b[${this.lastRenderedLineCount}A`)
        write('\x1b[1G')
      }

      // 2. 逐行覆写（全行清 + 重写）
      for (let i = 0; i < lines.length; i++) {
        write('\x1b[2K')
        write(lines[i])
        if (i < lines.length - 1) write('\n')
      }

      // 3. 如果新内容比旧内容短，清掉下方残留
      if (lines.length < this.lastRenderedLineCount) {
        write('\n')
        write('\x1b[J')
      } else if (lines.length > 0) {
        // 保持光标在新行，为下一次渲染/用户键入让位
        write('\n')
      } else {
        // 完全空：至少留一行
        write('\n')
      }
    })

    this.lastRenderedLineCount = lines.length
  }

  showOverlay(_c: Component, _opts?: OverlayOptions): OverlayHandle {
    // TODO Phase 6
    let closed = false
    return {
      get closed() { return closed },
      close: () => { closed = true },
    }
  }

  closeOverlay(_h: OverlayHandle): void {
    // TODO Phase 6
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.terminal.hideCursor()
    // 预留一个空行作为渲染区起点
    this.terminal.write('\n')
    this.requestRender()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    // 清除渲染区
    if (this.lastRenderedLineCount > 0) {
      this.terminal.write(`\x1b[${this.lastRenderedLineCount}A`)
      this.terminal.write('\x1b[1G')
      this.terminal.write('\x1b[J')
      this.lastRenderedLineCount = 0
    }
    this.buffer.clear()
    this.terminal.showCursor()
  }

  /** 终端 resize 后调用：清 buffer、按新 width 重新渲染 */
  onResize(): void {
    this.width = this.terminal.columns
    this.buffer.clear()
    this.lastRenderedLineCount = 0
    // 不自动 requestRender：resize 可能连续触发，
    // 让上层（TUI）在下一帧统一重绘，避免抖动期间多次覆写。
    // 上层典型用法：term.onResize(() => screen.onResize()); screen.requestRender()
  }

  /** 测试用：当前渲染区行数 */
  get renderedLineCount(): number { return this.lastRenderedLineCount }
}
