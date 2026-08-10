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

export class Terminal {
  private caps: TerminalCapabilities

  constructor() {
    this.caps = this.detect()
  }

  get capabilities(): TerminalCapabilities { return this.caps }
  get columns(): number { return process.stdout.columns || 80 }
  get rows(): number { return process.stdout.rows || 24 }

  /** 探测终端能力（实现放阶段 2，骨架仅返回保守默认） */
  private detect(): TerminalCapabilities {
    // TODO Phase 2: 通过环境变量、DA 查询、OSC 11 探测等补全
    const isTTY = !!process.stdout.isTTY
    return {
      isTTY,
      columns: this.columns,
      rows: this.rows,
      syncOutput: false,
      kittyKeyboard: false,
      osc11: false,
      kittyImages: false,
      iterm2Images: false,
      bracketedPaste: false,
      mouse: false,
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

  /** 注册 stdin 数据监听 */
  onInput(listener: (data: string) => void): () => void {
    const handler = (buf: Buffer) => listener(buf.toString('utf-8'))
    process.stdin.on('data', handler)
    return () => { process.stdin.off('data', handler) }
  }

  /** 注册 resize 监听 */
  onResize(listener: (cols: number, rows: number) => void): () => void {
    const handler = () => listener(this.columns, this.rows)
    process.stdout.on('resize', handler)
    return () => { process.stdout.off('resize', handler) }
  }

  /** 写 stdout；实现同步，**不** 自动 flush batch */
  write(data: string): void {
    process.stdout.write(data)
  }

  /** 写 stderr（TUI 错误通道，不会被渲染层捕获） */
  writeErr(data: string): void {
    process.stderr.write(data)
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
