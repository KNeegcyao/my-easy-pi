---
source: src/ai/types.ts + src/session/manager.ts + src/agent/loop.ts + src/tui/host.ts
last_updated: 2026-08-17
version: 1.0.0
---

# 分支与撤回 — Event Sourcing 在对话中的实践

> **撤回一条消息，不删除它。标记它、跳过它、让它活在历史里。**
>
> 这是 pi 持久化的核心理念，也是本章要讲的模式：**Event Sourcing（事件溯源）**。
> 你不必知道这个名词——你只需要理解一个文件、一个标记、一个分支。

## 为什么撤回不能删消息？

### 初学者最常见的误区

```typescript
// ❌ 新手直觉：撤回 = 删除
messages.pop()  // 删掉最后一条
fs.writeFileSync('chat.jsonl', JSON.stringify(messages))
```

两行代码，两个问题：

1. **文件是追加写入的** — `pop()` 只改了内存，JSONL 文件里那行数据还在。重启 `-c` 一看，撤回的消息"复活"了。
2. **把撤回从"理解"降级成了"抹除"** — 你丢失了"用户曾经撤回了一条消息"这个事实。在审计、调试、回放场景下，这个事实很有价值。

### pi 的思路：不删，只标记

```
文件中的记录（永不被删除）:
  第 3 行: {"id":"m1","role":"user",    "content":"帮我写个快排"}
  第 4 行: {"id":"m2","role":"assistant","content":"这是快排的实现..."}
  第 5 行: {"id":"m3","role":"assistant","content":"这是快排的实现...", "revoked": true}
                                                        ↑
                                                    撤回只是给这条消息打了一个标记
```

逻辑层读取时跳过 `revoked: true` 的消息，但文件里**那条记录永远在**。

## Event Sourcing 是什么（用聊天讲明白）

**Event Sourcing = 不删不改，只追加。**

想象你在写日记：

| 方式 | 做法 | 问题 |
|------|------|------|
| **传统 CRUD** | "昨天写错了，撕掉那页重写" | 撕掉的那页再也看不到了 |
| **Event Sourcing** | "昨天写错了，今天写一行补充：『撤回昨天第三段』" | 两页都在，但你知道该跳过哪段 |

聊天记录就是一本追加写入的日记。`revoked: true` 就是那行补充。

```
                    时间 →
──────────────────────────────────────→
 "帮我写个快排"  │   "这是快排..."  │  "这是快排..."[revoked] │  "帮我写个归并"
      m1         │       m2         │          m2'           │       m3
                 │                  │                        │
                 │    撤回 → 标记 ───┘                        │
                 │                  ← 新消息从 m1 分支出去 ────┘
```

## 代码实现（三步）

### 第一步：给消息加一个"撤回"字段

`src/ai/types.ts`：

```typescript
export interface AgentMessage {
  id: string
  parentId: string | null
  role: AgentMessageRole
  content: string
  // ... 其他字段
  revoked?: boolean       // ← 新加的：true = 已撤回
  createdAt: number
}
```

就一行。所有代码都在用 `AgentMessage`，加一个可选字段不会破坏任何东西。

### 第二步：撤回时打标记，不删除

`src/tui/host.ts` 中的 `undoLastTurn()`：

```typescript
// 旧行为：删消息
agent.state.messages.splice(i, 1)  // ❌ 文件里还在，重启复活

// 新行为：标 revoked
agent.state.messages[i].revoked = true  // ✅ 标记，保留历史

// 然后把整个 messages 数组写回文件
storage.writeMessages(sessionId, agent.state.messages)
```

注意 `storage.writeMessages` 会**重写整个 JSONL 文件**。这是唯一一个"不是追加"的写操作——但它只在撤回时触发一次，可以接受。

### 第三步：读消息时过滤撤回的

**发往 LLM 时过滤**（`src/agent/loop.ts`）：

```typescript
function defaultConvertToLlm(messages) {
  return messages
    .filter(m => !m.revoked        // ← 跳过撤回消息
              && m.role !== 'notification'
              && m.role !== 'thinking')
    .map(m => { /* ... */ })
}
```

**恢复会话时过滤**（`src/session/manager.ts`）：

```typescript
getActiveBranch(messages) {
  // 从最后一条非撤回消息开始
  let current = messages.slice().reverse()
    .find(m => !m.revoked)

  // 沿 parentId 回溯，跳过撤回的父节点
  while (current) {
    branch.unshift(current)
    const parent = map.get(current.parentId)
    current = parent && !parent.revoked ? parent : null
  }
  return branch
}
```

## 完整的撤回流程

```
用户按 ESC
    │
    ├── 流式进行中？
    │     ├── 是 → agent.abort()    ← 中断 LLM 生成
    │     │        abortingTurn = true  ← 防止异步事件回卷
    │     └── 否 → 直接走撤回
    │
    ├── undoLastTurn()
    │     ├── 从 chatContainer 移除 UI 组件（streamTurn、spacer）
    │     ├── 标记最后一条 assistant 消息为 revoked: true
    │     ├── 流式撤回无 assistant → 直接移除最后一条 user 消息
    │     └── storage.writeMessages() 写回文件
    │
    ├── chatContainer 显示"已撤回"
    └── 用户可以重新输入
```

### 流式撤回的特殊处理

当 AI 还在回复时按下 ESC：

1. `agent.abort()` 中断 LLM 请求
2. `undoLastTurn()` 找不到 assistant 消息（还没生成完）
   → 改为直接移除最后一条 user 消息
3. Agent 异步恢复后试图推入一条 partial assistant 消息
   → `abortingTurn` 标志让 `message_end` 处理器跳过它并 `pop()` 掉

## 验证效果

### 撤回后文件不丢数据

```bash
# 1. 启动 TUI，说句话，等回复，按 ESC 撤回
npx tsx src/cli.ts -i

# 2. 查看 JSONL 文件——撤回的消息还在，只是多了 revoked: true
cat .my-easy-pi/sessions/session-*.jsonl | grep revoked
# 输出: {"id":"msg-xxx","role":"assistant","content":"...","revoked":true,...}
```

### 撤回后重启不会复活

```bash
# 3. 继续上次会话——撤回的消息不会出现
npx tsx src/cli.ts -c
# 看到的是撤回前的 user 消息，没有那条 assistant 回复
```

### 撤回后可以重新输入

撤回后输入框已清空，直接打新的消息。新消息的 `parentId` 指向撤回前的 user 消息，形成分支：

```
   user: "帮我写个快排"  ← parentId: null
   assistant: "..."     ← parentId: user, revoked: true
   user: "算了，归并"   ← parentId: user（分支出去）
```

## 为什么这对初学者友好

| 概念 | 用聊天讲 | 学术名词 |
|------|----------|----------|
| 不删只追加 | 写日记不撕页 | Event Sourcing |
| 打标记跳过 | 给旧日记画个"已废弃" | Soft Delete / Tombstone |
| parentId 回溯 | 顺着"上一条"箭头找回去 | 不可变数据结构 |
| 重写文件=快照 | 偶尔整理一下日记本 | Snapshot / Compaction |

每个概念都有**文件系统层面的可观测效果**——`cat` 看一眼 JSONL 就全明白了。这比画 UML 图、讲 CQRS、聊分布式共识直观得多。

## 练习

1. **观察撤回的痕迹**
   - 启动 TUI，发一条消息，等回复后按 ESC
   - `cat .my-easy-pi/sessions/*.jsonl | tail -5` 看看撤回后多写了什么
   - 能不能在 JSONL 里找到那条 `revoked: true` 的消息？

2. **撤回复活实验**
   - 撤回一条消息后，手动编辑 JSONL 文件，把 `revoked: true` 改成 `revoked: false`
   - 重启 `-c`，那条消息是不是"复活"了？
   - 这说明了撤回的本质是什么？

3. **扩展思考**
   - 如果把 `revoked` 改成 `"reason": "user_undo"`，能不能实现"撤回时告诉用户原因"？
   - 如果想实现"管理员可以恢复被撤回的消息"，需要改哪里？
   - `storage.writeMessages` 重写整个文件，如果文件很大（10000 条消息）会慢吗？怎么优化？

> [📚 返回章节首页](../05-session-layer/README.md)