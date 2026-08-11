import { describe, it, expect, vi } from 'vitest'
import { startTUI } from '../../src/tui/host.js'
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
import { Terminal, type TerminalCapabilities } from '../../src/tui/terminal.js'
import type { Agent, AgentEvent } from '../../src/agent/types.js'

/** 捕获 stdout 的 fake Terminal（不进 raw / 不挂真 stdin） */
class FakeTerminal extends Terminal {
  written: string[] = []
  inputs: Array<(data: string) => void> = []

  constructor(caps: Partial<TerminalCapabilities> = {}) {
    super()
    const capsFinal: TerminalCapabilities = {
      isTTY: true, columns: 80, rows: 24,
      syncOutput: false,  // 测试里不验证 CSI 2026
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
  override onInput(listener: (data: string) => void): () => void {
    this.inputs.push(listener)
    return () => {
      this.inputs = this.inputs.filter(l => l !== listener)
    }
  }
  override onResize(_: (cols: number, rows: number) => void): () => void {
    return () => {}
  }
  override enterRawMode(): () => void { return () => {} }
  override hideCursor(): void {}
  override showCursor(): void {}
  override enterAltScreen(): void {}
  override exitAltScreen(): void {}

  /** 测试 helper：模拟用户键入 */
  type(data: string): void {
    for (const l of this.inputs) l(data)
  }
}

/** 极简 fake Agent：只实现 host 用到的接口 */
function fakeAgent(): Agent & { emit(e: AgentEvent): void; prompts: string[]; followUps: string[]; streaming: boolean } {
  const listeners: Array<(e: AgentEvent) => void> = []
  const prompts: string[] = []
  const followUps: string[] = []
  let streaming = false

  const agent = {
    state: {
      model: { id: 'test-model', provider: 'test', supportsTools: () => true, supportsThinking: () => false },
      tools: [{ name: 'bash', description: 'run shell' }],
      messages: [],
      isStreaming: false,
      systemPrompt: '',
      pendingToolCalls: new Set(),
    },
    subscribe(fn: (e: AgentEvent) => void) {
      listeners.push(fn)
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1) }
    },
    async prompt(text: string) {
      prompts.push(text)
      streaming = true
      this.state.isStreaming = true
    },
    followUp(text: string) { followUps.push(text) },
    emit(e: AgentEvent) { for (const l of listeners) l(e) },
    prompts,
    followUps,
    get streaming() { return streaming },
  } as unknown as Agent & { emit(e: AgentEvent): void; prompts: string[]; followUps: string[]; streaming: boolean }
  return agent
}

describe('startTUI (host)', () => {
  it('启动：写 hero + editor 渲染', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })

    const out = term.written.join('')
    expect(out).toContain('piagent')
    expect(out).toContain('test-model')
    expect(out).toContain('test')         // provider
    expect(out).toContain('/help')
    stop()
  })

  it('用户键入 + Enter → agent.prompt 被调用，用户消息进 transcript', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })
    term.written = []

    term.type('hello')
    term.type('\r')
    // 让 prompt promise 微任务跑完
    setImmediate(() => {})

    expect((agent as any).prompts).toEqual(['hello'])
    expect(term.written.join('')).toContain('hello')
    stop()
  })

  it('空输入 Enter → 不 prompt，只 requestRender', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })
    term.written = []

    term.type('\r')
    setImmediate(() => {})

    expect((agent as any).prompts).toEqual([])
    stop()
  })

  it('slash /help → 命令输出进 transcript', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })
    term.written = []

    term.type('/help\r')

    expect(term.written.join('')).toContain('可用命令')
    expect((agent as any).prompts).toEqual([])
    stop()
  })

  it('turn_start 事件 → loader 显示', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })
    term.written = []

    agent.emit({ type: 'turn_start' })
    await sleep(20)   // 等节流（16ms）过去
    expect(term.written.join('')).toContain('thinking')
    stop()
  })

  it('message_update → markdown 流式渲染', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })
    term.written = []

    agent.emit({ type: 'turn_start' })
    await sleep(20)
    term.written = []
    agent.emit({ type: 'message_update', message: { content: 'hello **world**' } })
    await sleep(20)

    expect(term.written.join('')).toContain('hello')
    stop()
  })

  it('message_end → 卸载 markdown/loader，恢复 prompt', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })

    agent.emit({ type: 'turn_start' })
    await sleep(20)
    agent.emit({ type: 'message_update', message: { content: 'final answer' } })
    await sleep(20)
    term.written = []
    agent.emit({ type: 'message_end', message: { id: '1', parentId: null, role: 'assistant', content: 'final answer', createdAt: 0 } })
    await sleep(20)

    // message_end 后渲染区只剩 editor；final answer 已在 message_update 时画过，
    // 这里只验证不崩溃且 prompt 恢复（绿色 > 在渲染区）
    const out = term.written.join('')
    expect(out).toMatch(/>/)   // prompt 出现
    stop()
  })

  it('tool_execution_start → 工具行进 transcript', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })
    term.written = []

    agent.emit({
      type: 'tool_execution_start',
      toolCallId: 'tc1',
      toolName: 'bash',
      args: { command: 'ls -la' },
    })

    expect(term.written.join('')).toContain('bash')
    expect(term.written.join('')).toContain('ls -la')
    stop()
  })

  it('error 事件 → 错误行进 transcript', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })
    term.written = []

    agent.emit({ type: 'error', message: 'something broke' })
    expect(term.written.join('')).toContain('something broke')
    stop()
  })

  it('历史 ↑：提交后能调回', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })

    term.type('first message\r')
    await sleep(20)
    term.written = []

    // ↑ 应调回 'first message'
    term.type('\x1b[A')
    await sleep(20)   // onInput → requestRender 节流
    const out = term.written.join('')
    expect(out).toContain('first message')
    stop()
  })

  it('agent streaming 时提交 → followUp 队列', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })

    // 模拟 streaming 状态
    agent.state.isStreaming = true
    term.type('queued\r')

    expect((agent as any).followUps).toEqual(['queued'])
    expect((agent as any).prompts).toEqual([])
    stop()
  })

  it('stop 函数：清理不抛错', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term })
    expect(() => stop()).not.toThrow()
  })
})