---
对应源码: src/session/
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# 会话层 — 持久化、恢复与上下文管理

## 1. 本节目标

理解 piagent 的会话层（Session Layer）如何实现以下三个核心能力：

1. **持久化** — 将用户与 Agent 的对话保存到磁盘，程序重启后不丢失
2. **恢复** — 支持 `-c` 继续上次会话、`-l` 查看所有会话
3. **上下文管理** — 通过压缩机制控制发送给 LLM 的消息量，避免超出上下文窗口

## 2. 前置知识

- 了解 piagent 的基本用法（`pi -c`、`pi -l` 等 CLI 命令）
- 对 TypeScript 的 `async/await`、`fs/promises` 有基本了解
- 了解 Agent 循环（Agent Loop）的基本概念

## 3. 文件列表

| 文件 | 说明 |
|------|------|
| `src/session/storage.ts` | JSONL 文件存储 — 底层读写 |
| `src/session/manager.ts` | 会话管理器 — 上层 CRUD 操作 |
| `src/session/compaction.ts` | 上下文压缩器 — 控制消息数量 |
| `src/session/index.ts` | 统一导出 |

## 4. 整体架构

```
┌─────────────────────────────────────────────────────┐
│                  CLI (cli.ts)                        │
│   -c 继续  │  -l 列表  │  --delete 删除             │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│            SessionManager (manager.ts)               │
│  createSession()  │  loadSession()  │  deleteSession()│
│  listSessions()   │  saveMessage()  │  renameSession()│
│  getLastSession() │  saveLastSession()                │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│            Storage 层 (storage.ts)                    │
│  appendMessage()  │  readMessages()  │  writeMessages()│
│  deleteSession()  │  listSessions()                   │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │  .jsonl 文件     │
            │  ~/.piagent/    │
            │  sessions/      │
            └─────────────────┘

另外，Agent 每次发给 LLM 的消息会经过 Compactor 处理：
┌──────────┐     ┌──────────────┐     ┌──────────┐
│  Agent   │ ──► │  Compactor   │ ──► │   LLM    │
│ 消息列表  │     │  compact()   │     │          │
└──────────┘     └──────────────┘     └──────────┘
```

## 5. 核心概念

### 5.1 会话（Session）

一个会话对应一次用户与 Agent 的完整对话。每个会话由以下几个要素标识：

- **sessionId** — 唯一标识，格式为 `session-{timestamp}`
- **JSONL 文件** — 存在 `~/.piagent/sessions/{sessionId}.jsonl`
- **元数据消息** — 第一条消息（`id: 'meta'`）记录会话名称和创建时间

### 5.2 JSONL 存储

JSONL（JSON Lines）是一种每行一个 JSON 对象的格式，相比 JSON 数组：

- 支持**追加写**，无需加载整个文件
- 读取时按行解析，适合**大文件**
- 通过 `id` + `parentId` 可构建**树形结构**，支持分支

### 5.3 上下文压缩

当对话历史过长时，Compactor 将早期消息合并为一条摘要，保留最近 N 条完整消息，确保发给 LLM 的上下文不会超出模型窗口限制。

## 6. 学习路径

1. 先读 [01-session-manager.md](01-session-manager.md) — 了解会话的增删改查
2. 再读 [02-jsonl-storage.md](02-jsonl-storage.md) — 理解底层存储格式
3. 最后读 [03-context-compaction.md](03-context-compaction.md) — 掌握上下文压缩机制
4. 完成 [practice.md](practice.md) — 动手练习巩固

## 7. 小结

会话层是 piagent 从"一次性对话"进化到"持久化交互"的关键。通过 JSONL 文件实现了零依赖的持久化存储，通过 Compactor 解决了 LLM 上下文窗口限制问题。会话层为上层 CLI 和界面提供了 `-c`（继续）、`-l`（列表）等用户友好功能的基础。