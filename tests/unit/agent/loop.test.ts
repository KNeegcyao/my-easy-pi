import { describe, test, expect, vi } from 'vitest'
import { Agent } from '../../../src/agent/loop.js'
import type { Model, LLMEvent, ModelContext, StreamOptions, ToolResult } from '../../../src/ai/types.js'
import type { AgentTool } from '../../../src/agent/types.js'

// ── 测试辅助：创建 Mock Model ──
function createMockModel(events: LLMEvent[]): Model {
  return {
    id: 'test-model',
    provider: 'test',
    supportsTools: () => true,
    supportsThinking: () => false,
    async *stream(_context: ModelContext, _options?: StreamOptions): AsyncIterable<LLMEvent> {
      for (const event of events) {
        yield event
      }
    },
  }
}

// ── 测试辅助：创建 Mock 工具 ──
function createMockTool(name: string, result?: ToolResult): AgentTool {
  return {
    name,
    description: `Mock ${name} tool`,
    parameters: {},
    async execute(_id: string, _params: Record<string, unknown>, _signal: AbortSignal) {
      return result || { content: [{ type: 'text', text: `${name} executed` }] }
    },
  }
}

// ── 测试辅助：创建 Agent 实例 ──
function createAgent(events: LLMEvent[] = [], tools: AgentTool[] = []) {
  const model = createMockModel(events)
  return new Agent({
    systemPrompt: '测试系统提示',
    model,
    tools,
    toolExecution: 'parallel',
  })
}

describe('Agent Loop', () => {
  test('基本流程：用户输入 → LLM 文本响应 → 结束', { timeout: 3000 }, async () => {
    const agent = createAgent([
      { type: 'text_delta', delta: '你好' },
      { type: 'text_delta', delta: '世界' },
      { type: 'done', stopReason: 'end_turn' },
    ])

    const eventTypes: string[] = []
    agent.subscribe((event) => { eventTypes.push(event.type) })

    await agent.prompt('测试消息')

    // 事件序列
    expect(eventTypes).toContain('agent_start')
    expect(eventTypes).toContain('turn_start')
    expect(eventTypes).toContain('turn_end')
    expect(eventTypes).toContain('agent_end')

    // 消息历史
    expect(agent.state.messages).toHaveLength(2)
    expect(agent.state.messages[0].role).toBe('user')
    expect(agent.state.messages[0].content).toBe('测试消息')
    expect(agent.state.messages[1].role).toBe('assistant')
    expect(agent.state.messages[1].content).toBe('你好世界')

    // 流式状态重置
    expect(agent.state.isStreaming).toBe(false)
  })

  test('工具调用流程：执行工具并返回结果', { timeout: 3000 }, async () => {
    // 使用计数器模型：第一轮调工具，第二轮文本回答
    let callCount = 0
    const countingModel: Model = {
      id: 'test-model', provider: 'test',
      supportsTools: () => true, supportsThinking: () => false,
      async *stream() {
        callCount++
        if (callCount === 1) {
          yield { type: 'tool_call_start', id: 'tc-1', name: 'bash', args: { command: 'ls' } } as LLMEvent
          yield { type: 'done', stopReason: 'tool_use' } as LLMEvent
        } else {
          yield { type: 'text_delta', delta: '完成' } as LLMEvent
          yield { type: 'done', stopReason: 'end_turn' } as LLMEvent
        }
      },
    }

    const bashTool = createMockTool('bash', {
      content: [{ type: 'text', text: '命令输出结果' }],
    })
    const executeSpy = vi.spyOn(bashTool, 'execute')

    const agent = new Agent({
      systemPrompt: '测试',
      model: countingModel,
      tools: [bashTool],
    })

    await agent.prompt('帮我执行 ls 命令')

    // 工具被调用（第 4 参 onUpdate 回调用于流式中间态）
    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(executeSpy).toHaveBeenCalledWith('tc-1', { command: 'ls' }, expect.any(AbortSignal), expect.any(Function))
  })

  test('工具执行结束后再调用 LLM', { timeout: 3000 }, async () => {
    // 模拟两轮交互：第一轮 LLM 调工具，第二轮 LLM 给最终回答
    let callCount = 0
    const model: Model = {
      id: 'test-model', provider: 'test',
      supportsTools: () => true, supportsThinking: () => false,
      async *stream() {
        callCount++
        if (callCount === 1) {
          // 第一轮：调工具
          yield { type: 'tool_call_start', id: 'tc-1', name: 'bash', args: { command: 'ls' } } as LLMEvent
          yield { type: 'done', stopReason: 'tool_use' } as LLMEvent
        } else {
          // 第二轮：文字回答
          yield { type: 'text_delta', delta: '已完成' } as LLMEvent
          yield { type: 'done', stopReason: 'end_turn' } as LLMEvent
        }
      },
    }

    const bashTool = createMockTool('bash', {
      content: [{ type: 'text', text: 'ls 结果' }],
    })

    const agent = new Agent({
      systemPrompt: '测试',
      model,
      tools: [bashTool],
    })

    await agent.prompt('执行 ls')

    // LLM 被调用了两次
    expect(callCount).toBe(2)
    // 消息历史：user → assistant(tool call) → toolResult → assistant(回答)
    expect(agent.state.messages.length).toBeGreaterThanOrEqual(4)
  })

  test('工具不存在时返回错误', { timeout: 3000 }, async () => {
    let callCount = 0
    const countingModel: Model = {
      id: 'test-model', provider: 'test',
      supportsTools: () => true, supportsThinking: () => false,
      async *stream() {
        callCount++
        if (callCount === 1) {
          yield { type: 'tool_call_start', id: 'tc-1', name: 'nonexistent', args: { dummy: true } } as LLMEvent
          yield { type: 'done', stopReason: 'tool_use' } as LLMEvent
        } else {
          yield { type: 'text_delta', delta: '完成' } as LLMEvent
          yield { type: 'done', stopReason: 'end_turn' } as LLMEvent
        }
      },
    }

    const agent = new Agent({
      systemPrompt: '测试',
      model: countingModel,
      tools: [],
    })

    await agent.prompt('调用不存在的工具')

    const toolResults = agent.state.messages.filter(m => m.role === 'toolResult')
    expect(toolResults).toHaveLength(1)
    expect(toolResults[0].isError).toBe(true)
  })

  test('LLM 返回错误不崩溃', { timeout: 3000 }, async () => {
    const agent = createAgent([
      { type: 'error', message: 'API 调用失败' },
    ])

    await expect(agent.prompt('测试')).resolves.not.toThrow()
    expect(agent.state.errorMessage).toBe('API 调用失败')
  })

  test('流式处理中再次调用 prompt 会抛出错误', { timeout: 3000 }, async () => {
    const agent = createAgent([
      { type: 'text_delta', delta: 'a' },
      { type: 'done', stopReason: 'end_turn' },
    ])

    const promise1 = agent.prompt('消息1')

    await expect(agent.prompt('消息2')).rejects.toThrow()

    await promise1
  })

  test('abort 中断操作', { timeout: 5000 }, async () => {
    // 用延迟模型来测试中断
    const slowModel: Model = {
      id: 'test', provider: 'test',
      supportsTools: () => true, supportsThinking: () => false,
      async *stream() {
        await new Promise(r => setTimeout(r, 50))
        yield { type: 'text_delta', delta: 'a' } as LLMEvent
        yield { type: 'done', stopReason: 'end_turn' } as LLMEvent
      },
    }

    const agent = new Agent({ systemPrompt: 'x', model: slowModel, tools: [] })
    const promise = agent.prompt('测试')
    agent.abort()

    await expect(promise).resolves.not.toThrow()
    expect(agent.state.isStreaming).toBe(false)
  })

  test('reset 重置状态', { timeout: 3000 }, async () => {
    const agent = createAgent([
      { type: 'text_delta', delta: '测试' },
      { type: 'done', stopReason: 'end_turn' },
    ])

    await agent.prompt('消息')
    expect(agent.state.messages.length).toBeGreaterThan(0)

    agent.reset()
    expect(agent.state.messages).toHaveLength(0)
    expect(agent.state.isStreaming).toBe(false)
    expect(agent.state.pendingToolCalls.size).toBe(0)
  })

  test('subscribe/unsubscribe', async () => {
    const agent = createAgent()
    const unsub = agent.subscribe(() => {})
    expect(typeof unsub).toBe('function')
  })

  test('多个订阅者', { timeout: 3000 }, async () => {
    const agent = createAgent([
      { type: 'text_delta', delta: '测试' },
      { type: 'done', stopReason: 'end_turn' },
    ])

    const events1: string[] = []
    const events2: string[] = []
    agent.subscribe((event) => { events1.push(event.type) })
    agent.subscribe((event) => { events2.push(event.type) })

    await agent.prompt('消息')

    expect(events1.length).toBeGreaterThan(0)
    expect(events2.length).toBeGreaterThan(0)
    expect(events1).toEqual(events2)
  })

  test('订阅者出错不影响其他', { timeout: 3000 }, async () => {
    const agent = createAgent([
      { type: 'text_delta', delta: '测试' },
      { type: 'done', stopReason: 'end_turn' },
    ])

    const events: string[] = []
    agent.subscribe(() => { throw new Error('err') })
    agent.subscribe((event) => { events.push(event.type) })

    await expect(agent.prompt('消息')).resolves.not.toThrow()
    expect(events.length).toBeGreaterThan(0)
  })
})

describe('Agent Loop — 消息队列', () => {
  test('steer 和 followUp 管理消息', () => {
    const agent = createAgent()
    agent.steer('高优先级')
    agent.followUp('低优先级')
    // 不验证队列内部状态，只验证不报错
  })
})

describe('Agent Loop — 工具执行钩子', () => {
  test('beforeToolCall 阻止工具执行', { timeout: 3000 }, async () => {
    let callCount = 0
    const countingModel: Model = {
      id: 'test-model', provider: 'test',
      supportsTools: () => true, supportsThinking: () => false,
      async *stream() {
        callCount++
        if (callCount === 1) {
          yield { type: 'tool_call_start', id: 'tc-1', name: 'bash', args: { command: 'rm -rf' } } as LLMEvent
          yield { type: 'done', stopReason: 'tool_use' } as LLMEvent
        } else {
          yield { type: 'text_delta', delta: '完成' } as LLMEvent
          yield { type: 'done', stopReason: 'end_turn' } as LLMEvent
        }
      },
    }

    const bashTool = createMockTool('bash', {
      content: [{ type: 'text', text: '不应该执行' }],
    })
    const executeSpy = vi.spyOn(bashTool, 'execute')

    const agent = new Agent({
      systemPrompt: '测试',
      model: countingModel,
      tools: [bashTool],
      beforeToolCall: async () => ({ block: true, reason: '危险命令被阻止' }),
    })

    await agent.prompt('删除文件')

    // 工具没有被执行
    expect(executeSpy).not.toHaveBeenCalled()
  })

  test('工具执行出错', { timeout: 3000 }, async () => {
    let callCount = 0
    const countingModel: Model = {
      id: 'test-model', provider: 'test',
      supportsTools: () => true, supportsThinking: () => false,
      async *stream() {
        callCount++
        if (callCount === 1) {
          yield { type: 'tool_call_start', id: 'tc-1', name: 'broken', args: { dummy: true } } as LLMEvent
          yield { type: 'done', stopReason: 'tool_use' } as LLMEvent
        } else {
          yield { type: 'text_delta', delta: '完成' } as LLMEvent
          yield { type: 'done', stopReason: 'end_turn' } as LLMEvent
        }
      },
    }

    const brokenTool: AgentTool = {
      name: 'broken', description: '出错工具', parameters: {},
      async execute() { throw new Error('工具内部错误') },
    }

    const agent = new Agent({
      systemPrompt: '测试',
      model: countingModel,
      tools: [brokenTool],
    })

    await agent.prompt('测试')

    const toolResults = agent.state.messages.filter(m => m.role === 'toolResult')
    expect(toolResults).toHaveLength(1)
    expect(toolResults[0].isError).toBe(true)
  })

  test('terminate 终止循环', { timeout: 3000 }, async () => {
    const terminateTool = createMockTool('bash', {
      content: [{ type: 'text', text: '终止' }],
      terminate: true,
    })

    let callCount = 0
    const countingModel: Model = {
      id: 'test-model', provider: 'test',
      supportsTools: () => true, supportsThinking: () => false,
      async *stream() {
        callCount++
        yield { type: 'tool_call_start', id: 'tc-1', name: 'bash', args: { command: 'exit' } } as LLMEvent
        yield { type: 'done', stopReason: 'tool_use' } as LLMEvent
      },
    }

    const agent = new Agent({
      systemPrompt: '测试',
      model: countingModel,
      tools: [terminateTool],
    })

    await agent.prompt('结束')

    // 最后一条消息是 toolResult（没有继续调 LLM）
    const lastMsg = agent.state.messages[agent.state.messages.length - 1]
    expect(lastMsg.role).toBe('toolResult')
    // LLM 只被调用一次
    expect(callCount).toBe(1)
  })
})