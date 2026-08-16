// ============================================================
// ExtensionLoader — 扩展加载器
//
// 自动发现并加载扩展：
//   1. 项目目录  .pi/extensions/*.ts
//   2. 全局目录  ~/.my-easy-pi/extensions/*.ts
//
// 扩展文件默认导出一个函数，接收 ExtensionAPI 实例。
// ============================================================

import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ExtensionAPI } from './api.js'

/** 扩展加载器 */
export class ExtensionLoader {
  private loaded = new Set<string>()

  constructor(
    private api: ExtensionAPI,
    private projectDir: string = process.cwd(),
  ) {}

  /** 加载所有扩展 */
  async loadAll(): Promise<number> {
    let count = 0
    const dirs = this.getSearchDirs()

    for (const dir of dirs) {
      if (!existsSync(dir)) continue
      count += await this.loadDir(dir)
    }

    return count
  }

  /** 获取搜索目录列表（按优先级） */
  private getSearchDirs(): string[] {
    return [
      join(this.projectDir, '.pi', 'extensions'),
      join(homedir(), '.my-easy-pi', 'extensions'),
    ]
  }

  /** 加载单个目录下的所有扩展 */
  private async loadDir(dir: string): Promise<number> {
    let count = 0
    try {
      const files = await readdir(dir)
      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue
        if (this.loaded.has(file)) continue
        this.loaded.add(file)

        try {
          const fullPath = join(dir, file)
          const mod = await import(fullPath)
          if (typeof mod.default === 'function') {
            await mod.default(this.api)
            count++
          }
        } catch {
          // 单个扩展加载失败不影响其他扩展
        }
      }
    } catch {
      // 目录不存在或无法读取时跳过
    }
    return count
  }
}