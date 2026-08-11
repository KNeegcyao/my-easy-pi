import { describe, it, expect } from 'vitest'
import { AssistantTurn, userPromptLine, mutedLine } from '../../src/tui/components/assistant-turn.js'
import { Text } from '../../src/tui/components/text.js'
import { Container } from '../../src/tui/layout/container.js'

describe('AssistantTurn', () => {
  it('初始 render → 占位 1 行（无内容但保留行）', () => {
    const t = new AssistantTurn()
    expect(t.render(80)).toEqual([''])
  })

  it('updateContent 流式 → markdown 进 contentContainer', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'hello **world**' }, true)
    const lines = t.render(80)
    expect(lines.join('')).toContain('hello')
    expect(lines.join('')).toContain('world')
  })

  it('updateContent 末尾追加 Spacer（与 pi 对齐）', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'hello' }, true)
    const lines = t.render(80)
    // pi 模式：Spacer(1) 在 Markdown 之前，所以 lines[0] 是空行
    expect(lines[0]).toBe('')
  })

  it('updateContent 多次调用内容替换（不累积）', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'first' }, true)
    const l1 = t.render(80).join('')
    t.updateContent({ content: 'second longer text' }, true)
    const l2 = t.render(80).join('')
    expect(l1).toContain('first')
    expect(l1).not.toContain('second')
    expect(l2).toContain('second')
    expect(l2).not.toContain('first')
  })

  it('updateContent isStreaming=false 不应丢内容', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'hello' }, true)
    t.updateContent({ content: 'hello final' }, false)
    const lines = t.render(80)
    expect(lines.join('')).toContain('hello final')
  })

  it('stopReason=aborted + isStreaming=false → 追加错误文案', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'partial', stopReason: 'aborted' }, false)
    const out = t.render(80).join('')
    expect(out).toContain('已中止')
  })

  it('stopReason=aborted 但 isStreaming=true → 不显示错误（流式中不算 abort）', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'partial', stopReason: 'aborted' }, true)
    const out = t.render(80).join('')
    expect(out).not.toContain('已中止')
  })

  it('stopReason=length + isStreaming=false → 显示截断提示', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'x', stopReason: 'length' }, false)
    expect(t.render(80).join('')).toContain('截断')
  })

  it('custom errorMessage 覆盖默认文案', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'x', stopReason: 'error', errorMessage: '网络断了' }, false)
    expect(t.render(80).join('')).toContain('网络断了')
  })

  it('addToolExecution 后，updateContent clear contentContainer 不丢工具组件', () => {
    const t = new AssistantTurn()
    const tool = new Text('--tool--')
    t.addToolExecution(tool)
    t.updateContent({ content: 'assistant says' }, true)
    const out = t.render(80).join('')
    // 工具行应保留（在 toolsContainer，不是 contentContainer）
    expect(out).toContain('--tool--')
    expect(out).toContain('assistant says')
  })

  it('addToolExecution 多个工具按顺序保留', () => {
    const t = new AssistantTurn()
    t.addToolExecution(new Text('tool1'))
    t.addToolExecution(new Text('tool2'))
    t.updateContent({ content: 'msg' }, true)
    const lines = t.render(80).join('')
    expect(lines).toContain('tool1')
    expect(lines).toContain('tool2')
  })

  it('getToolsContainer 返回 toolsContainer', () => {
    const t = new AssistantTurn()
    expect(t.getToolsContainer()).toBeInstanceOf(Container)
    expect(t.getToolsContainer().childCount).toBe(0)
  })

  it('invalidate 清缓存', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: 'a' }, true)
    const a = t.render(80)
    // 改内部状态（通过重新 updateContent）
    t.updateContent({ content: 'b' }, true)
    const b = t.render(80)
    expect(a).not.toEqual(b)
  })

  it('不缓存：嵌套 tool 变化能向上反映', () => {
    // AssistantTurn 不缓存自身（与 Container 一致），让子组件变化透传
    const t = new AssistantTurn()
    t.updateContent({ content: 'msg' }, true)
    const a = t.render(80).join('')
    // 加一个 tool 子组件，不应需要手动 invalidate turn 才能看到
    t.addToolExecution(new Text('tool-line'))
    const b = t.render(80).join('')
    expect(b).toContain('tool-line')
  })

  it('空内容 + 无 tool → render 返回占位 1 行', () => {
    const t = new AssistantTurn()
    t.updateContent({ content: '' }, true)
    expect(t.render(80)).toEqual([''])
  })

  it('streaming 标记可读', () => {
    const t = new AssistantTurn()
    expect(t.streaming).toBe(true)  // 初始默认
    t.updateContent({ content: 'x' }, false)
    expect(t.streaming).toBe(false)
  })
})

describe('helper functions', () => {
  it('userPromptLine 加 > 前缀', () => {
    expect(userPromptLine('hello')).toBe('> hello')
  })

  it('mutedLine 加 dim gray 前缀', () => {
    const s = mutedLine('已加入队列')
    expect(s).toContain('\x1b[2m')   // dim
    expect(s).toContain('\x1b[90m') // gray
    expect(s).toContain('已加入队列')
  })
})
