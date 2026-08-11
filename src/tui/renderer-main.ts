// ============================================================
// TuiMainScreen — 主屏渲染器（Phase 4.5 对齐 pi）
//
// 渲染策略移植自 pi/packages/tui/src/tui-main-screen.ts：
//   1. 16ms 节流（MIN_RENDER_INTERVAL_MS）：高频 requestRender 合并成一帧
//   2. diff 限范围：只重写 firstChanged..lastChanged 之间变化的行
//   3. 纯追加识别（appendStart）：末尾新增且旧行全未变 → 不上移，直接 \r\n 追加
//      —— 这是"打字机效果"的来源
//   4. 视口贴底推滚：追加超出视口底部时用 \r\n repeat 把旧行推进 scrollback
//   5. width/height 变化 / 首次 → fullRender 兜底
//   6. CSI 2026 包裹每帧防闪烁
//
// 流式 markdown 进渲染区（differential），完成后自然留在 scrollback；
// message_end 不再额外 commitTranscript（避免重复）。
// ============================================================

import type { Component, TUI, OverlayHandle, OverlayOptions } from './component.js'
import { Terminal } from './terminal.js'
import { ScreenBuffer } from './screen-buffer.js'
import { Csi2026 } from './csi2026.js'

export class TuiMainScreen implements TUI {
  private terminal: Terminal
  private buffer: ScreenBuffer   // 保留供测试/外部 inspect；doRender 用 previousLines
  private frame: Csi2026
  private components: Component[] = []
  private dockTop: Component[] = []
  private dockBottom: Component[] = []
  private main: Component | null = null
  private started = false
  private width: number

  // ── pi 对齐的渲染状态 ──
  private previousLines: string[] = []
  private previousViewportTop = 0
  private previousHeight = 0
  private previousWidth = 0
  private hardwareCursorRow = 0

  // ── 节流 ──
  private static readonly MIN_RENDER_INTERVAL_MS = 16
  private renderRequested = false
  private renderTimer: NodeJS.Timeout | null = null
  private lastRenderAt = 0

  constructor(terminal?: Terminal) {
    this.terminal = terminal ?? new Terminal()
    this.buffer = new ScreenBuffer()
    this.frame = new Csi2026({ supported: this.terminal.capabilities.syncOutput })
    this.width = this.terminal.columns
    this.disposeResize = this.terminal.onResize(() => this.onResize())
  }

  private disposeResize: (() => void) | null = null

  dispose(): void {
    this.disposeResize?.()
    this.disposeResize = null
    if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null }
  }

  registerComponent(c: Component): void { this.components.push(c) }
  unregisterComponent(c: Component): void {
    this.components = this.components.filter(x => x !== c)
  }
  dock(position: 'top' | 'bottom', c: Component): void {
    ;(position === 'top' ? this.dockTop : this.dockBottom).push(c)
  }
  setMain(c: Component): void { this.main = c }

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

  // ── 节流调度（对齐 pi requestRender/scheduleRender）──

  /** 触发一次重渲染（可高频调用；内部 16ms 节流合并）。 */
  requestRender(): void {
    if (!this.started) return
    if (this.renderRequested) return
    this.renderRequested = true
    process.nextTick(() => this.scheduleRender())
  }

  /** 立即渲染一帧（跳过节流；用于 commitTranscript 后、stop 前）。 */
  private renderNow(): void {
    if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null }
    this.renderRequested = false
    this.lastRenderAt = this.timeNow()
    this.doRender()
  }

  private scheduleRender(): void {
    if (!this.started || this.renderTimer || !this.renderRequested) return
    const elapsed = this.timeNow() - this.lastRenderAt
    const delay = Math.max(0, TuiMainScreen.MIN_RENDER_INTERVAL_MS - elapsed)
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null
      if (!this.started || !this.renderRequested) return
      this.renderRequested = false
      this.lastRenderAt = this.timeNow()
      this.doRender()
      if (this.renderRequested) this.scheduleRender()
    }, delay)
  }

  /** 可替换的 now（ms）；Date.now 在 workflow 不可用但这里是运行时，正常用。 */
  private timeNow(): number { return Date.now() }

  // ── 核心：doRender（移植 pi tui-main-screen.ts:180-490）──

  private doRender(): void {
    if (!this.started) return
    const width = this.terminal.columns
    const height = this.terminal.rows
    const widthChanged = this.previousWidth !== 0 && this.previousWidth !== width
    const heightChanged = this.previousHeight !== 0 && this.previousHeight !== height

    const newLines = this.renderAreaLines()

    const write = (s: string) => this.terminal.write(s)

    const fullRender = (clear: boolean) => {
      let buf = ''
      if (this.frame.isSupported) buf += '\x1b[?2026h'
      if (clear) buf += '\x1b[2J\x1b[H'
      for (let i = 0; i < newLines.length; i++) {
        if (i > 0) buf += '\r\n'
        buf += newLines[i]
      }
      if (this.frame.isSupported) buf += '\x1b[?2026l'
      write(buf)
      this.hardwareCursorRow = Math.max(0, newLines.length - 1)
      const bufferLength = Math.max(height, newLines.length)
      this.previousViewportTop = Math.max(0, bufferLength - height)
      this.previousLines = newLines
      this.previousWidth = width
      this.previousHeight = height
    }

    // 首次渲染
    if (this.previousLines.length === 0 && !widthChanged && !heightChanged) {
      fullRender(false)
      return
    }
    // 尺寸变化 → 全量重画
    if (widthChanged || heightChanged) {
      fullRender(true)
      return
    }

    // 算 firstChanged..lastChanged
    let firstChanged = -1
    let lastChanged = -1
    const maxLines = Math.max(newLines.length, this.previousLines.length)
    for (let i = 0; i < maxLines; i++) {
      const oldLine = i < this.previousLines.length ? this.previousLines[i] : ''
      const newLine = i < newLines.length ? newLines[i] : ''
      if (oldLine !== newLine) {
        if (firstChanged === -1) firstChanged = i
        lastChanged = i
      }
    }
    const appendedLines = newLines.length > this.previousLines.length
    if (appendedLines) {
      if (firstChanged === -1) firstChanged = this.previousLines.length
      lastChanged = newLines.length - 1
    }
    // 纯追加：旧行数 > 0 且变化正好从旧行末尾开始
    const appendStart =
      appendedLines &&
      firstChanged === this.previousLines.length &&
      this.previousLines.length > 0

    // 无变化
    if (firstChanged === -1) {
      this.previousLines = newLines
      this.previousWidth = width
      this.previousHeight = height
      return
    }

    // 变化都在被删除的行里（新内容更短，且变化起始已超出新内容范围）
    if (firstChanged >= newLines.length) {
      // 内容缩短：清多余行
      const extraLines = this.previousLines.length - newLines.length
      if (extraLines > 0) {
        let buf = this.frame.isSupported ? '\x1b[?2026h' : ''
        // 移到新内容末尾
        const targetRow = Math.max(0, newLines.length - 1)
        const lineDiff = targetRow - this.hardwareCursorRow + this.previousViewportTop
        if (lineDiff > 0) buf += `\x1b[${lineDiff}B`
        else if (lineDiff < 0) buf += `\x1b[${-lineDiff}A`
        buf += '\r'
        for (let i = 0; i < extraLines; i++) {
          buf += '\x1b[2K'
          if (i < extraLines - 1) buf += '\x1b[1B'
        }
        const moveBack = Math.max(0, extraLines - 1)
        if (moveBack > 0) buf += `\x1b[${moveBack}A`
        if (this.frame.isSupported) buf += '\x1b[?2026l'
        write(buf)
        this.hardwareCursorRow = targetRow
      }
      this.previousLines = newLines
      this.previousWidth = width
      this.previousHeight = height
      return
    }

    // ── diff 限范围渲染 ──
    let viewportTop = this.previousViewportTop
    const prevViewportBottom = this.previousViewportTop + height - 1

    let buf = this.frame.isSupported ? '\x1b[?2026h' : ''

    // 视口推滚：纯追加且新行超出视口底部 → 用 \r\n 把视口下推
    const moveTargetRow = appendStart ? firstChanged - 1 : firstChanged
    if (moveTargetRow > prevViewportBottom) {
      const scroll = moveTargetRow - prevViewportBottom
      buf += '\r\n'.repeat(scroll)
      this.previousViewportTop += scroll
      viewportTop += scroll
      this.hardwareCursorRow = moveTargetRow
    }

    // 移光标到 moveTargetRow
    const currentScreenRow = this.hardwareCursorRow - this.previousViewportTop
    const targetScreenRow = moveTargetRow - viewportTop
    const lineDiff = targetScreenRow - currentScreenRow
    if (lineDiff > 0) buf += `\x1b[${lineDiff}B`
    else if (lineDiff < 0) buf += `\x1b[${-lineDiff}A`

    // 纯追加：\r\n 进新行；行内变更：\r 回列首
    buf += appendStart ? '\r\n' : '\r'

    // 只写 firstChanged..lastChanged
    const renderEnd = Math.min(lastChanged, newLines.length - 1)
    for (let i = firstChanged; i <= renderEnd; i++) {
      if (i > firstChanged) buf += '\r\n'
      buf += '\x1b[2K'
      buf += newLines[i]
    }

    let finalCursorRow = renderEnd

    // 内容缩短：清多余行
    if (this.previousLines.length > newLines.length) {
      if (renderEnd < newLines.length - 1) {
        const moveDown = newLines.length - 1 - renderEnd
        buf += `\x1b[${moveDown}B`
        finalCursorRow = newLines.length - 1
      }
      const extra = this.previousLines.length - newLines.length
      for (let i = 0; i < extra; i++) {
        buf += '\r\n\x1b[2K'
      }
      const moveBack = extra
      if (moveBack > 0) buf += `\x1b[${moveBack}A`
    }

    if (this.frame.isSupported) buf += '\x1b[?2026l'
    write(buf)

    this.hardwareCursorRow = finalCursorRow
    this.previousLines = newLines
    this.previousViewportTop = viewportTop
    this.previousWidth = width
    this.previousHeight = height
  }

  showOverlay(_c: Component, _opts?: OverlayOptions): OverlayHandle {
    let closed = false
    return { get closed() { return closed }, close: () => { closed = true } }
  }
  closeOverlay(_h: OverlayHandle): void {}

  start(): void {
    if (this.started) return
    this.started = true
    this.terminal.hideCursor()
    this.terminal.write('\n')   // 预留渲染区起点
    this.renderNow()             // 首帧立即画（不经节流）
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null }
    this.renderRequested = false
    // 清渲染区残留
    if (this.previousLines.length > 0) {
      const lineDiff = this.hardwareCursorRow - this.previousViewportTop
      let buf = ''
      if (lineDiff > 0) buf += `\x1b[${lineDiff}A`
      buf += '\r\x1b[J'
      this.terminal.write(buf)
      this.previousLines = []
      this.previousViewportTop = 0
      this.hardwareCursorRow = 0
    }
    this.buffer.clear()
    this.terminal.showCursor()
  }

  onResize(): void {
    this.width = this.terminal.columns
    this.buffer.clear()
    // 不清 previousLines：让 doRender 的 widthChanged 分支触发 fullRender
    if (this.started) this.requestRender()
  }

  // commitTranscript 已移除（Phase 4.7）—— pi 没有"transcript 区 vs 渲染区"二分，
  // 所有历史（用户消息、工具、错误、命令输出）一律走 chatContainer.addChild，
  // 由 doRender 统一 diff 渲染。外部如需追加内容，请通过 Chat 等常驻 Container 操作。

  /** 测试用 */
  get renderedLineCount(): number { return this.previousLines.length }
  /** 测试用：是否有待渲染（节流队列） */
  get hasPendingRender(): boolean { return this.renderRequested }
  /** 测试用：强制刷新节流队列 */
  flushPending(): void {
    if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null }
    if (this.renderRequested) {
      this.renderRequested = false
      this.lastRenderAt = this.timeNow()
      this.doRender()
    }
  }
}