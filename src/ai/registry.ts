// ============================================================
// ModelRegistry — 模型注册表
//
// 用来管理不同的 LLM 提供商。
// 可以注册新的提供商（如 OpenAI、DeepSeek），
// 然后通过 getModel() 获取具体的模型实例。
// ============================================================

import type { ProviderFactory, Model, ModelInfo } from './types.js'

export class ModelRegistry {
  /** 存储所有已注册的提供商工厂 */
  private providers = new Map<string, ProviderFactory>()

  /** 注册一个提供商
   * @param name - 提供商名称，如 "anthropic"
   * @param factory - 提供商工厂实例
   */
  setProvider(name: string, factory: ProviderFactory): void {
    this.providers.set(name, factory)
  }

  /** 获取一个模型实例
   * @param provider - 提供商名称
   * @param modelId - 模型 ID
   * @param config - 提供商配置（如 apiKey）
   * @returns Model 实例，如果提供商或模型不存在则返回 null
   */
  getModel(provider: string, modelId: string, config?: { apiKey?: string; baseUrl?: string }): Model | null {
    const factory = this.providers.get(provider)
    if (!factory) return null

    const instance = factory.create({
      apiKey: config?.apiKey || '',
      baseUrl: config?.baseUrl,
    })
    return instance.createModel(modelId)
  }

  /** 列出所有已注册的模型
   * @param provider - 可选，只列出指定提供商的模型
   */
  listModels(provider?: string): ModelInfo[] {
    if (provider) {
      const factory = this.providers.get(provider)
      if (!factory) return []
      const instance = factory.create({ apiKey: '' })
      return instance.listModels()
    }

    const allModels: ModelInfo[] = []
    for (const [, factory] of this.providers) {
      const instance = factory.create({ apiKey: '' })
      allModels.push(...instance.listModels())
    }
    return allModels
  }
}