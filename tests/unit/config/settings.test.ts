import { describe, test, expect } from 'vitest'
import { ConfigManager } from '../../../src/config/settings.js'

describe('ConfigManager', () => {
  test('未加载时 get 返回默认值', () => {
    const config = new ConfigManager()
    expect(config.get('key', 'default')).toBe('default')
  })

  test('加载后不报错', async () => {
    const config = new ConfigManager()
    await config.load()
    expect(typeof config.get('key')).toBe('undefined')
  })

  test('getApiKey 优先读环境变量', () => {
    process.env.DEEPSEEK_API_KEY = 'env-key'
    const config = new ConfigManager()
    expect(config.getApiKey('deepseek')).toBe('env-key')
    delete process.env.DEEPSEEK_API_KEY
  })

  test('getDefaultProvider 检测环境变量', () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const config = new ConfigManager()
    expect(config.getDefaultProvider()).toBe('openai')
    delete process.env.OPENAI_API_KEY
  })

  test('getDefaultModel 返回正确的默认模型', () => {
    const config = new ConfigManager()
    expect(config.getDefaultModel('deepseek')).toBe('deepseek-chat')
    expect(config.getDefaultModel('anthropic')).toBe('claude-sonnet-4-20250514')
    expect(config.getDefaultModel('openai')).toBe('gpt-4o')
  })

  test('save 和 set 不报错', async () => {
    const config = new ConfigManager()
    await config.load()
    await config.set('defaultProvider', 'openai')
    expect(config.get('defaultProvider')).toBe('openai')
  })
})