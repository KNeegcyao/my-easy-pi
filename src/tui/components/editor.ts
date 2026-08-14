import type { Component, Focusable } from '../component.js'

/**
 * Editor — 行编辑器
 *
 * 关键约定：Editor 不直接读写 stdin/stdout；
 *   - 输入：通过 handleInput(data) 接收 raw STDIN 片段（已是 utf-8 字符串）
 *   - 输出：通过 onSubmit / onChange / onCancel 回调通知外部
 *
 * 支持的按键（raw mode 下的常见编码）：
 *   - 可打印字符：直接插入光标位置
 *   - Enter (\r / \n)：提交
 *   - Backspace (\x7f)：删除光标前一字
 *   - Delete (ESC [ 3 ~)：删除光标处一字
 *   - Ctrl+A：移到行首
 *   - Ctrl+E：移到行尾
 *   - Ctrl+B / ←：左移
 *   - Ctrl+F / →：右移
 *   - Ctrl+D：光标处删除（行空时触发 onCancel）
 *   - Ctrl+K：删到行尾
 *   - Ctrl+U：删到行首
 *   - Ctrl+W：向左删一词（到空白）
 *   - Ctrl+C / Esc：取消
 *   - ↑ / ↓：历史前后翻
 *   - Home / End：行首 / 行尾
 */
export interface EditorOptions {
  /** 提示符（渲染前缀） */
  prompt?: string
  /** 提交回调（Enter） */
  onSubmit?: (text: string) => void
  /** 内容变化回调（每次编辑触发） */
  onChange?: (text: string) => void
  /** 取消回调（Ctrl+C / Esc / Ctrl+D-on-empty） */
  onCancel?: () => void
  /** 历史（↑/↓ 翻阅；提交后由业务侧把新条目 push 进来） */
  history?: string[]
}

/** 解析一次输入得出来的"按键意图"；纯数据，易测试 */
export type KeyIntent =
  | { type: 'insert'; ch: string }
  | { type: 'submit' }
  | { type: 'newline' }         // Alt+Enter / Shift+Enter（插入 \n 不提交）
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'cursorLeft' }
  | { type: 'cursorRight' }
  | { type: 'cursorHome' }
  | { type: 'cursorEnd' }
  | { type: 'killToEnd' }       // Ctrl+K
  | { type: 'killToStart' }     // Ctrl+U
  | { type: 'killWord' }        // Ctrl+W
  | { type: 'historyPrev' }     // ↑
  | { type: 'historyNext' }     // ↓
  | { type: 'cancel' }          // Ctrl+C / Esc
  | { type: 'cancelIfEmpty' }   // Ctrl+D
  | { type: 'unknown' }

/** 把一段 raw 输入解析成按键意图列表（一次 data 可能含多个按键） */
export function parseKeys(data: string): KeyIntent[] {
  const out: KeyIntent[] = []
  let i = 0
  while (i < data.length) {
    const ch = data[i]
    const cp = data.codePointAt(i) || 0

    // ESC 开头的控制序列
    if (ch === '\x1b') {
      // Alt+Enter（\x1b\r）：插入换行
      if (data[i + 1] === '\r' || data[i + 1] === '\n') {
        out.push({ type: 'newline' })
        i += 2
        continue
      }
      const parsed = parseEsc(data, i)
      if (parsed) {
        out.push(parsed.intent)
        i = parsed.next
        continue
      }
      // 裸 ESC：取消
      out.push({ type: 'cancel' })
      i++
      continue
    }

    // 单字节控制字符
    switch (ch) {
      case '\r': case '\n':
        out.push({ type: 'submit' })
        i++
        continue
      case '\x7f':  // DEL = Backspace
        out.push({ type: 'backspace' })
        i++
        continue
      case '\x01':  // Ctrl+A
        out.push({ type: 'cursorHome' })
        i++
        continue
      case '\x05':  // Ctrl+E
        out.push({ type: 'cursorEnd' })
        i++
        continue
      case '\x02':  // Ctrl+B
        out.push({ type: 'cursorLeft' })
        i++
        continue
      case '\x06':  // Ctrl+F
        out.push({ type: 'cursorRight' })
        i++
        continue
      case '\x04':  // Ctrl+D
        out.push({ type: 'cancelIfEmpty' })
        i++
        continue
      case '\x0b':  // Ctrl+K
        out.push({ type: 'killToEnd' })
        i++
        continue
      case '\x15':  // Ctrl+U
        out.push({ type: 'killToStart' })
        i++
        continue
      case '\x17':  // Ctrl+W
        out.push({ type: 'killWord' })
        i++
        continue
      case '\x03':  // Ctrl+C
        out.push({ type: 'cancel' })
        i++
        continue
      case '\t':
        out.push({ type: 'insert', ch: '\t' })
        i++
        continue
    }

    // 其他控制字符忽略
    if (cp < 0x20 || cp === 0x7f) {
      i++
      continue
    }

    // 可打印字符（含多字节 utf-8；按 codePoint 推进）
    out.push({ type: 'insert', ch: String.fromCodePoint(cp) })
    i += (cp > 0xffff ? 2 : 1)
  }
  return out
}

/** 解析 ESC 起始的序列；返回意图 + 下一位置；无法识别返回 null */
function parseEsc(data: string, start: number): { intent: KeyIntent; next: number } | null {
  // ESC [ ... 终结符
  if (data[start + 1] === '[') {
    // 找终结字母（跳过数字/分号/?）
    let j = start + 2
    while (j < data.length && /[0-9;?]/.test(data[j])) j++
    if (j >= data.length) return null  // 不完整
    const final = data[j]
    const params = data.slice(start + 2, j)

    switch (final) {
      case 'A': return { intent: { type: 'historyPrev' }, next: j + 1 }     // ↑
      case 'B': return { intent: { type: 'historyNext' }, next: j + 1 }      // ↓
      case 'C': return { intent: { type: 'cursorRight' }, next: j + 1 }      // →
      case 'D': return { intent: { type: 'cursorLeft' }, next: j + 1 }       // ←
      case 'H': return { intent: { type: 'cursorHome' }, next: j + 1 }       // Home
      case 'F': return { intent: { type: 'cursorEnd' }, next: j + 1 }        // End
      case '~': {
        // 数字参数决定语义：1/7=Home, 4/8=End, 3=Delete, 2=Insert, 5/6=PageUp/Down
        const num = parseInt(params, 10)
        if (num === 3) return { intent: { type: 'delete' }, next: j + 1 }
        if (num === 1 || num === 7) return { intent: { type: 'cursorHome' }, next: j + 1 }
        if (num === 4 || num === 8) return { intent: { type: 'cursorEnd' }, next: j + 1 }
        return { intent: { type: 'unknown' }, next: j + 1 }
      }
      case 'u': {
        // CSI u protocol (kitty): \x1b[<key>;<modifier>u
        // 13;2 = Shift+Enter → 换行不提交
        if (params === '13;2') return { intent: { type: 'newline' }, next: j + 1 }
        return { intent: { type: 'unknown' }, next: j + 1 }
      }
      default: return { intent: { type: 'unknown' }, next: j + 1 }
    }
  }
  // ESC OH / OF (rxvt Home/End)
  if (data[start + 1] === 'O') {
    const f = data[start + 2]
    if (f === 'H') return { intent: { type: 'cursorHome' }, next: start + 3 }
    if (f === 'F') return { intent: { type: 'cursorEnd' }, next: start + 3 }
    return { intent: { type: 'unknown' }, next: start + 3 }
  }
  return null
}

export class Editor implements Component, Focusable {
  private opts: EditorOptions
  private text = ''
  private cursorPos = 0
  private focused = false
  private cachedLines: string[] | null = null

  // 历史浏览状态
  private history: string[]
  private historyIdx = -1   // -1 = 不在浏览状态（当前编辑 text）
  private draft = ''        // 浏览历史时，未提交的草稿

  constructor(opts: EditorOptions = {}) {
    this.opts = opts
    this.history = opts.history ? [...opts.history] : []
  }

  // ── Focusable ──
  get hasFocus(): boolean { return this.focused }
  focus(): void { this.focused = true; this.invalidate() }
  blur(): void { this.focused = false; this.invalidate() }

  // ── 内容 API ──
  setText(text: string): void {
    this.text = text
    this.cursorPos = text.length
    this.historyIdx = -1
    this.invalidate()
  }
  getText(): string { return this.text }
  getCursorPos(): number { return this.cursorPos }
  clear(): void { this.setText('') }

  /** 追加一条历史（业务侧在 onSubmit 后调用） */
  pushHistory(entry: string): void {
    if (entry.length === 0) return
    // 避免与最近一条重复
    if (this.history[this.history.length - 1] === entry) return
    this.history.push(entry)
    this.historyIdx = -1
  }
  getHistory(): readonly string[] { return this.history }

  // ── Component ──
  invalidate(): void { this.cachedLines = null }

  render(width: number): string[] {
    if (this.cachedLines) return this.cachedLines
    const prompt = this.opts.prompt ?? '> '
    // 单行横向滚动：始终返回 1 行。超宽时只显示光标附近的窗口，
    // 光标始终可见。这保证 bottomDock 高度恒 1，layout 稳定（Phase 5）。
    const line = renderSingleLineScroll(prompt, this.text, this.cursorPos, width)
    this.cachedLines = [line]
    return this.cachedLines
  }

  // ── 输入处理 ──
  handleInput(data: string): void {
    const intents = parseKeys(data)
    this.handleIntents(intents)
  }

  /** 直接处理已解析的 KeyIntent 列表（用于 KeyBinds 层调用） */
  handleIntents(intents: KeyIntent[]): void {
    for (const intent of intents) {
      this.applyIntent(intent)
    }
  }

  private applyIntent(intent: KeyIntent): void {
    switch (intent.type) {
      case 'insert':
        this.text = this.text.slice(0, this.cursorPos) + intent.ch + this.text.slice(this.cursorPos)
        this.cursorPos += intent.ch.length
        this.exitHistoryBrowse()
        this.invalidate()
        this.emitChange()
        break

      case 'newline':
        // Alt+Enter / Shift+Enter：在光标处插入 \n 不提交
        this.text = this.text.slice(0, this.cursorPos) + '\n' + this.text.slice(this.cursorPos)
        this.cursorPos += 1
        this.exitHistoryBrowse()
        this.invalidate()
        this.emitChange()
        break

      case 'submit': {
        const submitted = this.text
        this.opts.onSubmit?.(submitted)
        // 提交后清空（典型 readline 行为）
        this.text = ''
        this.cursorPos = 0
        this.historyIdx = -1
        this.invalidate()
        break
      }

      case 'backspace':
        if (this.cursorPos > 0) {
          // 删除光标前一个 code point
          const before = this.text.slice(0, this.cursorPos)
          const removed = lastCodePoint(before)
          this.text = before.slice(0, before.length - removed.length) + this.text.slice(this.cursorPos)
          this.cursorPos -= removed.length
          this.exitHistoryBrowse()
          this.invalidate()
          this.emitChange()
        }
        break

      case 'delete':
        if (this.cursorPos < this.text.length) {
          const after = this.text.slice(this.cursorPos)
          const removed = firstCodePoint(after)
          this.text = this.text.slice(0, this.cursorPos) + after.slice(removed.length)
          this.exitHistoryBrowse()
          this.invalidate()
          this.emitChange()
        }
        break

      case 'cursorLeft':
        if (this.cursorPos > 0) {
          const before = this.text.slice(0, this.cursorPos)
          this.cursorPos -= lastCodePoint(before).length
          this.invalidate()
        }
        break

      case 'cursorRight':
        if (this.cursorPos < this.text.length) {
          const after = this.text.slice(this.cursorPos)
          this.cursorPos += firstCodePoint(after).length
          this.invalidate()
        }
        break

      case 'cursorHome':
        this.cursorPos = 0
        this.invalidate()
        break

      case 'cursorEnd':
        this.cursorPos = this.text.length
        this.invalidate()
        break

      case 'killToEnd':
        if (this.cursorPos < this.text.length) {
          this.text = this.text.slice(0, this.cursorPos)
          this.exitHistoryBrowse()
          this.invalidate()
          this.emitChange()
        }
        break

      case 'killToStart':
        if (this.cursorPos > 0) {
          this.text = this.text.slice(this.cursorPos)
          this.cursorPos = 0
          this.exitHistoryBrowse()
          this.invalidate()
          this.emitChange()
        }
        break

      case 'killWord': {
        // 向左删一个 "word segment"（与 bash backward-kill-word 近似）：
        //   - 若光标左侧紧邻空白 → 删那段空白
        //   - 否则 → 删那段非空白字符
        // 例：'hello world' 末尾 Ctrl+W → 'hello '（删 world）
        //     'hello ' 末尾 Ctrl+W → 'hello'（删空格）
        //     'hello' 末尾 Ctrl+W → ''（删 hello）
        let p = this.cursorPos
        if (p > 0 && isWhiteSpace(this.text[p - 1])) {
          while (p > 0 && isWhiteSpace(this.text[p - 1])) p--
        } else {
          while (p > 0 && !isWhiteSpace(this.text[p - 1])) p--
        }
        if (p < this.cursorPos) {
          this.text = this.text.slice(0, p) + this.text.slice(this.cursorPos)
          this.cursorPos = p
          this.exitHistoryBrowse()
          this.invalidate()
          this.emitChange()
        }
        break
      }

      case 'historyPrev':
        this.browseHistory(-1)
        break

      case 'historyNext':
        this.browseHistory(1)
        break

      case 'cancel':
        this.opts.onCancel?.()
        break

      case 'cancelIfEmpty':
        if (this.text.length === 0) {
          this.opts.onCancel?.()
        } else {
          // 等价 Delete
          this.applyIntent({ type: 'delete' })
        }
        break

      case 'unknown':
        // 忽略
        break
    }
  }

  private browseHistory(direction: 1 | -1): void {
    if (this.history.length === 0) return
    if (this.historyIdx === -1) {
      // 进入浏览前保存草稿
      if (direction === -1) {
        this.draft = this.text
        this.historyIdx = this.history.length - 1
      } else {
        return  // 已经在最底部，向下无意义
      }
    } else {
      this.historyIdx += direction
      if (this.historyIdx >= this.history.length) {
        // 越界：回到草稿
        this.historyIdx = -1
        this.text = this.draft
        this.cursorPos = this.text.length
        this.invalidate()
        return
      }
      if (this.historyIdx < 0) {
        this.historyIdx = -1
        this.text = this.draft
        this.cursorPos = this.text.length
        this.invalidate()
        return
      }
    }
    this.text = this.history[this.historyIdx] ?? ''
    this.cursorPos = this.text.length
    this.invalidate()
  }

  private exitHistoryBrowse(): void {
    if (this.historyIdx !== -1) {
      this.historyIdx = -1
      this.draft = ''
    }
  }

  private emitChange(): void {
    this.opts.onChange?.(this.text)
  }
}

// ============================================================
// Helpers
// ============================================================

function isWhiteSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

function visibleLen(s: string): number {
  // 简化：按 code points 计数（不含 ANSI；prompt 一般无 ANSI）
  let n = 0
  for (const _ of s) n++
  return n
}

/** 取字符串首字 code point（可能是代理对） */
function firstCodePoint(s: string): string {
  if (s.length === 0) return ''
  const cp = s.codePointAt(0) || 0
  return String.fromCodePoint(cp)
}

/** 取字符串末字 code point（正确处理代理对：用 Array.from 按 code point 拆分） */
function lastCodePoint(s: string): string {
  if (s.length === 0) return ''
  const cps = Array.from(s)  // 按 code point 拆分；代理对合并为 1 项
  return cps[cps.length - 1]
}

/**
 * 单行横向滚动渲染（Phase 5）：恒返回 1 行。
 * prompt + text + 反白光标。超宽时按"光标居中窗口"裁切，光标始终可见。
 * 借鉴 pi/常见单行 editor：光标在窗口右侧 1/4 处滚动。
 */
function renderSingleLineScroll(prompt: string, text: string, cursorPos: number, width: number): string {
  const promptW = visibleLen(prompt)
  const avail = Math.max(1, width - promptW)   // 文本可用列数

  // 关心的是 text 视觉字符（按 code point）；cursorPos 是 code point 序号
  const chars = Array.from(text)
  const cursorCp = Math.min(cursorPos, chars.length)   // 光标在第几个 code point

  if (chars.length <= avail) {
    // 不超宽：直接全量渲染
    const before = chars.slice(0, cursorCp).join('')
    const at = chars.slice(cursorCp, cursorCp + 1).join('')
    const after = chars.slice(cursorCp + 1).join('')
    const cursorBlock = at ? `\x1b[7m${at}\x1b[0m` : '\x1b[7m \x1b[0m'
    return `${prompt}${before}${cursorBlock}${after}`
  }

  // 超宽：算可见窗口 [windowStart, windowStart+avail)，含光标
  // 让光标尽量在窗口右 1/4，留左 3/4 给已输入内容
  let windowStart = Math.max(0, cursorCp - Math.floor(avail * 0.75))
  if (windowStart + avail > chars.length) windowStart = Math.max(0, chars.length - avail)
  if (cursorCp < windowStart) windowStart = cursorCp
  const windowEnd = windowStart + avail
  const showChars = chars.slice(windowStart, windowEnd)

  // 在 window 内的光标相对位置
  const localCursor = cursorCp - windowStart
  const before = showChars.slice(0, localCursor).join('')
  const at = showChars.slice(localCursor, localCursor + 1).join('')
  const after = showChars.slice(localCursor + 1).join('')
  const cursorBlock = at ? `\x1b[7m${at}\x1b[0m` : '\x1b[7m \x1b[0m'

  // 窗口未在 text 开头时左侧加省略提示（占 1，avail-1 给内容）
  // 简化 v1：不加省略号，纯裁切（pi 也基本如此，避免占宽）
  return `${prompt}${before}${cursorBlock}${after}`
}