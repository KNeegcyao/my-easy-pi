# Print 模式 — 命令行输出接口

| 元信息 | 内容 |
|--------|------|
| 对应源码 | `src/interface/print.ts` |
| 最后更新 | 2026-08-10 |
| 适用版本 | piagent v0.1.0 |

---

## 1. 本节目标

理解 Print 模式的设计与实现：它是最简单的终端输出模式，专注于将 Agent 的流式输出实时渲染到终端，适合单次问答和管道场景。

---

## 2. 前置知识

- Node.js `process.stdout` / `process.stderr` 标准流
- JavaScript 字符串切片操作
- 管道（pipe）操作的基本概念

---

## 3. 核心概念

### 3.1 流式增量输出

Print 模式的核心是 **增量输出**：每次收到 `message_update` 事件时，只输出新增加的文本内容，而不是重新输出整个消息。这避免了重复输出，实现了流畅的流式打字效果。

为了直观理解增量输出的过程，以下是 `message_update` 事件的时序图：

```
时间 ──────────────────────────────────────────────►
                                                    
 Client                              LLM Agent                    
   │                                     │                         
   │  发送消息                            │                         
   │─────────────────────────────────────►│                         
   │                                     │                         
   │     ◄─── message_start ─────────────│                         
   │     重置 lastContentLength = 0      │                         
   │                                     │                         
   │     ◄─── message_update ────────────│                         
   │     content = "De"                  │                         
   │     newPart = content.slice(0)      │  输出 "De"              
   │     lastContentLength = 2           │                         
   │                                     │                         
   │     ◄─── message_update ────────────│                         
   │     content = "Design"              │                         
   │     newPart = content.slice(2)      │  输出 "sign"            
   │     lastContentLength = 6           │                         
   │                                     │                         
   │     ◄─── message_update ────────────│                         
   │     content = "Design Patterns"     │                         
   │     newPart = content.slice(6)      │  输出 " Patterns"       
   │     lastContentLength = 20          │                         
   │                                     │                         
   │     ◄─── message_end ───────────────│                         
   │     输出 EOL + EOL                  │                         
   │                                     │                         
```

### 3.2 `lastContentLength` 的工作原理（类比理解）

`lastContentLength` 是 Print 模式中最关键的变量。把它想象成：

**场景一：进度条**
> 你下载一个文件，进度条显示 "45%"。3 秒后，进度变成 "67%"。你不会重新渲染整条进度条——你只渲染从 45% 到 67% 的那段变化。`lastContentLength` 就像进度条上次记录的位置，`content.slice(lastContentLength)` 就是"只绘制新增的部分"。

**场景二：追剧**
> 你周更追剧，上次看到第 3 集第 28 分钟。新一集更新后，你直接从 28 分钟往后看，而不是从头重看整部剧。`lastContentLength` 就是你的"上次观看到的时间点"，每次 `message_update` 送来的是"截至目前的完整视频"，你只播放自己还没看过的部分。

**代码中的实际行为：**

| 步骤 | `content`（累计完整内容） | `lastContentLength`（已输出长度） | `newPart`（本次要输出的内容） |
|------|--------------------------|----------------------------------|-----------------------------|
| 初始 | — | `0` | — |
| 第 1 次 update | `"De"` | `0` | `"De"`（从第 0 字符开始切片） |
| 第 2 次 update | `"Design"` | `2` | `"sign"`（从第 2 字符开始切片） |
| 第 3 次 update | `"Design Patterns"` | `6` | `" Patterns"`（从第 6 字符开始切片） |

### 3.3 为什么 `content` 是累计的而不是增量？

这是 LLM API 的设计惯例。每次 `message_update` 携带的是**截至当前时刻的完整消息文本**，而不是"从上一次到这一次新增了多少"。Print 模式通过 `content.slice(lastContentLength)` 把"累计完整内容"转化为"增量输出"——这是一个典型的**有状态处理**模式。

> **与 JSON 模式的关键差异**：Print 模式维护 `lastContentLength` 这个状态变量来追踪已输出位置；JSON 模式不维护任何状态，每次直接输出整个事件对象。详见 [02-json-mode.md](./02-json-mode.md) 的对比。

### 3.4 事件订阅

Print 模式订阅了四个事件：
- `message_start`：重置计数器，准备开始新消息
- `message_update`：计算增量内容并输出
- `message_end`：消息结束，输出换行
- `error`：错误信息输出到 stderr

### 3.5 标准流分离

```
                        ┌─────────────┐
        正常输出 ──────►│   stdout    │──────► 终端显示
                        │    (fd 1)   │          │
                        └─────────────┘          │
                                                 ▼
                        ┌─────────────┐     管道传递
        错误信息 ──────►│   stderr    │──────► 终端显示（不进入管道）
                        │    (fd 2)   │
                        └─────────────┘
```

- **stdout**（文件描述符 1）：Agent 的正常输出内容
- **stderr**（文件描述符 2）：错误信息

这种分离的关键好处在于：当你在 shell 中使用管道时，只有 stdout 的内容会被传递给管道右侧的命令。错误信息通过 stderr 输出到终端，不会污染管道数据：

```bash
# stderr 仍然显示在终端上，但不会传递给 grep
piagent -p "列出 .ts 文件" 2>/dev/null   # 丢弃 stderr
piagent -p "列出 .ts 文件" | grep "test"  # stderr 不会混入 grep 的输入
```

---

## 4. 代码实现

### 4.1 完整源码

文件位置：`src/interface/print.ts`

```typescript
import { EOL } from 'os'
import type { Agent, AgentEvent } from '../agent/index.js'

export function createPrintInterface(agent: Agent): void {
  // 记录上一次输出内容的长度，用于计算增量
  let lastContentLength = 0

  // 订阅 Agent 的所有事件
  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        // 新消息开始，重置计数器
        lastContentLength = 0
        break

      case 'message_update': {
        // 获取当前消息的全部内容
        const content = event.message.content
        if (content) {
          // 计算自上次输出以来新增的文本
          const newPart = content.slice(lastContentLength)
          if (newPart) process.stdout.write(newPart)
          // 更新已输出长度
          lastContentLength = content.length
        }
        break
      }

      case 'message_end':
        // 助手消息结束，输出两个换行作为分隔
        if (event.message.role === 'assistant') {
          process.stdout.write(EOL + EOL)
        }
        break

      case 'error':
        // 错误信息输出到 stderr，不影响管道
        process.stderr.write(`[error] ${event.message}${EOL}`)
        break
    }
  })
}
```

### 4.2 逐行注释解释

| 行号 | 代码 | 说明 |
|------|------|------|
| 1 | `import { EOL } from 'os'` | 导入系统换行符（Linux 为 `\n`，Windows 为 `\r\n`） |
| 2 | `import type { Agent, AgentEvent }` | 仅导入类型，编译后不产生代码 |
| 4 | `export function createPrintInterface` | 导出工厂函数，接收 Agent 实例 |
| 6 | `let lastContentLength = 0` | 闭包变量，追踪已输出的内容长度 |
| 8 | `agent.subscribe(...)` | 注册事件监听器，返回取消订阅函数 |
| 10 | `case 'message_start'` | 新消息开始时触发 |
| 11 | `lastContentLength = 0` | 重置计数器，准备接收新消息 |
| 15 | `const content = event.message.content` | 获取当前累计的完整内容 |
| 18 | `content.slice(lastContentLength)` | 计算增量——只取未输出过的部分 |
| 19 | `process.stdout.write(newPart)` | 增量输出，实现流式效果 |
| 20 | `lastContentLength = content.length` | 更新已输出长度 |
| 25 | `event.message.role === 'assistant'` | 只对助手消息做结束处理 |
| 26 | `process.stdout.write(EOL + EOL)` | 空行分隔不同消息 |
| 30 | `process.stderr.write(...)` | 错误走 stderr，不污染 stdout |

### 4.3 代码要点分析

- **闭包变量**：`lastContentLength` 定义在 `createPrintInterface` 函数内，不会泄漏到全局作用域
- **空值保护**：`if (content)` 确保当 `content` 为 `null` 或 `undefined` 时不执行输出
- **空输出保护**：`if (newPart)` 避免输出空字符串（虽然 `write("")` 无害，但减少不必要的调用）
- **仅处理助手消息**：`role === 'assistant'` 过滤确保不会错误地处理用户消息的结束事件

## 4. 代码实现

### 完整源码

文件位置：`src/interface/print.ts`

```typescript
import { EOL } from 'os'
import type { Agent, AgentEvent } from '../agent/index.js'

export function createPrintInterface(agent: Agent): void {
  // 记录上一次输出内容的长度，用于计算增量
  let lastContentLength = 0

  // 订阅 Agent 的所有事件
  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        // 新消息开始，重置计数器
        lastContentLength = 0
        break

      case 'message_update': {
        // 获取当前消息的全部内容
        const content = event.message.content
        if (content) {
          // 计算自上次输出以来新增的文本
          const newPart = content.slice(lastContentLength)
          if (newPart) process.stdout.write(newPart)
          // 更新已输出长度
          lastContentLength = content.length
        }
        break
      }

      case 'message_end':
        // 助手消息结束，输出两个换行作为分隔
        if (event.message.role === 'assistant') {
          process.stdout.write(EOL + EOL)
        }
        break

      case 'error':
        // 错误信息输出到 stderr，不影响管道
        process.stderr.write(`[error] ${event.message}${EOL}`)
        break
    }
  })
}
```

### 逐行注释解释

| 行号 | 代码 | 说明 |
|------|------|------|
| 1 | `import { EOL } from 'os'` | 导入系统换行符（Linux 为 `\n`，Windows 为 `\r\n`） |
| 2 | `import type { Agent, AgentEvent }` | 仅导入类型，编译后不产生代码 |
| 4 | `export function createPrintInterface` | 导出工厂函数，接收 Agent 实例 |
| 6 | `let lastContentLength = 0` | 闭包变量，追踪已输出的内容长度 |
| 8 | `agent.subscribe(...)` | 注册事件监听器，返回取消订阅函数 |
| 10 | `case 'message_start'` | 新消息开始时触发 |
| 11 | `lastContentLength = 0` | 重置计数器，准备接收新消息 |
| 15 | `const content = event.message.content` | 获取当前累计的完整内容 |
| 18 | `content.slice(lastContentLength)` | 计算增量——只取未输出过的部分 |
| 19 | `process.stdout.write(newPart)` | 增量输出，实现流式效果 |
| 20 | `lastContentLength = content.length` | 更新已输出长度 |
| 25 | `event.message.role === 'assistant'` | 只对助手消息做结束处理 |
| 26 | `process.stdout.write(EOL + EOL)` | 空行分隔不同消息 |
| 30 | `process.stderr.write(...)` | 错误走 stderr，不污染 stdout |

---

## 5. 运行与验证

### 5.1 基本使用

```bash
# 管道模式：将前一条命令的输出作为输入
echo "Hello, world!" | piagent -p "翻译成中文"

# 直接提问
piagent -p "解释什么是事件驱动编程"
```

### 5.2 观察流式效果

Print 模式会逐字输出 LLM 的响应，你可以看到文字一个个出现，而不是一次性整段输出。实际终端效果如下：

```
$ piagent -p "用中文说 Hello"
正  在  生  成...
De
Design
Design P
Design Pat
Design Patter
Design Patterns
Design Patterns 是
Design Patterns 是 ...
（每一行都只比上一行多几个字——这就是增量输出的效果）
```

> **注意**：以上是简化的逐行示意。实际的终端输出是同一行不断追加，不会换行——看起来就像 LLM 在"打字"。

### 5.3 验证错误输出分离

```bash
# 正常输出走 stdout，错误走 stderr
piagent -p "你好" 2>/dev/null   # 只看到正常输出，错误被丢弃
piagent -p "你好" 1>/dev/null   # 只看到错误（如果有）
```

运行效果：

```bash
# 丢弃 stderr，只看正常输出
$ piagent -p "翻译 hello" 2>/dev/null
你好
# 丢弃 stdout，只看错误
$ piagent -p "触发错误" 1>/dev/null
[error] API 调用失败：Connection timeout
```

### 5.4 管道测试

```bash
# Print 模式天然适合管道链
piagent -p "列出当前目录的文件" | grep "\.ts"
```

```bash
# 实际输出示例（筛选 .ts 后缀的文件列表）
$ echo "列出当前 ts 文件" | piagent -p "提取文件名" | grep "\.ts"
print.ts
json.ts
rpc.ts
```

---

## 6. 与其他模式的对比

Print 模式与 piagent 其他三种输出模式各有侧重：

| 对比维度 | Print | JSON | RPC | TUI |
|----------|-------|------|-----|-----|
| **代码行数** | ~41 行 | ~8 行 | ~60 行 | ~400+ 行 |
| **是否有状态** | 有（`lastContentLength`） | 无 | 有（请求-响应映射） | 有（编辑器状态） |
| **输出粒度** | 仅用户可见部分 | 所有事件 | 所有事件 | 所有事件 + UI 渲染 |
| **人可读性** | 最高（纯文本） | 低（原始 JSON） | 低（原始 JSON） | 最高（全屏 UI） |
| **机器可读** | 否 | 是 | 是 | 否 |
| **管道友好** | 是 | 是 | 需解析协议 | 否 |
| **错误输出** | stderr 分离 | stdout 混在一起 | stdout 混在一起 | 屏内错误提示 |
| **典型场景** | 终端问答、管道脚本 | CI 集成、日志分析 | Go/Python 远程调用 | 日常开发 |
| **依赖** | 无 | 无 | 无 | 无（纯 ANSI） |

Print 模式在"简单"和"实用"之间取得了最佳平衡——既保持了极低的代码复杂度，又通过增量输出提供了流畅的终端体验。

---

## 7. 常见问题（FAQ）

### Q1: 为什么有时会看到内容重复？

**原因**：如果事件订阅器被注册了多次（例如不小心多次调用 `createPrintInterface`），每个监听器都会独立维护自己的 `lastContentLength`，导致内容被重复输出。

**解决方法**：确保 `createPrintInterface` 只被调用一次。如果需要在不同时机订阅事件，使用 `agent.subscribe()` 返回的取消订阅函数：

```typescript
const unsubscribe = agent.subscribe(myListener)
// 不再需要时取消订阅
unsubscribe()
```

### Q2: Print 模式为什么不显示工具调用？

Print 模式只处理了四个事件类型，而工具调用相关的事件（`tool_execution_start`、`tool_execution_update`、`tool_execution_end`）被忽略了。这是因为 Print 模式面向终端用户，工具调用通常被视为"内部细节"。

如果想显示工具调用，可以在 `message_update` 的 case 之外增加处理：

```typescript
case 'tool_execution_start':
  process.stdout.write(`\n[Tool: ${event.name}] 执行中...`)
  break
```

### Q3: `content.slice(lastContentLength)` 在并发场景下安全吗？

**不安全**。`lastContentLength` 是一个共享的可变变量，如果多个事件处理器同时读写它，就会出现竞态条件。在 piagent 目前的架构中，事件处理是同步顺序执行的（`agent.subscribe` 注册的回调是串行调用的），所以不存在并发问题。但如果事件系统改成异步并行，就需要加锁或使用原子操作。

### Q4: 为什么有时最后一个 `message_update` 的内容和 `message_end` 的内容不一致？

这是正常现象。`message_update` 是"增量快照"，`message_end` 是"最终确认"。在某些 LLM API 实现中，`message_end` 可能会对内容做后处理（如裁掉多余空格、修剪标记等），导致两者略有差异。Print 模式以 `message_update` 的输出为准，`message_end` 只负责输出换行分隔。

---

## 8. 小结

Print 模式是 piagent 最轻量的接口实现，全部代码只有 41 行。它通过增量输出实现流式打字效果，通过标准流分离支持管道操作，是整个项目中"简单即美"的典范。

核心要点回顾：

- **增量输出**：`lastContentLength` 配合 `content.slice()` 实现流式打字效果
- **标准流分离**：stdout 输出正常内容，stderr 输出错误信息，互不干扰
- **有状态设计**：与 JSON 模式的无状态设计形成鲜明对比
- **管道友好**：纯文本输出天然支持 shell 管道链

### 思考题

1. 如果 `lastContentLength` 不重置，连续两次对话会出什么问题？
2. 为什么 `message_update` 中的 `content` 是累计的完整内容而不是增量？
3. 如何修改代码让 Print 模式也显示工具调用信息（如 `[Tool: search]`）？
4. 如果 Agent 支持流式思维链（思考步骤逐条输出），Print 模式需要做什么改动？

> ← [上一节](../07-interface-layer/README.md) · [下一节](./02-json-mode.md) →
>
> [📚 返回章节首页](../07-interface-layer/README.md)