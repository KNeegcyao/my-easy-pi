import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import {
  parseArgs,
  buildTools,
  buildModel,
  buildConfirmFn,
  buildAgent,
  shouldUseTUI,
  resolveUserMessage,
  type ParsedArgs,
} from '../../../src/cli.js'
import { PermissionManager } from '../../../src/agent/index.js'
import { Compactor } from '../../../src/session/index.js'
import { AnthropicProvider } from '../../../src/ai/index.js'

// 构造一个真实但可断开的 model（不发起网络）
function fakeAnthropicModel() {
  const factory = AnthropicProvider.create({ apiKey: 'sk-fake' })
  return factory.createModel('claude-sonnet-4-20250514')!
}

const ORIG_TTY = process.stdin.isTTY
const ORIG_STDIN = process.stdin

afterEach(() => {
  // restore stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value: ORIG_TTY, configurable: true })
})

// ── parseArgs ──
describe('parseArgs', () => {
  test('无参默认 output=print', () => {
    const a = parseArgs([])
    expect(a.output).toBe('print')
    expect(a.tui).toBeUndefined()
  })

  test('解析 -m / --provider / --model', () => {
    const a = parseArgs(['-m', '你好', '--provider', 'openai', '--model', 'gpt-4o'])
    expect(a.message).toBe('你好')
    expect(a.provider).toBe('openai')
    expect(a.model).toBe('gpt-4o')
  })

  test('解析 -i / --main-screen 组合', () => {
    const a = parseArgs(['-i', '--main-screen'])
    expect(a.tui).toBe(true)
    expect(a.mainScreen).toBe(true)
  })

  test('解析链式标志 -c -l', () => {
    const a = parseArgs(['-c', '-l'])
    expect(a.continue).toBe(true)
    expect(a.list).toBe(true)
  })

  test('--delete 带参数', () => {
    const a = parseArgs(['--delete', 'abc-123'])
    expect(a.deleteSession).toBe('abc-123')
  })
})

// ── buildTools ──
describe('buildTools', () => {
  test('注册 8 个内置工具', () => {
    const reg = buildTools()
    const names = reg.listTools().map(t => t.name).sort()
    expect(names).toEqual(['bash', 'edit', 'find', 'grep', 'ls', 'read', 'web_fetch', 'write'].sort())
  })

  test('每次调用返回独立实例', () => {
    const a = buildTools()
    const b = buildTools()
    expect(a).not.toBe(b)
    a.registerTool({ name: 'x', description: '', parameters: {} } as never)
    expect(b.listTools().some(t => t.name === 'x')).toBe(false)
  })
})

// ── buildModel ──
describe('buildModel', () => {
  test('合法 provider+model 返回 model', () => {
    const r = buildModel('anthropic', 'claude-sonnet-4-20250514', 'sk-test')
    expect('model' in r).toBe(true)
    if ('model' in r) {
      expect(r.model.id).toBe('claude-sonnet-4-20250514')
      expect(r.model.provider).toBe('anthropic')
    }
  })

  test('未知 provider 返回 PROVIDER_NOT_FOUND（先于 key 校验，main 真实可达）', () => {
    const r = buildModel('ghost', 'whatever')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error.code).toBe('PROVIDER_NOT_FOUND')
  })

  test('已知 provider 缺 key 返回 AUTH_API_KEY_MISSING', () => {
    const r = buildModel('openai', 'gpt-4o', undefined)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error.code).toBe('AUTH_API_KEY_MISSING')
  })

  test('已知 provider 且有 key，但 model 不存在返回 MODEL_NOT_FOUND', () => {
    const r = buildModel('openai', 'not-a-real-model', 'sk-test')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error.code).toBe('MODEL_NOT_FOUND')
  })
})

// ── buildConfirmFn ──
describe('buildConfirmFn', () => {
  test('非 TTY 返回 undefined', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    expect(buildConfirmFn(false)).toBeUndefined()
  })

  test('TTY 返回函数', () => {
    expect(typeof buildConfirmFn(true)).toBe('function')
  })
})

// ── buildAgent ──
describe('buildAgent', () => {
  test('装配 Agent：注入 tools / model / 权限与压缩钩子', () => {
    const model = fakeAnthropicModel()
    const tools = buildTools().listTools()
    const permission = new PermissionManager({ confirm: undefined })
    const compactor = new Compactor()
    const agent = buildAgent({ model, tools, permission, compactor })
    expect(agent.state.tools.map(t => t.name)).toEqual(tools.map(t => t.name))
    expect(agent.state.model.id).toBe(model.id)
    // system prompt 被注入
    expect(agent.state.systemPrompt).toContain('piagent')
  })
})

// ── shouldUseTUI ──
describe('shouldUseTUI', () => {
  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  })

  test('显式 -i 强制 TUI', () => {
    expect(shouldUseTUI({ output: 'print', tui: true })).toBe(true)
  })

  test('有 -m 消息不自动 TUI', () => {
    expect(shouldUseTUI({ output: 'print', message: 'hi' })).toBe(false)
  })

  test('非 print 输出模式不自动 TUI', () => {
    expect(shouldUseTUI({ output: 'json' })).toBe(false)
  })

  test('无参 TTY+print 自动 TUI', () => {
    expect(shouldUseTUI({ output: 'print' })).toBe(true)
  })

  test('非 TTY 不自动 TUI', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    expect(shouldUseTUI({ output: 'print' })).toBe(false)
  })
})

// ── resolveUserMessage ──
describe('resolveUserMessage', () => {
  test('-m 优先', async () => {
    const r = await resolveUserMessage({ output: 'print', message: '直接消息' })
    expect(r).toBe('直接消息')
  })

  test('-p 作为 prompt（无 stdin 管道时）', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    const r = await resolveUserMessage({ output: 'print', prompt: '只 prompt' })
    expect(r).toBe('只 prompt')
  })
})
