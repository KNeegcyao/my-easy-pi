// ============================================================
// TuiAltScreen — Alternate-screen 全屏渲染器（Phase 5）
//
// \x1b[?1049h 进 alt buffer，应用自管 viewport；
// setLayoutRoot 挂一棵 VStack（chat ScrollView + footer editor）；
// 每帧用 CSI 2026 包裹逐行定位重写整屏（行级 diff 留后续优化）；
// stop() 退出时把完整 transcript 回放到主屏 scrollback。
//
// 与 TuiMainScreen 互为降级：host 见 options.useMainScreen 选其一。
// ============================================================

import type { Component, TUI, OverlayHandle, OverlayOptions } from './component.js'
import type { Stack } from './layout/stack.js'
import { Terminal } from './terminal.js'
import { Csi2026 } from './csi2026.js'

export class TuiAltScreen implements TUI {
  private terminal: Terminal
  private frame: Csi2026
  private root: Stack | null = null
  private started = false
  /** 上一帧屏幕（height 行）——用于 stop 回放 + 跳过无变化帧 */
  private previousScreen: string[] = []

  // 节流（同 TuiMainScreen 16ms）
  private renderRequested = false
  private renderTimer: NodeJS.Timeout | null = null
  private lastRenderAt = 0
  private static readonly MIN_RENDER_INTERVAL_MS = 16

  constructor(terminal?: Terminal) {
    this.terminal = terminal ?? new Terminal()
    this.frame = new Csi2026({ supported: this.terminal.capabilities.syncOutput })
  }

  // ── TUI 接口（alt-screen 只认 setLayoutRoot；其余保留空实现满足接口）──
  private components: Component[] = []
  private dockBottom: Component[] = []
  private main: Component | null = null
  registerComponent(c: Component): void { this.components.push(c) }
  unregisterComponent(c: Component): void { this.components = this.components.filter(x => x !== c) }
  dock(position: 'top' | 'bottom', c: Component): void { if (position === 'bottom') this.dockBottom.push(c) }
  setMain(c: Component): void { this.main = c }

  /** alt-screen 专用：挂布局树根（VStack）。host 用此替代 registerComponent/dock。 */
  setLayoutRoot(root: Stack): void {
    this.root = root
  }

  showOverlay(_c: Component, _opts?: OverlayOptions): OverlayHandle {
    let closed = false
    return { get closed() { return closed }, close: () => { closed = true } }
  }
  closeOverlay(_h: OverlayHandle): void { /* Phase 6 */ }

  // ── 节流调度 ──
  requestRender(): void {
    if (!this.started) return
    if (this.renderRequested) return
    this.renderRequested = true
    process.nextTick(() => this.scheduleRender())
  }

  private scheduleRender(): void {
    if (!this.started || this.renderTimer || !this.renderRequested) return
    const elapsed = Date.now() - this.lastRenderAt
    const delay = Math.max(0, TuiAltScreen.MIN_RENDER_INTERVAL_MS - elapsed)
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null
      if (!this.started || !this.renderRequested) return
      this.renderRequested = false
      this.lastRenderAt = Date.now()
      this.doRender()
      if (this.renderRequested) this.scheduleRender()
    }, delay)
  }

  /** 立即渲染一帧（测试/stop 前用） */
  private renderNow(): void {
    if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null }
    this.renderRequested = false
    this.lastRenderAt = Date.now()
    this.doRender()
  }

  /** 测试用：强制 flush 节流队列 */
  flushPending(): void { this.renderNow() }

  // ── 核心：doRender（逐行定位重写整屏，CSI 2026 包裹）──
  private doRender(): void {
    if (!this.started || !this.root) return
    const width = this.terminal.columns
    const height = this.terminal.rows
    this.root.setViewportHeight(height)
    const lines = this.root.render(width)
    // 补齐到 height 行（VStack 已补，保险）
    while (lines.length < height) lines.push('')

    // 跳过无变化帧（节流的副产品）
    let changed = false
    for (let i = 0; i < height; i++) {
      if (lines[i] !== (this.previousScreen[i] ?? '')) { changed = true; break }
    }
    if (!changed && this.previousScreen.length === height) return

    let buf = this.frame.isSupported ? '\x1b[?2026h' : ''
    for (let row = 0; row < height; row++) {
      // 定位到 row+1 行首 + 清行 + 写内容
      buf += `\x1b[${row + 1};1H\x1b[2K${lines[row] || ''}`
    }
    if (this.frame.isSupported) buf += '\x1b[?2026l'
    this.terminal.write(buf)

    this.previousScreen = lines.slice(0, height)
  }

  // ── 生命周期 ──
  start(): void {
    if (this.started) return
    this.started = true
    this.terminal.enterAltScreen()
    this.terminal.hideCursor()
    this.terminal.clearScreen()
    this.previousScreen = []
    this.renderNow()
  }

  /**
   * stop：退出 alt 前，把完整 chat transcript 回放到主屏 scrollback。
   *   pi 用 layout frame 全量；我们简化为 rootStack.render(width) 的全部行
   *   （含ScrollView 裁切——但 host 回放用 chatContainer 全量更完整，
   *    这里用 rootStack 的可见快照，主屏 scrollback 也有完整历史由
   *    host.replayHistory 在下次 -c 时重建）。
   *
   * 实际回放策略：rootStack 这帧的 height 行直接写出（够 grep/tmux copy
   * 当前可见状态）。完整历史靠 session 持久化 + 下次 -c 回放。
   */
  stop(): void {
    if (!this.started) return
    this.started = false
    if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null }

    const width = this.terminal.columns
    // 退出 alt buffer
    this.terminal.write('\x1b[?1049l')
    // 回放最后一帧到主屏（CSI 2026 包裹，逐行 \r 清行 + 内容）
    if (this.previousScreen.length > 0) {
      let buf = this.frame.isSupported ? '\x1b[?2026h' : ''
      buf += '\x1b[1;1H'
      for (const line of this.previousScreen) {
        buf += `\r\x1b[2K${line}\n`
      }
      if (this.frame.isSupported) buf += '\x1b[?2026l'
      this.terminal.write(buf)
    }
    this.terminal.showCursor()
    this.previousScreen = []
  }

  /** resize：root.setViewportHeight + requestRender */
  onResize(): void {
    // host 调；doRender 会读 terminal.rows 重新分配
    this.previousScreen = []   // 强制下帧全量
    this.requestRender()
  }

  /** 依赖注入入口（host 传 terminal） */
  static withTerminal(terminal: Terminal): TuiAltScreen {
    return new TuiAltScreen(terminal)
  }
}