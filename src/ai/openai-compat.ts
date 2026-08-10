// ============================================================
// OpenAI 兼容格式 — 共享的请求体构建和事件转换
//
// DeepSeek 和 OpenAI 使用相同的 Chat Completions 格式。
// 此模块提取两者的公共逻辑，消除代码重复。
// ============================================================

import type { ModelContext, LLMEvent } from './types.js'

/**
 * 构建 OpenAI 兼容的请求体
 */
export function buildOpenAIRequestBody(
  modelId: string,
  context: ModelContext,
  supportsTools: boolean,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: modelId,
    stream: true,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: context.systemPrompt },
      ...context.messages.map(msg => {
        if (msg.role === 'user') {
          const content = typeof msg.content === 'string'
            ? msg.content
            : msg.content.map((c: any) => {
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
  if (context.tools && context.tools.length > 0 && supportsTools) {
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

/**
 * 将 OpenAI 兼容格式的流式事件转成 LLMEvent
 */
export function convertOpenAIEvent(data: Record<string, unknown>): LLMEvent | null {
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