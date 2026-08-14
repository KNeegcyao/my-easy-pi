import { describe, it, expect } from 'vitest'
import { MockOperations } from '../../../src/tools/__tests__/mock-operations.js'
import { createReadTool } from '../../../src/tools/builtin/read.js'
import { createWriteTool } from '../../../src/tools/builtin/write.js'
import { createLsTool } from '../../../src/tools/builtin/ls.js'

describe('Operations + Tool factories', () => {
  it('MockOperations + createReadTool', async () => {
    const ops = new MockOperations()
    ops.setFile('/tmp/test.txt', 'hello world')
    const tool = createReadTool(ops)
    const result = await tool.execute('tc1', { path: '/tmp/test.txt' })
    expect((result.content[0] as { text: string }).text).toContain('hello world')
  })

  it('MockOperations + createWriteTool', async () => {
    const ops = new MockOperations()
    const tool = createWriteTool(ops)
    const result = await tool.execute('tc1', { path: '/tmp/out.txt', content: 'test' })
    expect((result.content[0] as { text: string }).text).toMatch(/已写入/)
    // Verify via ops
    await expect(ops.readFile('/tmp/out.txt')).resolves.toBe('test')
  })

  it('MockOperations + createLsTool', async () => {
    const ops = new MockOperations()
    ops.setDir('/tmp', [
      { name: 'file1.txt', isDirectory: false },
      { name: 'mydir', isDirectory: true },
    ])
    const tool = createLsTool(ops)
    const result = await tool.execute('tc1', { path: '/tmp' })
    const text = (result.content[0] as { text: string }).text
    expect(text).toContain('📁')
    expect(text).toContain('mydir')
    expect(text).toContain('📄')
    expect(text).toContain('file1.txt')
  })
})