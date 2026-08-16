# RPC 模式 — stdin/stdout JSONL 协议

| 元信息 | 内容 |
|--------|------|
| 对应源码 | `src/interface/rpc.ts` |
| 最后更新 | 2026-08-08 |
| 适用版本 | my-easy-pi v0.1.0 |

---

## 1. 本节目标

理解 RPC 模式的设计与实现：通过 stdin/stdout 上的 JSONL 协议，使其他编程语言（Python、Go、Java 等）能够与 my-easy-pi 进行双向通信，实现无缝集成。

---

## 2. 前置知识

- Node.js `readline` 模块
- 标准输入输出（stdin/stdout/stderr）的流概念
- JSON 序列化与反序列化
- 基本的进程间通信（IPC）概念

---

## 3. 核心概念

### 3.1 双向 JSONL 协议

与 Print 和 JSON 模式不同，RPC 模式是 **双向** 的：

- **stdout（输出）**：Agent 的事件流，与 JSON 模式相同（JSONL 格式）
- **stdin（输入）**：外部程序发送的指令，也是 JSONL 格式
- **stderr（诊断）**：人类可读的日志，不污染 JSONL 协议通道

### 3.2 协议消息格式

**请求（stdin → my-easy-pi）：**

| 消息类型 | 格式 | 说明 |
|----------|------|------|
| `message` | `{"type":"message","content":"你好"}` | 发送用户消息 |
| `exit` | `{"type":"exit"}` | 优雅退出 |

**响应（my-easy-pi → stdout）：**

与 JSON 模式相同的事件流，包括 `message_update`、`message_end`、`agent_end`、`error` 等。

### 3.3 设计目标

RPC 模式的设计目标是 **最小依赖集成**：任何语言只要能读写标准输入输出、能解析 JSON，就能与 my-easy-pi 交互。不需要安装 npm 包，不需要了解 Node.js 内部机制。

---

## 4. 代码实现

### 完整源码

文件位置：`src/interface/rpc.ts`

```typescript
import * as readline from 'readline'
import type { Agent, AgentEvent } from '../agent/index.js'

/** 启动 RPC 模式 */
export function startRPC(agent: Agent): void {
  // 所有事件输出到 stdout（JSONL）
  agent.subscribe((event: AgentEvent) => {
    const json = JSON.stringify(event) + '\n'
    process.stdout.write(json)
  })

  // 从 stdin 读取消息
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // 提示信息输出到 stderr，不污染 JSONL
    prompt: '',
  })

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    try {
      const msg = JSON.parse(trimmed)

      switch (msg.type) {
        case 'message':
          if (msg.content) {
            await agent.prompt(msg.content)
          }
          break

        case 'exit':
          rl.close()
          break

        default:
          process.stderr.write(`未知消息类型: ${msg.type}\n`)
      }
    } catch (error) {
      process.stderr.write(`解析失败: ${error}\n`)
    }
  })

  rl.on('close', () => {
    process.exit(0)
  })
}
```

### 逐行注释解释

| 行号 | 代码 | 说明 |
|------|------|------|
| 1 | `import * as readline` | 导入 Node.js readline 模块，用于逐行读取 stdin |
| 2 | `import type { Agent, AgentEvent }` | 仅导入类型声明 |
| 6 | `export function startRPC` | 启动 RPC 模式的入口函数（注意：名称与 Print/JSON 不同） |
| 9 | `agent.subscribe(...)` | 订阅 Agent 事件并输出到 stdout（同 JSON 模式） |
| 14 | `readline.createInterface(...)` | 创建 readline 接口监听 stdin |
| 15 | `input: process.stdin` | 读取标准输入 |
| 16 | `output: process.stderr` | 将 readline 的提示输出到 stderr，避免污染 stdout 的 JSONL |
| 20 | `rl.on('line', ...)` | 每当收到一行输入时触发 |
| 21 | `line.trim()` | 去除首尾空白字符 |
| 25 | `JSON.parse(trimmed)` | 解析 JSON 消息 |
| 28 | `case 'message'` | 处理用户消息 |
| 29 | `await agent.prompt(msg.content)` | 将消息发送给 Agent 处理 |
| 34 | `case 'exit'` | 处理退出指令 |
| 35 | `rl.close()` | 关闭 readline 接口 |
| 40 | `process.stderr.write(...)` | 未知消息类型，写入 stderr 日志 |
| 44 | `process.stderr.write(...)` | JSON 解析失败，写入 stderr 日志 |
| 48 | `rl.on('close', ...)` | readline 关闭时退出进程 |

---

## 5. 运行与验证

### 5.1 基本使用

```bash
# 通过 echo 发送消息
echo '{"type":"message","content":"你好"}' | my-easy-pi --rpc

# 发送多条消息
printf '{"type":"message","content":"你好"}\n{"type":"message","content":"继续"}\n{"type":"exit"}\n' | my-easy-pi --rpc
```

### 5.2 Python 集成示例

```python
import subprocess
import json

# 启动 my-easy-pi RPC 进程
proc = subprocess.Popen(
    ['my-easy-pi', '--rpc'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

# 发送消息
request = json.dumps({"type": "message", "content": "用 Python 写一个冒泡排序"})
proc.stdin.write(request + '\n')
proc.stdin.flush()

# 读取事件流
for line in proc.stdout:
    event = json.loads(line)
    if event['type'] == 'message_update':
        print(event['message']['content'], end='', flush=True)
    elif event['type'] == 'message_end':
        print()
    elif event['type'] == 'agent_end':
        break

# 优雅退出
proc.stdin.write(json.dumps({"type": "exit"}) + '\n')
proc.stdin.flush()
proc.wait()
```

### 5.3 Go 集成示例

```go
package main

import (
    "bufio"
    "encoding/json"
    "fmt"
    "os/exec"
)

type Request struct {
    Type    string `json:"type"`
    Content string `json:"content,omitempty"`
}

type Event struct {
    Type    string          `json:"type"`
    Message json.RawMessage `json:"message,omitempty"`
}

func main() {
    cmd := exec.Command("my-easy-pi", "--rpc")
    stdin, _ := cmd.StdinPipe()
    stdout, _ := cmd.StdoutPipe()
    cmd.Start()

    // 发送消息
    req := Request{Type: "message", Content: "解释 Go 的 defer 关键字"}
    json.NewEncoder(stdin).Encode(req)

    // 读取响应
    scanner := bufio.NewScanner(stdout)
    for scanner.Scan() {
        var event Event
        json.Unmarshal(scanner.Bytes(), &event)
        fmt.Println("事件:", event.Type)
        if event.Type == "agent_end" {
            break
        }
    }

    // 退出
    json.NewEncoder(stdin).Encode(Request{Type: "exit"})
    cmd.Wait()
}
```

### 5.4 验证 stderr 与 stdout 分离

```bash
# 将 stdout 和 stderr 分别重定向
echo '{"type":"message","content":"你好"}' \
  | my-easy-pi --rpc \
  2>rpc_debug.log \
  1>rpc_output.jsonl

# 查看输出
cat rpc_output.jsonl    # JSONL 事件流
cat rpc_debug.log        # 错误和诊断信息
```

---

## 6. 小结

RPC 模式是 my-easy-pi 接口层中功能最丰富的实现，它通过一个简单的 JSONL 协议，让任何语言都能与 my-easy-pi 集成。设计上的关键细节——`output: process.stderr`——确保了 JSONL 协议通道的纯净，这是实践中容易忽略但至关重要的点。

### 思考题

1. 为什么 RPC 模式使用 `startRPC` 命名，而 Print/JSON 使用 `createPrintInterface`/`createJSONInterface`？命名差异反映了什么设计意图？
2. 如果外部程序发送消息时 Agent 正在处理上一条消息，会发生什么？代码中是否处理了并发问题？
3. 如何扩展 RPC 协议以支持工具调用结果的自定义处理？

> ← [上一节](./02-json-mode.md) · [下一节](./04-tui.md) →
>
> [📚 返回章节首页](../07-interface-layer/README.md)