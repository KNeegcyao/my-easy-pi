// ============================================================
// SSE 流读取器 — 通用的 Server-Sent Events 解析
//
// 从 fetch Response 中读取 SSE 流，按行解析 'data:' 前缀。
// 所有 LLM Provider 共享此模块。
//
// **重要**：readSSEStream 是 async generator——**逐 chunk 边读边 yield**，
// 决不缓冲整个响应。这是 TUI 打字机效果的前提：每收到一个 network chunk
// 就立刻把其中的 LLMEvent yield 给上层，让 Agent 的 processLLMStream 在
// 网络到达时就 emit message_update，TUI 的 16ms 节流才能把同帧内的多个
// delta 合并成一帧增量渲染。
// ============================================================

import type { LLMEvent } from './types.js'

/**
 * SSE 行转换函数类型
 * 每个 Provider 实现自己的转换逻辑，将 JSON 数据映射为 LLMEvent
 */
export type SSECallback = (data: Record<string, unknown>) => LLMEvent | null

/**
 * 从 fetch Response 中读取 SSE 流，**边读边 yield**。
 *
 * 不再返回 `{ events, usage }` 聚合数组——旧实现先 await 完整流再 return
 * 全部事件，把流式变成了批量，导致 TUI 整块跳出。
 *
 * usage（如果 convertEvent 把它挂在 done event 上）会随 done event 一起
 * yield；上层（Agent.processLLMStream）已从 done event 提取 usage。
 *
 * @param response - fetch 返回的 Response 对象
 * @param convertEvent - 将解析后的 JSON 数据转换为 LLMEvent
 * @param signal - 可选的 AbortSignal；fetch 本身已挂此 signal，这里
 *                 额外在每次 read 前检查 aborted 以加速退出
 */
export async function* readSSEStream(
  response: Response,
  convertEvent: SSECallback,
  signal?: AbortSignal,
): AsyncGenerator<LLMEvent, void, void> {
  const reader = response.body?.getReader()
  if (!reader) {
    yield { type: 'error', message: 'No response body' }
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      // abort 加速退出（fetch 自身已 abort，但 reader.read 可能还在 pending）
      if (signal?.aborted) break

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      // 每读到一个 chunk 就立刻解析并 yield——不缓冲
      for (const line of lines) {
        const event = parseSSELine(line, convertEvent)
        if (event) yield event
      }
    }

    // 流尾残留：读完最后一块后再 yield
    if (buffer.trim() && !signal?.aborted) {
      const event = parseSSELine(buffer.trim(), convertEvent)
      if (event) yield event
    }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }
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
