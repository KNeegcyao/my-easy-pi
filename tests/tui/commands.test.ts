import { describe, it, expect } from 'vitest'
import { executeCommand, recordTokenUsage } from '../../src/interface/tui/commands.js'
import type { Agent } from '../../src/agent/index.js'
import { createAgentState } from '../../src/agent/state.js'
import type { Model } from '../../src/ai/types.js'

/** 创建 mock 模型实例 */
function createModel(opts: { id: string; provider: string }): Model {
  return {
    id: opts.id,
    provider: opts.provider,
    stream: async function* () {},
    supportsTools: () => true,
    supportsThinking: () => true,
  }
}

function createMockAgent(overrides?: Partial<Agent['state']>): Agent {
  const state = createAgentState({
    systemPrompt: '你是一个 AI 助手',
    model: createModel({ id: 'claude-sonnet-4', provider: 'anthropic' }),
    messages: [
      { id: '1', parentId: null, role: 'user', content: 'hi', createdAt: 1000 },
      { id: '2', parentId: null, role: 'assistant', content: 'hello!', createdAt: 1001 },
      { id: '3', parentId: null, role: 'user', content: 'how are you?', createdAt: 1002 },
      { id: '4', parentId: null, role: 'assistant', content: 'I\'m great!', createdAt: 1003 },
      { id: '5', parentId: null, role: 'user', content: 'list tools', createdAt: 1004 },
      { id: '6', parentId: null, role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'bash', args: {} }], createdAt: 1005 },
      { id: '7', parentId: null, role: 'toolResult', content: 'ok', toolCallId: 'tc1', createdAt: 1006 },
      { id: '8', parentId: null, role: 'assistant', content: 'done', createdAt: 1007 },
    ],
  })
  return {
    state: { ...state, ...overrides },
    prompt: async () => {},
    subscribe: () => () => {},
    reset: () => {},
    abort: () => {},
    followUp: () => {},
    steer: () => {},
    waitForIdle: async () => {},
    clearSteeringQueue: () => {},
    clearFollowUpQueue: () => {},
    clearAllQueues: () => {},
  } as unknown as Agent
}

describe('executeCommand — /stats', () => {
  it('显示消息数量和各角色分布', () => {
    const agent = createMockAgent()
    const result = executeCommand('/stats', agent)
    expect(result).not.toBeNull()
    expect(result!.output).toContain('8')      // 总消息数
    expect(result!.output).toContain('3')      // user
    expect(result!.output).toContain('4')      // assistant (含 1 条带 toolCalls)
    expect(result!.output).toContain('1')      // toolResult
    expect(result!.output).toContain('anthropic/claude-sonnet-4')
  })
})

describe('executeCommand — /thinking', () => {
  it('无参数时显示当前思考级别', () => {
    const agent = createMockAgent()
    const result = executeCommand('/thinking', agent)
    expect(result).not.toBeNull()
    expect(result!.output).toContain('off')
  })

  it('设置有效思考级别', () => {
    const agent = createMockAgent()
    const result = executeCommand('/thinking high', agent)
    expect(result).not.toBeNull()
    expect(result!.output).toContain('high')
    expect(agent.state.thinkingLevel).toBe('high')
  })

  it('无效级别返回错误', () => {
    const agent = createMockAgent()
    const result = executeCommand('/thinking ultra', agent)
    expect(result).not.toBeNull()
    expect(result!.output).toContain('✗')
  })
})

describe('executeCommand — /system', () => {
  it('无参数时显示当前 system prompt', () => {
    const agent = createMockAgent()
    const result = executeCommand('/system', agent)
    expect(result).not.toBeNull()
    expect(result!.output).toContain('AI 助手')
  })

  it('更新 system prompt', () => {
    const agent = createMockAgent()
    const result = executeCommand('/system 你是代码审查专家', agent)
    expect(result).not.toBeNull()
    expect(result!.output).toContain('已更新')
    expect(result!.output).toContain('8 字符')
    expect(agent.state.systemPrompt).toBe('你是代码审查专家')
  })
})