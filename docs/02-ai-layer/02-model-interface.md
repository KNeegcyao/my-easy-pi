---
对应源码: 'src/ai/types.ts（Model 接口）、src/ai/providers/*.ts（实现）'
最后更新: 2026-08-08
适用版本: piagent v0.1+
---

# Model 抽象接口

## 1. 本节目标

理解 `Model` 接口的设计思路，以及为什么选择 `AsyncIterable` 作为流式返回类型。

## 2. 前置知识

- 了解 TypeScript 的 `interface` 和 `implements`
- 了解 `async generator` 和 `for await...of` 语法
- 了解 LLM 流式响应的基本概念（Token 逐个生成）

## 3. 核心概念

### 3.1 Model 接口

```typescript
export interface Model {
  id: string
  provider: string
  stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent>
  supportsTools(): boolean
  supportsThinking(): boolean
}
```

`Model` 接口是 AI 层的核心抽象，它定义了所有 LLM 模型的统一行为：

- **id** — 模型标识，如 `"claude-sonnet-4-20250514"`
- **provider** — 提供商名称，如 `"anthropic"`
- **stream()** — 核心方法，流式调用 LLM
- **supportsTools()** — 是否支持工具调用
- **supportsThinking()** — 是否支持思考过程输出

### 3.2 为什么用 `AsyncIterable` 而不是回调？

**方案一：回调函数**

```typescript
// 回调方式
stream(context, {
  onText: (delta) => { ... },
  onToolCall: (tc) => { ... },
  onDone: () => { ... },
})
```

**方案二：`AsyncIterable`**

```typescript
// AsyncIterable 方式
for await (const event of model.stream(context)) {
  switch (event.type) { ... }
}
```

`AsyncIterable` 的优势：

1. **天然支持 `for await...of`** — 消费方代码更简洁
2. **组合性更强** — 可以轻松地 `map`、`filter`、`take` 等操作
3. **错误处理统一** — 用 `try/catch` 包裹整个循环即可
4. **背压支持** — 消费方可以控制读取速度
5. **与 `AbortSignal` 配合** — 可以优雅地取消流

### 3.3 流式事件类型

`LLMEvent` 是流式通信的"语言"，定义了六种事件类型：

| 事件类型 | 触发时机 | 数据字段 |
|---------|---------|---------|
| `text_delta` | 生成文本时 | `delta: string` |
| `tool_call_start` | 开始调用工具时 | `id`, `name`, `args` |
| `tool_call_delta` | 工具参数增量时 | `id`, `delta: string` |
| `thinking_delta` | 思考过程输出时 | `delta: string` |
| `error` | 发生错误时 | `message: string` |
| `done` | 流结束时 | `stopReason?` |

### 3.4 能力声明

```typescript
supportsTools(): boolean
supportsThinking(): boolean
```

这两个方法让上层代码可以在调用前判断模型的能力，避免在不支持工具调用的模型上使用工具。例如：

```typescript
if (model.supportsTools()) {
  context.tools = defineTools()
}
```

## 4. 代码实现

### 4.1 使用 `async generator` 实现 `stream()`

以 Anthropic Provider 为例，`stream()` 方法使用 `async generator` 实现：

```typescript
class AnthropicModel implements Model {
  id: string
  provider = 'anthropic'

  async *stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent> {
    // 1. 构建请求体
    const body = this.buildRequestBody(context)

    // 2. 发起流式请求
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

    // 3. 处理错误
    if (!response.ok) {
      const errorText = await response.text()
      // yield 关键字向 AsyncIterable 流中发射一个事件
      yield { type: 'error', message: `Anthropic API Error (${response.status}): ${errorText}` }
      return
    }

    // 4. 读取流式响应（SSE 格式）
    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', message: 'No response body' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        // 逐块读取响应体
        const { done, value } = await reader.read()
        if (done) break

        // 解码字节并追加到缓冲区
        buffer += decoder.decode(value, { stream: true })

        // 按行分割（SSE 每行一个事件）
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 最后一段可能不完整，留到下次

        // 逐行解析并 yield 事件
        for (const line of lines) {
          const event = this.parseSSELine(line)
          if (event) yield event
        }
      }

      // 处理缓冲区剩余内容
      if (buffer.trim()) {
        const event = this.parseSSELine(buffer.trim())
        if (event) yield event
      }
    } finally {
      reader.releaseLock()
    }
  }
}
```

**逐行解释：**

1. `async *stream()` — `*` 表示这是一个 async generator，可以用 `yield` 逐个返回值
2. `yield { type: 'error', ... }` — 向调用方发射一个错误事件（不是抛出异常，而是作为流中的一条数据）
3. `response.body?.getReader()` — 获取响应体的 `ReadableStreamDefaultReader`，用于逐块读取
4. `buffer += decoder.decode(value, { stream: true })` — 将字节解码为字符串，`stream: true` 表示可能有未完成的字符
5. `buffer.split('\n')` — SSE 协议按行分割事件
6. `buffer = lines.pop() || ''` — 最后一段可能不完整，留到下次读取
7. `reader.releaseLock()` — 在 `finally` 块中释放 `reader` 锁，确保资源释放

### 4.2 消费方代码

```typescript
// 调用方可以用 for await...of 消费流
const model = new AnthropicModel('claude-sonnet-4-20250514', apiKey, baseUrl)

for await (const event of model.stream(context)) {
  switch (event.type) {
    case 'text_delta':
      // 逐步输出文本
      process.stdout.write(event.delta)
      break
    case 'thinking_delta':
      // 显示思考过程
      process.stderr.write(`\x1b[33m${event.delta}\x1b[0m`)
      break
    case 'tool_call_start':
      console.log(`\n🔧 调用工具: ${event.name}(${JSON.stringify(event.args)})`)
      break
    case 'done':
      console.log('\n✅ 完成')
      break
    case 'error':
      console.error(`\n❌ ${event.message}`)
      break
  }
}
```

### 4.3 取消流

```typescript
// 使用 AbortController 取消流
const controller = new AbortController()

// 5 秒后超时取消
setTimeout(() => controller.abort(), 5000)

try {
  for await (const event of model.stream(context, { signal: controller.signal })) {
    // ...
  }
} catch (err) {
  if ((err as Error).name === 'AbortError') {
    console.log('请求已取消')
  }
}
```

## 5. 运行与验证

```bash
# 检查类型定义是否正确
npx tsc --noEmit src/ai/types.ts

# 可以用一个简单的测试验证 AsyncIterable 的行为
cat << 'EOF' > /tmp/test-iterable.ts
async function* gen() {
  yield { type: 'text_delta', delta: 'Hello' }
  yield { type: 'text_delta', delta: ' World' }
  yield { type: 'done', stopReason: 'end_turn' }
}

async function main() {
  for await (const event of gen()) {
    console.log(event)
  }
}
main()
EOF
```

## 6. 小结

`Model` 接口通过 `AsyncIterable<LLMEvent>` 提供了一种优雅的流式 LLM 调用方式。与回调方案相比，`AsyncIterable` 让消费方代码更简洁、组合性更强、错误处理更统一。`supportsTools()` 和 `supportsThinking()` 两个方法让上层代码可以在调用前判断模型能力，避免运行时错误。

### 思考题

1. 如果 `stream()` 方法改用 `EventEmitter` 或 `Observable` 模式，代码会有什么不同？各有什么优缺点？
2. 为什么 `yield` 错误事件（`{ type: 'error' }`）而不是 `throw` 一个异常？两种方式对调用方的影响有何不同？
3. 在 SSE 解析中，`buffer = lines.pop() || ''` 这行代码为什么要保留最后一段？如果不保留会出什么问题？