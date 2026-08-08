---
对应源码: `src/ai/retry.ts`
最后更新: 2026-08-08
适用版本: piagent v0.1+
---

# 指数退避重试

## 1. 本节目标

理解 `fetchWithRetry` 的指数退避策略，以及如何处理不同 HTTP 状态码的重试逻辑。

## 2. 前置知识

- 了解 HTTP 状态码（429 Too Many Requests、502 Bad Gateway、503 Service Unavailable、504 Gateway Timeout）
- 了解 `fetch` API 的基本用法
- 了解指数退避（Exponential Backoff）的基本概念

## 3. 核心概念

### 3.1 指数退避

指数退避是一种网络重试策略：每次重试的等待时间按指数增长。如果第一次等待 1 秒，那么：

- 第 1 次重试：等 1 秒
- 第 2 次重试：等 2 秒
- 第 3 次重试：等 4 秒
- 第 N 次重试：等 2^(N-1) 秒

**为什么用指数退避而不是固定间隔？**

- **固定间隔太短** — 如果服务器过载，频繁重试会让情况更糟
- **固定间隔太长** — 如果只是短暂抖动，用户等待太久
- **指数退避** — 短时抖动快速恢复，持续问题逐步降频

### 3.2 哪些错误需要重试？

| HTTP 状态码 | 含义 | 是否重试 |
|------------|------|---------|
| 429 | Too Many Requests（限流） | ✅ 重试，使用 `Retry-After` 头 |
| 502 | Bad Gateway（网关错误） | ✅ 重试 |
| 503 | Service Unavailable（服务不可用） | ✅ 重试 |
| 504 | Gateway Timeout（网关超时） | ✅ 重试 |
| 4xx 其他 | 客户端错误（如 400、401、403） | ❌ 不重试 |
| 5xx 其他 | 服务端错误（如 500） | ❌ 不重试 |

## 4. 代码实现

### 4.1 完整代码

```typescript
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

/** 判断一个 HTTP 状态码是否值得重试 */
function isRetryable(status: number): boolean {
  // 429: 限流，502/503/504: 服务器临时问题
  return status === 429 || status === 502 || status === 503 || status === 504
}

/** 异步等待 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 从响应头中提取 Retry-After 值（单位：秒） */
function getRetryAfter(response: Response): number | null {
  const header = response.headers.get('Retry-After')
  if (!header) return null
  const seconds = parseInt(header, 10)
  // 如果解析失败（如非数字字符串），返回 null
  return isNaN(seconds) ? null : seconds * 1000
}

/** 带重试的 fetch 调用 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { maxRetries?: number },
): Promise<Response> {
  // 最大重试次数，默认为 3
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  let lastError: Error | null = null

  // attempt 从 0 开始，0 是首次请求，1 是第一次重试，以此类推
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...options })

      // 请求成功或遇到不可重试的错误，直接返回
      if (response.ok || !isRetryable(response.status)) {
        return response
      }

      // 最后一次尝试也失败了，直接返回（不抛出异常）
      if (attempt === maxRetries) {
        return response
      }

      // 计算等待时间：指数退避
      let delay = BASE_DELAY_MS * Math.pow(2, attempt)
      // 429 限流特殊处理：优先使用 Retry-After 头
      if (response.status === 429) {
        const retryAfter = getRetryAfter(response)
        if (retryAfter !== null) delay = retryAfter
      }

      await sleep(delay)
    } catch (error) {
      // 网络错误（如 DNS 解析失败、连接被拒绝）
      lastError = error instanceof Error ? error : new Error(String(error))
      // 最后一次尝试也失败了，抛出异常
      if (attempt === maxRetries) throw lastError
      // 等待后重试
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt))
    }
  }

  // 兜底：如果循环正常结束（理论上不会执行到这里）
  throw lastError || new Error('Max retries exceeded')
}
```

### 4.2 重试流程图

```
开始
  │
  ▼
attempt = 0
  │
  ▼
fetch(url, options)
  │
  ├── 成功 (response.ok) ──────▶ 返回 response
  │
  ├── 不可重试 (4xx 非 429) ──▶ 返回 response
  │
  ├── 可重试 (429/502/503/504)
  │     │
  │     ├── 已达最大重试次数 ──▶ 返回 response（不抛出）
  │     │
  │     └── 未达最大重试次数
  │           │
  │           ├── 429? ──▶ 使用 Retry-After 头
  │           └── 其他 ──▶ 指数退避: 2^attempt * 1000ms
  │                          │
  │                          ▼
  │                      sleep(delay)
  │                          │
  │                          ▼
  │                      attempt++
  │                          │
  └──────────────────────────┘
  │
  └── 网络异常 (catch)
        │
        ├── 已达最大重试次数 ──▶ 抛出异常
        │
        └── 未达最大重试次数 ──▶ sleep → 重试
```

### 4.3 关键设计决策

**为什么网络错误抛出异常，而 HTTP 错误直接返回？**

```typescript
// HTTP 错误（如 502）：直接返回 response
if (response.ok || !isRetryable(response.status)) {
  return response  // 调用方可以检查 response 的状态码
}

// 网络错误（如 DNS 解析失败）：抛出异常
} catch (error) {
  if (attempt === maxRetries) throw lastError  // 最后一次重试才抛出
}
```

这样设计的原因：

1. **HTTP 错误** — 返回 `response` 对象，调用方可以读取 `response.status` 和 `response.body` 来获取详细的错误信息
2. **网络错误** — 不返回 `response` 对象，只能抛出异常让调用方处理

**为什么最后一次重试仍然失败时，HTTP 错误不抛出异常？**

```typescript
if (attempt === maxRetries) {
  return response  // 直接返回，不抛出
}
```

因为调用方可能需要读取 `response` 中的错误信息（如错误 JSON 体）。如果抛出异常，调用方就失去了获取详细错误信息的机会。

## 5. 运行与验证

```bash
# 查看 retry.ts 的完整代码
cat src/ai/retry.ts

# 验证重试逻辑
cat << 'EOF' > /tmp/test-retry.ts
import { fetchWithRetry } from './src/ai/retry.js'

// 测试不可重试的状态码（预期：立即返回）
async function testNonRetryable() {
  // 模拟一个 400 错误，应直接返回，不重试
  const result = await fetchWithRetry('https://httpbin.org/status/400', {
    method: 'GET',
  })
  console.log('400 status:', result.status)  // 应输出 400
}

// 测试可重试的状态码（预期：重试多次）
async function testRetryable() {
  const result = await fetchWithRetry('https://httpbin.org/status/503', {
    method: 'GET',
  })
  console.log('503 status:', result.status)  // 应输出 503（重试后仍失败）
}

testNonRetryable().catch(console.error)
testRetryable().catch(console.error)
EOF
```

## 6. 小结

`fetchWithRetry` 通过指数退避策略，在 LLM API 调用中提供了优雅的容错机制。它只重试可恢复的错误（429、502、503、504），对不可恢复的错误直接返回，避免了不必要的等待。同时，对 429 限流错误的特殊处理（使用 `Retry-After` 头）体现了对 API 服务商意图的尊重。

### 思考题

1. 当前的指数退避策略是 `1s → 2s → 4s`，如果改成 `0.5s → 1s → 2s` 会有什么影响？改成 `2s → 4s → 8s` 呢？
2. 为什么 `isRetryable()` 函数设计为独立的纯函数，而不是内联在 `fetchWithRetry` 中？
3. 如果同时有多个并发请求遇到 429 限流，都等待同样的时间后同时重试，会发生什么？如何解决？