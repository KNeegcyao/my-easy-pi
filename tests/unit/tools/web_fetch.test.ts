import { describe, test, expect } from 'vitest'
import { createWebFetchTool } from '../../../examples/extensions/web_fetch.js'
import { MockOperations } from '../../../src/tools/__tests__/mock-operations.js'
import type { Operations } from '../../../src/tools/operations.js'

describe('webFetchTool（扩展示例）', () => {
  test('工具定义正确', () => {
    const tool = createWebFetchTool(new MockOperations())
    expect(tool.name).toBe('web_fetch')
    expect(tool.description).toBeTruthy()
    expect(tool.parameters).toBeDefined()
    expect(tool.execute).toBeInstanceOf(Function)
  })

  test('参数 Schema 要求 url 字段', () => {
    const tool = createWebFetchTool(new MockOperations())
    const schema = tool.parameters as Record<string, any>
    expect(schema.properties?.url).toBeDefined()
    expect(schema.required).toContain('url')
  })

  test('执行时通过 Operations.fetchUrl 获取内容', async () => {
    const ops = new MockOperations()
    ops.setFetchResult('hello world')
    const tool = createWebFetchTool(ops)
    const result = await tool.execute('tc-1', { url: 'https://example.com' }, new AbortController().signal)
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'hello world' })
  })

  test('内容超长时截断保护', async () => {
    const ops = new MockOperations()
    ops.setFetchResult('x'.repeat(200_000))
    const tool = createWebFetchTool(ops)
    const result = await tool.execute('tc-2', { url: 'https://example.com' }, new AbortController().signal)
    const text = (result.content[0] as { text: string }).text
    expect(text).toContain('内容已截断')
    expect(text.length).toBeLessThan(101_000)
  })

  test('请求失败时返回错误结果而非抛出异常', async () => {
    const ops: Operations = {
      ...new MockOperations(),
      async fetchUrl() {
        throw new Error('network down')
      },
    }
    const tool = createWebFetchTool(ops)
    const result = await tool.execute('tc-3', { url: 'https://example.com' }, new AbortController().signal)
    expect((result.content[0] as { text: string }).text).toContain('请求失败')
  })
})
