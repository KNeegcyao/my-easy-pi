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
 * 将 OpenAI 兼容格式的流式事件转成 LLMEvent。
 *
 * 返回事件数组：同一 chunk 可能同时携带 content 与 tool_calls，
 * 应两者都消费，不能因先取 content 而提前return丢失工具增量。
 */
export function convertOpenAIEvent(data: Record<string, unknown>): LLMEvent[] {
  const choices = data.choices as Array<Record<string, unknown>> | undefined
  if (!choices || choices.length === 0) return []

  const delta = choices[0].delta as Record<string, unknown> | undefined
  const finishReason = choices[0].finish_reason as string | null | undefined

  const events: LLMEvent[] = []

  // 流结束（工具结束优先判别，若非工具则作正常结束）
  if (finishReason) {
    events.push({
      type: 'done',
      stopReason: finishReason === 'tool_calls' ? 'tool_use' as const : 'end_turn' as const,
    })
    // finish_reason 出现时往往 content/tool_calls 已消费完，可直接返回
    return events
  }

  if (!delta) return events

  // 文本内容（可能与本 chunk 的工具增量并存，不提前 return）
  if (delta.content) {
    events.push({ type: 'text_delta', delta: delta.content as string })
  }

  // 工具调用——无论是否已有 content 都继续消费
  const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined
  if (toolCalls && toolCalls.length > 0) {
    const tc = toolCalls[0]
    const fn = tc.function as Record<string, unknown> | undefined
    if (tc.id) {
      // tool_call 开始（第一个 chunk 带 id）
      const argsStr = fn?.arguments as string | undefined
      if (argsStr && argsStr !== 'null' && argsStr !== '') {
        try {
          const parsed = JSON.parse(argsStr)
          events.push({
            type: 'tool_call_start',
            id: tc.id as string,
            name: (fn?.name as string) || '',
            args: parsed,
          })
          return events
        } catch {
          // 参数不完整，按流式处理
        }
      }
      events.push({
        type: 'tool_call_start',
        id: tc.id as string,
        name: (fn?.name as string) || '',
        args: {},
      })
    } else if (fn?.arguments) {
      // tool_call 增量参数
      events.push({
        type: 'tool_call_delta',
        id: '',
        delta: fn.arguments as string,
      })
    }
  }

  return events
}