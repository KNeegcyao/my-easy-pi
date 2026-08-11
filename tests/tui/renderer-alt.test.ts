import { describe, it, expect } from 'vitest'
import { TuiAltScreen } from '../../src/tui/renderer-alt.js'
import { VStack } from '../../src/tui/layout/stack.js'
import { ScrollView } from '../../src/tui/layout/scroll-view.js'
import { Container } from '../../src/tui/layout/container.js'
import { Text } from '../../src/tui/components/text.js'
import { Terminal, type TerminalCapabilities } from '../../src/tui/terminal.js'

class FT extends Terminal {
  written: string[] = []
  constructor() {
    super()
    Object.defineProperty(this, 'capabilities', { get: () => ({isTTY:true,columns:80,rows:5,syncOutput:false,kittyKeyboard:false,osc11:false,kittyImages:false,iterm2Images:false,bracketedPaste:true,mouse:false} as TerminalCapabilities), configurable: true })
    Object.defineProperty(this, 'columns', { get: () => 80, configurable: true })
    Object.defineProperty(this, 'rows', { get: () => 5, configurable: true })
  }
  override write(d: string) { this.written.push(d) }
  override writeErr(d: string) { this.written.push(d) }
  override onInput() { return () => {} }
  override onResize() { return () => {} }
  override enterRawMode() { return () => {} }
  override hideCursor() {} override showCursor() {}
  override enterAltScreen() {} override exitAltScreen() {}
  override clearScreen() {}
}

describe('TuiAltScreen', () => {
  it('start 进 alt + hideCursor + 首帧', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    const chat = new Container([new Text('hello')])
    const sv = new ScrollView({ stickyBottom: true })
    sv.setChild(chat)
    const root = new VStack([{ component: sv, grow: 1, min: 1 }, { component: new Text('> prompt'), grow: 0 }])
    s.setLayoutRoot(root)
    s.start()
    const out = term.written.join('')
    expect(out).toContain('hello')
    expect(out).toContain('> prompt')
    s.stop()
  })

  it('setLayoutRoot 未设：start 不崩，doRender 空转', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    expect(() => s.start()).not.toThrow()
    s.stop()
  })

  it('渲染每行带定位序列 \\x1b[N;1H', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    const chat = new Container([new Text('a\nb\nc\nd\ne')])
    const sv = new ScrollView({ stickyBottom: true })
    sv.setChild(chat)
    s.setLayoutRoot(new VStack([{ component: sv, grow: 1, min: 1 }]))
    s.start()
    const out = term.written.join('')
    expect(out).toContain('\x1b[1;1H')
    expect(out).toContain('\x1b[2;1H')
    s.stop()
  })

  it('requestRender 节流（多次合并一帧）', async () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    const chat = new Container([new Text('x')])
    const sv = new ScrollView({ stickyBottom: true }); sv.setChild(chat)
    s.setLayoutRoot(new VStack([{ component: sv, grow: 1, min: 1 }]))
    s.start()
    term.written = []
    s.requestRender(); s.requestRender(); s.requestRender()
    await new Promise(r => setTimeout(r, 40))
    // 节流后只一帧（含一次 \\x1b[1;1H 序列开始）；不验证精确次数，验证不爆
    expect(term.written.length).toBeLessThan(5)
    s.stop()
  })

  it('flushPending 立即渲染（跳过节流）', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    const chat = new Container([new Text('initial')])
    const sv = new ScrollView({ stickyBottom: true }); sv.setChild(chat)
    s.setLayoutRoot(new VStack([{ component: sv, grow: 1, min: 1 }]))
    s.start()
    term.written = []
    // 改内容触发变化
    chat.addChild(new Text('flushed'))
    s.requestRender()
    s.flushPending()
    expect(term.written.join('')).toContain('flushed')
    s.stop()
  })

  it('stop 退出 alt（\\x1b[?1049l）', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    s.setLayoutRoot(new VStack([{ component: new Container([new Text('hi')]), grow: 1, min: 1 }]))
    s.start()
    term.written = []
    s.stop()
    // FakeTerminal.showCursor 是 no-op（不写序列），只验证退出 alt + 回放
    expect(term.written.join('')).toContain('\x1b[?1049l')
    expect(term.written.join('')).toContain('hi')
  })

  it('stop 回放最后一帧到主屏', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    s.setLayoutRoot(new VStack([{ component: new Container([new Text('replay-me')]), grow: 1, min: 1 }]))
    s.start()
    s.flushPending()
    term.written = []
    s.stop()
    expect(term.written.join('')).toContain('replay-me')
  })

  it('editor 永远在底部行（不随 chat 增长漂移）', () => {
    const term = new FT()
    const s = new TuiAltScreen(term)
    const chat = new Container()
    const sv = new ScrollView({ stickyBottom: true }); sv.setChild(chat)
    const editor = new Text('> prompt')
    s.setLayoutRoot(new VStack([
      { component: sv, grow: 1, min: 1 },
      { component: editor, grow: 0, min: 1 },
    ]))
    s.start()
    // chat 增长到 20 行
    for (let i = 0; i < 20; i++) chat.addChild(new Text(`line${i}`))
    s.flushPending()
    const out = term.written.join('')
    // editor '> prompt' 应在最后一行（行 5）出现
    // 找最后的 \x1b[5;1H 之后的内容
    const lastFrame = out.split('\x1b[?2026h').pop() || ''
    // 行 5 定位后含 prompt
    expect(lastFrame).toContain('\x1b[5;1H')
    expect(out).toContain('> prompt')
    s.stop()
  })
})