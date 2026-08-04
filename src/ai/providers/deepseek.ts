// ============================================================
// DeepSeek Provider
//
// DeepSeek API 兼容 OpenAI 的 Chat Completions 格式。
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

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

// ── DeepSeekProvider 工厂 ──
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

// ── DeepSeekModel ──
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
    // deepseek-chat (V3) 支持函数调用，deepseek-reasoner (R1) 不支持
    return this.id === 'deepseek-chat'
  }

  supportsThinking(): boolean {
    return this.id === 'deepseek-reasoner'
  }

  /** 流式调用 DeepSeek API（兼容 OpenAI 格式） */
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
      yield { type: 'error', message: `DeepSeek API Error (${response.status}): ${errorText}` }
      return
    }

    // 读取 SSE 流
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

  /** 构建 OpenAI 兼容的请求体 */
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

    // 添加工具定义（转成 function calling 格式）
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

  /** 解析 SSE 行 */
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

  /** 将 OpenAI 格式的流式事件转成 LLMEvent */
  private convertEvent(data: Record<string, unknown>): LLMEvent | null {
    const choices = data.choices as Array<Record<string, unknown>> | undefined
    if (!choices || choices.length === 0) return null

    const delta = choices[0].delta as Record<string, unknown> | undefined
    const finishReason = choices[0].finish_reason as string | null | undefined

    // 流结束
    if (finishReason) {
      return {
        type: 'done',
        stopReason: finishReason === 'tool_calls' ? 'tool_use' as const : 'end_turn' as const,
      }
    }

    if (!delta) return null

    // 文本内容
    if (delta.content) {
      return { type: 'text_delta', delta: delta.content as string }
    }

    // 工具调用
    const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined
    if (toolCalls && toolCalls.length > 0) {
      const tc = toolCalls[0]
      const fn = tc.function as Record<string, unknown> | undefined
      if (tc.id) {
        // tool_call 开始（第一个 chunk 带 id）
        // DeepSeek 有时会在同一 chunk 就传完所有参数
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
            // 参数不完整，按流式处理
          }
        }
        return {
          type: 'tool_call_start',
          id: tc.id as string,
          name: fn?.name as string || '',
          args: {},
        }
      } else if (fn?.arguments) {
        // tool_call 增量参数
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