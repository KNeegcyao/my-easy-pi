---
对应源码: src/extension/api.ts
最后更新: 2026-08-08
适用版本: piagent v1.0
---

# ExtensionAPI — 扩展接口设计

> 扩展通过 `api` 参数与内核交互——这是扩展与 piagent 之间的契约

## 1. 本节目标

理解 `ExtensionAPI` 类的接口设计，掌握扩展能够使用哪些能力，以及为什么扩展系统是一等公民。

## 2. 前置知识

- 了解 `AgentTool` 接口（详见 [04-工具层](../04-tools-layer/README.md)）
- 了解 `AgentEvent` 事件系统（详见 [03-Agent 层](../03-agent-layer/README.md)）
- 了解 `ToolRegistry` 工具注册表（详见 [04-工具层](../04-tools-layer/README.md)）

## 3. 核心概念

### 3.1 为什么扩展系统是一等公民

在 piagent 中，扩展系统与内置模块享有同等的地位，体现在：

1. **API 与内核同源** — `ExtensionAPI` 直接操作 `ToolRegistry` 和 `Agent` 实例，与内置模块使用相同的数据结构
2. **无特权限制** — 扩展注册的工具与内置工具在 LLM 看来没有区别，都通过 `ToolRegistry` 统一管理
3. **事件平权** — 扩展通过 `on()` 订阅的事件与内置监听器接收完全相同的事件流
4. **生命周期一致** — 扩展加载是 Agent 启动流程的标准环节，不是"后门"或"附加品"

### 3.2 ExtensionAPI 类结构

`ExtensionAPI` 是扩展与 piagent 交互的唯一入口。它封装了三个核心能力：

| 核心能力 | 对应方法 | 操作对象 |
|----------|----------|----------|
| 工具管理 | `registerTool` / `unregisterTool` | `ToolRegistry` |
| 命令管理 | `registerCommand` / `getCommand` / `listCommands` | 内部 `Map` |
| 事件监听 | `on` | `Agent` 的订阅系统 |

### 3.3 辅助类型：Command

```typescript
export interface Command {
  description: string
  execute(args: string[]): Promise<void> | void
}
```

`Command` 接口定义了一个 CLI 命令的结构：
- `description` — 命令的描述文本，用于帮助信息展示
- `execute` — 命令的执行函数，接收字符串参数数组，可同步或异步

## 4. 代码实现

### 4.1 完整源码

```typescript
// ============================================================
// ExtensionAPI — 扩展 API
//
// 扩展通过 api 参数可以：
//   - registerTool()   注册自定义工具
//   - unregisterTool() 注销工具
//   - registerCommand() 注册自定义命令
//   - on()             监听 Agent 事件
// ============================================================

import type { AgentTool } from '../agent/types.js'
import type { AgentEventListener } from '../ai/types.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { Agent } from '../agent/index.js'

export interface Command {
  description: string
  execute(args: string[]): Promise<void> | void
}

export class ExtensionAPI {
  // 存储注册的自定义命令，key 是命令名
  private commands = new Map<string, Command>()

  constructor(
    private toolRegistry: ToolRegistry,  // 工具注册表引用
    private agent: Agent,                // Agent 实例引用
  ) {}

  /** 注册自定义工具 */
  registerTool(tool: AgentTool): void {
    // 委托给 ToolRegistry.registerTool，与内置工具共用注册表
    this.toolRegistry.registerTool(tool)
  }

  /** 注销工具 */
  unregisterTool(name: string): void {
    // 从工具注册表中移除指定工具
    this.toolRegistry.unregisterTool(name)
  }

  /** 注册自定义命令 */
  registerCommand(name: string, command: Command): void {
    // 将命令存入内部 Map，供 CLI 层查询
    this.commands.set(name, command)
  }

  /** 监听 Agent 事件 */
  on(event: string, handler: AgentEventListener): void {
    // 委托给 Agent.subscribe，与内置监听器接收相同事件
    this.agent.subscribe(handler)
  }

  /** 查找命令（给 CLI 使用） */
  getCommand(name: string): Command | undefined {
    return this.commands.get(name)
  }

  /** 列出所有命令 */
  listCommands(): string[] {
    return Array.from(this.commands.keys())
  }
}
```

### 4.2 逐行注释解读

**构造函数**（第 24-27 行）：
```typescript
constructor(
  private toolRegistry: ToolRegistry,  // 工具注册表，用于管理工具
  private agent: Agent,                // Agent 实例，用于订阅事件
) {}
```
`ExtensionAPI` 通过构造函数接收两个核心依赖：
- `ToolRegistry` — 所有工具（包括内置和扩展注册的）都存储在这里
- `Agent` — Agent 实例，提供事件订阅能力

**registerTool**（第 29-32 行）：
```typescript
registerTool(tool: AgentTool): void {
  this.toolRegistry.registerTool(tool)
}
```
直接委托给 `ToolRegistry.registerTool`。这意味着扩展注册的工具与内置工具**完全等价**，LLM 在调用时无法区分工具是内置的还是扩展注册的。

**unregisterTool**（第 34-37 行）：
```typescript
unregisterTool(name: string): void {
  this.toolRegistry.unregisterTool(name)
}
```
从注册表中移除工具。扩展可以动态禁用某个工具，这在条件性工具启用场景中非常有用。

**registerCommand**（第 39-42 行）：
```typescript
registerCommand(name: string, command: Command): void {
  this.commands.set(name, command)
}
```
命令是扩展暴露给 CLI 用户的能力。`Command` 接口包含 `description`（帮助描述）和 `execute`（执行函数）。命令存储在 `ExtensionAPI` 内部，不经过 Agent 循环。

**on**（第 44-47 行）：
```typescript
on(event: string, handler: AgentEventListener): void {
  this.agent.subscribe(handler)
}
```
扩展可以监听 Agent 的完整生命周期事件。注意参数 `event` 目前未被使用——所有监听器都会收到所有事件，扩展需要在 `handler` 内部按事件类型过滤。这是当前设计的一个简化点。

**getCommand / listCommands**（第 49-57 行）：
```typescript
getCommand(name: string): Command | undefined {
  return this.commands.get(name)
}

listCommands(): string[] {
  return Array.from(this.commands.keys())
}
```
这两个方法供 CLI 层使用，让用户能够查询和调用扩展注册的命令。

### 4.3 扩展示例代码

以下是一个完整的扩展示例，展示了如何使用 `ExtensionAPI` 的所有能力：

```typescript
// hello.ts — 一个简单的 piagent 扩展
import type { ExtensionAPI } from 'piagent'

export default async function (api: ExtensionAPI) {
  // 1. 注册一个自定义工具
  api.registerTool({
    name: 'hello',
    description: '向用户问好，接收一个名字参数',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '用户的名字' },
      },
      required: ['name'],
    },
    async execute(toolCallId, params, signal, onUpdate) {
      const name = params.name as string
      return {
        content: [{ type: 'text', text: `你好，${name}！欢迎使用 piagent！` }],
      }
    },
  })

  // 2. 注册一个 CLI 命令
  api.registerCommand('hello:status', {
    description: '查看 hello 扩展的运行状态',
    execute(args: string[]) {
      console.log('[hello] 扩展运行正常')
    },
  })

  // 3. 监听 Agent 事件并打印日志
  api.on('*', (event, signal) => {
    if (event.type === 'turn_start') {
      console.log('[hello] Agent 开始新一轮处理')
    }
    if (event.type === 'tool_execution_start') {
      console.log(`[hello] 工具 ${event.toolName} 被调用`)
    }
  })
}
```

## 5. 运行与验证

### 5.1 验证 API 接口设计

`ExtensionAPI` 的接口设计可以通过 TypeScript 类型检查来验证：

```bash
# 检查类型定义是否正确
npx tsc --noEmit src/extension/api.ts
```

### 5.2 测试扩展是否可以被加载

```bash
# 创建一个测试扩展
mkdir -p ~/.piagent/extensions
cat > ~/.piagent/extensions/test-api.ts << 'EOF'
import type { ExtensionAPI } from 'piagent'

export default async function (api: ExtensionAPI) {
  // 验证 registerTool 可用
  api.registerTool({
    name: 'test-tool',
    description: '测试工具',
    parameters: { type: 'object', properties: {} },
    async execute() {
      return { content: [{ type: 'text', text: 'ok' }] }
    },
  })

  // 验证 registerCommand 可用
  api.registerCommand('test:ping', {
    description: '测试命令',
    execute() { console.log('pong') },
  })

  // 验证 on 可用
  api.on('*', (event) => {
    if (event.type === 'agent_start') {
      console.log('[test] Agent 启动了')
    }
  })

  console.log('[test] 扩展加载成功')
}
EOF
```

## 6. 小结

`ExtensionAPI` 是 piagent 扩展系统的核心接口，它封装了三个关键能力：工具管理、命令管理和事件监听。通过将 `ToolRegistry` 和 `Agent` 的引用注入到 `ExtensionAPI` 中，扩展获得了与内置模块同等的"一等公民"地位。

### 当前设计的简化点

1. `on()` 方法的 `event` 参数目前未被使用，所有监听器收到所有事件，需要在 handler 中自行过滤
2. 没有提供 `unsubscribe` 返回值，扩展无法取消订阅
3. 命令管理独立于 Agent 循环，不参与 LLM 的推理过程

### 思考题

1. `ExtensionAPI` 的构造函数接收 `ToolRegistry` 和 `Agent` 引用，为什么不直接接收更多底层依赖（如 `FileSystem`）？
2. 如果扩展同时注册了同名工具，`registerTool` 会覆盖还是报错？查看 `ToolRegistry` 的源码后回答。
3. 如何在 `on()` 中只监听特定类型的 `AgentEvent`（例如只监听 `tool_execution_end`）？