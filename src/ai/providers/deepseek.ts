// ============================================================
// DeepSeek Provider
//
// DeepSeek API 兼容 OpenAI 的 Chat Completions 格式。
// 使用共享的 SSE 读取器和 OpenAI 兼容格式模块。
// 支持：
//   - 流式文本输出（text_delta）
//   - 工具/函数调用（tool_call）
//
// 文档：https://api-docs.deepseek.com/
// ============================================================

import type {
  ProviderFactory, Model, ModelContext, ModelInfo,
  LLMEvent, StreamOptions,
} from '../types.js'
import { fetchWithRetry } from '../retry.js'
import { readSSEStream } from '../sse.js'
import { buildOpenAIRequestBody, convertOpenAIEvent } from '../openai-compat.js'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export const DeepSeekProvider: ProviderFactory = {
  create(config) {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl || DEEPSEEK_BASE_URL

    return {
      name: 'deepseek',

      listModels(): ModelInfo[] {
        return [
          { id: 'deepseek-chat', provider: 'deepseek', description: 'DeepSeek V3 (通用对话)' },
          { id: 'deepseek-reasoner', provider: 'deepseek', description: 'DeepSeek R1 (深度推理)' },
        ]
      },

      createModel(modelId: string): Model | null {
        const supported = this.listModels().find(m => m.id === modelId)
        if (!supported) return null
        return new DeepSeekModel(modelId, apiKey, baseUrl)
      },
    }
  },
}

class DeepSeekModel implements Model {
  id: string
  provider = 'deepseek'

  constructor(
    id: string,
    private apiKey: string,
    private baseUrl: string,
  ) {
    this.id = id
  }

  supportsTools(): boolean {
    return this.id === 'deepseek-chat'
  }

  supportsThinking(): boolean {
    return this.id === 'deepseek-reasoner'
  }

  async *stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent> {
    const body = buildOpenAIRequestBody(this.id, context, this.supportsTools())

    const response = await fetchWithRetry(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      yield { type: 'error', message: `DeepSeek API Error (${response.status}): ${errorText}` }
      return
    }

    // 边读边转发：每收到一个 network chunk 就 yield，TUI 才能打字机式增长
    for await (const event of readSSEStream(response, convertOpenAIEvent, options?.signal)) {
      yield event
    }
  }
}