---
source: src/interface/*.ts
last_updated: 2026-08-10
version: 1.0.0
---

# 接口层 — 事件驱动与多模式输出

> 接口层是 my-easy-pi 面向用户的"第一道门面"。它通过事件驱动架构，将 Agent 核心发射的事件渲染成用户可读的输出。关键设计原则是：**Agent 核心不关心输出格式，接口层不关心 Agent 如何工作**，两者通过 `AgentEvent` 类型契约完成通信。

## Learning objectives

完成本章后，你将能够：

1. **理解事件驱动架构** -- 掌握 Agent 核心通过 `emit()` / `subscribe()` 与接口层解耦的设计思想
2. **掌握四种输出模式** -- 理解 Print、JSON、RPC、TUI 四种模式的适用场景和启动方式
3. **看懂 AgentEvent 事件流** -- 熟悉 `agent_start`、`message_update`、`tool_execution_*` 等事件的生命周期
4. **理解订阅者模式实现** -- 掌握 `agent.subscribe()` 的函数签名和多监听器并行机制
5. **选择正确的模式** -- 根据使用场景（终端开发、CI 集成、远程调用、日常使用）选择最合适的接口模式
6. **接口层与 RPC 对比** -- 理解接口层四种模式的定位与 [08-rpc-layer](../08-rpc-layer/README.md) 中标准化 MCP 协议的区别
7. **排查事件问题** -- 当事件未正确渲染时，能快速定位是 Agent 未发射事件还是接口层未处理事件

## Prerequisites

- 熟悉 TypeScript 类型系统和模块导入
- 理解事件驱动编程（发布/订阅模式）
- 了解 Node.js 标准输入输出（`stdin`、`stdout`、`stderr`）
- 了解终端 ANSI 转义序列（可选，对 TUI 模式有帮助）
- 了解 [Agent 层 - 事件系统](../03-agent-layer/05-event-system.md) 中 `AgentEvent` 的类型定义

## Architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent 核心 (agent/)                           │
│                                                                 │
│  Agent Loop 产生事件:                                            │
│  emit('agent_start')             ───┐                           │
│  emit('message_start')           ───┤                           │
│  emit('message_update') [流式]   ───┤── AgentEvent 事件总线      │
│  emit('message_end')             ───┤                           │
│  emit('tool_execution_start')    ───┤                           │
│  emit('tool_execution_update')   ───┤                           │
│  emit('tool_execution_end')      ───┤                           │
│  emit('error')                   ───┤                           │
│  emit('agent_end')               ───┘                           │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
                    AgentEvent 事件流 (契约)
                                  │
                                  │
         ┌────────────────────────┼────────────────────────────┐
         │                        │                            │
         ▼                        ▼                            ▼
  ┌──────────────┐        ┌──────────────┐             ┌──────────────┐
  │  Print 模式  │        │  JSON 模式   │             │  TUI 模式    │
  │  print.ts    │        │  json.ts     │             │  tui/index.ts│
  │              │        │              │             │              │
  │  纯文本流式   │        │  JSONL 事件流 │             │  全屏交互式  │
  │  适合终端直用 │        │  适合程序消费 │             │  适合日常开发 │
  └──────┬───────┘        └──────┬───────┘             └──────┬───────┘
         │                       │                            │
         │              ┌────────┴────────┐                   │
         │              │  RPC 模式       │                   │
         │              │  rpc.ts         │                   │
         │              │                 │                   │
         │              │  stdin/stdout   │                   │
         │              │  双向 JSONL 协议│                   │
         │              │  适合远程/跨语言 │                   │
         │              └─────────────────┘                   │
         │                       │                            │
         ▼                       ▼                            ▼
    stdout 文本            stdout JSONL                 全屏终端 ANSI
```

## 文件列表

| 文件 | 说明 | 重要性 |
|------|------|--------|
| `src/interface/print.ts` | Print 模式 — 纯文本流式输出，默认模式 | ⭐⭐⭐ |
| `src/interface/json.ts` | JSON 模式 — JSONL 事件流，适合程序/脚本 | ⭐⭐ |
| `src/interface/rpc.ts` | RPC 模式 — stdin/stdout JSONL 双向协议 | ⭐⭐ |
| `src/interface/tui/index.ts` | TUI 入口 — 全屏终端界面初始化 | ⭐⭐ |
| `src/interface/tui/editor.ts` | TUI 编辑器 — 交互式输入与 Slash 命令 | ⭐⭐⭐ |
| `src/interface/tui/renderer.ts` | TUI 渲染器 — 事件订阅与消息渲染 | ⭐⭐⭐ |
| `src/interface/tui/commands.ts` | TUI 命令系统 — Slash 命令处理 | ⭐⭐ |
| `src/interface/tui/theme.ts` | TUI 主题 — ANSI 颜色与控制序列 | ⭐ |

## Key concepts

### 1. 事件驱动架构

核心流程：

```
用户输入 → Agent 核心 → emit(AgentEvent) → 接口层 subscribe() → 输出到终端/文件/其他程序
```

**关键设计原则**：Agent 核心不关心输出格式，接口层不关心 Agent 如何工作。两者通过 `AgentEvent` 类型契约完成通信。

### 2. AgentEvent 事件类型

| 事件类型 | 触发时机 | 携带数据 |
|----------|----------|----------|
| `agent_start` | Agent 开始处理 | 无 |
| `agent_end` | Agent 处理完成 | 完整消息列表 |
| `turn_start` | 单轮对话开始 | 无 |
| `turn_end` | 单轮对话结束 | 消息和工具结果 |
| `message_start` | 开始生成消息 | 空消息对象 |
| `message_update` | 消息内容增量更新 | 部分消息内容 |
| `message_end` | 消息生成完成 | 完整消息对象 |
| `tool_execution_start` | 工具开始执行 | 工具名称和参数 |
| `tool_execution_update` | 工具执行进度 | 部分结果 |
| `tool_execution_end` | 工具执行完成 | 工具结果 |
| `error` | 发生错误 | 错误信息 |

## 四种模式对比

### 功能对比

| 特性 | Print | JSON | RPC | TUI |
|------|-------|------|-----|-----|
| 输出格式 | 纯文本流 | JSONL | JSONL（双向） | 全屏 ANSI |
| 输入方式 | 命令行参数 | 命令行参数 | stdin JSONL | 交互式编辑器 |
| 目标用户 | 终端用户 | 程序/脚本 | 外部语言集成 | 终端用户 |
| 流式输出 | ✅ | ✅ | ✅ | ✅ |
| 交互性 | 无 | 无 | 通过协议 | 全屏交互 |
| 依赖 | 无 | 无 | 无 | 无（纯 ANSI） |
| 典型场景 | `echo "你好" \| piagent -p "翻译"` | CI 集成、日志分析 | Python/Go 调用 | 日常开发使用 |

### 选型指南：何时使用哪种模式

| 使用场景 | 推荐模式 | 原因 |
|----------|----------|------|
| 日常命令行交互 | **Print**（默认） | 最简单的文本输入输出，无需学习 |
| 管道集成到其他命令 | **Print** | 纯文本输出自然支持管道 `\|` |
| 在 CI/CD 中使用 | **JSON** | 可解析的事件流，便于提取日志和结果 |
| 用脚本/程序调用 piagent | **JSON** | 无需处理 ANSI 控制字符，直接解析 JSONL |
| 跨语言集成（Python/Go 调用） | **RPC** | 标准化的 stdin/stdout 协议 |
| 远程调用 | **RPC** | 协议可映射到 WebSocket 或 HTTP 传输层 |
| 日常开发使用 | **TUI** | 全屏交互，支持 Slash 命令、多行编辑 |
| 调试 Agent 事件流程 | **JSON** | 完整的事件流可见，便于观察事件生命周期 |

## 事件驱动的工作原理

每种接口层模式都遵循相同的订阅者模式：

```typescript
export function createXxxInterface(agent: Agent): void {
  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_update':
        // 将最新内容输出到终端
        break
      case 'message_end':
        // 消息结束，换行
        break
      // ...
    }
  })
}
```

1. 调用 `agent.subscribe()` 注册监听器
2. 每当 Agent 核心产生事件，所有监听器都会收到通知
3. 每个接口只处理自己关心的事件类型，忽略其他
4. 多个监听器可以同时存在（例如 TUI 中同时订阅事件和渲染 UI）

## Key design principles

### 1. 关注点分离

接口层是 my-easy-pi 架构中"关注点分离"的典范实践。Agent 核心（`agent/`）只负责 LLM 调用和工具执行，完全不知道输出是什么格式。接口层独立负责渲染，不关心 Agent 内部如何工作。

**效果**：一个 Agent 核心可以同时对接多种 UI 形态。

### 2. 无状态纯函数

每种接口模式都是独立的函数，不共享状态，没有继承层次。这意味着：
- 新接口模式可以"即插即用"
- 测试时可以单独测试每种模式
- 移除一种模式不影响其他模式

### 3. 订阅者模式而非继承

四种模式都使用 `agent.subscribe()` 注册监听器，而不是继承 Agent 类或实现 Agent 接口。这是因为：
- 接口层只是输出渲染器，不是 Agent 的变体
- 多个接口可以同时监听同一 Agent（例如调试时同时开启 JSON 和 TUI）
- 接口层不需要覆盖 Agent 的任何行为

## Running Locally

### 查看所有模式的启动方式

```bash
# Print 模式（默认）
echo "你好" | npx piagent -p "翻译成英文"

# JSON 模式
npx piagent -m "你好" --output json

# RPC 模式
echo '{"type":"message","content":"你好"}' | npx piagent --rpc

# TUI 模式（默认无参数时启动）
npx piagent
```

### 事件机制的观察

使用 JSON 模式可以最直观地看到完整的事件流：

```bash
npx piagent -m "你好" --output json | jq '.type'
```

输出示例：

```
"agent_start"
"message_start"
"message_update"
"message_update"
"message_end"
"agent_end"
```

## Summary and next steps

接口层是 my-easy-pi "关注点分离"的典范实践。通过事件驱动设计，一个 Agent 核心可以同时对接多种 UI 形态：

| 模式 | 核心价值 | 最佳用途 |
|------|----------|----------|
| **Print** | 简单直接 | 终端调试、管道集成 |
| **JSON** | 机器可读 | CI/CD、程序调用 |
| **RPC** | 双向协议 | 跨语言集成、远程调用 |
| **TUI** | 全屏交互 | 日常开发使用 |

> 在开发阶段用 TUI 调试，在生产环境用 JSON 模式集成 CI，在需要远程调用时启用 RPC。

完成本章后，你已理解 Agent 事件的完整流向。下一步：

- 进入 [RPC 层](../08-rpc-layer/README.md)，了解标准化 MCP 协议如何实现远程 Agent 调用
- 或回顾 [Agent 层事件系统](../03-agent-layer/05-event-system.md)，加深对事件类型的理解

### 思考题

1. 为什么四种模式都使用 `agent.subscribe()` 而不是继承 Agent 类？
2. 如果要在 Print 模式中增加 `--verbose` 参数显示工具调用细节，需要修改哪些代码？
3. 事件驱动设计带来的最大好处是什么？有没有什么场景下这种设计会成为负担？
4. 对比 Print 和 JSON 模式：当输出中包含不可见字符（如 ANSI 转义序列）时，哪种模式更适合程序消费？为什么？

> ← [📚 返回学习指南](../README.md) · [下一章](../08-config-and-sandbox/README.md) →
>
> → 下一篇: [01-print-mode.md](./01-print-mode.md)