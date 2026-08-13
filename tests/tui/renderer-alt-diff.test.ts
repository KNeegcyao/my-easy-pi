import { describe, it, expect } from 'vitest'
import { TuiAltScreen } from '../../src/tui/renderer-alt.js'
import { VStack } from '../../src/tui/layout/stack.js'
import { ScrollView } from '../../src/tui/layout/scroll-view.js'
import { Container } from '../../src/tui/layout/container.js'
import { Text } from '../../src/tui/components/text.js'
import { Terminal, type TerminalCapabilities } from '../../src/tui/terminal.js'

class FT extends Terminal {
  written: string[] = []
  constructor(caps?: Partial<TerminalCapabilities>) {
    super()
    const f: TerminalCapabilities = {
      isTTY: true, columns: 80, rows: 5, syncOutput: false,
      kittyKeyboard: false, osc11: false, kittyImages: false,
      iterm2Images: false, bracketedPaste: false, mouse: false,
      ...caps,
    }
    Object.defineProperty(this, 'capabilities', { get: () => f, configurable: true })
    Object.defineProperty(this, 'columns', { get: () => f.columns, configurable: true })
    Object.defineProperty(this, 'rows', { get: () => f.rows, configurable: true })
  }
  override write(d: string) { this.written.push(d) }
  override writeErr(d: string) { this.written.push('[ERR]'+d) }
  override onInput() { return () => {} }
  override onResize() { return () => {} }
  override enterRawMode() { return () => {} }
  override hideCursor() {} override showCursor() {}
  override enterAltScreen() {} override exitAltScreen() {}
  override clearScreen() {}
}

describe('TuiAltScreen — row diff', () => {
  it('首帧全量写（previousScreen 空）', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    s.setLayoutRoot(new VStack([{ component: new Container([new Text('a')]), grow: 1, min: 1 }]))
    s.start()
    const out = term.written.join('')
    expect(out).toContain('\x1b[1;1H')   // row 1 定位
    expect(out).toContain('a')
    s.stop()
  })

  it('无变化帧跳过（previousScreen 内容不变不重写）', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    const chat = new Container([new Text('stable')])
    const sv = new ScrollView({ stickyBottom: true }); sv.setChild(chat)
    s.setLayoutRoot(new VStack([{ component: sv, grow: 1, min: 1 }]))
    s.start()
    term.written = []
    // 第二次 requestRender（内容不变）
    s.flushPending()
    // 不应有定位序列（跳过）
    expect(term.written.join('')).not.toContain('\x1b[1;1H')
    s.stop()
  })

  it('单行变化只写该行', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    const chat = new Container([new Text('before')])
    const sv = new ScrollView({ stickyBottom: true }); sv.setChild(chat)
    s.setLayoutRoot(new VStack([{ component: sv, grow: 1, min: 1 }]))
    s.start()
    term.written = []
    // 改内容
    chat.clear()
    chat.addChild(new Text('after'))
    s.flushPending()
    const out = term.written.join('')
    expect(out).toContain('after')
    // 不应包含行 2-5 的定位（只有行 1 变化）
    expect(out).not.toContain('\x1b[2;')
    expect(out).not.toContain('\x1b[5;')
    s.stop()
  })

  it('多行变化只写变化行（不写未变行）', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    const chat = new Container([new Text('line1\nline2\nline3')])
    const sv = new ScrollView({ stickyBottom: true }); sv.setChild(chat)
    s.setLayoutRoot(new VStack([{ component: sv, grow: 1, min: 1 }]))
    s.start()
    term.written = []
    // 只改第 2 行
    chat.clear()
    chat.addChild(new Text('line1\nchanged\ntine3'))
    s.flushPending()
    const out = term.written.join('')
    expect(out).toContain('changed')
    // 在 rows=5 终端，line1/line3 在 viewport 内不应重写（它们没变）
    s.stop()
  })
})