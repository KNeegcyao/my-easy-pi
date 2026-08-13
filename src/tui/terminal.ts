// ============================================================
// Terminal — 终端能力探测与统一写入层
//
// 所有 stdout/stdin 交互必须经过这里；
// 业务侧 `process.stdout.write` 视为 bug（grep 应只能在 src/tui/ 内命中）。
// ============================================================

export interface TerminalCapabilities {
  isTTY: boolean
  columns: number
  rows: number
  /** CSI 2026 synchronized output（无闪烁帧更新） */
  syncOutput: boolean
  /** Kitty keyboard protocol（含键释放事件） */
  kittyKeyboard: boolean
  /** OSC 11 背景色探测 */
  osc11: boolean
  /** Kitty graphics protocol */
  kittyImages: boolean
  /** iTerm2 inline images */
  iterm2Images: boolean
  /** Bracketed paste */
  bracketedPaste: boolean
  /** 鼠标：SGR 1006 */
  mouse: boolean
}

export interface MouseEventData {
  button: number      // 64=wheel up, 65=wheel down
  col: number
  row: number
}

export class Terminal {
  private caps: TerminalCapabilities

  constructor() {
    this.caps = this.detect()
  }

  get capabilities(): TerminalCapabilities { return this.caps }
  get columns(): number { return process.stdout.columns || 80 }
  get rows(): number { return process.stdout.rows || 24 }

  /**
   * 刷新动态能力（列数/行数）。resize 后调用，不必新建 Terminal。
   */
  refresh(): void {
    this.caps.columns = this.columns
    this.caps.rows = this.rows
  }

  /**
   * 探测终端能力（启发式）。
   * 之后可通过 DA 查询 / OSC 11 探测 / 环境变量进一步精确化。
   */
  private detect(): TerminalCapabilities {
    const isTTY = !!process.stdout.isTTY
    return {
      isTTY,
      columns: this.columns,
      rows: this.rows,
      syncOutput: isTTY ? detectSyncOutput() : false,
      kittyKeyboard: false,   // Phase 5 再做（需 query CSI ? flags）
      osc11: false,           // Phase 5 再做
      kittyImages: false,     // Phase 7（仅 alt screen）
      iterm2Images: false,    // Phase 7
      bracketedPaste: isTTY,  // 几乎所有当代终端都支持
      mouse: false,           // Phase 5 再做
    }
  }

  /** 进入 raw mode；返回 dispose */
  enterRawMode(): () => void {
    if (!process.stdin.isTTY) return () => {}
    const prev = process.stdin.isRaw
    process.stdin.setRawMode(true)
    process.stdin.resume()
    return () => {
      process.stdin.setRawMode(prev ?? false)
      process.stdin.pause()
    }
  }

  /** 注册 stdin 数据监听（已剥离鼠标事件） */
  onInput(listener: (data: string) => void): () => void {
    const handler = (buf: Buffer) => {
      const str = buf.toString('utf-8')
      // 检查是否是 SGR 鼠标事件 \x1b[<...M 或 \x1b[<...m
      const mouseMatch = str.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/)
      if (mouseMatch) {
        const [, btn, col, row] = mouseMatch
        this.invokeMouseListeners({ button: parseInt(btn), col: parseInt(col), row: parseInt(row) })
        return
      }
      listener(str)
    }
    process.stdin.on('data', handler)
    return () => { process.stdin.off('data', handler) }
  }

  /** 注册鼠标事件监听（滚轮/点击） */
  onMouse(listener: (ev: MouseEventData) => void): () => void {
    this.mouseListeners.add(listener)
    return () => { this.mouseListeners.delete(listener) }
  }

  private mouseListeners = new Set<(ev: MouseEventData) => void>()
  private invokeMouseListeners(ev: MouseEventData): void {
    for (const cb of this.mouseListeners) cb(ev)
  }

  /** 启用 SGR 鼠标跟踪（按钮事件 + 滚轮） */
  enableMouse(): void {
    this.write('\x1b[?1000h')
    this.write('\x1b[?1006h')
  }

  /** 停用 SGR 鼠标跟踪 */
  disableMouse(): void {
    this.write('\x1b[?1006l')
    this.write('\x1b[?1000l')
  }

  /** 注册 resize 监听 */
  onResize(listener: (cols: number, rows: number) => void): () => void {
    const handler = () => {
      this.refresh()
      listener(this.columns, this.rows)
    }
    process.stdout.on('resize', handler)
    return () => { process.stdout.off('resize', handler) }
  }

  /** 写 stdout；实现同步，**不** 自动 flush batch */
  write(data: string): void {
    if (process.stdout.writable) process.stdout.write(data)
  }

  /** 写 stderr（TUI 错误通道，不会被渲染层捕获） */
  writeErr(data: string): void {
    if (process.stderr.writable) process.stderr.write(data)
  }

  // ── escape code 便捷方法（供 renderers/overlays 使用）──
  hideCursor(): void { this.write('\x1b[?25l') }
  showCursor(): void { this.write('\x1b[?25h') }
  enterAltScreen(): void { this.write('\x1b[?1049h') }
  exitAltScreen(): void { this.write('\x1b[?1049l') }
  moveCursor(row: number, col: number): void { this.write(`\x1b[${row};${col}H`) }
  cursorUp(n: number): void { if (n > 0) this.write(`\x1b[${n}A`) }
  clearToEnd(): void { this.write('\x1b[J') }
  clearScreen(): void { this.write('\x1b[2J\x1b[H') }
}

// ============================================================
// CSI 2026 终端启发式探测
// ============================================================

/**
 * 依据 TERM_PROGRAM / TERM 启发式判断终端是否支持 CSI 2026。
 * 已知支持: iTerm2, kitty, WezTerm, foot, Alacritty(≥0.13), VSCode(≥0.74)
 * 已知不符: Apple Terminal（不一致）、tmux（除非 passthrough）
 *
 * 用法：
 *   if (detectSyncOutput()) renderer.wrapWithSyncFrame(...)
 */
export function detectSyncOutput(): boolean {
  const term = process.env.TERM_PROGRAM || ''
  const termName = process.env.TERM || ''

  // 支持名单
  if (term === 'iTerm.app') return true
  if (term === 'kitty') return true
  if (term === 'WezTerm') return true
  if (term === 'foot') return true
  if (term === 'Alacritty') return true
  if (term === 'vscode') return true
  if (term === 'Hyper') return true

  // 不支持名单
  if (term === 'Apple_Terminal') return false
  if (process.env.TMUX) return false  // tmux 需要 allow-passthrough

  // 未识别：保守 false。宁可不加帧也不要在不支持的终端上刷屏。
  if (!term && !termName) return false
  if (termName === 'xterm-256color' || termName === 'xterm') return false

  return false
}
