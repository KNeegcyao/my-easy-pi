// ============================================================
// SSE 流读取器 — 通用的 Server-Sent Events 解析
//
// 从 fetch Response 中读取 SSE 流，按行解析 'data:' 前缀。
// 所有 LLM Provider 共享此模块。
// ============================================================

import type { LLMEvent } from './types.js'

/**
 * SSE 行转换函数类型
 * 每个 Provider 实现自己的转换逻辑，将 JSON 数据映射为 LLMEvent
 */
export type SSECallback = (data: Record<string, unknown>) => LLMEvent | null

/**
 * 从 fetch Response 中读取 SSE 流
 *
 * @param response - fetch 返回的 Response 对象
 * @param convertEvent - 将解析后的 JSON 数据转换为 LLMEvent
 * @param signal - 可选的 AbortSignal
 * @returns AsyncIterable<LLMEvent>
 */
export async function readSSEStream(
  response: Response,
  convertEvent: SSECallback,
  signal?: AbortSignal,
): Promise<{ events: LLMEvent[]; usage?: Record<string, number> }> {
  const reader = response.body?.getReader()
  if (!reader) {
    return { events: [{ type: 'error', message: 'No response body' }] }
  }

  const decoder = new TextDecoder()
  let buffer = ''
  const events: LLMEvent[] = []
  let usage: Record<string, number> | undefined

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const event = parseSSELine(line, convertEvent)
        if (event) {
          // 捕获 usage 信息（非标准事件，部分 Provider 携带）
          if (event.type === 'done' && (event as any).usage) {
            usage = (event as any).usage
          }
          events.push(event)
        }
      }
    }

    // 处理缓冲区剩余内容
    if (buffer.trim()) {
      const event = parseSSELine(buffer.trim(), convertEvent)
      if (event) events.push(event)
    }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }

  return { events, usage }
}

/**
 * 解析单行 SSE 数据
 * 处理 data: 前缀、[DONE] 标记、注释行等
 */
export function parseSSELine(
  line: string,
  convertEvent: SSECallback,
): LLMEvent | null {
  // 跳过空行和注释
  if (!line || line.startsWith(':')) return null

  // 只处理 data: 开头的行
  if (!line.startsWith('data: ')) return null

  const jsonStr = line.slice(6).trim()

  // 流结束标记
  if (jsonStr === '[DONE]') {
    return { type: 'done', stopReason: 'end_turn' }
  }

  try {
    const data = JSON.parse(jsonStr)
    return convertEvent(data)
  } catch {
    return null
  }
}