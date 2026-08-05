import { describe, test, expect } from 'vitest'
import { fetchWithRetry } from '../../../src/ai/retry.js'

describe('fetchWithRetry', () => {
  test('连接失败进入重试并最终抛出', async () => {
    await expect(fetchWithRetry('http://localhost:1', { maxRetries: 1 })).rejects.toThrow()
  })
})