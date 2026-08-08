# 接口层 — 章节概览

| 元信息 | 内容 |
|--------|------|
| 对应源码 | `src/interface/` 目录 |
| 最后更新 | 2026-08-08 |
| 适用版本 | piagent v0.1.0 |

---

## 1. 本节目标

接口层是 piagent 面向用户的第一道门面。它的核心职责是：

- **提供多种交互方式**：支持 Print、JSON、RPC、TUI 四种模式，覆盖从终端到远程集成的所有场景
- **解耦 Agent 核心与 UI**：Agent 核心（`src/agent/`）完全不知道用户界面长什么样，它只发射事件。接口层负责订阅这些事件并将其渲染成用户可读的输出
- **保持极简设计**：每种模式都是独立的文件，无共享状态，无继承层次，真正做到"即插即用"

---

## 2. 前置知识

- 熟悉 TypeScript 类型系统和模块导入
- 理解事件驱动编程（发布/订阅模式）
- 了解 Node.js 标准输入输出（`stdin`、`stdout`、`stderr`）
- 了解终端 ANSI 转义序列（可选，对 TUI 模式有帮助）

---

## 3. 核心概念

### 3.1 事件驱动架构

piagent 的接口层基于 **事件驱动** 架构。核心流程如下：

```
用户输入
    │
    ▼
Agent 核心 (src/agent/loop.ts)
    │
    ├─ emit('agent_start')          ──┐
    ├─ emit('message_start')        ──┤
    ├─ emit('message_update')       ──┤── 所有接口层订阅
    ├─ emit('message_end')          ──┤
    ├─ emit('tool_execution_*')     ──┤
    ├─ emit('agent_end')            ──┘
    │
    ▼
接口层 (Print / JSON / RPC / TUI)
    │
    ▼
输出到终端 / 文件 / 其他程序
```

**关键设计原则**：Agent 核心不关心输出格式，接口层不关心 Agent 如何工作。两者通过 `AgentEvent` 类型契约完成通信。

### 3.2 AgentEvent 事件类型

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

### 3.3 四种模式对比

| 特性 | Print | JSON | RPC | TUI |
|------|-------|------|-----|-----|
| 输出格式 | 纯文本流 | JSONL | JSONL（双向） | 全屏 ANSI |
| 输入方式 | 命令行参数 | 命令行参数 | stdin JSONL | 交互式编辑器 |
| 目标用户 | 终端用户 | 程序/脚本 | 外部语言集成 | 终端用户 |
| 流式输出 | ✅ | ✅ | ✅ | ✅ |
| 交互性 | 无 | 无 | 通过协议 | 全屏交互 |
| 依赖 | 无 | 无 | 无 | 无（纯 ANSI） |
| 典型场景 | `echo "你好" \| piagent -p "翻译"` | CI 集成、日志分析 | Python/Go 调用 | 日常开发使用 |

### 3.4 文件列表

| 文件 | 职责 |
|------|------|
| `src/interface/print.ts` | Print 模式 — 最简单的流式输出 |
| `src/interface/json.ts` | JSON 模式 — JSONL 事件流 |
| `src/interface/rpc.ts` | RPC 模式 — stdin/stdout JSONL 协议 |
| `src/interface/tui/index.ts` | TUI 入口 — 全屏终端界面初始化 |
| `src/interface/tui/editor.ts` | TUI 编辑器 — 交互式输入与 Slash 命令 |
| `src/interface/tui/renderer.ts` | TUI 渲染器 — 事件订阅与消息渲染 |
| `src/interface/tui/commands.ts` | TUI 命令系统 — Slash 命令处理 |
| `src/interface/tui/theme.ts` | TUI 主题 — ANSI 颜色与控制序列 |

---

## 4. 事件驱动的工作原理

每个接口层函数都遵循相同的模式：

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

---

## 5. 运行与验证

### 5.1 查看所有模式的启动方式

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

### 5.2 事件机制的观察

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

---

## 6. 小结

接口层是 piagent 架构中"关注点分离"的典范实践。通过事件驱动设计，一个 Agent 核心可以同时对接多种 UI 形态，而无需做任何修改。这种模式在大模型应用中尤为重要——你可以在开发阶段用 TUI 调试，在生产环境用 JSON 模式集成 CI，在需要远程调用时启用 RPC。

### 思考题

1. 为什么四种模式都使用 `agent.subscribe()` 而不是继承 Agent 类？
2. 如果要在 Print 模式中增加 `--verbose` 参数显示工具调用细节，需要修改哪些代码？
3. 事件驱动设计带来的最大好处是什么？有没有什么场景下这种设计会成为负担？