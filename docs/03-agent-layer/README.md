---
source: src/agent/*.ts
last_updated: 2026-08-08
version: 1.0.0
---

# Agent 层 — 章节概览

> Agent 层是 my-easy-pi 的"大脑与中枢神经系统"，负责管理 Agent 的完整生命周期，驱动 LLM 调用和工具执行。

## Agent 层的职责

Agent 层将 AI 层（统一 LLM 接口）和工具层（文件系统等操作能力）串联起来，形成一个完整的"思考-行动-观察"循环：

1. **接收用户输入** → 将用户消息加入消息历史
2. **调用 LLM** → 将消息历史发送给 LLM，获取流式响应
3. **检查工具调用** → 如果 LLM 决定调用工具，提取工具调用信息
4. **执行工具** → 执行工具并收集结果
5. **结果送回 LLM** → 将工具结果追加到消息历史，让 LLM 产生最终回答
6. **重复直到完成** → 循环直到 LLM 不再调用工具

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Agent 层                              │
│                                                         │
│  ┌──────────────┐    ┌──────────────────┐               │
│  │  MessageQueue │    │   AgentState     │               │
│  │  (steering/   │◄───│   (状态管理)      │               │
│  │   follow-up)  │    └──────────────────┘               │
│  └──────┬───────┘                                       │
│         │ 队列消息                               │
│         ▼                                       │
│  ┌──────────────────────────────────────────────┐│
│  │           Agent Loop (loop.ts)               ││
│  │                                              ││
│  │  prompt() → runLoop() → processLLMStream()   ││
│  │                 ↓                            ││
│  │            executeToolCalls()                ││
│  │                 ↓                            ││
│  │            runLoop() 继续循环                 ││
│  └──────────────────────────────────────────────┘│
│         │                                        │
│         ▼                                        │
│  ┌──────────────────┐   ┌──────────────────────┐│
│  │  Event System    │   │  PermissionManager   ││
│  │  (emit/subscribe)│   │  (权限检查)           ││
│  └──────────────────┘   └──────────────────────┘│
│                                                         │
└─────────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
  ┌─────────────┐         ┌──────────────┐
  │   AI 层     │         │  工具层      │
  │  (LLM 调用) │         │  (工具执行)   │
  └─────────────┘         └──────────────┘
```

## 文件列表

| 文件 | 说明 | 重要性 |
|------|------|--------|
| `loop.ts` | Agent 核心循环 — 本章最重要的文件 | ⭐⭐⭐ |
| `state.ts` | 状态管理 — AgentState 接口与工厂函数 | ⭐⭐ |
| `queue.ts` | 消息队列 — Steering/Follow-up 双队列 | ⭐⭐ |
| `permission.ts` | 权限系统 — 三级风险等级与交互确认 | ⭐⭐ |
| `types.ts` | AgentTool 类型定义（扩展自 Tool） | ⭐ |
| `index.ts` | 统一导出入口 | ⭐ |

## 与 AI 层的关系

AI 层（`src/ai/`）提供了"语言基础"——Model/LLMMessage/ToolCall 等核心类型。Agent 层在此基础上构建了"运行时"：

| 维度 | AI 层 | Agent 层 |
|------|-------|----------|
| 职责 | 统一 LLM 调用接口 | 驱动 Agent 完整生命周期 |
| 消息 | 定义 LLMMessage 格式 | 管理 AgentMessage 历史与转换 |
| 工具 | 定义 Tool 纯类型接口 | 定义 AgentTool（添加 execute 方法） |
| 流 | 定义 LLMEvent 流式事件 | 将 LLMEvent 转为 AgentEvent |
| 状态 | 无状态 | 管理完整运行时状态 |

AI 层提供了"原材料"，Agent 层负责"生产流程"。

## 前置知识

在阅读本章前，请确保已了解：

- [AI 层](../02-ai-layer/README.md) 的核心概念：Model、LLMMessage、ToolCall、LLMEvent
- TypeScript 基础知识：类、接口、泛型、async/await、AsyncIterable
- 事件驱动编程的基本模式
- 消息队列的基本概念

## 阅读顺序

1. **[01-agent-loop.md](01-agent-loop.md)** — ⭐ Agent Loop 核心循环（最重要的文档）
2. **[02-state-management.md](02-state-management.md)** — 状态管理
3. **[03-message-queue.md](03-message-queue.md)** — 消息队列
4. **[04-permission-system.md](04-permission-system.md)** — 权限系统
5. **[05-event-system.md](05-event-system.md)** — 事件驱动模式
6. **[practice.md](practice.md)** — 本章练习

> ← [📚 返回学习指南](../README.md) · [下一章](../04-tools-layer/README.md) →
>
> → 下一篇: [01-agent-loop.md](./01-agent-loop.md)