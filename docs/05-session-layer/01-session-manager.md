---
对应源码: src/session/manager.ts
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# 会话管理 — SessionManager

## 1. 本节目标

理解 `SessionManager` 类如何封装会话的完整生命周期，包括：

- 创建、加载、删除、列出会话
- 与 CLI 的集成（`-c` 继续、`-l` 列表）
- 自动命名机制
- 消息保存流程

## 2. 前置知识

- 了解 JSONL 文件格式（见 [02-jsonl-storage.md](02-jsonl-storage.md)）
- TypeScript 类与异步编程
- 了解 `fs/promises` 的基本操作

## 3. 核心概念

### 3.1 会话生命周期

```
createSession() ──► 保存 meta 消息 ──► 返回 sessionId
       │
       ▼
saveMessage()  ──► 追加消息到 JSONL 文件
       │
       ▼
loadSession()  ──► 读取 JSONL 文件 ──► 过滤 meta 消息
       │
       ▼
deleteSession() ──► 删除 JSONL 文件
```

#### 用"浏览器标签页"来理解会话

如果把 piagent 想象成一个浏览器，那么：

| 浏览器概念 | 会话管理中的对应 |
|-----------|-----------------|
| 打开一个新标签页 | 创建一个新会话（`createSession()`） |
| 在标签页中浏览网页 | 在会话中与 Agent 对话（`saveMessage()`） |
| 切换到另一个标签页 | 加载另一个会话（`loadSession()`） |
| 关闭标签页 | 删除会话（`deleteSession()`） |
| 标签页标题 | 会话名称（自动根据首条消息命名） |
| 浏览器历史记录 | 会话消息列表（含 parentId 追踪） |
| 标签页分组 | 会话列表（`listSessions()`） |
| 浏览器重启后恢复标签页 | `-c` 参数继续上次会话 |

**关键区别**：浏览器标签页可同时打开多个，而 piagent 在一个终端窗口中一次只活跃一个会话。但你可以在不同终端窗口中同时使用不同会话——每个终端窗口就像浏览器的不同窗口，各自维护自己的"当前标签页"。

### 3.2 多会话创建与切换：时序图

以下展示了创建多个会话并在它们之间切换的完整流程：

```
用户 / CLI              SessionManager              存储层（JSONL）
  │                           │                          │
  │  （首次运行）              │                          │
  │  createSession()          │                          │
  ├──────────────────────────►│                          │
  │                           │  追加 meta 消息           │
  │                           ├─────────────────────────►│
  │                           │◄──── 写入成功 ──────────│
  │◄── 返回 session-1  ────┤                          │
  │                           │                          │
  │  第一条用户消息到达        │                          │
  │  saveMessage(msg1)        │                          │
  ├──────────────────────────►│                          │
  │                           │  追加消息到 session-1     │
  │                           ├─────────────────────────►│
  │                           │                          │
  │  renameSession("排序")    │  （自动重命名）            │
  ├──────────────────────────►│                          │
  │                           │  读取所有消息 → 替换 meta │
  │                           ├─────────────────────────►│
  │                           │◄──── 覆盖写入 ──────────│
  │                           │                          │
  │  （用户想新建一个会话）     │                          │
  │  createSession()          │                          │
  ├──────────────────────────►│                          │
  │                           │  追加 meta 消息           │
  │                           ├─────────────────────────►│
  │                           │◄──── 写入成功 ──────────│
  │◄── 返回 session-2  ────┤                          │
  │                           │                          │
  │  在 session-2 中对话...   │                          │
  │  saveMessage(msg2)        │                          │
  ├──────────────────────────►│                          │
  │                           │  追加消息到 session-2     │
  │                           ├─────────────────────────►│
  │                           │                          │
  │  （用户想回到 session-1）  │                          │
  │  loadSession(session-1)   │                          │
  ├──────────────────────────►│                          │
  │                           │  读取 session-1 的 JSONL  │
  │                           ├─────────────────────────►│
  │                           │◄── 返回消息列表 ────────│
  │◄── 恢复历史消息 ────────┤    （过滤掉 notification）  │
  │                           │                          │
  │  在 session-1 中继续对话   │                          │
  │  saveMessage(msg3)        │                          │
  ├──────────────────────────►│                          │
  │                           │  追加消息到 session-1     │
  │                           ├─────────────────────────►│
```

**关键观察**：
1. 每个会话有独立的 JSONL 文件，互不干扰
2. `createSession()` 只写入一条 meta 消息，非常轻量
3. `loadSession()` 读取整个文件到内存，适合消息量不大的场景
4. 自动重命名发生在首条用户消息到达后，由 `cli.ts` 的订阅逻辑触发

### 3.3 SessionSummary

每个会话的摘要信息，用于列表展示：

```typescript
export interface SessionSummary {
  id: string            // 会话 ID，如 "session-1722428800000"
  name: string           // 会话名称，自动生成或用户命名
  messageCount: number   // 消息数量（不含 meta）
  createdAt: string      // 创建时间
}
```

### 3.4 与 CLI 的集成点

| CLI 参数 | 调用方法 | 行为 |
|----------|----------|------|
| `-c` / `--continue` | `getLastSession()` + `loadSession()` | 恢复上次会话的消息并继续 |
| `-l` / `--list` | `listSessions()` | 打印所有会话的摘要信息 |
| `--delete <id>` | `deleteSession(id)` | 删除指定会话文件 |

## 4. 代码实现

### 4.1 创建会话 — `createSession`

```typescript
/** 创建新会话 */
async createSession(name?: string): Promise<string> {
  // 用时间戳生成唯一 ID，确保不会重复
  const id = `session-${Date.now()}`
  // 存入一条元数据消息作为会话名称
  // meta 消息的 role 为 'notification'，正常加载时会被过滤掉
  await storage.appendMessage(id, {
    id: 'meta',              // 固定 ID，便于查找
    parentId: null,           // meta 消息是根节点
    role: 'notification',     // UI 通知类型，不会被发给 LLM
    content: name || `会话 ${new Date().toLocaleString('zh-CN')}`,
    createdAt: Date.now(),
  })
  return id
}
```

**关键设计**：
- `session-{Date.now()}` 保证了 ID 的全局唯一性
- meta 消息用 `role: 'notification'` 标记，加载时与其他消息区分
- 会话名称默认使用当前时间，后续可被自动命名覆盖

### 4.2 加载会话 — `loadSession`

```typescript
/** 加载会话的所有消息 */
async loadSession(id: string): Promise<AgentMessage[]> {
  const messages = await storage.readMessages(id)
  // 过滤掉元数据消息，只保留有效的对话消息
  // 注意：这里保留了 id === 'meta' 的消息，实际上 meta 也是 notification
  // 所以实际返回的是空数组（meta 被过滤掉）
  return messages.filter(m => m.role !== 'notification' || m.id === 'meta')
}
```

**注意**：当前实现中 `filter` 条件为 `m.role !== 'notification' || m.id === 'meta'`。由于 meta 消息的 `role` 是 `'notification'` 且 `id` 是 `'meta'`，所以 meta 消息会被保留。但其他 `notification` 类型的消息会被过滤。实际效果是：meta 消息保留，其余 `notification` 消息被过滤。

### 4.3 重命名会话 — `renameSession`

```typescript
/** 重命名会话 */
async renameSession(id: string, name: string): Promise<void> {
  const meta: AgentMessage = {
    id: 'meta',
    parentId: null,
    role: 'notification',
    content: name,
    createdAt: Date.now(),
  }
  // 读取所有消息，替换 meta，重新写入
  const allMessages = await storage.readMessages(id)
  const filtered = allMessages.filter(m => m.id !== 'meta')
  filtered.unshift(meta)          // 将新的 meta 放在最前面
  await storage.writeMessages(id, filtered)  // 覆盖写入整个文件
}
```

**重命名流程**：
1. 读取整个 JSONL 文件
2. 过滤掉旧的 meta 消息
3. 在数组头部插入新的 meta 消息
4. 覆盖写入整个文件

### 4.4 删除会话 — `deleteSession`

```typescript
/** 删除会话 */
async deleteSession(id: string): Promise<void> {
  await storage.deleteSession(id)   // 委托给 storage 层
}
```

### 4.5 列出会话 — `listSessions`

```typescript
/** 列出所有会话 */
async listSessions(): Promise<SessionSummary[]> {
  const ids = await storage.listSessions()          // 获取所有 sessionId
  const summaries: SessionSummary[] = []

  for (const id of ids) {
    const messages = await storage.readMessages(id)  // 读取每个会话
    const meta = messages.find(m => m.id === 'meta') // 找到 meta 消息
    summaries.push({
      id,
      name: meta?.content || id,                     // 用 meta 的 content 作为名称
      messageCount: messages.filter(m => m.id !== 'meta').length,  // 有效消息数
      createdAt: meta?.createdAt
        ? new Date(meta.createdAt).toLocaleString('zh-CN')
        : 'unknown',
    })
  }

  return summaries
}
```

**注意**：当前实现遍历所有会话并逐个读取文件，当会话数量很多时可能有性能问题。优化思路：为每个会话维护一个独立的元信息文件。

### 4.6 保存最后活跃会话 — `saveLastSession` / `getLastSession`

```typescript
/** 保存最后活跃的会话 ID */
async saveLastSession(sessionId: string): Promise<void> {
  try {
    const dir = join(homedir(), '.piagent')
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(LAST_SESSION_PATH, sessionId, 'utf-8')
  } catch { /* 不影响主流程 */ }
}

/** 获取最后活跃的会话 ID */
async getLastSession(): Promise<string | null> {
  try {
    if (!existsSync(LAST_SESSION_PATH)) return null
    return await readFile(LAST_SESSION_PATH, 'utf-8') || null
  } catch { return null }
}
```

**关键设计**：
- `last-session` 文件保存在 `~/.piagent/` 目录下
- 异常被静默捕获，不影响主流程
- 这是 `-c` 继续会话功能的基础

### 4.7 保存消息 — `saveMessage`

```typescript
/** 保存消息到会话 */
async saveMessage(sessionId: string, message: AgentMessage): Promise<void> {
  if (message.role === 'notification') return // 不保存纯 UI 消息
  await storage.appendMessage(sessionId, message)
}
```

- `notification` 类型的消息是 UI 通知，不需要持久化
- 追加写，不影响已有数据

### 4.8 获取活跃分支 — `getActiveBranch`

```typescript
/** 从消息列表中获取活跃分支（从根部到最新消息的直线路径） */
getActiveBranch(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length === 0) return []

  const branch: AgentMessage[] = []
  const map = new Map<string, AgentMessage>()     // id → message 的映射表
  for (const msg of messages) {
    map.set(msg.id, msg)
  }

  // 从最后一条消息开始，沿 parentId 链回溯到根
  let current = messages[messages.length - 1]
  while (current) {
    branch.unshift(current)                        // 插入到数组头部
    current = current.parentId ? map.get(current.parentId)! : null as unknown as AgentMessage
  }

  return branch
}
```

**树形结构遍历**：利用 `parentId` 构建的链表，从叶子节点回溯到根节点，得到从根到叶的完整路径。

#### Session 分支（Branch）示意

在实际对话中，LLM 可能会生成多条回复。piagent 的会话模型将这些回复组织成树形结构：

```
消息树结构（每个节点是一条消息，箭头表示 parentId）：
                           助手回复B ◄── 用户反驳
                          /
用户提问 ──► 助手回复A ──┤
                          \
                           助手回复C ◄── 用户追问
                                          │
                                          ▼
                                       助手回复D ◄── 当前活跃分支（绿色路径）
```

**如何追踪活跃分支** — `getActiveBranch()` 从最后一条消息（叶子节点）出发，沿 `parentId` 链回溯到根：

```
第 1 步：从最后一条出发       第 2 步：沿 parentId 回溯      第 3 步：到达根节点
  msg-D ◄── current              msg-C ──► ...                msg-A (root)
    │                              │                            │
    │ parentId = msg-C             │ parentId = msg-B           │ parentId = null
    ▼                              ▼                            ▼
  找到 msg-C                    找到 msg-B                    到达根部，完成
```

**活跃分支路径**（最终结果）：
```
msg-A（根）─► msg-B ─► msg-C ─► msg-D（当前活跃）
```

这就像 Git 的分支——消息树中存在多条分支，`getActiveBranch()` 只返回"当前所在分支"的线性路径。LLM 得到这条路径后，就能理解对话的上下文，而不会被其他分支的消息干扰。

### 4.9 CLI 集成 — 在 cli.ts 中的使用

```typescript
// 在 cli.ts 的 main() 函数中：

// 1. 创建 SessionManager 实例
const sessionManager = new SessionManager()

// 2. 处理 -l（列表）命令
if (args.list) {
  const sessions = await sessionManager.listSessions()
  for (const s of sessions) {
    console.log(`  ${s.id}  |  ${s.name}  |  ${s.messageCount} 条  |  ${s.createdAt}`)
  }
  process.exit(0)
}

// 3. 处理 -c（继续）命令
if (args.continue) {
  const lastId = await sessionManager.getLastSession()
  if (lastId) {
    const msgs = await sessionManager.loadSession(lastId)
    if (msgs.length > 0) { initialMessages = msgs; sessionId = lastId }
  }
}

// 4. 自动保存会话 + 自动命名
if (!sessionId) sessionId = await sessionManager.createSession()
await sessionManager.saveLastSession(sessionId)

// 5. 订阅 Agent 事件，保存消息并自动命名
agent.subscribe(async (event) => {
  if (event.type === 'message_end' && event.message.role !== 'notification') {
    await sessionManager.saveMessage(sessionId!, event.message)

    // 第一条用户消息自动命名会话
    if (!sessionNamed && event.message.role === 'user' && event.message.content) {
      const name = event.message.content.slice(0, 40) + (event.message.content.length > 40 ? '...' : '')
      await sessionManager.renameSession(sessionId!, name)
      sessionNamed = true
    }
  }
})
```

**自动命名机制**：
- 当第一条用户消息到达时，截取前 40 个字符作为会话名称
- 超过 40 字符则追加 `...`
- 通过 `renameSession()` 覆盖之前的默认名称

## 5. 运行与验证

### 5.1 查看会话列表

```bash
# 如果有会话记录
node dist/cli.js -l

# 输出示例：
# session-1722428800000  |  帮我写一个排序算法  |  5 条  |  2026/8/1 14:30:00
# session-1722428900000  |  Python 文件操作     |  3 条  |  2026/8/2 10:15:00
```

### 5.2 继续上次会话

```bash
node dist/cli.js -c
```

### 5.3 删除会话

```bash
node dist/cli.js --delete session-1722428800000
```

### 5.4 查看 last-session 文件

```bash
cat ~/.piagent/last-session
# 输出类似：session-1722428800000
```

## 6. 小结

`SessionManager` 是会话层的核心门面，它封装了底层的存储操作，为上层（CLI、界面）提供了简洁的会话管理 API。核心设计思想：

1. **委托模式** — CRUD 操作委托给 `storage.ts`，职责清晰
2. **元数据分离** — 用 `meta` 消息与会话内容分离，加载时按需过滤
3. **自动命名** — 首条消息内容截取作为会话名称，提升用户体验
4. **异常容忍** — `saveLastSession` 等辅助方法静默处理异常

### 思考题

1. 当前 `listSessions()` 每次都要读取所有会话文件，如果会话数量达到 100 个，有什么优化方案？
2. `getActiveBranch()` 为什么从最后一条消息开始回溯，而不是从第一条开始向下遍历？
3. 如果用户同时开启两个终端窗口，都使用 `-c` 继续同一个会话，会发生什么？如何解决？

> ← [上一节](./README.md) · [下一节](./02-jsonl-storage.md) →
>
> [📚 返回章节首页](../05-session-layer/README.md)