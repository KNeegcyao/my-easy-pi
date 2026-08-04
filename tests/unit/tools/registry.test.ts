import { describe, test, expect } from 'vitest'
import { ToolRegistry } from '../../../src/tools/registry.js'
import { bashTool } from '../../../src/tools/builtin/bash.js'
import { readTool } from '../../../src/tools/builtin/read.js'
import { writeTool } from '../../../src/tools/builtin/write.js'
import { editTool } from '../../../src/tools/builtin/edit.js'
import { grepTool } from '../../../src/tools/builtin/grep.js'
import { findTool } from '../../../src/tools/builtin/find.js'
import { lsTool } from '../../../src/tools/builtin/ls.js'

describe('ToolRegistry', () => {
  test('注册和获取工具', () => {
    const registry = new ToolRegistry()
    registry.registerTool(bashTool)
    expect(registry.getTool('bash')).toBeDefined()
    expect(registry.getTool('bash')?.name).toBe('bash')
  })

  test('获取不存在的工具返回 undefined', () => {
    const registry = new ToolRegistry()
    expect(registry.getTool('nonexistent')).toBeUndefined()
  })

  test('注销工具', () => {
    const registry = new ToolRegistry()
    registry.registerTool(bashTool)
    registry.unregisterTool('bash')
    expect(registry.getTool('bash')).toBeUndefined()
  })

  test('列出所有已注册的工具', () => {
    const registry = new ToolRegistry()
    registry.registerTool(bashTool)
    registry.registerTool(readTool)
    registry.registerTool(writeTool)
    registry.registerTool(editTool)
    registry.registerTool(grepTool)
    registry.registerTool(findTool)
    registry.registerTool(lsTool)
    const tools = registry.listTools()
    expect(tools).toHaveLength(7)
    expect(tools.map(t => t.name)).toEqual(
      expect.arrayContaining(['bash', 'read', 'write', 'edit', 'grep', 'find', 'ls'])
    )
  })
})

describe('内置工具', () => {
  test('bash 工具定义了必要的属性', () => {
    expect(bashTool.name).toBe('bash')
    expect(bashTool.description).toBeTruthy()
    expect(bashTool.parameters).toBeDefined()
    expect(bashTool.execute).toBeInstanceOf(Function)
  })

  test('read 工具定义了必要的属性', () => {
    expect(readTool.name).toBe('read')
    expect(readTool.description).toBeTruthy()
    expect(readTool.parameters).toBeDefined()
    expect(readTool.execute).toBeInstanceOf(Function)
  })

  test('write 工具定义了必要的属性', () => {
    expect(writeTool.name).toBe('write')
    expect(writeTool.description).toBeTruthy()
    expect(writeTool.parameters).toBeDefined()
    expect(writeTool.execute).toBeInstanceOf(Function)
  })

  test('bash 工具执行失败时返回 ToolResult 而不是 throw', async () => {
    const result = await bashTool.execute(
      'test-call',
      { command: 'exit 1' },
      new AbortController().signal,
    )
    expect(result.content).toBeDefined()
    expect(result.content.length).toBeGreaterThan(0)
  })
})