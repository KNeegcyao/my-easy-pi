// ============================================================
// TuiAltScreen — Alternate-screen 渲染器
//
// \x1b[?1049h 进入 alt buffer，应用自管 viewport；
// 提供完整 constrained layout（VStack/HStack/ScrollView）；
// 退出时把 transcript 回放到主屏幕，供 grep / tmux copy mode 使用。
//
// 阶段 5 实现：Claude Code 式全屏体验。
// ============================================================

import type { Component, TUI, OverlayHandle, OverlayOptions } from './component.js'
import { Terminal } from './terminal.js'
import { ScreenBuffer } from './screen-buffer.js'
import { Csi2026 } from './csi2026.js'

export class TuiAltScreen implements TUI {
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
    // TODO Phase 5: 布局引擎求值 → 各组件 render(width) → ScreenBuffer.replace → csi2026.frame(write)
    if (!this.started) return
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
    this.terminal.enterAltScreen()
    this.terminal.hideCursor()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.terminal.showCursor()
    this.terminal.exitAltScreen()
    // TODO Phase 5: 退出前把最终 transcript 回放到主屏
  }
}
