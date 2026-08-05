import { describe, test, expect } from 'vitest'
import { ExtensionAPI } from '../../../src/extension/api.js'
import { bashTool } from '../../../src/tools/builtin/bash.js'
import { ToolRegistry } from '../../../src/tools/registry.js'

describe('ExtensionAPI', () => {
  test('registerTool 注册工具到 registry', () => {
    const registry = new ToolRegistry()
    const api = new ExtensionAPI(registry, null as any)
    api.registerTool(bashTool)
    expect(registry.getTool('bash')).toBeDefined()
  })

  test('unregisterTool 移除工具', () => {
    const registry = new ToolRegistry()
    const api = new ExtensionAPI(registry, null as any)
    api.registerTool(bashTool)
    api.unregisterTool('bash')
    expect(registry.getTool('bash')).toBeUndefined()
  })

  test('listCommands 返回空列表初始', () => {
    const registry = new ToolRegistry()
    const api = new ExtensionAPI(registry, null as any)
    expect(api.listCommands()).toEqual([])
  })
})