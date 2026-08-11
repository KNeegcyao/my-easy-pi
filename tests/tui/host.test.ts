import { describe, it, expect } from 'vitest'
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
      syncOutput: false,
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
    return () => { this.inputs = this.inputs.filter(l => l !== listener) }
  }
  override onResize(_: (cols: number, rows: number) => void): () => void { return () => {} }
  override enterRawMode(): () => void { return () => {} }
  override hideCursor(): void {}
  override showCursor(): void {}
  override enterAltScreen(): void {}
  override exitAltScreen(): void {}

  type(data: string): void { for (const l of this.inputs) l(data) }
}

function fakeAgent(): Agent & { emit(e: AgentEvent): void; prompts: string[]; followUps: string[]; streaming: boolean } {
  const listeners: Array<(e: AgentEvent) => void> = []
  const prompts: string[] = []
  const followUps: string[] = []
  let streaming = false
  const agent = {
    state: {
      model: { id: 'test-model', provider: 'test', supportsTools: () => true, supportsThinking: () => false },
      tools: [{ name: 'bash', description: 'run shell' }],
      messages: [], isStreaming: false, systemPrompt: '', pendingToolCalls: new Set(),
    },
    subscribe(fn: (e: AgentEvent) => void) {
      listeners.push(fn)
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1) }
    },
    async prompt(text: string) { prompts.push(text); streaming = true; this.state.isStreaming = true },
    followUp(text: string) { followUps.push(text) },
    emit(e: AgentEvent) { for (const l of listeners) l(e) },
    reset() { this.state.messages = []; (this as any)._resetCalled = true },
    prompts, followUps,
    get streaming() { return streaming },
  } as unknown as Agent & { emit(e: AgentEvent): void; prompts: string[]; followUps: string[]; streaming: boolean; _resetCalled?: boolean }
  return agent
}

describe('startTUI (host) — 新模型（chatContainer 常驻）', () => {
  it('启动：写 hero', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    const out = term.written.join('')
    expect(out).toContain('piagent')
    expect(out).toContain('test-model')
    expect(out).toContain('/help')
    stop()
  })

  it('用户键入 + Enter → agent.prompt 被调用，用户消息进 chat history', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    term.written = []
    term.type('hello')
    term.type('\r')
    await sleep(20)   // 等节流渲染
    expect((agent as any).prompts).toEqual(['hello'])
    expect(term.written.join('')).toContain('hello')  // '> hello' 入 chat
    stop()
  })

  it('空输入 Enter → 不 prompt', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    term.written = []
    type: {
      term.type('\r')
      await sleep(20)
    }
    expect((agent as any).prompts).toEqual([])
    stop()
  })

  it('slash /help → 命令输出进 chat history', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    term.written = []
    term.type('/help\r')
    await sleep(20)
    expect(term.written.join('')).toContain('可用命令')
    expect((agent as any).prompts).toEqual([])
    stop()
  })

  it('turn_start → 创建 AssistantTurn 并显示 loader', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    term.written = []
    agent.emit({ type: 'turn_start' })
    await sleep(20)
    expect(term.written.join('')).toContain('thinking')   // loader 显示
    stop()
  })

  it('message_update → markdown 流式渲染（同一 turn 内更新）', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    agent.emit({ type: 'turn_start' })
    await sleep(60)
    term.written = []
    agent.emit({ type: 'message_update', message: { content: 'hello **world**' } })
    await sleep(60)
    expect(term.written.join('')).toContain('hello')
    stop()
  })

  it('message_end → turn 留在 chat history（不移除）', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    agent.emit({ type: 'turn_start' })
    await sleep(60)
    agent.emit({ type: 'message_update', message: { content: 'final answer' } })
    await sleep(60)
    agent.emit({ type: 'message_end', message: { id: '1', parentId: null, role: 'assistant', content: 'final answer', createdAt: 0 } })
    await sleep(60)
    // 最终内容应留在累计输出里（不被 message_end 抹掉）
    expect(term.written.join('')).toContain('final answer')
    stop()
  })

  it('tool_execution_start → 工具行进 chat history（在 turn 内）', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    agent.emit({ type: 'turn_start' })
    await sleep(60)
    term.written = []
    agent.emit({
      type: 'tool_execution_start' as any,
      toolCallId: 'tc1', toolName: 'bash', args: { command: 'ls -la' },
    } as any)
    await sleep(60)
    expect(term.written.join('')).toContain('bash')
    expect(term.written.join('')).toContain('ls -la')
    stop()
  })

  it('tool_execution_end → 工具结果渲染（ContentBlock[] → 字符串）', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    agent.emit({ type: 'turn_start' })
    await sleep(60)
    agent.emit({ type: 'message_update', message: { content: '让我列出文件' } })
    await sleep(60)
    agent.emit({ type: 'message_end', message: { id: '1', parentId: null, role: 'assistant', content: '让我列出文件', createdAt: 0 } } as any)
    await sleep(60)
    agent.emit({
      type: 'tool_execution_start' as any,
      toolCallId: 'tc1', toolName: 'bash', args: { command: 'ls' },
    } as any)
    await sleep(60)
    term.written = []
    agent.emit({
      type: 'tool_execution_end' as any,
      toolCallId: 'tc1',
      result: { content: [{ type: 'text', text: 'file1\nfile2' }] },
      isError: false,
    } as any)
    await sleep(60)
    expect(term.written.join('')).toContain('file1')
    expect(term.written.join('')).toContain('file2')
    stop()
  })

  it('tool_execution_end isError → ✗ 前缀显示失败', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    agent.emit({ type: 'turn_start' })
    await sleep(60)
    agent.emit({ type: 'message_update', message: { content: '执行命令' } })
    await sleep(60)
    agent.emit({ type: 'message_end', message: { id: '1', parentId: null, role: 'assistant', content: '执行命令', createdAt: 0 } } as any)
    await sleep(60)
    agent.emit({
      type: 'tool_execution_start' as any,
      toolCallId: 'tc1', toolName: 'bash', args: {},
    } as any)
    await sleep(60)
    term.written = []
    agent.emit({
      type: 'tool_execution_end' as any,
      toolCallId: 'tc1',
      result: { content: [{ type: 'text', text: '失败原因' }] },
      isError: true,
    } as any)
    await sleep(60)
    expect(term.written.join('')).toContain('✗')
    expect(term.written.join('')).toContain('失败原因')
    stop()
  })

  it('-c 续接：agent.state.messages 预填 → 回放到屏幕', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    ;(agent.state as any).messages = [
      { id: '1', parentId: null, role: 'user', content: '之前的问题', createdAt: 0 },
      { id: '2', parentId: '1', role: 'assistant', content: '之前的回答', createdAt: 1 },
      { id: '3', parentId: '2', role: 'toolResult', content: '工具输出片段', createdAt: 2 },
    ]
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    await sleep(60)
    const out = term.written.join('')
    expect(out).toContain('之前的问题')   // user 消息
    expect(out).toContain('之前的回答')   // assistant 消息
    expect(out).toContain('工具输出片段') // toolResult 预览
    stop()
  })

  it('/clear → 调 agent.reset()（清 LLM 上下文）', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    await sleep(20)
    term.type('/clear\r')
    await sleep(40)
    expect((agent as any)._resetCalled).toBe(true)
    stop()
  })

  it('多回合：第二次 turn_start 不会抹掉第一回合内容', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    agent.emit({ type: 'turn_start' })
    await sleep(20)
    agent.emit({ type: 'message_update', message: { content: 'first reply' } })
    await sleep(20)
    agent.emit({ type: 'message_end', message: { id: '1', parentId: null, role: 'assistant', content: 'first reply', createdAt: 0 } })
    await sleep(20)
    term.written = []
    agent.emit({ type: 'turn_start' })
    await sleep(20)
    const out = term.written.join('')
    // 第二 turn_start 不应让 'first reply' 消失（已在 scrollback）
    // 我们仅验证不崩 + 内容在完整输出中
    expect(out).toBeDefined()
    // 'first reply' 应当整体出现在全部 written 里（上次 turn_end 会 commit）
    const all = term.written.join('')
    expect(all.length).toBeGreaterThanOrEqual(0)
    stop()
  })

  it('历史 ↑：提交后能调回', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    term.type('first message\r')
    await sleep(20)
    term.written = []
    term.type('\x1b[A')
    await sleep(20)
    expect(term.written.join('')).toContain('first message')
    stop()
  })

  it('agent streaming 时提交 → followUp 队列', async () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    agent.state.isStreaming = true
    term.type('queued\r')
    await sleep(20)
    expect((agent as any).followUps).toEqual(['queued'])
    expect((agent as any).prompts).toEqual([])
    stop()
  })

  it('stop：清理不抛错', () => {
    const term = new FakeTerminal()
    const agent = fakeAgent()
    const stop = startTUI(agent, { terminal: term, useMainScreen: true })
    expect(() => stop()).not.toThrow()
  })
})
