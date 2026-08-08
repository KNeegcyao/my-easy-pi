---
对应源码: src/session/compaction.ts
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# 上下文压缩 — Compactor

## 1. 本节目标

理解为什么需要上下文压缩，以及 Compactor 如何通过"保留最近 N 条 + 摘要"策略控制消息数量。

## 2. 前置知识

- 了解 LLM 的上下文窗口概念（如 Claude 的 200K、GPT-4 的 128K）
- 了解 Agent 循环的基本流程（每轮对话都会将完整历史发给 LLM）
- 了解 `AgentMessage` 类型的基本结构

## 3. 核心概念

### 3.1 为什么需要压缩？

LLM 的上下文窗口是**有限**的。即使像 Claude 这样支持 200K token 的模型，也不能无限累积对话历史。

```
问题：如果不压缩，会发生什么？

第 1 轮：消息 1-2  （2 条，~100 tokens）
第 10 轮：消息 1-20（20 条，~1000 tokens）
第 100 轮：消息 1-200（200 条，~10000 tokens）
第 1000 轮：消息 1-2000（2000 条，~100000 tokens）

→ 最终超出上下文窗口，LLM 报错或开始"遗忘"早期内容
→ 每次请求的 token 持续增长，API 费用越来越高
→ 响应速度越来越慢
```

### 3.2 压缩策略

```
压缩前（25 条消息）：
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│  1  │  2  │  3  │  4  │ ... │     │     │     │     │     │     │     │     │     │     │     │  16 │  17 │  18 │  19 │  20 │  21 │  22 │  23 │  24 │  25 │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
  ↑ 早期消息（超过阈值）                                                          ↑ 最近 N 条（保留完整）
  │                                                                               │
  └── 压缩为一条摘要 ──────────────────────────────────────────────────────────────┘

压缩后（11 条消息）：
┌────────────────────────────────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│  [上下文压缩摘要]              │ 16  │ 17  │ 18  │ 19  │ 20  │ 21  │ 22  │ 23  │ 24  │ 25  │
└────────────────────────────────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

### 3.3 触发条件

- **自动触发**：Agent 每次调用 LLM 前，通过 `transformContext` 回调调用 `compactor.compact()`
- **触发条件**：消息总数超过 `threshold`（默认 20 条）

### 3.4 当前实现 vs 理想实现

| 方面 | 当前实现 | 理想实现 |
|------|----------|----------|
| 摘要生成 | 简单文本拼接，固定提示 | 调用 LLM 生成真正的语义摘要 |
| 信息保留 | 只保留轮数和最早时间 | 保留关键决策、代码变更、错误信息 |
| 压缩率 | 固定保留 N 条 | 根据 token 数动态调整 |
| 迭代压缩 | 每次从原始消息压缩 | 增量式压缩，保留前一次摘要 |

## 4. 代码实现

### 4.1 Compactor 类

```typescript
import type { AgentMessage } from '../ai/types.js'

export interface CompactorOptions {
  /** 触发压缩的消息阈值（默认 20） */
  threshold?: number
  /** 保留的最近消息数（默认 10） */
  keepRecent?: number
}

export class Compactor {
  private threshold: number    // 压缩触发的消息数阈值
  private keepRecent: number   // 保留的最近消息数

  constructor(options?: CompactorOptions) {
    this.threshold = options?.threshold ?? 20     // 默认阈值 20
    this.keepRecent = options?.keepRecent ?? 10    // 默认保留 10 条
  }
  // ...
}
```

**可配置参数**：
- `threshold`：当消息总数超过此值时触发压缩
- `keepRecent`：保留最近的 N 条消息完整不变

### 4.2 压缩入口 — `compact`

```typescript
/** 检查是否需要压缩，需要则返回压缩后的消息列表 */
compact(messages: AgentMessage[]): AgentMessage[] {
  // 如果消息数量未超过阈值，不做任何处理
  if (messages.length <= this.threshold) return messages
  // 超过阈值，执行截断策略
  return this.truncate(messages)
}
```

**核心逻辑**：只有消息数量超过阈值时才执行压缩，否则原样返回。

### 4.3 截断策略 — `truncate`

```typescript
/** 截断策略：保留最近 N 条，之前的消息合并为一条摘要 */
private truncate(messages: AgentMessage[]): AgentMessage[] {
  // 取最近 keepRecent 条消息
  const recent = messages.slice(-this.keepRecent)

  // 计算截断点：消息总数 - 保留数
  const cutoffIndex = messages.length - this.keepRecent
  // 截断点之前的消息（需要压缩的旧消息）
  const olderMessages = messages.slice(0, cutoffIndex)

  // 如果没有旧消息，直接返回原列表
  if (olderMessages.length === 0) return messages

  // 从旧消息生成摘要
  const summary = this.createSummary(olderMessages)
  // 返回 [摘要, ...最近消息]
  return [summary, ...recent]
}
```

**关键步骤**：
1. `messages.slice(-keepRecent)` — 从末尾取 N 条
2. `messages.slice(0, cutoffIndex)` — 取需要压缩的旧消息
3. `this.createSummary(olderMessages)` — 生成摘要消息
4. 返回 `[summary, ...recent]` — 摘要 + 最近消息

### 4.4 摘要生成 — `createSummary`

```typescript
/** 从旧消息生成摘要 */
private createSummary(olderMessages: AgentMessage[]): AgentMessage {
  // 估算轮数（每轮约 2 条消息：user + assistant）
  const turnCount = Math.ceil(olderMessages.length / 2)
  return {
    id: `compact-${Date.now()}`,                    // 唯一 ID
    parentId: null,                                   // 摘要作为新的根节点
    role: 'notification',                             // 通知类型，不会被发给 LLM？
    content: `[上下文压缩] 前面 ${turnCount} 轮对话已被压缩为摘要。` +
      `最早的消息从 ${new Date(olderMessages[0].createdAt).toLocaleString('zh-CN')} 开始。`,
    createdAt: Date.now(),
  }
}
```

**当前摘要内容**：
- 压缩的轮数
- 最早消息的时间

**注意**：这是一个**简化实现**，真正的摘要应该由 LLM 生成，包含对话中的关键信息。

### 4.5 运行时参数调整

```typescript
setThreshold(threshold: number): void { this.threshold = threshold }
setKeepRecent(keep: number): void { this.keepRecent = keep }
```

### 4.6 在 Agent 中的使用

```typescript
// 在 cli.ts 中：
const compactor = new Compactor()

const agent = new Agent({
  // ...
  transformContext: async (messages) => compactor.compact(messages),
  // ...
})
```

Agent 每次调用 LLM 前，会通过 `transformContext` 回调对消息列表进行预处理，Compactor 在此处介入。

## 5. 运行与验证

### 5.1 默认参数验证

```typescript
const compactor = new Compactor()
// threshold = 20, keepRecent = 10

// 测试：15 条消息，不超过阈值
const msgs15 = Array(15).fill(null).map((_, i) => ({
  id: `msg${i}`,
  parentId: i > 0 ? `msg${i-1}` : null,
  role: 'user' as const,
  content: `消息 ${i}`,
  createdAt: Date.now() + i * 1000,
}))
console.log(compactor.compact(msgs15).length)  // 输出：15（未压缩）

// 测试：25 条消息，超过阈值
const msgs25 = Array(25).fill(null).map((_, i) => ({
  id: `msg${i}`,
  parentId: i > 0 ? `msg${i-1}` : null,
  role: 'user' as const,
  content: `消息 ${i}`,
  createdAt: Date.now() + i * 1000,
}))
console.log(compactor.compact(msgs25).length)  // 输出：11（1 条摘要 + 10 条最近）
```

### 5.2 修改参数观察效果

```typescript
const compactor = new Compactor({ threshold: 10, keepRecent: 5 })
// 15 条消息 → 超过阈值 → 1 条摘要 + 5 条最近 = 6 条
```

### 5.3 集成测试

```bash
# 启动交互模式，进行多轮对话后观察压缩效果
node dist/cli.js -i
# 进行 20+ 轮对话后，查看 JSONL 文件中是否出现 compact- 开头的消息
cat ~/.piagent/sessions/session-*.jsonl | grep "compact-"
```

## 6. 小结

Compactor 是 piagent 应对 LLM 上下文窗口限制的关键组件。虽然当前实现还比较简陋（简单的文本截断而非真正的摘要），但它奠定了上下文管理的架构基础。

### 改进方向

1. **LLM 摘要** — 调用 LLM 将旧消息压缩为真正的语义摘要，保留关键信息
2. **动态阈值** — 根据模型的实际上下文窗口大小动态调整压缩参数
3. **增量压缩** — 每次只压缩新增的部分，避免重复处理
4. **Token 精确计算** — 用 token 数而非消息条数作为触发条件

### 思考题

1. 当前实现中，压缩后的摘要消息 `role` 是 `'notification'`，但 `Manager.saveMessage()` 会过滤 `notification` 消息。这意味着摘要不会被持久化，下次恢复会话时又会回到压缩前的状态。这是一个 bug 还是有意为之？
2. 如果用 LLM 生成摘要，每次压缩都调用 LLM 会增加额外成本。如何平衡压缩频率和成本？
3. 如果用户想"回看"被压缩掉的早期对话，当前实现能支持吗？如何改进？