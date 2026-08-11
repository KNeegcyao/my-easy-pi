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

  test('复合只读命令（cd X && find Y）放行', async () => {
    const pm = new PermissionManager()
    const r = await pm.check(createContext('bash', 'cd /tmp && find . -type d | sort'))
    expect(r).toBeUndefined()   // 各段全 safe → 不拦截
  })

  test('for 循环只读体放行（for d in ...; do echo $d; done）', async () => {
    const pm = new PermissionManager()
    const r = await pm.check(createContext('bash', 'for d in agent ai config; do echo $d; done'))
    expect(r).toBeUndefined()
  })

  test('复合命令含危险段被拦（cd X && rm -rf Y）', async () => {
    const pm = new PermissionManager()
    const r = await pm.check(createContext('bash', 'cd /tmp && rm -rf /'))
    expect(r).toBeDefined()
    expect(r?.block).toBe(true)
  })

  test('for 循环危险体被拦（do rm -rf $d）', async () => {
    const pm = new PermissionManager()
    const r = await pm.check(createContext('bash', 'for d in .; do rm -rf $d; done'))
    expect(r).toBeDefined()
    expect(r?.block).toBe(true)
  })

  test('管道只读命令放行（ls -la | grep foo | wc -l）', async () => {
    const pm = new PermissionManager()
    const r = await pm.check(createContext('bash', 'ls -la | grep foo | wc -l'))
    expect(r).toBeUndefined()
  })

  test('cat 大文件读仍 safe（只读）', async () => {
    const pm = new PermissionManager()
    const r = await pm.check(createContext('bash', 'cat README.md | head -50'))
    expect(r).toBeUndefined()
  })

  test('head -N 读文件 safe', async () => {
    const pm = new PermissionManager()
    const r = await pm.check(createContext('bash', 'head -30 src/cli.ts'))
    expect(r).toBeUndefined()
  })
})