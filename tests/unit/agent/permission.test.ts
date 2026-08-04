import { describe, test, expect } from 'vitest'
import { PermissionManager, RiskLevel } from '../../../src/agent/permission.js'
import type { ToolCallContext } from '../../../src/agent/loop.js'

function createContext(name: string, command: string): ToolCallContext {
  return {
    toolCall: { id: 'test-1', name, args: { command } },
    args: { command },
    messages: [],
  }
}

describe('PermissionManager', () => {
  test('安全命令直接放行', async () => {
    const pm = new PermissionManager()
    const result = await pm.check(createContext('bash', 'ls -la'))
    expect(result).toBeUndefined()
  })

  test('危险命令在非交互环境被拒绝', async () => {
    const pm = new PermissionManager()
    const result = await pm.check(createContext('bash', 'rm -rf /'))
    expect(result).toBeDefined()
    expect(result?.block).toBe(true)
    expect(result?.reason).toContain('已自动拒绝')
  })

  test('非 bash 工具不拦截', async () => {
    const pm = new PermissionManager()
    const result = await pm.check(createContext('read', 'xxx'))
    expect(result).toBeUndefined()
  })

  test('clearApproved 重置缓存', () => {
    const pm = new PermissionManager()
    pm['approved'].add('test-command')
    expect(pm['approved'].has('test-command')).toBe(true)
    pm.clearApproved()
    expect(pm['approved'].has('test-command')).toBe(false)
  })
})