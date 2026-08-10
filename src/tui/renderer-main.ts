// ============================================================
// TuiMainScreen — 主屏渲染器
//
// 保留终端原生 scrollback；transcript 里"已完成"的内容永久打印；
// 只对尾部（loader + editor）做帧内 diff 更新。
//
// 阶段 4 实现：与现有 interface/tui/ 等价的体验。
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

  constructor(terminal?: Terminal) {
    this.terminal = terminal ?? new Terminal()
    this.buffer = new ScreenBuffer()
    this.frame = new Csi2026({ supported: this.terminal.capabilities.syncOutput })
  }

  registerComponent(c: Component): void {
    this.components.push(c)
    this.requestRender()
  }

  unregisterComponent(c: Component): void {
    this.components = this.components.filter(x => x !== c)
    this.requestRender()
  }

  dock(position: 'top' | 'bottom', c: Component): void {
    ;(position === 'top' ? this.dockTop : this.dockBottom).push(c)
    this.requestRender()
  }

  setMain(c: Component): void {
    this.main = c
    this.requestRender()
  }

  requestRender(): void {
    // TODO Phase 4: 收集所有组件 render(width) → ScreenBuffer.replace → csi2026.frame(write)
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
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.terminal.showCursor()
  }
}
