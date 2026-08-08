---
source: src/agent/*.ts
last_updated: 2026-08-08
version: 1.0.0
---

# 本章练习

> 动手实践是理解 Agent 层的最佳方式。以下练习按难度递增排列。

## 练习 1：阅读并理解 loop.ts 的完整流程

**目标**：确保你能完整地讲出 Agent Loop 的运转过程。

**步骤**：

1. 打开 `src/agent/loop.ts`，从头到尾通读一遍
2. 用纸笔（或思维导图工具）画出 `prompt()` → `runLoop()` → `processLLMStream()` → `executeToolCalls()` 的完整调用链
3. 在代码中圈出所有 `emit` 调用，确认每个事件发射的位置
4. 在代码中圈出所有 `break` 和 `continue`，确认循环的退出条件

**验证**：

- 你能不借助代码，说出 Agent Loop 的 10 个步骤吗？
- 你能说出三种循环退出条件吗？
- 你能说出 `beforeToolCall` 和 `afterToolCall` 分别在什么时机被调用吗？

---

## 练习 2：修改 Compactor 的阈值观察效果

**目标**：理解 `transformContext` 的作用，通过修改上下文压缩逻辑观察对 Agent 行为的影响。

**背景**：`transformContext` 是一个可选配置项，可以在每次调用 LLM 之前对消息历史进行转换/压缩。当前代码中没有提供默认实现。

**任务**：

1. 在 `src/agent/loop.ts` 中添加一个 `Compactor` 类，实现"消息截断"功能：

```typescript
class Compactor {
  private maxMessages: number

  constructor(maxMessages: number = 20) {
    this.maxMessages = maxMessages
  }

  async compact(messages: AgentMessage[]): Promise<AgentMessage[]> {
    if (messages.length <= this.maxMessages) return messages

    // 保留系统消息和最近的 N 条消息
    const systemMessages = messages.filter(m => m.role === 'system')
    const recentMessages = messages.slice(-this.maxMessages + systemMessages.length)

    return [...systemMessages, ...recentMessages]
  }
}
```

2. 将 `Compactor` 作为 `transformContext` 传入 Agent：

```typescript
const compactor = new Compactor(10)
const agent = new Agent({
  systemPrompt: '...',
  model,
  tools,
  transformContext: (messages) => compactor.compact(messages),
})
```

3. 运行 Agent 并进行多轮对话，观察消息历史是否被截断。

**思考题**：

- 将 `maxMessages` 设为 2 会怎么样？Agent 还能正常工作吗？
- 当前实现只简单地截断，更好的做法是生成摘要。如何将 AI 层的能力集成进来实现摘要压缩？
- 截断消息时，如果截断了某个工具调用的结果，LLM 会不会"失忆"？

---

## 练习 3：画 Agent Loop 的完整流程图

**目标**：通过画流程图，建立对 Agent Loop 的整体认知。

**要求**：

1. 使用你喜欢的工具（draw.io、Excalidraw、Mermaid、纸笔等）
2. 流程图必须包含以下元素：
   - `prompt()` 方法
   - `runLoop()` 循环
   - `processLLMStream()` 流处理
   - `executeToolCalls()` 三阶段执行
   - 消息队列检查
   - 三种退出条件
   - 事件发射点
   - 钩子调用点
3. 用不同颜色区分：
   - 蓝色：Agent 方法调用
   - 绿色：事件发射
   - 橙色：钩子调用
   - 红色：错误/退出路径

**验证**：

- 让一个不了解代码的人看你的流程图，他能否理解 Agent Loop 的工作方式？
- 你的流程图是否覆盖了所有 `emit` 调用点？

---

## 练习 4：实现一个简单的权限规则

**目标**：通过给 `PermissionManager` 添加自定义规则，理解权限系统的工作方式。

**任务**：

1. 创建一个自定义的 `PermissionManager`，添加以下规则：

```typescript
const myRules: PermissionRule[] = [
  // 禁止写入 /etc 目录
  { pattern: />\s+\/etc\//, risk: RiskLevel.DANGEROUS, reason: '禁止修改系统配置' },
  // 禁止执行 Python 代码（防止恶意脚本）
  { pattern: /^python\s+-c/, risk: RiskLevel.DANGEROUS, reason: '禁止执行内联 Python 代码' },
  // git push 需要确认
  { pattern: /^git\s+push/, risk: RiskLevel.NORMAL, reason: '推送代码到远程仓库' },
]

const pm = new PermissionManager(myRules)
```

2. 将 `pm.check` 作为 `beforeToolCall` 传入 Agent
3. 尝试让 Agent 执行 `echo "test" > /etc/config.yml`，观察是否被阻止

**验证**：

- `ls /etc` 应该被允许（不在规则中，默认 NORMAL，但第一次需要确认）
- `echo "test" > /etc/config.yml` 应该被阻止
- 已批准的命令第二次不会再次询问

---

## 练习 5：实现一个自定义事件监听器

**目标**：通过实现自定义事件监听器，理解事件系统的用法。

**任务**：

实现一个 `EventLogger` 类，将 Agent 事件记录到数组中，方便测试：

```typescript
class EventLogger {
  private events: Array<{ type: string; timestamp: number }> = []

  subscribe(agent: Agent): () => void {
    return agent.subscribe((event) => {
      this.events.push({
        type: event.type,
        timestamp: Date.now(),
      })
    })
  }

  /** 获取事件序列 */
  getSequence(): string[] {
    return this.events.map(e => e.type)
  }

  /** 统计每种事件的数量 */
  getCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const e of this.events) {
      counts[e.type] = (counts[e.type] || 0) + 1
    }
    return counts
  }

  /** 清空日志 */
  clear(): void {
    this.events = []
  }
}

// 使用示例
const logger = new EventLogger()
logger.subscribe(agent)

await agent.prompt('你好')

console.log('事件序列:', logger.getSequence().join(' → '))
console.log('事件统计:', logger.getCounts())
```

**验证**：

- 事件序列是否以 `agent_start` 开始，以 `agent_end` 结束？
- 如果 LLM 调用了工具，事件序列中是否包含 `tool_execution_start` 和 `tool_execution_end`？

---

## 练习 6：综合练习 — 构建一个"可观察的 Agent"

**目标**：综合运用 Agent 层所有知识，构建一个带有完整监控的 Agent。

**任务**：

1. 创建一个 Agent，包含：
   - 一个简单的系统提示词
   - 至少一个工具（如 `echo` 或 `ls`）
   - `beforeToolCall` 钩子（记录日志）
   - `afterToolCall` 钩子（检查结果）

2. 添加三个事件订阅者：
   - 订阅者 1：实时显示 LLM 输出到控制台
   - 订阅者 2：记录所有事件到数组
   - 订阅者 3：统计工具执行时间

3. 发送一条让 Agent 调用工具的 prompt

4. 验证：
   - 控制台能看到 LLM 的实时输出
   - 事件日志完整记录所有事件
   - 工具执行时间被正确统计

**参考代码框架**：

```typescript
import { Agent } from './src/agent/index.js'
import { createModel } from './src/ai/index.js'
import { PermissionManager } from './src/agent/permission.js'

// 1. 创建模型
const model = createModel('deepseek', { apiKey: process.env.DEEPSEEK_API_KEY })

// 2. 创建工具（简单示例）
const echoTool: AgentTool = {
  name: 'echo',
  description: '回显输入内容',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string' },
    },
  },
  async execute(toolCallId, params, signal) {
    return {
      content: [{ type: 'text', text: `你说了: ${params.text}` }],
    }
  },
}

// 3. 创建 Agent
const agent = new Agent({
  systemPrompt: '你是一个有用的助手，可以调用 echo 工具。',
  model,
  tools: [echoTool],
  beforeToolCall: async (ctx) => {
    console.log(`[钩子] 准备调用: ${ctx.toolCall.name}`)
    return undefined
  },
  afterToolCall: async (ctx) => {
    console.log(`[钩子] 工具结果: ${ctx.result.content}`)
    return undefined
  },
})

// 4. 订阅者 1：实时显示
agent.subscribe((event) => {
  if (event.type === 'message_update') {
    process.stdout.write(event.message.content)
  }
})

// 5. 订阅者 2：事件日志
const eventLog: string[] = []
agent.subscribe((event) => {
  eventLog.push(event.type)
})

// 6. 订阅者 3：工具执行时间
const toolTimings: Record<string, number> = {}
agent.subscribe((event) => {
  if (event.type === 'tool_execution_start') {
    toolTimings[event.toolCallId] = Date.now()
  }
  if (event.type === 'tool_execution_end') {
    const start = toolTimings[event.toolCallId]
    if (start) {
      console.log(`\n[计时] 工具 ${event.toolCallId} 耗时 ${Date.now() - start}ms`)
    }
  }
})

// 7. 运行
await agent.prompt('请调用 echo 工具，回显 "Hello Agent!"')

// 8. 输出统计
console.log('\n\n=== 统计 ===')
console.log('事件总数:', eventLog.length)
console.log('事件序列:', eventLog.join(' → '))
```

---

## 参考答案提示

**练习 1 验证答案**：

Agent Loop 的 10 个步骤：
1. `prompt()` 创建用户消息
2. `runLoop()` 发射 `turn_start`
3. 可选：`transformContext` 压缩上下文
4. `convertToLlm` 转换消息格式
5. 构建 `ModelContext` 并调用 LLM
6. `processLLMStream()` 处理流式响应
7. 创建 assistant 消息并发射 `message_end`
8. 检查是否有工具调用
   - 有：`executeToolCalls()` 执行工具
   - 无：检查队列
9. 将工具结果加入消息历史
10. 继续循环或退出

三种退出条件：
- LLM 无工具调用 + 队列为空 → 正常结束
- 所有工具返回 `terminate: true` → 主动终止
- LLM 无工具调用 + 队列有消息 → 注入队列消息，继续循环

**练习 2 思考题提示**：

- `maxMessages = 2`：Agent 可能"失忆"，无法进行多轮对话
- 摘要压缩：可以使用 LLM 的 `summarize` 能力，但需要额外的一次 LLM 调用
- 截断工具结果：如果截断了 `toolResult` 但保留了 `assistant` 消息中的 `toolCalls`，LLM 会认为工具还没执行完