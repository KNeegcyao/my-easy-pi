---
对应源码: src/extension/api.ts
最后更新: 2026-08-08
适用版本: my-easy-pi v1.0
---

# ExtensionAPI — 扩展接口设计

> 扩展通过 `api` 参数与内核交互——这是扩展与 my-easy-pi 之间的契约

## 1. 本节目标

理解 `ExtensionAPI` 类的接口设计，掌握扩展能够使用哪些能力，以及为什么扩展系统是一等公民。

## 2. 前置知识

- 了解 `AgentTool` 接口（详见 [04-工具层](../04-tools-layer/README.md)）
- 了解 `AgentEvent` 事件系统（详见 [03-Agent 层](../03-agent-layer/README.md)）
- 了解 `ToolRegistry` 工具注册表（详见 [04-工具层](../04-tools-layer/README.md)）

## 3. 核心概念

### 3.1 用"手机 App"来理解扩展

可以把 my-easy-pi 的扩展系统想象成你的手机：

| 手机概念 | my-easy-pi 扩展系统中的对应 |
|----------|------------------------|
| 手机操作系统 | my-easy-pi 内核（Agent + ToolRegistry） |
| App Store / 应用市场 | `~/.my-easy-pi/extensions/` 目录 |
| 下载并安装 App | 将扩展文件放入扩展目录 |
| 手机开机启动 | `ExtensionLoader.loadAll()` 扫描并加载扩展 |
| App 的 Manifest 声明文件 | 扩展的 `export default function` |
| 操作系统提供的 API（如相机、GPS） | `ExtensionAPI` 提供的能力（registerTool, on 等） |
| 用户打开 App 并使用其功能 | LLM 调用扩展注册的工具 |
| 卸载 App | 删除扩展文件（目前不支持运行时卸载） |

**类比的好处**：
- 你不需要知道手机操作系统内部的实现细节，只需要知道 App 能调用哪些 API
- 同理，扩展开发者不需要了解 my-easy-pi 内部复杂的 Agent 循环，只需要掌握 `ExtensionAPI` 提供的三个能力
- 手机 App 可以随时安装和（理想情况下）卸载，扩展也应该如此

### 3.2 为什么扩展系统是一等公民

在 my-easy-pi 中，扩展系统与内置模块享有同等的地位，体现在：

1. **API 与内核同源** — `ExtensionAPI` 直接操作 `ToolRegistry` 和 `Agent` 实例，与内置模块使用相同的数据结构
2. **无特权限制** — 扩展注册的工具与内置工具在 LLM 看来没有区别，都通过 `ToolRegistry` 统一管理
3. **事件平权** — 扩展通过 `on()` 订阅的事件与内置监听器接收完全相同的事件流
4. **生命周期一致** — 扩展加载是 Agent 启动流程的标准环节，不是"后门"或"附加品"

### 3.3 ExtensionAPI 类结构

`ExtensionAPI` 是扩展与 my-easy-pi 交互的唯一入口。它封装了三个核心能力：

| 核心能力 | 对应方法 | 操作对象 |
|----------|----------|----------|
| 工具管理 | `registerTool` / `unregisterTool` | `ToolRegistry` |
| 命令管理 | `registerCommand` / `getCommand` / `listCommands` | 内部 `Map` |
| 事件监听 | `on` | `Agent` 的订阅系统 |

> 如果类比手机 App，这三项能力相当于：注册一个快捷方式（工具）、注册一个设置页入口（命令）、监听系统广播（事件）。

### 3.4 辅助类型：Command

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
//   - registerTool()   注册自定义工具       ← 让 LLM 能调用扩展的功能
//   - unregisterTool() 注销工具             ← 运行时禁用某个工具
//   - registerCommand() 注册自定义命令      ← 让用户在 CLI 中执行扩展的命令
//   - on()             监听 Agent 事件     ← 对 Agent 的生命周期做出响应
//
// 设计理念：扩展与内置模块"平权"
//   - 注册的工具 → 进入 ToolRegistry（和内置工具同一个地方）
//   - 监听的事件 → 流入 Agent.subscribe（和内置监听器同一套机制）
// ============================================================

import type { AgentTool } from '../agent/types.js'          // AgentTool 接口，所有工具必须实现
import type { AgentEventListener } from '../ai/types.js'     // 事件监听器类型
import type { ToolRegistry } from '../tools/registry.js'    // 工具注册表，管理所有工具
import type { Agent } from '../agent/index.js'               // Agent 实例

// Command 接口：定义一个 CLI 命令的结构
export interface Command {
  description: string                          // 命令的描述文本，用于 --help 展示
  execute(args: string[]): Promise<void> | void // 执行函数，接收 CLI 参数数组
}

// ExtensionAPI 类：扩展与 my-easy-pi 内核之间的"桥梁"
// 每个扩展在初始化时都会收到一个 API 实例，通过它来操作内核
export class ExtensionAPI {
  // 内部 Map，存储所有注册的自定义命令
  // key = 命令名（如 "hello:status"），value = Command 对象
  private commands = new Map<string, Command>()

  // 构造函数：接收两个核心依赖的引用
  // 注意：这里使用的是"依赖注入"模式——不自己创建依赖，而是由外部传入
  constructor(
    private toolRegistry: ToolRegistry,   // ← 工具注册表，所有工具都汇集到这里
    private agent: Agent,                 // ← Agent 实例，通过它订阅事件
  ) {}

  /** 注册自定义工具 */
  registerTool(tool: AgentTool): void {
    // ★ 关键设计：直接委托给 ToolRegistry，与内置工具共用注册表
    // LLM 在调用时，完全不知道这个工具是内置还是扩展注册的
    this.toolRegistry.registerTool(tool)
  }

  /** 注销工具 */
  unregisterTool(name: string): void {
    // 从注册表中按名称移除工具
    // 适用于"条件性工具启用"场景：某些情况下禁用特定工具
    this.toolRegistry.unregisterTool(name)
  }

  /** 注册自定义命令 */
  registerCommand(name: string, command: Command): void {
    // 命令存储在 ExtensionAPI 内部，不经过 Agent 循环
    // 这意味着命令是给"人"（CLI 用户）用的，而不是给"AI"（LLM）用的
    this.commands.set(name, command)
  }

  /** 监听 Agent 事件 */
  on(event: string, handler: AgentEventListener): void {
    // ★ 注意：参数 event 当前未被使用！
    // 所有监听器都会收到全部 AgentEvent，需要在 handler 中自行过滤
    // 这是当前设计的一个简化点，未来可能会改进
    this.agent.subscribe(handler)
  }

  /** 查找命令（给 CLI 使用） */
  getCommand(name: string): Command | undefined {
    // 根据命令名查找对应的 Command 对象
    return this.commands.get(name)
  }

  /** 列出所有命令 */
  listCommands(): string[] {
    // 返回所有已注册的命令名列表
    // 用于 CLI 的自动补全或帮助信息展示
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
// ============================================================
// hello.ts — 一个简单的 my-easy-pi 扩展
//
// 这是扩展的标准模板，展示了如何使用 ExtensionAPI 的全部能力
//
// 关键约定：
//   1. 文件必须放在 ~/.my-easy-pi/extensions/ 或 .pi/extensions/ 下
//   2. 必须使用 export default 导出一个 async function
//   3. 该函数接收一个参数：api（ExtensionAPI 实例）
// ============================================================

// 导入 ExtensionAPI 类型（来自 my-easy-pi 包）
import type { ExtensionAPI } from 'my-easy-pi'

// 默认导出函数：扩展的入口点
// 当 ExtensionLoader 发现此文件时，会动态导入并调用此函数
// api 参数是 my-easy-pi 内核提供的"桥梁"，通过它可以注册工具、命令和事件监听
export default async function (api: ExtensionAPI) {

  // ── 1. 注册一个自定义工具 ──────────────────────────────────
  // 工具是"给 LLM 用的"——LLM 会在需要时调用它
  // 注册后，这个工具对 LLM 来说和内置的 grep、find 等工具没有区别
  api.registerTool({
    name: 'hello',                    // 工具名称，LLM 通过这个名字引用它
    description: '向用户问好，接收一个名字参数',  // 工具描述，LLM 根据它判断何时调用
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '用户的名字',  // 参数描述，帮助 LLM 正确填写参数
        },
      },
      required: ['name'],            // 必填参数列表
    },
    // execute：工具被调用时的执行函数
    // 接收工具调用 ID、参数对象、取消信号和更新回调
    async execute(toolCallId, params, signal, onUpdate) {
      const name = params.name as string
      return {
        content: [{ type: 'text', text: `你好，${name}！欢迎使用 my-easy-pi！` }],
      }
    },
  })

  // ── 2. 注册一个 CLI 命令 ──────────────────────────────────
  // 命令是"给人用的"——用户可以在 CLI 中直接调用
  // 不经过 Agent 循环，不会消耗 LLM Token
  api.registerCommand('hello:status', {
    description: '查看 hello 扩展的运行状态',
    execute(args: string[]) {
      console.log('[hello] 扩展运行正常')
    },
  })

  // ── 3. 监听 Agent 事件并打印日志 ──────────────────────────
  // on() 注册的事件监听器会收到 Agent 的全部生命周期事件
  // 在 handler 中通过 event.type 判断事件类型
  // 注意：这里的 'event' 和 'signal' 是标准事件处理参数
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

## 5. 扩展的完整生命周期

一个扩展从被加载到最终卸载，经历以下完整的生命周期阶段。理解这个生命周期有助于把握扩展系统的工作原理。

### 5.1 生命周期时序图

```
时间 ────────────────────────────────────────────────────────────►

╔══════════════════ 加载阶段 ═════════════════╗
                                              │
  ExtensionLoader        扫描目录 ──► 找到 hello.ts
       │                                      │
       ├── import("./hello.ts") ──────────────►  动态导入模块（Node.js import()）
       │   │                                    │
       │   ◄──── 获取模块对象 ────────────────┤
       │   │         { default: function }      │
       │   │                                    │
       │   ├── typeof mod.default === 'function'  ✓  验证导出是否为函数
       │   │                                    │
       │   ├── mod.default(api) ───────────────►  执行扩展初始化函数
       │   │   │                                    │
╔══════╧═══╧══════╤══════════════════════════════╗  │
║  扩展初始化内部   │                              ║  │
║                 │                              ║  │
║  api.registerTool({                            ║  │
║    name: 'hello',  ──► ToolRegistry ────────►   ║  │  注册工具到注册表
║    ...                                          ║  │
║  })                                             ║  │
║                 │                              ║  │
║  api.registerCommand('hello:status', {          ║  │
║    ...           ──► 内部 commands Map ──────►   ║  │  注册 CLI 命令
║  })                                             ║  │
║                 │                              ║  │
║  api.on('*', handler) ──► Agent.subscribe ──►   ║  │  注册事件监听器
║                                                 ║  │
╚═════════════════════════════════════════════════╝  │
                                                    │
╔══════════════════ 使用阶段 ═══════════════════╗    │
                                                 │
  Agent 运行中...                                 │
       │                                          │
  用户提问 ──► LLM 思考 ──► 选择工具 ──► 查找 ToolRegistry
       │                                          │
       ├── 找到 hello 工具 ──► 执行 hello.execute()  LLM 调用扩展工具
       │   │                                    │
       │   ◄── 返回 "你好！欢迎使用 my-easy-pi！" ─┤
       │                                          │
  Agent 发出事件 ──► 扩展的 on() 监听器收到通知   事件流到达扩展
       │                                          │
╚═════════════════════════════════════════════════╝
                                                    │
╔══════════════════ 卸载阶段 ══════════════════╗    │
                                              │     │
  当前局限：扩展卸载后无法移除已注册的工具和命令       （未来改进方向）
  重启 my-easy-pi 是"卸载"的等效操作
╚══════════════════════════════════════════════╝
```

### 5.2 各阶段详解

| 阶段 | 触发器 | 关键操作 | 错误处理 |
|------|--------|----------|----------|
| **扫描** | `loadAll()` 调用 | 遍历搜索目录，过滤 `.ts/.js` 文件 | 目录不存在则跳过 |
| **加载** | `import(fullPath)` | 动态导入模块，获取模块对象 | 捕获 import 异常，不影响其他扩展 |
| **验证** | 获取 `mod.default` | 检查是否为函数类型 | 非函数跳过，静默处理 |
| **注册** | 调用 `mod.default(api)` | 执行扩展初始化逻辑 | catch 子句捕获执行异常 |
| **使用** | Agent 运行期间 | LLM 调用工具 / 事件触发监听器 | 工具执行异常由 Agent 处理 |
| **卸载** | （当前不支持） | 移除工具、命令、事件监听器 | 后续版本可能实现 |

### 5.3 运行与验证

#### 5.3.1 验证 API 接口设计

`ExtensionAPI` 的接口设计可以通过 TypeScript 类型检查来验证：

```bash
# 检查类型定义是否正确
npx tsc --noEmit src/extension/api.ts
```

#### 5.3.2 测试扩展是否可以被加载

```bash
# 创建一个测试扩展
mkdir -p ~/.my-easy-pi/extensions
cat > ~/.my-easy-pi/extensions/test-api.ts << 'EOF'
import type { ExtensionAPI } from 'my-easy-pi'

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

`ExtensionAPI` 是 my-easy-pi 扩展系统的核心接口，它封装了三个关键能力：工具管理、命令管理和事件监听。通过将 `ToolRegistry` 和 `Agent` 的引用注入到 `ExtensionAPI` 中，扩展获得了与内置模块同等的"一等公民"地位。

### 当前设计的简化点

1. `on()` 方法的 `event` 参数目前未被使用，所有监听器收到所有事件，需要在 handler 中自行过滤
2. 没有提供 `unsubscribe` 返回值，扩展无法取消订阅
3. 命令管理独立于 Agent 循环，不参与 LLM 的推理过程

### 思考题

1. `ExtensionAPI` 的构造函数接收 `ToolRegistry` 和 `Agent` 引用，为什么不直接接收更多底层依赖（如 `FileSystem`）？
2. 如果扩展同时注册了同名工具，`registerTool` 会覆盖还是报错？查看 `ToolRegistry` 的源码后回答。
3. 如何在 `on()` 中只监听特定类型的 `AgentEvent`（例如只监听 `tool_execution_end`）？

> ← [上一节](../06-extension-layer/README.md) · [下一节](./02-extension-loader.md) →
>
> [📚 返回章节首页](../06-extension-layer/README.md)