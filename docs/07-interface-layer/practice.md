# 本章练习 — 接口层

| 元信息 | 内容 |
|--------|------|
| 对应源码 | `src/interface/` 目录 |
| 最后更新 | 2026-08-08 |
| 适用版本 | piagent v0.1.0 |

---

## 练习 1：使用四种模式运行一次

### 目标

亲身感受四种接口模式的不同输出效果，建立直观体验。

### 步骤

**1. Print 模式（默认）**

```bash
piagent -p "简要解释什么是 RESTful API" > print_output.txt
cat print_output.txt
```

**2. JSON 模式**

```bash
piagent -m "简要解释什么是 RESTful API" --output json > json_output.jsonl
cat json_output.jsonl
```

**3. RPC 模式**

```bash
echo '{"type":"message","content":"简要解释什么是 RESTful API"}' | piagent --rpc > rpc_output.jsonl
cat rpc_output.jsonl
```

**4. TUI 模式**

```bash
piagent --tui
# 输入：简要解释什么是 RESTful API
# 观察全屏效果
# 输入 /exit 退出
```

### 观察要点

- 对比 Print 输出的纯文本与 JSON 的结构化输出
- 对比 JSON 模式和 RPC 模式输出的异同（注意 RPC 输出中是否包含 `agent_start` 事件）
- 观察 TUI 模式下的 tool execution 反馈、thinking 提示等额外 UI 元素

---

## 练习 2：对比输出差异

### 目标

使用 `diff` 工具对比 JSON 模式和 RPC 模式的输出，理解两者的差异。

### 步骤

```bash
# 1. 生成 JSON 模式输出
piagent -m "你好" --output json > json_output.jsonl

# 2. 生成 RPC 模式输出
echo '{"type":"message","content":"你好"}' | piagent --rpc > rpc_output.jsonl

# 3. 对比差异
diff json_output.jsonl rpc_output.jsonl

# 4. 统计事件数量
echo "JSON 事件数: $(wc -l < json_output.jsonl)"
echo "RPC 事件数: $(wc -l < rpc_output.jsonl)"
```

### 思考题

1. 两种模式的输出是否完全一致？为什么？
2. 如果启动 RPC 但不发送任何消息，会看到什么事件？
3. 用 `jq` 提取两种模式输出中的 `message_end` 事件，内容是否相同？

---

## 练习 3：理解事件驱动对接不同 UI

### 目标

通过实际操作理解"同一个 Agent 核心对接不同 UI"的设计模式。

### 步骤

**1. 查看事件流**

使用 JSON 模式输出并观察完整的事件序列：

```bash
piagent -m "1+1等于几" --output json | jq -c '.type'
```

你应该看到类似以下输出：

```
"agent_start"
"message_start"
"message_update"
"message_update"
"message_end"
"agent_end"
```

**2. 编写一个简单的事件监听器**

创建一个简单的 Node.js 脚本来订阅 Agent 事件并自定义输出：

```javascript
// custom-interface.js
// 这个脚本模拟了接口层的工作方式

import { createAgent } from './src/agent/index.js'

const agent = createAgent({
  systemPrompt: '你是一个助手',
  model: { provider: 'openai', id: 'gpt-4' },
  tools: [],
})

// 自定义接口：只输出工具调用事件
agent.subscribe((event) => {
  if (event.type === 'tool_execution_start') {
    console.log(`[工具] ${event.toolName} 开始执行`)
  }
  if (event.type === 'tool_execution_end') {
    console.log(`[工具] 执行完成`)
  }
})

// 同时订阅另一个接口：输出最终的助手消息
agent.subscribe((event) => {
  if (event.type === 'message_end' && event.message.role === 'assistant') {
    console.log(`[助手] ${event.message.content}`)
  }
})

await agent.prompt('你好')
```

**3. 运行并观察**

```bash
node custom-interface.js
```

观察两个不同的订阅者如何独立处理相同的事件流。

### 思考题

1. 如果两个订阅者都返回了 `Promise`，它们是在同一个微任务中执行还是并行执行？查看 `loop.ts` 中的 `emit()` 方法确认。
2. 如何实现一个"静默模式"接口——既不输出到终端，也不输出 JSON，只在后台记录日志？
3. 如果要在 Print 模式中同时显示工具调用信息，需要修改哪些代码？尝试实现。

---

## 练习 4：扩展练习

### 4.1 为 Print 模式增加 `--verbose` 选项

修改 `print.ts` 使其支持显示工具调用信息。提示：
- 在 `message_update` 之前，插入 `tool_execution_start` 的处理
- 输出格式参考：`[Tool] 正在执行: search`

### 4.2 为 TUI 增加新命令

在 `commands.ts` 中增加一个 `/stats` 命令，显示当前会话的统计信息（如对话轮数、总消息数等）。提示：
- 在 `switch` 中添加新的 case
- 从 `agent.state.messages` 获取消息列表长度

### 4.3 使用 RPC 模式集成到其他语言

选择你熟悉的语言（Python、Go、Ruby、Rust 等），编写一个简单的程序通过 RPC 模式与 piagent 交互。参考 `03-rpc-mode.md` 中提供的 Python 和 Go 示例。

---

## 练习 5：综合理解

### 问题

1. 四种接口模式中，哪些是"只读"（只输出不输入）的？哪些是"双向"的？
2. 如果删除 `agent.subscribe()` 的返回值（取消订阅函数），会有什么影响？
3. 接口层代码中没有任何类继承，全部是函数和模块。这种设计比类继承好在哪？
4. 如果要实现一个 WebSocket 接口（WebSocketInterface），需要复用哪些代码？需要新增哪些代码？

### 实验

```bash
# 体验"一个 Agent，四种 UI"——用同一个 prompt 测试四种模式
PROMPT="用一句话解释指针"

echo "=== Print 模式 ==="
piagent -p "$PROMPT"

echo "=== JSON 模式 ==="
piagent -m "$PROMPT" --output json | jq -r 'select(.type == "message_end") | .message.content'

echo "=== RPC 模式 ==="
echo "{\"type\":\"message\",\"content\":\"$PROMPT\"}" | piagent --rpc | jq -r 'select(.type == "message_end") | .message.content'

# TUI 模式需要手动测试
echo "=== TUI 模式 ==="
echo "请手动运行: piagent --tui"
```

---

## 参考答案要点

### 练习 3 思考题

1. `emit()` 方法使用 `for...of` 循环串行执行所有监听器，不是并行。每个监听器会 `await`，所以监听器之间是顺序执行的。

2. 静默模式实现：
   ```typescript
   export function createSilentInterface(agent: Agent): void {
     agent.subscribe(async (event) => {
       await fs.appendFile('agent.log', JSON.stringify(event) + '\n')
     })
   }
   ```

3. 在 Print 模式中增加 tool 事件处理：
   - 在 `message_start` 的 case 之外，增加 `tool_execution_start` 和 `tool_execution_end` 的 case
   - 输出格式如 `process.stdout.write(`\n[Tool] ${event.toolName}...\n`)`

### 练习 5 问题

1. **只读**：Print 模式、JSON 模式（只输出事件流，不接受输入）。**双向**：RPC 模式（通过 stdin/stdout 协议）、TUI 模式（交互式编辑器）。

2. 取消订阅函数未被使用，意味着监听器会在 Agent 的整个生命周期中持续存在，可能导致内存泄漏（如果 Agent 实例被频繁创建销毁）。

3. 函数式设计更简单、更易测试、更易组合。没有 `this` 绑定问题，没有继承链的认知负担，TypeScript 的类型推断也更顺畅。

4. WebSocket 接口需要复用：事件订阅机制（`agent.subscribe()`）、事件序列化（`JSON.stringify`）。需要新增：WebSocket 服务器创建、连接管理、WebSocket 特有的消息格式。