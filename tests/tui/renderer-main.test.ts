import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TuiMainScreen } from '../../src/tui/renderer-main.js'
import { Terminal, type TerminalCapabilities } from '../../src/tui/terminal.js'
import { Text } from '../../src/tui/components/text.js'
import { Loader } from '../../src/tui/components/loader.js'

class FakeTerminal extends Terminal {
  written: string[] = []

  constructor(caps: Partial<TerminalCapabilities> = {}) {
    super()
    const capsFinal: TerminalCapabilities = {
      isTTY: true, columns: 80, rows: 24,
      syncOutput: true,
      kittyKeyboard: false, osc11: false,
      kittyImages: false, iterm2Images: false,
      bracketedPaste: true, mouse: false,
      ...caps,
    }
    Object.defineProperty(this, 'capabilities', { get: () => capsFinal, configurable: true })
    Object.defineProperty(this, 'columns', { get: () => capsFinal.columns, configurable: true })
    Object.defineProperty(this, 'rows', { get: () => capsFinal.rows, configurable: true })
  }

  override write(data: string): void { this.written.push(data) }
  override writeErr(data: string): void { this.written.push('[ERR]' + data) }
  override onResize(_: (cols: number, rows: number) => void): () => void { return () => {} }
  override hideCursor(): void {}
  override showCursor(): void {}
  override enterAltScreen(): void {}
  override exitAltScreen(): void {}
}

describe('TuiMainScreen — 基础', () => {
  let term: FakeTerminal
  let screen: TuiMainScreen

  beforeEach(() => {
    term = new FakeTerminal()
    screen = new TuiMainScreen(term)
  })

  it('start 首帧渲染组件内容（renderNow，不经节流）', () => {
    screen.registerComponent(new Text('hello'))
    screen.start()   // start 内部 renderNow
    expect(term.written.join('')).toContain('hello')
    screen.dispose()
  })

  it('帧被 BSU/ESU 包裹（syncOutput=true）', () => {
    screen.registerComponent(new Text('x'))
    screen.start()
    const out = term.written.join('')
    expect(out).toContain('\x1b[?2026h')
    expect(out).toContain('\x1b[?2026l')
    screen.dispose()
  })

  it('syncOutput=false 时不产生 BSU/ESU', () => {
    const t = new FakeTerminal({ syncOutput: false })
    const s = new TuiMainScreen(t)
    s.registerComponent(new Text('x'))
    s.start()
    const out = t.written.join('')
    expect(out).not.toContain('\x1b[?2026h')
    expect(out).not.toContain('\x1b[?2026l')
    s.dispose()
  })

  it('stop 清渲染区 + showCursor', () => {
    screen.registerComponent(new Text('x'))
    screen.start()
    term.written = []   // 注：FakeTerminal showCursor no-op，不会写序列
    screen.stop()
    const out = term.written.join('')
    expect(out).toContain('\x1b[J')   // clearToEnd
    screen.dispose()
  })
})

describe('TuiMainScreen — 节流', () => {
  it('高频 requestRender 在 16ms 内只画一帧', () => {
    const term = new FakeTerminal()
    const screen = new TuiMainScreen(term)
    const text = new Text('a')
    screen.registerComponent(text)
    screen.start()
    const lenAfterStart = term.written.length

    // 节流：多次 requestRender 不立即画
    text.setContent('b')
    screen.requestRender()
    text.setContent('c')
    screen.requestRender()
    expect(term.written.length).toBe(lenAfterStart)   // 还没画

    // flush 强制画一帧
    screen.flushPending()
    const out = term.written.slice(lenAfterStart).join('')
    expect(out).toContain('c')       // 只看到最终值 c，不是 b
    expect(out).not.toContain('b')   // b 被合并掉
    screen.dispose()
  })

  it('hasPendingRender 反映节流队列', () => {
    const term = new FakeTerminal()
    const screen = new TuiMainScreen(term)
    screen.registerComponent(new Text('x'))
    screen.start()
    term.written = []

    screen.registerComponent(new Text('y'))
    screen.requestRender()
    // 节流队列可能已/未触发（process.nextTick 异步）；flush 后必为 false
    screen.flushPending()
    expect(screen.hasPendingRender).toBe(false)
    screen.dispose()
  })
})

describe('TuiMainScreen — diff 限范围 + 纯追加（核心 pi 行为）', () => {
  it('纯追加：不上移光标，直接 \\r\\n 追加新行（打字机效果）', () => {
    const term = new FakeTerminal()
    const screen = new TuiMainScreen(term)
    // 用多行 Text 模拟流式追加
    const text = new Text('line1\nline2', { wrap: false })
    screen.registerComponent(text)
    screen.start()
    term.written = []

    // 纯追加一行：旧行不变
    text.setContent('line1\nline2\nline3')
    screen.requestRender()
    screen.flushPending()
    const out = term.written.join('')

    // 不应有大段 cursorUp（\x1b[NA, N>1 表示整块上移重画）
    // 纯追加路径只产生 \r\n 追加 + 单行 \x1b[2K
    const cursorUpMatches = out.match(/\x1b\[(\d+)A/g) || []
    const bigUp = cursorUpMatches.filter(m => parseInt(m.match(/\d+/)![0]) > 1)
    expect(bigUp.length).toBe(0)
    expect(out).toContain('line3')
    screen.dispose()
  })

  it('行内变更（spinner）：只重写变化的行，不重画整块', () => {
    const term = new FakeTerminal()
    const screen = new TuiMainScreen(term)
    const loader = new Loader('working')
    const text = new Text('header', { wrap: false })
    screen.registerComponent(text)
    screen.registerComponent(loader)
    screen.start()
    term.written = []

    // spinner 推进 5 帧
    for (let i = 0; i < 5; i++) {
      loader.tick()
      screen.requestRender()
      screen.flushPending()
    }
    const out = term.written.join('')

    // 'header' 行在 spinner 帧不变化 → diff 跳过，不重复写
    // （测试已清零首帧输出，所以 header 在后续帧根本不应出现）
    const headerCount = (out.match(/header/g) || []).length
    expect(headerCount).toBe(0)
    expect(out).toContain('⠴')   // 第 5 帧 spinner 被重写
    screen.dispose()
  })

  it('内容缩短：清多余行', () => {
    const term = new FakeTerminal()
    const screen = new TuiMainScreen(term)
    const text = new Text('a\nb\nc\nd\ne', { wrap: false })
    screen.registerComponent(text)
    screen.start()
    term.written = []

    text.setContent('a\nb')
    screen.requestRender()
    screen.flushPending()
    const out = term.written.join('')
    expect(out).toContain('\x1b[2K')   // 清多余行
    // a/b 行未变，diff 跳过不重写（正确行为）
    screen.dispose()
  })
})

describe('TuiMainScreen — 视口推滚（长输出）', () => {
  it('渲染区超过终端高度时产生 \\r\\n 推滚（进 scrollback）', () => {
    // rows=5 模拟小终端
    const term = new FakeTerminal({ columns: 80, rows: 5 } as any)
    // 上面 caps 里 columns/rows 已通过 defineProperty 设；这里再校准
    Object.defineProperty(term, 'rows', { get: () => 5, configurable: true })
    const screen = new TuiMainScreen(term)
    const text = new Text('seed', { wrap: false })
    screen.registerComponent(text)
    screen.start()
    term.written = []

    // 追加到远超 5 行
    text.setContent(Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n'))
    screen.requestRender()
    screen.flushPending()
    const out = term.written.join('')

    // 长输出处理：fullRender 或 append 路径都会产生 \r\n 分隔
    // 关键是不崩溃 + 最新行 line19 出现（在底部）
    expect(out).toContain('\r\n')
    expect(out).toContain('line19')
    screen.dispose()
  })
})