---
对应源码: 'src/ai/ 目录'
最后更新: 2026-08-08
适用版本: piagent v0.1+
---

# 本章练习

## 练习 1：阅读 DeepSeek 的流式解析逻辑

**目标：** 深入理解 SSE 流式解析和工具调用的事件转换。

**任务：**

阅读 `src/ai/providers/deepseek.ts` 中的以下方法，并回答后面的问题：

1. `parseSSELine()` — 第 184-200 行
2. `convertEvent()` — 第 203-264 行

**问题：**

1. DeepSeek 的工具调用可能在单个 chunk 中完整体现（带完整参数），也可能分多个 chunk 流式传输。`convertEvent()` 方法中是如何区分这两种情况的？

2. 当 `tool_call_delta` 事件发生时，`id` 字段为什么是空字符串 `''`？调用方在拼接工具调用参数时，如何知道哪个工具调用正在接收增量数据？

3. 流式解析中使用了 `buffer` 变量来暂存不完整的行数据。如果服务器非常慢，一次只发送一个字节，当前的解析逻辑是否能正确处理？为什么？

**提示：**

查看 `convertEvent()` 中关于 `tool_calls` 的处理逻辑，特别是 `tc.id` 存在和不存在时的分支。

---

## 练习 2：画一个 Provider 的类图

**目标：** 通过画类图理解策略模式在 AI 层的应用。

**任务：**

以 Anthropic Provider 为例，画出以下类/接口的关系图：

- `ProviderFactory` 接口
- `Model` 接口
- `AnthropicProvider` 对象
- `AnthropicModel` 类
- `ModelRegistry` 类

**要求：**

1. 标注出每个类/接口的方法
2. 用箭头表示实现关系（`implements`）和依赖关系
3. 标注出 `ProviderFactory` 和 `Model` 之间的调用链

**参考格式：**

```
┌──────────────────────────────────────────────┐
│              <<interface>>                   │
│              ProviderFactory                 │
│──────────────────────────────────────────────│
│ + create(config): ProviderInstance           │
└──────────────────────────────────────────────┘
          ▲           implements
          │
┌──────────────────────────────────────────────┐
│         AnthropicProvider (const)            │
│──────────────────────────────────────────────│
│ + create(config): { name, listModels, ... }  │
└──────────────────────────────────────────────┘
          │ 创建
          ▼
┌──────────────────────────────────────────────┐
│              <<interface>>                   │
│                 Model                        │
│──────────────────────────────────────────────│
│ + id: string                                 │
│ + provider: string                           │
│ + stream(context): AsyncIterable<LLMEvent>   │
│ + supportsTools(): boolean                   │
│ + supportsThinking(): boolean                │
└──────────────────────────────────────────────┘
          ▲           implements
          │
┌──────────────────────────────────────────────┐
│           AnthropicModel (class)             │
│──────────────────────────────────────────────│
│ - apiKey: string                             │
│ - baseUrl: string                            │
│ + stream(context): AsyncIterable<LLMEvent>   │
│ + supportsTools(): boolean                   │
│ + supportsThinking(): boolean                │
│ - buildRequestBody(context): object          │
│ - parseSSELine(line): LLMEvent | null        │
│ - convertAnthropicEvent(data): LLMEvent|null │
└──────────────────────────────────────────────┘
```

---

## 练习 3：自己实现一个简单的 Provider（模拟）

**目标：** 通过动手实现一个模拟 Provider，巩固对 AI 层各类型和接口的理解。

**任务：**

创建一个模拟 Provider，它不调用真实的 LLM API，而是返回预设的响应。这在开发和测试中非常有用。

**要求：**

1. 实现 `ProviderFactory` 接口，注册一个名为 `mock` 的提供商
2. 支持一个模型 `mock-chat`
3. `stream()` 方法根据输入消息，返回预设的回复（硬编码或基于关键词匹配）
4. 不需要实现真正的 API 调用，返回模拟的流式事件

**参考框架：**

```typescript
import type {
  ProviderFactory, Model, ModelContext, ModelInfo,
  LLMEvent, StreamOptions,
} from '../types.js'

// 预设的响应映射
const MOCK_RESPONSES: Record<string, string> = {
  '你好': '你好！我是模拟助手。',
  '天气': '今天是晴天，温度 25°C。',
  '默认': '这是一个模拟响应。',
}

export const MockProvider: ProviderFactory = {
  create(config) {
    return {
      name: 'mock',

      listModels(): ModelInfo[] {
        return [
          { id: 'mock-chat', provider: 'mock', description: '模拟聊天模型' },
        ]
      },

      createModel(modelId: string): Model | null {
        if (modelId !== 'mock-chat') return null
        return new MockModel()
      },
    }
  },
}

class MockModel implements Model {
  id = 'mock-chat'
  provider = 'mock'

  supportsTools(): boolean {
    return false
  }

  supportsThinking(): boolean {
    return false
  }

  async *stream(context: ModelContext, options?: StreamOptions): AsyncIterable<LLMEvent> {
    // 1. 从输入消息中提取用户最后一条消息
    const lastUserMessage = [...context.messages]
      .reverse()
      .find(m => m.role === 'user')

    const userText = lastUserMessage
      ? (typeof lastUserMessage.content === 'string'
          ? lastUserMessage.content
          : lastUserMessage.content.map(c => c.type === 'text' ? c.text : '').join(''))
      : ''

    // 2. 查找匹配的回复
    const response = MOCK_RESPONSES[userText] || MOCK_RESPONSES['默认']

    // 3. 模拟逐字输出（每个字作为一个 text_delta）
    for (const char of response) {
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 50))
      yield { type: 'text_delta', delta: char }
    }

    // 4. 发送完成事件
    yield { type: 'done', stopReason: 'end_turn' }
  }
}
```

**验证：**

```typescript
import { ModelRegistry } from './src/ai/registry.js'
import { MockProvider } from './src/ai/providers/mock.js'

const registry = new ModelRegistry()
registry.setProvider('mock', MockProvider)

const model = registry.getModel('mock', 'mock-chat', { apiKey: '' })

if (model) {
  for await (const event of model.stream({
    systemPrompt: '你是一个助手',
    messages: [{ role: 'user', content: '你好' }],
  })) {
    if (event.type === 'text_delta') {
      process.stdout.write(event.delta)
    }
  }
  // 输出: 你好！我是模拟助手。
}
```

**扩展挑战（选做）：**

1. 为 MockProvider 添加工具调用支持，模拟 LLM 调用工具的场景
2. 添加一个 `delay` 配置项，控制模拟响应的速度
3. 添加一个 `failRate` 配置项，模拟部分请求失败的情况（用于测试重试机制）

---

## 总结

完成这三个练习后，你应该能够：

1. 理解 SSE 流式解析的细节和边界情况
2. 画出 Provider 的类图，清晰表达策略模式的关系
3. 独立实现一个新的 Provider，包括工厂、模型和事件转换

这些练习覆盖了 AI 层最核心的概念和实现，是后续理解 Agent 层的基础。