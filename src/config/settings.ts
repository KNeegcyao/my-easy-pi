// ============================================================
// ConfigManager — 分层配置管理
//
// 配置加载优先级（高 → 低）：
//   1. CLI 参数            （在 cli.ts 中处理）
//   2. 环境变量             （process.env）
//   3. 用户配置             ~/.my-easy-pi/config.json
//   4. 项目配置             .my-easy-pi/settings.json
//   5. 硬编码默认值
//
// 用户配置文件格式 (~/.my-easy-pi/config.json)：
//   {
//     "defaultProvider": "deepseek",
//     "defaultModel": "deepseek-chat",
//     "apiKeys": {
//       "deepseek": "sk-xxx",
//       "openai": "sk-xxx",
//       "anthropic": "sk-xxx"
//     }
//   }
// ============================================================

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface ApiKeys {
  deepseek?: string
  anthropic?: string
  openai?: string
  [key: string]: string | undefined
}

export interface Settings {
  defaultProvider?: string
  defaultModel?: string
  apiKeys?: ApiKeys
  output?: 'print' | 'json' | 'rpc'
  [key: string]: unknown
}

const USER_CONFIG_DIR = join(homedir(), '.my-easy-pi')
const USER_CONFIG_PATH = join(USER_CONFIG_DIR, 'config.json')

const PROJECT_CONFIG_DIR = join(process.cwd(), '.my-easy-pi')
const PROJECT_CONFIG_PATH = join(PROJECT_CONFIG_DIR, 'settings.json')

export class ConfigManager {
  private userConfig: Settings = {}
  private projectConfig: Settings = {}
  private loaded = false

  /** 加载所有层级的配置 */
  async load(): Promise<Settings> {
    const merged: Settings = {}

    // 1. 项目配置（最低优先级）
    this.projectConfig = await this.loadFile(PROJECT_CONFIG_PATH)

    // 2. 用户配置（中等优先级）
    this.userConfig = await this.loadFile(USER_CONFIG_PATH)

    Object.assign(merged, this.projectConfig)
    Object.assign(merged, this.userConfig)

    this.loaded = true
    return merged
  }

  /** 读取某个配置项 */
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.loaded) return defaultValue
    const value = this.getFromConfig(key)
    return (value as T) ?? defaultValue
  }

  /** 获取 API Key（环境变量 > 用户配置） */
  getApiKey(provider: string): string | undefined {
    const envMap: Record<string, string> = {
      deepseek: 'DEEPSEEK_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
    }

    const envVar = envMap[provider]
    if (envVar && process.env[envVar]) {
      return process.env[envVar]
    }

    return this.userConfig.apiKeys?.[provider]
  }

  /** 获取默认提供商 */
  getDefaultProvider(): string {
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek'
    if (process.env.OPENAI_API_KEY) return 'openai'
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
    return this.get('defaultProvider', 'deepseek')!
  }

  /** 获取默认模型 */
  getDefaultModel(provider: string): string {
    return this.get('defaultModel') || this.fallbackModel(provider)
  }

  /** 设置配置项 */
  async set(key: string, value: unknown): Promise<void> {
    this.userConfig[key] = value
    await this.save()
  }

  /** 保存用户配置 */
  async save(): Promise<void> {
    if (!existsSync(USER_CONFIG_DIR)) {
      await mkdir(USER_CONFIG_DIR, { recursive: true })
    }
    await writeFile(USER_CONFIG_PATH, JSON.stringify(this.userConfig, null, 2), 'utf-8')
  }

  // ── 私有方法 ──

  private async loadFile(path: string): Promise<Settings> {
    try {
      if (!existsSync(path)) return {}
      const content = await readFile(path, 'utf-8')
      return JSON.parse(content) as Settings
    } catch {
      return {}
    }
  }

  private getFromConfig(key: string): unknown {
    if (key in this.userConfig) return this.userConfig[key]
    if (key in this.projectConfig) return this.projectConfig[key]
    return undefined
  }

  private fallbackModel(provider: string): string {
    const models: Record<string, string> = {
      deepseek: 'deepseek-chat',
      anthropic: 'claude-sonnet-4-20250514',
      openai: 'gpt-4o',
    }
    return models[provider] || 'deepseek-chat'
  }
}