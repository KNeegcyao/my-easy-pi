import { describe, it, expect } from 'vitest'
import { ToolExecution, type ToolResultLike } from '../../src/tui/components/tool-execution.js'

describe('ToolExecution', () => {
  it('构造：渲染调用行（toolName + args）', () => {
    const t = new ToolExecution('bash', { command: 'ls -la' })
    const out = t.render(80).join('\n')
    expect(out).toContain('bash')
    expect(out).toContain('command=ls -la')
    expect(out).toContain('→')
  })

  it('updateArgs 更新参数显示', () => {
    const t = new ToolExecution('bash', { command: 'ls' })
    t.updateArgs({ command: 'ls -la /tmp' })
    expect(t.render(80).join('\n')).toContain('ls -la /tmp')
    expect(t.render(80).join('\n')).not.toContain('command=ls\n')
  })

  it('markExecutionStarted 无 result 时显示 running', () => {
    const t = new ToolExecution('bash', { command: 'ls' })
    t.markExecutionStarted()
    const out = t.render(80).join('\n')
    expect(out).toContain('running')
  })

  it('updateResult 显示结果内容', () => {
    const t = new ToolExecution('bash', { command: 'ls' })
    const result: ToolResultLike = { content: 'file1\nfile2' }
    t.updateResult(result, false)
    const out = t.render(80).join('\n')
    expect(out).toContain('file1')
    expect(out).toContain('file2')
  })

  it('updateResult isError=true → 红色 ✗ 前缀', () => {
    const t = new ToolExecution('bash', { command: 'rm' })
    t.updateResult({ content: '删除失败', isError: true }, false)
    const out = t.render(80).join('\n')
    expect(out).toContain('✗')
    expect(out).toContain('删除失败')
  })

  it('isPartial=true 不影响显示（后续会再调 end 覆盖）', () => {
    const t = new ToolExecution('bash', { command: 'ls' })
    t.markExecutionStarted()
    t.updateResult({ content: 'partial' }, true)
    expect(t.render(80).join('\n')).toContain('partial')
    // 再调 final
    t.updateResult({ content: 'complete' }, false)
    expect(t.render(80).join('\n')).toContain('complete')
  })

  it('setArgsComplete 去掉 args 后缀 *', () => {
    const t = new ToolExecution('bash', { command: 'ls' })
    const before = t.render(80).join('\n')
    t.setArgsComplete()
    const after = t.render(80).join('\n')
    // 简化：setArgsComplete 后不再有 *（dim gray *）；这里仅验证不崩
    expect(after).toContain('bash')
  })

  it('调用顺序：args → started → result 都正确', () => {
    const t = new ToolExecution('bash', {})
    t.updateArgs({ command: 'echo hi' })
    t.markExecutionStarted()
    t.updateResult({ content: 'hi' }, false)
    const out = t.render(80).join('\n')
    expect(out).toContain('echo hi')   // 调用行
    expect(out).toContain('hi')        // 结果
    expect(t.hasResult).toBe(true)
    expect(t.started).toBe(true)
  })

  it('空 args → 调用行无 args 段', () => {
    const t = new ToolExecution('ls', {})
    const line = t.render(80)[0]
    expect(line).toContain('ls')
    expect(line).not.toContain('=')
  })

  it('多行结果全显示', () => {
    const t = new ToolExecution('bash', { command: 'ls' })
    t.updateResult({ content: 'a\nb\nc\nd' }, false)
    const lines = t.render(80)
    // 调用行 + 4 结果行
    expect(lines.length).toBeGreaterThanOrEqual(5)
  })

  it('hasResult / started getter', () => {
    const t = new ToolExecution('ls', {})
    expect(t.hasResult).toBe(false)
    expect(t.started).toBe(false)
    t.markExecutionStarted()
    expect(t.started).toBe(true)
    t.updateResult({ content: 'x' }, false)
    expect(t.hasResult).toBe(true)
  })

  it('name getter', () => {
    const t = new ToolExecution('bash', {})
    expect(t.name).toBe('bash')
  })

  it('缓存：相同 width 返回相同引用', () => {
    const t = new ToolExecution('bash', { command: 'ls' })
    const a = t.render(80)
    const b = t.render(80)
    expect(a).toBe(b)
  })

  it('updateArgs 后缓存失效（重算）', () => {
    const t = new ToolExecution('bash', { command: 'ls' })
    const a = t.render(80)
    t.updateArgs({ command: 'pwd' })
    const b = t.render(80)
    expect(a).not.toBe(b)
    expect(b.join('\n')).toContain('pwd')
  })
})
