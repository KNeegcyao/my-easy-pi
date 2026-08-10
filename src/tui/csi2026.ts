// ============================================================
// CSI 2026 — Synchronized Output（同步输出帧）
//
// 通过 \x1b[?2026h 开始一个原子帧，中间的所有 escape 都不立即生效；
// 用 \x1b[?2026l 关闭，终端一次性应用所有变更，肉眼无闪烁。
//
// 不支持的终端（旧 xterm、无配置的 tmux）自动降级为顺序写入。
// ============================================================

export interface Csi2026Options {
  /** 终端是否支持 CSI 2026；false 时 begin/end 均不产生输出 */
  supported: boolean
}

const BSU = '\x1b[?2026h'   // Begin Synchronized Update
const ESU = '\x1b[?2026l'   // End Synchronized Update

export class Csi2026 {
  private supported: boolean
  private depth = 0

  constructor(opts: Csi2026Options) {
    this.supported = opts.supported
  }

  setSupported(v: boolean): void { this.supported = v }
  get isSupported(): boolean { return this.supported }

  /** 返回帧开始的 ANSI 序列（不支持时为空串） */
  begin(): string {
    if (!this.supported) return ''
    this.depth++
    return this.depth === 1 ? BSU : ''
  }

  /** 返回帧结束的 ANSI 序列（不支持时为空串） */
  end(): string {
    if (!this.supported) return ''
    if (this.depth === 0) return ''
    this.depth--
    return this.depth === 0 ? ESU : ''
  }

  /** 把 fn 的所有写入包裹在一个原子帧里 */
  frame<T>(write: (s: string) => void, fn: () => T): T {
    const beginSeq = this.begin()
    if (beginSeq) write(beginSeq)
    try {
      return fn()
    } finally {
      const endSeq = this.end()
      if (endSeq) write(endSeq)
    }
  }
}
