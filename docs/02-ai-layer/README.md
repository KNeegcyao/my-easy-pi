---
对应源码: 'src/ai/ 目录'
最后更新: 2026-08-08
适用版本: my-easy-pi v0.1+
---

# AI 层 — 章节概览

## 1. 本节目标

AI 层是整个 my-easy-pi 的"底层通信层"，负责屏蔽不同 LLM 提供商（Anthropic、OpenAI、DeepSeek 等）的 API 差异，向上层 Agent 提供统一的流式调用接口。完成本章学习后，你将理解：

- 如何设计一套通用的 LLM 调用抽象
- 策略模式在实际项目中的应用
- 流式响应的解析与事件分发
- 统一错误码与重试机制的设计思路

## 2. 前置知识

- 熟悉 TypeScript 基础语法（类型、接口、泛型）
- 了解 `async generator` 和 `AsyncIterable` 的概念
- 了解 HTTP 请求和 SSE（Server-Sent Events）基本概念
- 了解 LLM API 的基本调用方式（Chat Completion 格式）

## 3. 架构概览

```
┌─────────────────────────────────────────────────────┐
│  上层 Agent / 应用层                                 │
│  (不关心底层是哪个 LLM 提供商)                        │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Model 抽象接口 (stream / supportsTools / ...)       │
│  ┌───────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ DeepSeekModel │  │OpenAIModel  │  │Anthropic… │  │
│  └───────┬───────┘  └──────┬──────┘  └─────┬─────┘  │
│          │                 │                │         │
│  ┌───────┴─────────────────┴────────────────┴──────┐ │
│  │          ProviderFactory (策略模式)              │ │
│  └──────────────────────┬─────────────────────────┘ │
│                         │                            │
│  ┌──────────────────────┴─────────────────────────┐ │
│  │           ModelRegistry (注册表)                │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │  AppError 错误体系 │  │  fetchWithRetry 重试机制 │  │
│  └──────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 4. 文件列表

| 文件 | 职责 |
|------|------|
| `src/ai/types.ts` | 核心类型定义（Model、LLMEvent、AgentMessage、ToolCall 等） |
| `src/ai/registry.ts` | ModelRegistry — 模型注册与获取 |
| `src/ai/retry.ts` | 指数退避重试机制 |
| `src/ai/errors.ts` | 统一错误码体系 |
| `src/ai/providers/deepseek.ts` | DeepSeek Provider 实现 |
| `src/ai/providers/anthropic.ts` | Anthropic Provider 实现 |
| `src/ai/providers/openai.ts` | OpenAI Provider 实现 |
| `src/ai/index.ts` | 统一导出入口 |

## 5. 核心设计原则

### 5.1 抽象优于具体

所有 LLM 提供商都实现同一个 `Model` 接口，上层代码只依赖接口，不依赖具体实现。新增一个提供商只需添加一个新的 Provider 文件，无需修改已有代码。

### 5.2 流式优先

LLM 响应天然是流式的（Token 逐个生成），因此 `stream()` 方法使用 `AsyncIterable<LLMEvent>` 作为返回值，让调用方可以用 `for await...of` 消费事件流。

### 5.3 统一事件格式

不同提供商的 API 事件格式各不相同（Anthropic 使用 `content_block_start`/`content_block_delta`，OpenAI 使用 `choices[].delta`），通过 `LLMEvent` 统一为六种事件类型，上层代码只需处理这六种事件。

### 5.4 分层错误处理

错误码按模块分类（`AUTH_*`、`CONFIG_*`、`PROVIDER_*`、`TOOL_*`、`INTERNAL_*`），每个错误都附带修复建议，让用户能快速定位问题。

## 6. 依赖关系

```
types.ts  ←  被所有模块引用（类型定义的基础）
    ↑
errors.ts  ←  独立，被上层模块引用
    ↑
retry.ts   ←  被 Provider 实现引用
    ↑
providers/   ← 依赖 types.ts 和 retry.ts
    ↑
registry.ts  ← 依赖 types.ts
    ↑
index.ts     ← 统一导出
```

## 7. 小结

AI 层是 my-easy-pi 的"地基"，它通过四层抽象（类型定义 → Model 接口 → Provider 策略 → 注册中心）将 LLM 调用的复杂性隔离在底层，让上层 Agent 代码可以专注于业务逻辑。此外，统一错误码和重试机制为系统的健壮性提供了保障。

### 思考题

1. 为什么 `AgentMessage` 比 `LLMMessage` 多出了 `notification` 和 `thinking` 角色？这些角色出现在 LLM 调用中会怎样？
2. 如果要在 `LLMEvent` 中新增一种事件类型（如 `image_delta`），需要修改哪些文件？
3. 为什么 `ModelRegistry.getModel()` 每次调用都创建新的 Model 实例，而不是缓存复用？

> ← [📚 返回学习指南](../README.md) · [下一章](../03-agent-layer/README.md) →
>
> → 下一篇: [01-core-types.md](./01-core-types.md)