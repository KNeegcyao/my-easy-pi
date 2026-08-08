# Print 模式 — 命令行输出接口

| 元信息 | 内容 |
|--------|------|
| 对应源码 | `src/interface/print.ts` |
| 最后更新 | 2026-08-08 |
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

### 3.2 事件订阅

Print 模式订阅了四个事件：
- `message_start`：重置计数器，准备开始新消息
- `message_update`：计算增量内容并输出
- `message_end`：消息结束，输出换行
- `error`：错误信息输出到 stderr

### 3.3 标准流分离

- **stdout**：Agent 的正常输出内容
- **stderr**：错误信息

这种分离使得管道操作时，只有正常输出会被传递，错误信息不会污染下游。

---

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

Print 模式会逐字输出 LLM 的响应，你可以看到文字一个个出现，而不是一次性整段输出。

### 5.3 验证错误输出分离

```bash
# 正常输出走 stdout，错误走 stderr
piagent -p "你好" 2>/dev/null   # 只看到正常输出
piagent -p "你好" 1>/dev/null   # 只看到错误（如果有）
```

### 5.4 管道测试

```bash
# Print 模式天然适合管道链
piagent -p "列出当前目录的文件" | grep "\.ts"
```

---

## 6. 小结

Print 模式是 piagent 最轻量的接口实现，全部代码只有 41 行。它通过增量输出实现流式打字效果，通过标准流分离支持管道操作，是整个项目中"简单即美"的典范。

### 思考题

1. 如果 `lastContentLength` 不重置，连续两次对话会出什么问题？
2. 为什么 `message_update` 中的 `content` 是累计的完整内容而不是增量？
3. 如何修改代码让 Print 模式也显示工具调用信息（如 `[Tool: search]`）？