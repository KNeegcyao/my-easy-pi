import { describe, it, expect } from 'vitest'
import { convertOpenAIEvent } from '../../../src/ai/openai-compat.js'

describe('convertOpenAIEvent — 流式保真', () => {
  it('纯文本 chunk 只发射文本增量', () => {
    const events = convertOpenAIEvent({
      choices: [{ delta: { content: '你' } }],
    })
    expect(events).toEqual([{ type: 'text_delta', delta: '你' }])
  })

  it('纯工具 chunk 只发射工具增量', () => {
    const events = convertOpenAIEvent({
      choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc1', function: { name: 'bash', arguments: '{"cmd":"ls"}' } }] } }],
    })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('tool_call_start')
    expect(events[0]).toMatchObject({ id: 'tc1', name: 'bash' })
  })

  it('同一 chunk 同时含文本与工具时两者都不丢失', () => {
    const events = convertOpenAIEvent({
      choices: [{
        delta: {
          content: '让我执行命令',
          tool_calls: [{ index: 0, id: 'tc2', function: { name: 'bash', arguments: '{"cmd":"pwd"}' } }],
        },
      }],
    })
    // 必须同时包含文本增量 与 工具开始事件（修复前会因先取 content 丢弃工具）
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ type: 'text_delta', delta: '让我执行命令' })
    expect(events[1]).toMatchObject({ type: 'tool_call_start', id: 'tc2', name: 'bash' })
  })

  it('工具增量参数不完整时按流式处理（发射 tool_call_start 空参）', () => {
    const events = convertOpenAIEvent({
      choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc3', function: { name: 'bash', arguments: '{"cmd":' } }] } }],
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'tool_call_start', id: 'tc3', name: 'bash', args: {} })
  })

  it('流结束标记映射为 done', () => {
    const events = convertOpenAIEvent({
      choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
    })
    expect(events[0]).toEqual({ type: 'done', stopReason: 'end_turn' })
  })
})