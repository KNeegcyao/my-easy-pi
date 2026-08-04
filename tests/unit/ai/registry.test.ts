import { describe, test, expect } from 'vitest'
import { ModelRegistry } from '../../../src/ai/registry.js'

describe('ModelRegistry', () => {
  test('创建注册表后 providers 为空', () => {
    const registry = new ModelRegistry()
    expect(registry.listModels()).toEqual([])
  })

  test('注册 unknown 提供商返回 null', () => {
    const registry = new ModelRegistry()
    const model = registry.getModel('unknown', 'test-model')
    expect(model).toBeNull()
  })
})