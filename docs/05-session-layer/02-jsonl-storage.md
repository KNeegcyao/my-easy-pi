---
对应源码: src/session/storage.ts
最后更新: 2026-08-08
适用版本: my-easy-pi v0.1.0
---

# JSONL 存储 — 零依赖的持久化方案

## 1. 本节目标

理解 my-easy-pi 为什么选择 JSONL 而不是 JSON 数组作为存储格式，以及 JSONL 如何通过 `id + parentId` 支持树形结构。

## 2. 前置知识

- 了解 JSON 序列化/反序列化
- 了解文件系统基本操作（读、写、追加、删除）
- 了解树形结构的基本概念

## 3. 核心概念

### 3.1 什么是 JSONL？

JSONL（JSON Lines）是一种每行包含一个独立 JSON 对象的文本格式。

```
{"id":"msg1","parentId":null,"role":"user","content":"你好","createdAt":1722428800000}
{"id":"msg2","parentId":"msg1","role":"assistant","content":"你好！有什么可以帮你的？","createdAt":1722428801000}
{"id":"msg3","parentId":"msg2","role":"user","content":"帮我写个排序算法","createdAt":1722428802000}
```

### 3.2 为什么用 JSONL 而不是 JSON 数组？

| 特性 | JSON 数组 | JSONL |
|------|-----------|-------|
| 追加写 | ❌ 需要读取整个文件，解析，追加，重新写入 | ✅ 直接 `appendFile` 即可 |
| 大文件支持 | ❌ 必须全部加载到内存 | ✅ 可逐行读取（流式处理） |
| 树形结构 | ❌ 需要额外维护索引 | ✅ 每行独立，通过 `parentId` 关联 |
| 人类可读性 | ✅ 格式化后易读 | ✅ 每行独立，grep 友好 |
| 文件大小 | 略小（无换行符开销） | 略大（每行末尾有换行符） |

**核心原因**：Agent 的对话是**增量生成**的，每次都重写整个文件是浪费。JSONL 天然支持追加写（append-only），每一条新消息只需一次 `appendFile` 调用。

### 3.3 存储路径

```mermaid graph TB
    Sessions["~/.my-easy-pi/sessions/"]
    S1["session-1722428800000.jsonl"]
    S2["session-1722428900000.jsonl"]
    S3["session-1722429000000.jsonl"]

    Sessions --> S1
    Sessions --> S2
    Sessions --> S3
```

每个会话对应一个 `.jsonl` 文件，文件名 = `sessionId.jsonl`。

### 3.4 树形结构

通过 `id` + `parentId` 实现树形结构：

```mermaid graph TB
    root["root (parentId: null)"]
    msg1["msg1 (id: 'msg1', parentId: null)"]
    msg2["msg2 (id: 'msg2', parentId: 'msg1')"]
    msg3["msg3 (id: 'msg3', parentId: 'msg2')<br/>← 当前活跃分支"]
    msg4["msg4 (id: 'msg4', parentId: 'msg1')<br/>← 分支点"]
    msg5["msg5 (id: 'msg5', parentId: null)"]

    root --> msg1
    root --> msg5
    msg1 --> msg2
    msg1 --> msg4
    msg2 --> msg3
```

每一条消息通过 `parentId` 指向其父消息，形成一条从根到叶的路径。`getActiveBranch()` 从最后一条消息回溯到根，得到当前活跃分支。

## 4. 代码实现

### 4.1 存储目录管理

```typescript
import { appendFile, readFile, writeFile, unlink, readdir, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { AgentMessage } from '../ai/types.js'

// 会话文件存储目录，相对项目根目录
const SESSION_DIR = join(process.cwd(), '.my-easy-pi', 'sessions')

/** 确保会话目录存在 */
async function ensureDir(): Promise<void> {
  if (!existsSync(SESSION_DIR)) {
    await mkdir(SESSION_DIR, { recursive: true })
  }
}
```

- 使用 `fs/promises` 的异步 API，非阻塞
- 目录路径为 `{cwd}/.my-easy-pi/sessions/`
- `ensureDir()` 在每次写操作前调用，确保目录存在

### 4.2 追加写入 — `appendMessage`

```typescript
/** 追加一条消息到 JSONL 文件 */
export async function appendMessage(sessionId: string, message: AgentMessage): Promise<void> {
  await ensureDir()                                    // 确保目录存在
  const line = JSON.stringify(message) + '\n'          // 序列化为 JSON 并追加换行符
  await appendFile(join(SESSION_DIR, `${sessionId}.jsonl`), line, 'utf-8')
}
```

**写入流程**：
1. 将 `AgentMessage` 对象序列化为 JSON 字符串
2. 在末尾追加换行符（`\n`）
3. 使用 `appendFile` 追加到文件末尾

**为什么是 append-only？**
- Agent 的消息是逐条生成的，每次新消息只需一次文件追加
- 不需要读取已有内容，性能更高
- 即使程序意外退出，已有数据也不会丢失

### 4.3 读取全部 — `readMessages`

```typescript
/** 读取整个会话的所有消息 */
export async function readMessages(sessionId: string): Promise<AgentMessage[]> {
  await ensureDir()
  const filePath = join(SESSION_DIR, `${sessionId}.jsonl`)
  if (!existsSync(filePath)) return []                  // 文件不存在返回空数组

  const content = await readFile(filePath, 'utf-8')     // 读取整个文件
  return content
    .split('\n')                                        // 按换行符分割
    .filter(Boolean)                                    // 过滤空行（文件末尾可能有多余换行）
    .map(line => JSON.parse(line) as AgentMessage)      // 每行解析为 AgentMessage
}
```

**读取流程**：
1. 读取整个 JSONL 文件
2. 按 `\n` 分割成行数组
3. 过滤空行（`filter(Boolean)`）
4. 每行 `JSON.parse` 还原为 `AgentMessage`

**注意**：当前实现是一次性读取整个文件到内存。对于超长对话（数万条消息），可以考虑流式读取。

### 4.4 覆盖写入 — `writeMessages`

```typescript
/** 覆盖写入整个会话 */
export async function writeMessages(sessionId: string, messages: AgentMessage[]): Promise<void> {
  await ensureDir()
  // 将所有消息序列化为 JSONL 格式
  const lines = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
  await writeFile(join(SESSION_DIR, `${sessionId}.jsonl`), lines, 'utf-8')
}
```

- 用于重命名等需要修改已有数据的场景
- 一次性写入整个文件，覆盖原有内容

### 4.5 删除会话 — `deleteSession`

```typescript
/** 删除会话文件 */
export async function deleteSession(sessionId: string): Promise<void> {
  const filePath = join(SESSION_DIR, `${sessionId}.jsonl`)
  if (existsSync(filePath)) {
    await unlink(filePath)                              // 删除文件
  }
}
```

### 4.6 列出会话 — `listSessions`

```typescript
/** 列出所有会话 */
export async function listSessions(): Promise<string[]> {
  await ensureDir()
  const files = await readdir(SESSION_DIR)              // 读取目录下所有文件
  return files
    .filter(f => f.endsWith('.jsonl'))                  // 只保留 .jsonl 文件
    .map(f => f.replace('.jsonl', ''))                  // 去掉扩展名，得到 sessionId
}
```

## 5. 运行与验证

### 5.1 查看 JSONL 文件内容

```bash
# 列出所有会话文件
ls ~/.my-easy-pi/sessions/

# 查看某个会话的内容
cat ~/.my-easy-pi/sessions/session-1722428800000.jsonl

# 使用 jq 格式化输出（如果安装了 jq）
cat ~/.my-easy-pi/sessions/session-1722428800000.jsonl | jq .
```

### 5.2 统计会话消息数

```bash
# 统计消息数量
wc -l ~/.my-easy-pi/sessions/session-1722428800000.jsonl
```

### 5.3 用 grep 搜索历史对话

```bash
# 在所有会话中搜索关键词
grep -r "排序算法" ~/.my-easy-pi/sessions/
```

## 6. 小结

JSONL 是 my-easy-pi 会话层的存储基石。它的设计选择背后有明确的工程考量：

1. **append-only 写入** — 与 Agent 对话的增量生成模式完美匹配
2. **每行独立** — 天然支持 `id + parentId` 树形结构，无需额外索引
3. **零依赖** — 只用 Node.js 内置的 `fs/promises`，无需数据库
4. **grep 友好** — 命令行工具可以直接搜索历史对话

### 思考题

1. 如果会话文件达到 100MB，`readMessages()` 一次性读取整个文件会有问题吗？如何改进？
2. 为什么 `appendMessage` 调用 `ensureDir()` 而 `readMessages` 也需要调用它？（提示：思考目录首次被删除的场景）
3. 如果想把存储从 JSONL 迁移到 SQLite，需要修改哪些文件？接口是否需要变化？

> ← [上一节](./01-session-manager.md) · [下一节](./03-context-compaction.md) →
>
> [📚 返回章节首页](../05-session-layer/README.md)