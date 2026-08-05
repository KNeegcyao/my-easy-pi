// ============================================================
// retry — LLM 调用容错工具
//
// 提供指数退避重试机制，处理网络抖动和 API 限流。
//
// 重试策略：
//   - 首次失败后等待 1 秒
//   - 后续每次加倍：2s → 4s → 8s（指数退避）
//   - 最大重试次数：3 次
//   - HTTP 429（限流）特殊处理：使用 Retry-After 头
// ============================================================

const DEFAULT_MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRetryAfter(response: Response): number | null {
  const header = response.headers.get('Retry-After')
  if (!header) return null
  const seconds = parseInt(header, 10)
  return isNaN(seconds) ? null : seconds * 1000
}

/** 带重试的 fetch 调用 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { maxRetries?: number },
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...options })

      if (response.ok || !isRetryable(response.status)) {
        return response
      }

      if (attempt === maxRetries) {
        return response
      }

      let delay = BASE_DELAY_MS * Math.pow(2, attempt)
      if (response.status === 429) {
        const retryAfter = getRetryAfter(response)
        if (retryAfter !== null) delay = retryAfter
      }

      await sleep(delay)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === maxRetries) throw lastError
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt))
    }
  }

  throw lastError || new Error('Max retries exceeded')
}