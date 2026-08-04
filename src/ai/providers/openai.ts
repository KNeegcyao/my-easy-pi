// ============================================================
// OpenAI Provider
//
// OpenAI API 使用标准的 Chat Completions 格式。
// DeepSeek Provider 也是同样的格式，代码结构基本一致。
// 支持：
//   - 流式文本输出（text_delta）
//   - 工具/函数调用（tool_call）
// ============================================================

import type {
  ProviderFactory, Model, ModelContext, ModelInfo,
  LLMEvent, StreamOptions,
} from '../types.js'

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
    const body = this.buildRequestBody(context)

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
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

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', message: 'No response body' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const event = this.parseSSELine(line)
          if (event) yield event
        }
      }

      if (buffer.trim()) {
        const event = this.parseSSELine(buffer.trim())
        if (event) yield event
      }
    } finally {
      reader.releaseLock()
    }
  }

  private buildRequestBody(context: ModelContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      model: this.id,
      stream: true,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: context.systemPrompt },
        ...context.messages.map(msg => {
          if (msg.role === 'user') {
            const content = typeof msg.content === 'string'
              ? msg.content
              : msg.content.map(c => {
                  if (c.type === 'text') return { type: 'text', text: c.text }
                  if (c.type === 'image') return { type: 'image_url', image_url: { url: `data:${c.mimeType};base64,${c.data}` } }
                  return { type: 'text', text: JSON.stringify(c) }
                })
            return { role: 'user', content }
          }
          if (msg.role === 'assistant') {
            const result: Record<string, unknown> = { role: 'assistant', content: msg.content }
            if (msg.toolCalls && msg.toolCalls.length > 0) {
              result.tool_calls = msg.toolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.args),
                },
              }))
            }
            return result
          }
          if (msg.role === 'toolResult') {
            return {
              role: 'tool',
              tool_call_id: msg.toolCallId,
              content: msg.content,
            }
          }
          return msg
        }),
      ],
    }

    if (context.tools && context.tools.length > 0 && this.supportsTools()) {
      body.tools = context.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }))
    }

    return body
  }

  private parseSSELine(line: string): LLMEvent | null {
    if (!line || line.startsWith(':')) return null
    if (!line.startsWith('data: ')) return null

    const jsonStr = line.slice(6).trim()
    if (jsonStr === '[DONE]') {
      return { type: 'done', stopReason: 'end_turn' }
    }

    try {
      const data = JSON.parse(jsonStr)
      return this.convertEvent(data)
    } catch {
      return null
    }
  }

  private convertEvent(data: Record<string, unknown>): LLMEvent | null {
    const choices = data.choices as Array<Record<string, unknown>> | undefined
    if (!choices || choices.length === 0) return null

    const delta = choices[0].delta as Record<string, unknown> | undefined
    const finishReason = choices[0].finish_reason as string | null | undefined

    if (finishReason) {
      return {
        type: 'done',
        stopReason: finishReason === 'tool_calls' ? 'tool_use' as const : 'end_turn' as const,
      }
    }

    if (!delta) return null

    if (delta.content) {
      return { type: 'text_delta', delta: delta.content as string }
    }

    const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined
    if (toolCalls && toolCalls.length > 0) {
      const tc = toolCalls[0]
      const fn = tc.function as Record<string, unknown> | undefined
      if (tc.id) {
        const argsStr = fn?.arguments as string | undefined
        if (argsStr && argsStr !== 'null' && argsStr !== '') {
          try {
            const parsed = JSON.parse(argsStr)
            return {
              type: 'tool_call_start',
              id: tc.id as string,
              name: fn?.name as string || '',
              args: parsed,
            }
          } catch {
            // 按流式处理
          }
        }
        return {
          type: 'tool_call_start',
          id: tc.id as string,
          name: fn?.name as string || '',
          args: {},
        }
      } else if (fn?.arguments) {
        return {
          type: 'tool_call_delta',
          id: '',
          delta: fn.arguments as string,
        }
      }
    }

    return null
  }
}