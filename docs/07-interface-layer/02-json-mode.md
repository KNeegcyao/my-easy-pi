# JSON 模式 — JSONL 事件流输出

| 元信息 | 内容 |
|--------|------|
| 对应源码 | `src/interface/json.ts` |
| 最后更新 | 2026-08-08 |
| 适用版本 | piagent v0.1.0 |

---

## 1. 本节目标

理解 JSON 模式的设计与实现：将 Agent 事件以 JSONL（每行一个 JSON 对象）格式输出到 stdout，适合程序消费、CI 集成和日志分析场景。

---

## 2. 前置知识

- JSON 序列化与反序列化
- JSONL（JSON Lines）格式规范
- 基本的 `jq` 命令使用

---

## 3. 核心概念

### 3.1 JSONL 格式

JSONL（JSON Lines）是每行一个独立 JSON 对象的文本格式，相比 JSON 数组的优势在于：
- **流式友好**：可以逐行处理，无需等待完整数组
- **内存友好**：不需要一次性加载全部数据
- **工具兼容**：兼容 Unix 管道工具（`head`、`tail`、`grep`、`jq` 等）

### 3.2 无状态输出

JSON 模式不维护任何状态——它不追踪内容长度，不记录已输出位置，每次收到事件就直接序列化整行输出。这是与 Print 模式最大的设计差异。

### 3.3 完整事件透明

JSON 模式输出 **所有** 事件类型（包括 `agent_start`、`turn_start`、`tool_execution_*` 等），而 Print 模式只输出了部分对用户可见的事件。这使得 JSON 输出可用于调试、审计和自动化分析。

---

## 4. 代码实现

### 完整源码

文件位置：`src/interface/json.ts`

```typescript
import { EOL } from 'os'
import type { Agent, AgentEvent } from '../agent/index.js'

/** 创建 JSON 输出接口 */
export function createJSONInterface(agent: Agent): void {
  agent.subscribe((event: AgentEvent) => {
    const json = JSON.stringify(event) + EOL
    process.stdout.write(json)
  })
}
```

### 逐行注释解释

| 行号 | 代码 | 说明 |
|------|------|------|
| 1 | `import { EOL } from 'os'` | 导入系统换行符 |
| 2 | `import type { Agent, AgentEvent }` | 仅导入类型声明 |
| 5 | `export function createJSONInterface` | 导出工厂函数，接收 Agent 实例 |
| 6 | `agent.subscribe(...)` | 订阅所有 Agent 事件 |
| 7 | `JSON.stringify(event) + EOL` | 将事件序列化为 JSON 字符串并追加换行 |
| 8 | `process.stdout.write(json)` | 写入标准输出 |

### 输出示例

当用户输入 "你好" 时，JSON 模式的输出大致如下：

```jsonl
{"type":"agent_start"}
{"type":"message_start","message":{"id":"msg-...","role":"assistant","content":""}}
{"type":"message_update","message":{"content":"你"}}
{"type":"message_update","message":{"content":"你好"}}
{"type":"message_update","message":{"content":"你好！有什么我可以帮你的吗？"}}
{"type":"message_end","message":{"id":"msg-...","role":"assistant","content":"你好！有什么我可以帮你的吗？"}}
{"type":"agent_end","messages":[...]}
```

---

## 5. 运行与验证

### 5.1 基本使用

```bash
# 启动 JSON 模式
piagent -m "你好" --output json
```

### 5.2 使用 jq 工具分析

```bash
# 只查看事件类型
piagent -m "你好" --output json | jq '.type'

# 查看所有 message_update 事件的内容
piagent -m "你好" --output json | jq 'select(.type == "message_update") | .message.content'

# 统计事件数量
piagent -m "你好" --output json | wc -l

# 查看最终响应内容
piagent -m "你好" --output json | jq 'select(.type == "message_end") | .message.content'
```

### 5.3 CI 集成示例

```bash
# 在 CI 脚本中获取 Agent 输出并提取关键信息
piagent -m "读取 package.json 的版本号" --output json \
  | jq -r 'select(.type == "message_end") | .message.content' \
  > agent_output.txt
```

### 5.4 调试用途

JSON 模式完整保留了工具调用信息，非常适合调试：

```bash
# 查看工具执行事件
piagent -m "搜索今天的天气" --output json \
  | jq 'select(.type | startswith("tool_execution"))'
```

---

## 6. 小结

JSON 模式是四种模式中最简洁的实现——仅 8 行代码（不含注释）。它通过将 Agent 事件完整地序列化为 JSONL 格式，实现了"机器可读"这一核心目标。无论是配合 `jq` 做数据分析，还是集成到 CI 流水线，JSON 模式都提供了充足的灵活性。

### 思考题

1. JSON 模式为什么不使用增量输出（像 Print 模式那样）？
2. 如果事件中包含循环引用，`JSON.stringify` 会怎样？应如何避免？
3. 如何修改 JSON 模式使其输出为 JSON 数组格式（`[...]`）而不是 JSONL？这样做有什么优缺点？