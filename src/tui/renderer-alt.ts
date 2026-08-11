// ============================================================
// TuiAltScreen — Alternate-screen 渲染器（Phase 7 完整实现）
//
// \x1b[?1049h 进入 alt buffer，应用自管 viewport；
// 提供完整 constrained layout（VStack/HStack/ScrollView）；
// 退出时把 transcript 回放到主屏幕，供 grep / tmux copy mode 使用。
//
// 当前阶段占位：实现 TUI 接口但 requestRender 不做任何渲染，
// 避免调用方误以为已可用。
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

  /** Phase 7 实现；当前阶段空转 */
  requestRender(): void {
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
    this.terminal.clearScreen()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.terminal.showCursor()
    this.terminal.exitAltScreen()
    // TODO Phase 7: 退出前把最终 transcript 回放到主屏
  }
}
