import { describe, it, expect, beforeEach } from 'vitest'
import { TuiMainScreen } from '../../src/tui/renderer-main.js'
import { Terminal, type TerminalCapabilities } from '../../src/tui/terminal.js'
import { Text } from '../../src/tui/components/text.js'
import { Loader } from '../../src/tui/components/loader.js'

/** 捕获 stdout 写入的 fake Terminal */
class FakeTerminal extends Terminal {
  written: string[] = []

  constructor(caps: Partial<TerminalCapabilities> = {}) {
    super()
    // 私有字段不能直接重赋值；通过 Object.defineProperty 覆盖 getter
    const capsFinal: TerminalCapabilities = {
      isTTY: true, columns: 80, rows: 24,
      syncOutput: true,
      kittyKeyboard: false, osc11: false,
      kittyImages: false, iterm2Images: false,
      bracketedPaste: true, mouse: false,
      ...caps,
    }
    Object.defineProperty(this, 'capabilities', {
      get: () => capsFinal,
      configurable: true,
    })
    Object.defineProperty(this, 'columns', { get: () => capsFinal.columns, configurable: true })
    Object.defineProperty(this, 'rows', { get: () => capsFinal.rows, configurable: true })
  }

  override write(data: string): void { this.written.push(data) }
  override writeErr(data: string): void { this.written.push('[ERR]' + data) }
  override onResize(_: (cols: number, rows: number) => void): () => void {
    return () => {}  // no-op；测试不触发
  }
}

describe('TuiMainScreen', () => {
  let term: FakeTerminal
  let screen: TuiMainScreen

  beforeEach(() => {
    term = new FakeTerminal()
    screen = new TuiMainScreen(term)
  })

  it('start 预留一行 + hideCursor', () => {
    screen.start()
    expect(term.written.some(s => s.includes('\x1b[?25l'))).toBe(true)
    screen.stop()
    screen.dispose()
  })

  it('初始 requestRender 渲染组件内容', () => {
    const text = new Text('hello')
    screen.registerComponent(text)
    screen.start()  // start() 内部已调一次 requestRender()
    expect(term.written.join('')).toContain('hello')
    screen.stop()
    screen.dispose()
  })

  it('帧被 BSU/ESU 包裹', () => {
    screen.registerComponent(new Text('x'))
    screen.start()
    screen.requestRender()
    const out = term.written.join('')
    expect(out).toContain('\x1b[?2026h')
    expect(out).toContain('\x1b[?2026l')
    screen.stop()
    screen.dispose()
  })

  it('第二次 requestRender 不动 => 无新输出（去抖）', () => {
    screen.registerComponent(new Text('x'))
    screen.start()
    screen.requestRender()
    const firstLen = term.written.length
    screen.requestRender()
    expect(term.written.length).toBe(firstLen)
    screen.stop()
    screen.dispose()
  })

  it('组件内容变化时重渲染', () => {
    const text = new Text('x')
    screen.registerComponent(text)
    screen.start()
    screen.requestRender()
    const firstLen = term.written.length

    text.setContent('y')
    screen.requestRender()
    expect(term.written.length).toBeGreaterThan(firstLen)
    const recent = term.written.slice(firstLen).join('')
    expect(recent).toContain('y')
    screen.stop()
    screen.dispose()
  })

  it('stop 清除渲染区并恢复光标', () => {
    screen.registerComponent(new Text('x'))
    screen.start()
    screen.requestRender()
    term.written = []
    screen.stop()
    const out = term.written.join('')
    expect(out).toContain('\x1b[?25h')
    expect(out).toContain('\x1b[J')
    screen.dispose()
  })

  it('Loader.tick + requestRender 推进帧', () => {
    const loader = new Loader('working')
    screen.registerComponent(loader)
    screen.start()
    screen.requestRender()
    expect(term.written.join('')).toContain('⠋')

    term.written = []
    for (let i = 0; i < 5; i++) {
      loader.tick()
      screen.requestRender()
    }
    expect(term.written.join('')).toContain('⠴')
    screen.stop()
    screen.dispose()
  })

  it('onResize 重置缓冲（不自动重渲染；调用方负责 requestRender）', () => {
    screen.registerComponent(new Text('hello world this is longer'))
    screen.start()
    screen.requestRender()
    expect(screen.renderedLineCount).toBe(1)

    screen.onResize()
    // onResize 清空 lastRenderedLineCount，但**不**自动 requestRender
    // （避免在 resize 风暴期间重复重绘；上层在下一帧统一渲染）
    expect(screen.renderedLineCount).toBe(0)
    screen.stop()
    screen.dispose()
  })

  it('syncOutput=false 时不产生 BSU/ESU', () => {
    const noSync = new FakeTerminal({ syncOutput: false })
    const s = new TuiMainScreen(noSync)
    s.registerComponent(new Text('x'))
    s.start()
    s.requestRender()
    const out = noSync.written.join('')
    expect(out).not.toContain('\x1b[?2026h')
    expect(out).not.toContain('\x1b[?2026l')
    s.stop()
    s.dispose()
  })
})
