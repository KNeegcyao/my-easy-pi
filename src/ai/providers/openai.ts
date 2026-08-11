// ============================================================
// OpenAI Provider
//
// OpenAI API 使用标准的 Chat Completions 格式。
// 使用共享的 SSE 读取器和 OpenAI 兼容格式模块。
// 支持：
//   - 流式文本输出（text_delta）
//   - 工具/函数调用（tool_call）
// ============================================================

import type {
  ProviderFactory, Model, ModelContext, ModelInfo,
  LLMEvent, StreamOptions,
} from '../types.js'
import { fetchWithRetry } from '../retry.js'
import { readSSEStream } from '../sse.js'
import { buildOpenAIRequestBody, convertOpenAIEvent } from '../openai-compat.js'

const OPENAI_BASE_URL = 'https://api.openai.com'

export const OpenAIProvider: ProviderFactory = {
  create(config) {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl || OPENAI_BASE_URL

    return {
      name: 'openai',

      listModels(): ModelInfo[] {
        return [
          { id: 'gpt-4o', provider: 'openai', description: 'GPT-4o 多模态模型' },
          { id: 'gpt-4o-mini', provider: 'openai', description: 'GPT-4o 轻量版' },
          { id: 'gpt-4-turbo', provider: 'openai', description: 'GPT-4 Turbo' },
          { id: 'gpt-3.5-turbo', provider: 'openai', description: 'GPT-3.5 Turbo' },
        ]
      },

      createModel(modelId: string): Model | null {
        const supported = this.listModels().find(m => m.id === modelId)
        if (!supported) return null
        return new OpenAIModel(modelId, apiKey, baseUrl)
      },
    }
  },
}

class OpenAIModel implements Model {
  id: string
  provider = 'openai'

  constructor(
    id: string,
    private apiKey: string,
    private baseUrl: string,
  ) {
    this.id = id
  }

  supportsTools(): boolean {
    return this.id.startsWith('gpt-4') || this.id === 'gpt-3.5-turbo'
  }

  supportsThinking(): boolean {
    return false
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
      yield { type: 'error', message: `OpenAI API Error (${response.status}): ${errorText}` }
      return
    }

    // 边读边转发：每收到一个 network chunk 就 yield
    for await (const event of readSSEStream(response, convertOpenAIEvent, options?.signal)) {
      yield event
    }
  }
}