// ============================================================
// Anthropic Provider
//
// 实现了 ProviderFactory 接口，负责调用 Anthropic 的 Messages API。
// 使用共享的 SSE 读取器。
// 支持：
//   - 流式文本输出（text_delta）
//   - 工具调用（tool_call_start / tool_call_delta）
//   - 思考过程（thinking_delta）
//
// 直接使用 Node.js 内置的 fetch 调用 API，不依赖第三方 SDK。
// ============================================================

import type {
  ProviderFactory, Model, ModelContext, ModelInfo,
  LLMEvent, StreamOptions,
} from '../types.js'
import { fetchWithRetry } from '../retry.js'
import { readSSEStream, type SSECallback } from '../sse.js'

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'

export const AnthropicProvider: ProviderFactory = {
  create(config) {
    const apiKey = config.apiKey
    const baseUrl = config.baseUrl || ANTHROPIC_BASE_URL

    return {
      name: 'anthropic',

      listModels(): ModelInfo[] {
        return [
          { id: 'claude-sonnet-4-20250514', provider: 'anthropic', description: 'Claude Sonnet 4' },
          { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', description: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-haiku-20240307', provider: 'anthropic', description: 'Claude 3 Haiku' },
        ]
      },

      createModel(modelId: string): Model | null {
        const supported = this.listModels().find(m => m.id === modelId)
        if (!supported && !modelId.startsWith('claude-')) return null
        return new AnthropicModel(modelId, apiKey, baseUrl)
      },
    }
  },
}

class AnthropicModel implements Model {
  id: string
  provider = 'anthropic'

  constructor(
    id: string,
    private apiKey: string,
    private baseUrl: string,
  ) {
    this.id = id
  }

  supportsTools(): boolean {
    return true
  }

  supportsThinking(): boolean {
    return this.id.includes('sonnet') || this.id.includes('opus')
  }

  async *stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent> {
    const body = this.buildRequestBody(context)

    const response = await fetchWithRetry(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      yield { type: 'error', message: `Anthropic API Error (${response.status}): ${errorText}` }
      return
    }

    // 使用共享 SSE 读取器，传入 Anthropic 特有的事件转换函数
    const convertEvent: SSECallback = (data) => this.convertAnthropicEvent(data)
    const { events } = await readSSEStream(response, convertEvent, options?.signal)
    for (const event of events) {
      yield event
    }
  }

  private buildRequestBody(context: ModelContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      model: this.id,
      max_tokens: 8192,
      stream: true,
      system: context.systemPrompt,
      messages: context.messages.map(msg => {
        if (msg.role === 'user') {
          if (typeof msg.content === 'string') {
            return { role: 'user', content: msg.content }
          }
          return { role: 'user', content: msg.content }
        }
        if (msg.role === 'assistant') {
          const content: unknown[] = [{ type: 'text', text: msg.content }]
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.args,
              })
            }
          }
          return { role: 'assistant', content }
        }
        if (msg.role === 'toolResult') {
          return {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: msg.content,
              is_error: msg.isError || false,
            }],
          }
        }
        return msg
      }),
    }

    if (context.tools && context.tools.length > 0) {
      body.tools = context.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }))
    }

    if (context.thinking) {
      body.thinking = { type: 'enabled', budget_tokens: context.thinking.budgetTokens }
    }

    return body
  }

  private convertAnthropicEvent(data: Record<string, unknown>): LLMEvent | null {
    const type = data.type as string

    switch (type) {
      case 'message_start':
        return null

      case 'content_block_start': {
        const block = data.content_block as Record<string, unknown> | undefined
        if (block?.type === 'tool_use') {
          return {
            type: 'tool_call_start',
            id: block.id as string,
            name: block.name as string,
            args: block.input as Record<string, unknown>,
          }
        }
        if (block?.type === 'text') {
          return { type: 'text_delta', delta: (block.text as string) || '' }
        }
        if (block?.type === 'thinking') {
          return { type: 'thinking_delta', delta: (block.thinking as string) || '' }
        }
        return null
      }

      case 'content_block_delta': {
        const delta = data.delta as Record<string, unknown> | undefined
        if (!delta) return null

        if (delta.type === 'text_delta') {
          return { type: 'text_delta', delta: (delta.text as string) || '' }
        }
        if (delta.type === 'thinking_delta') {
          return { type: 'thinking_delta', delta: (delta.thinking as string) || '' }
        }
        if (delta.type === 'input_json_delta') {
          return { type: 'tool_call_delta', id: '', delta: (delta.partial_json as string) || '' }
        }
        return null
      }

      case 'content_block_stop':
        return null

      case 'message_delta': {
        const stopReason = (data.delta as Record<string, unknown>)?.stop_reason as string | undefined
        if (stopReason) {
          return { type: 'done', stopReason: stopReason as 'end_turn' | 'tool_use' | 'stop_sequence' }
        }
        return null
      }

      case 'message_stop':
        return { type: 'done' }

      case 'error': {
        const error = data.error as Record<string, unknown> | undefined
        return { type: 'error', message: (error?.message as string) || 'Unknown error' }
      }

      default:
        return null
    }
  }
}