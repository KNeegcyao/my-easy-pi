// ============================================================
// ConfigManager — 配置管理
//
// 从 .piagent/settings.json 读取和写入配置。
// 支持字段：
//   - defaultProvider: 默认提供商
//   - defaultModel: 默认模型
// ============================================================

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export interface Settings {
  defaultProvider?: string
  defaultModel?: string
  [key: string]: unknown
}

const SETTINGS_DIR = join(process.cwd(), '.piagent')
const SETTINGS_PATH = join(SETTINGS_DIR, 'settings.json')

export class ConfigManager {
  private settings: Settings = {}
  private loaded = false

  /** 加载配置文件 */
  async load(): Promise<Settings> {
    try {
      if (!existsSync(SETTINGS_PATH)) {
        this.settings = {}
        this.loaded = true
        return this.settings
      }
      const content = await readFile(SETTINGS_PATH, 'utf-8')
      this.settings = JSON.parse(content) as Settings
      this.loaded = true
      return this.settings
    } catch {
      this.settings = {}
      this.loaded = true
      return this.settings
    }
  }

  /** 保存配置到文件 */
  async save(): Promise<void> {
    if (!existsSync(SETTINGS_DIR)) {
      await mkdir(SETTINGS_DIR, { recursive: true })
    }
    await writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2), 'utf-8')
  }

  /** 获取某个配置项 */
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.loaded) return defaultValue
    return (this.settings[key] as T) ?? defaultValue
  }

  /** 设置某个配置项并保存 */
  async set(key: string, value: unknown): Promise<void> {
    this.settings[key] = value
    await this.save()
  }
}