# CLI 入口：组装所有模块

> 对应源码：`src/cli.ts`
> 最后更新：2026-08-08
> 适用版本：my-easy-pi v0.1.0+

## 1. 本节目标

- 理解 `src/cli.ts` 的完整执行流程
- 掌握每个模块的初始化时机和依赖关系
- 能够清晰地回答"这个模块从哪里来、到哪里去"

## 2. 前置知识

- 熟悉前 8 章的所有模块（AI 层、Agent 层、工具层、会话层、扩展层、接口层、配置与沙箱）
- 理解 TypeScript 的模块导入/导出机制
- 了解 Node.js 的 `process.argv` 参数解析

## 3. 核心概念

### 3.1 什么是"入口文件"？

`src/cli.ts` 是 my-easy-pi 的**唯一入口**。它不实现任何业务逻辑，而是：

1. **解析用户输入**（命令行参数）
2. **创建所有模块实例**（组装）
3. **连接各模块**（注入依赖、注册订阅）
4. **启动交互界面**（运行）

类似于"搭积木"——每个模块是一块积木，`cli.ts` 负责按正确顺序把它们拼在一起。

### 3.2 组装式架构

```
                 ┌─────────────────────┐
                 │    CLI 入口 (cli.ts)  │
                 │    组装所有模块        │
                 └──────────┬──────────┘
          ┌─────────────────┼─────────────────────┐
          │                 │                     │
          ▼                 ▼                     ▼
    ┌──────────┐     ┌──────────┐          ┌──────────┐
    │  Config   │     │  Model   │          │   Tool   │
    │ Manager   │     │ Registry │          │ Registry │
    └──────────┘     └──────────┘          └──────────┘
          │                 │                     │
          ▼                 ▼                     ▼
    ┌──────────┐     ┌──────────┐          ┌──────────┐
    │ Session  │     │  Agent   │          │Interface │
    │ Manager  │     │  核心     │          │  TUI/Print│
    └──────────┘     └──────────┘          └──────────┘
```

### 3.3 初始化顺序的重要性

模块初始化的顺序是严格规定的，因为后面的模块依赖前面的模块：

```
参数解析 → 配置加载 → 模型初始化 → 工具注册 → 会话恢复 → Agent 创建 → 订阅 → 启动界面
  (1)        (2)          (3)          (4)        (5)        (6)      (7)      (8)
```

## 4. 代码实现

### 4.1 第一步：参数解析（parseArgs）

```typescript
// src/cli.ts 第 13-36 行
function parseArgs(): {
  prompt?: string; message?: string; model?: string
  provider?: string; tui?: boolean; output?: OutputMode
  continue?: boolean; list?: boolean; deleteSession?: string; init?: boolean
} {
  const args = process.argv.slice(2)   // 获取命令行参数（去掉 node 和脚本路径）
  const result: any = { output: 'print' }  // 默认输出模式为 print
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-p': case '--prompt': result.prompt = args[++i]; break      // 系统提示
      case '-m': case '--message': result.message = args[++i]; break    // 直接消息
      case '--model': result.model = args[++i]; break                    // 指定模型
      case '--provider': result.provider = args[++i]; break              // 指定提供商
      case '-o': case '--output': result.output = args[++i]; break       // 输出模式
      case '-i': case '--tui': result.tui = true; break                  // 强制 TUI
      case '-c': case '--continue': result.continue = true; break        // 继续会话
      case '-l': case '--list': result.list = true; break                // 列会话
      case '--delete': result.deleteSession = args[++i]; break           // 删会话
      case '--init': result.init = true; break                           // 初始化
      case '-h': case '--help': printHelp(); process.exit(0)             // 帮助
    }
  }
  return result
}
```

**逐行解释**：
- `process.argv.slice(2)`：Node.js 的命令行参数数组，前两个是 `node` 和脚本路径，从第三个开始才是真正的参数
- `result: any = { output: 'print' }`：默认输出模式为 print（终端文本输出）
- `args[++i]`：对于带值的参数（如 `--model gpt-4o`），需要读取下一个参数作为值
- `printHelp()`：显示帮助信息后退出进程

**从哪里来、到哪里去**：
- **来源**：Node.js 运行时提供的 `process.argv`
- **去向**：`parseArgs()` 的返回值被 `main()` 函数使用，指导后续所有模块的初始化行为

### 4.2 第二步：配置加载（ConfigManager）

```typescript
// src/cli.ts 第 74-76 行
async function main(): Promise<void> {
  const args = parseArgs()           // ① 解析参数
  const config = new ConfigManager() // ② 创建配置管理器
  await config.load()                // ③ 加载配置（项目配置 → 用户配置 → 合并）
  const sessionManager = new SessionManager()  // ④ 创建会话管理器
```

**ConfigManager 内部发生了什么**（`src/config/settings.ts`）：

```typescript
// src/config/settings.ts 第 55-69 行
async load(): Promise<Settings> {
  const merged: Settings = {}
  // 1. 项目配置（最低优先级）
  this.projectConfig = await this.loadFile(PROJECT_CONFIG_PATH)  // .my-easy-pi/settings.json
  // 2. 用户配置（中等优先级）
  this.userConfig = await this.loadFile(USER_CONFIG_PATH)       // ~/.my-easy-pi/config.json

  Object.assign(merged, this.projectConfig)  // 项目配置作为基础
  Object.assign(merged, this.userConfig)     // 用户配置覆盖项目配置
  this.loaded = true
  return merged
}
```

**配置优先级**（从低到高）：
1. 项目配置 `.my-easy-pi/settings.json`（最低）
2. 用户配置 `~/.my-easy-pi/config.json`（中等）
3. 环境变量 `DEEPSEEK_API_KEY` 等（高）
4. CLI 参数 `--model gpt-4o`（最高，在 `parseArgs` 中处理）

**从哪里来、到哪里去**：
- **来源**：`src/config/settings.ts` 中的 `ConfigManager` 类
- **去向**：之后通过 `config.getApiKey(provider)` 和 `config.getDefaultProvider()` 为模型初始化提供配置

### 4.3 第三步：会话管理命令优先处理

```typescript
// src/cli.ts 第 79-99 行
// 会话管理命令
if (args.list) {          // pi -l：列出所有会话
  const sessions = await sessionManager.listSessions()
  if (sessions.length === 0) { console.log('暂无会话记录'); process.exit(0) }
  console.log('\n会话列表:')
  for (const s of sessions) {
    console.log(`  ${s.id}  |  ${s.name}  |  ${s.messageCount} 条  |  ${s.createdAt}`)
  }
  process.exit(0)
}

if (args.deleteSession) { // pi --delete <id>：删除指定会话
  await sessionManager.deleteSession(args.deleteSession)
  console.log(`已删除会话: ${args.deleteSession}`)
  process.exit(0)
}

if (args.init) {          // pi --init：初始化配置和沙箱环境
  await runInit()
  process.exit(0)
}
```

**关键点**：这些命令不需要创建 Agent，属于"管理类"操作，直接处理完就退出进程。

**从哪里来、到哪里去**：
- **来源**：`src/session/manager.ts` 中的 `SessionManager` 类
- **去向**：直接操作文件系统（JSONL 文件），完成后退出进程

### 4.4 第四步：模型初始化（ModelRegistry + Provider）

```typescript
// src/cli.ts 第 128-137 行
const registry = new ModelRegistry()                    // ① 创建模型注册表
registry.setProvider('anthropic', AnthropicProvider)    // ② 注册 3 个提供商
registry.setProvider('deepseek', DeepSeekProvider)
registry.setProvider('openai', OpenAIProvider)

const model = registry.getModel(provider, modelId, { apiKey })  // ③ 获取具体模型
if (!model) {
  const err = MODEL_NOT_FOUND(modelId, provider)
  console.error(`[${err.code}] ${err.message}`)
  process.exit(1)
}
```

**ModelRegistry 内部机制**（`src/ai/registry.ts`）：

```typescript
// src/ai/registry.ts 第 29-38 行
getModel(provider: string, modelId: string, config?: { apiKey?: string; baseUrl?: string }): Model | null {
  const factory = this.providers.get(provider)  // 查找提供商工厂
  if (!factory) return null

  const instance = factory.create({              // 创建 Provider 实例
    apiKey: config?.apiKey || '',
    baseUrl: config?.baseUrl,
  })
  return instance.createModel(modelId)           // 创建具体模型实例
}
```

**从哪里来、到哪里去**：
- **来源**：`src/ai/registry.ts` 的 `ModelRegistry`，`src/ai/providers/` 下的 Provider 实现
- **去向**：创建的 `model` 对象被传入 `Agent` 构造函数，成为 Agent 的"大脑"

### 4.5 第五步：工具注册（7 个内置工具）

```typescript
// src/cli.ts 第 139-140 行
const toolRegistry = new ToolRegistry()
for (const t of [bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool]) {
  toolRegistry.registerTool(t)
}
```

**7 个内置工具一览**：

| 工具名 | 源码位置 | 作用 | 底层实现 |
|--------|----------|------|---------|
| `bash` | `src/tools/builtin/bash.ts` | 执行 shell 命令 | `child_process.exec` / Docker |
| `read` | `src/tools/builtin/read.ts` | 读取文件内容 | `fs.readFile` |
| `write` | `src/tools/builtin/write.ts` | 写入文件 | `fs.writeFile` |
| `edit` | `src/tools/builtin/edit.ts` | 替换文件中的文本 | 字符串替换 |
| `grep` | `src/tools/builtin/grep.ts` | 搜索关键词 | `grep` 命令 |
| `find` | `src/tools/builtin/find.ts` | 查找文件名 | `find` 命令 / glob |
| `ls` | `src/tools/builtin/ls.ts` | 列出目录 | `fs.readdir` |

**从哪里来、到哪里去**：
- **来源**：`src/tools/builtin/` 目录下的 7 个工具实现文件，通过 `src/tools/index.ts` 统一导出
- **去向**：`toolRegistry.listTools()` 的结果被传入 `Agent` 构造函数，成为 Agent 的"手脚"

### 4.6 第六步：会话恢复（SessionManager）

```typescript
// src/cli.ts 第 142-152 行
let initialMessages = undefined
let sessionId: string | null = null
if (args.continue) {                          // pi -c：继续上次会话
  const lastId = await sessionManager.getLastSession()  // 读取上次会话 ID
  if (lastId) {
    const msgs = await sessionManager.loadSession(lastId) // 加载会话消息
    if (msgs.length > 0) { initialMessages = msgs; sessionId = lastId }
  }
  if (!initialMessages) { console.error('没有可恢复的会话'); process.exit(1) }
}
```

**SessionManager 内部**（`src/session/manager.ts`）：

- `getLastSession()`：读取 `~/.my-easy-pi/last-session` 文件中的会话 ID
- `loadSession(id)`：读取 `sessions/{id}.jsonl` 文件，反序列化为 `AgentMessage[]`
- JSONL 文件每行一个 JSON 对象，追加写入，天然支持大文件

**从这里来、到哪里去**：
- **来源**：`src/session/manager.ts` 的 `SessionManager`
- **去向**：恢复的消息列表 `initialMessages` 会被注入到 Agent 的 `state.messages` 中

### 4.7 第七步：Agent 创建（构造函数 + 钩子）

```typescript
// src/cli.ts 第 154-163 行
const permission = new PermissionManager()     // 创建权限管理器
const compactor = new Compactor()              // 创建上下文压缩器

const agent = new Agent({
  systemPrompt: `你是 my-easy-pi — 一个 AI 编程助手。\n当前使用的模型: ${modelId}（提供商: ${provider}）\n\n你有以下工具可用：\n...`,  // 系统提示词
  model: model!,                                // 传入 Model 实例
  tools: toolRegistry.listTools(),              // 传入所有工具
  beforeToolCall: (ctx) => permission.check(ctx),  // 工具调用前检查权限
  transformContext: async (messages) => compactor.compact(messages),  // 上下文压缩
})

if (initialMessages) { agent.state.messages = initialMessages as any }  // 恢复历史消息
```

**Agent 构造函数内部**（`src/agent/loop.ts` 第 83-102 行）：

```typescript
constructor(config: AgentLoopConfig) {
  // 创建内部 ToolRegistry 并注册所有工具
  this.toolRegistry = new ToolRegistry()
  for (const tool of config.tools) {
    this.toolRegistry.registerTool(tool)
  }

  // 创建 Agent 状态
  this.state = createAgentState({
    systemPrompt: config.systemPrompt,
    model: config.model,
    tools: config.tools,
  })

  this.toolExecution = config.toolExecution || 'parallel'  // 默认并行执行工具
  this.convertToLlmFn = config.convertToLlm || defaultConvertToLlm  // 消息转换
  this.transformContextFn = config.transformContext  // 上下文压缩
  this.beforeToolCallFn = config.beforeToolCall      // 工具调用前钩子
  this.afterToolCallFn = config.afterToolCall        // 工具调用后钩子
  this.queue = new MessageQueue()                    // 创建消息队列
}
```

**两个钩子的作用**：

| 钩子 | 时机 | 作用 | 在 CLI 中的实现 |
|------|------|------|----------------|
| `beforeToolCall` | 工具执行前 | 权限检查、拦截危险操作 | `PermissionManager.check()` |
| `transformContext` | 每轮开始前 | 压缩上下文、防止超窗口 | `Compactor.compact()` |

**从哪里来、到哪里去**：
- **来源**：`src/agent/loop.ts` 的 `Agent` 类，`src/agent/permission.ts` 的 `PermissionManager`，`src/session/compaction.ts` 的 `Compactor`
- **去向**：创建的 `agent` 实例是整个系统的核心，后面所有操作都通过它进行

### 4.8 第八步：自动保存订阅

```typescript
// src/cli.ts 第 167-189 行
let sessionNamed = false
if (!sessionId) sessionId = await sessionManager.createSession()  // 创建新会话
await sessionManager.saveLastSession(sessionId)  // 保存为"上次会话"

let turnCount = 0
agent.subscribe(async (event) => {
  if (event.type === 'message_end' && event.message.role !== 'notification') {
    // 每条消息自动保存到 JSONL 文件
    await sessionManager.saveMessage(sessionId!, event.message)

    // 第一条用户消息自动命名会话
    if (!sessionNamed && event.message.role === 'user' && event.message.content) {
      const name = event.message.content.slice(0, 40) +
        (event.message.content.length > 40 ? '...' : '')
      await sessionManager.renameSession(sessionId!, name)
      sessionNamed = true
    }
  }
  if (event.type === 'turn_end') {
    turnCount++
    const toolCalls = event.toolResults.length
    recordTokenUsage(toolCalls * 100, toolCalls * 200)  // 记录 token 使用
  }
})
```

**订阅机制**：`agent.subscribe()` 返回一个取消订阅函数，但 CLI 中不需要取消，因为 Agent 生命周期就是应用的生命周期。

**自动保存的逻辑**：
- 每条 `message_end` 事件（非 notification）→ 追加写入 JSONL 文件
- 第一条用户消息 → 自动截取前 40 个字符作为会话名称
- 每轮结束 → 记录 token 使用统计

**从哪里来、到哪里去**：
- **来源**：`Agent.subscribe()` 是 Agent 的事件订阅方法
- **去向**：订阅的回调函数中调用 `SessionManager.saveMessage()` 写入文件系统

### 4.9 第九步：启动对应界面

```typescript
// src/cli.ts 第 192-213 行
// 启动界面
if (args.tui) { startTUI(agent) }  // 全屏终端交互界面
else if (args.output === 'json') {  // JSON 事件流模式
  createJSONInterface(agent)
  try { await agent.prompt(userMessage!) } catch (e) { ... }
} else if (args.output === 'rpc') { startRPC(agent) }  // 进程间通信模式
else {  // Print 模式（默认）
  createPrintInterface(agent)
  try { await agent.prompt(userMessage!); console.log('\n--- 完成 ---') }
  catch (e) { ... }
}
```

**4 种界面模式对比**：

| 模式 | 函数 | 适用场景 | 特点 |
|------|------|----------|------|
| **TUI** | `startTUI(agent)` | 交互式终端（默认） | 全屏显示、键盘操作、多行输入 |
| **Print** | `createPrintInterface(agent)` | 管道/脚本 | 流式输出到 stdout，适合 `echo "xxx" \| pi -p "..."` |
| **JSON** | `createJSONInterface(agent)` | CI/工具链 | 输出 JSONL 事件流，可用 `jq` 解析 |
| **RPC** | `startRPC(agent)` | 跨语言通信 | stdin/stdout JSONL 协议，Python/Go 等可嵌入 |

**Print 模式的实现**（`src/interface/print.ts`）：

```typescript
// 订阅事件，流式输出文本差异部分
agent.subscribe((event: AgentEvent) => {
  switch (event.type) {
    case 'message_update': {
      const content = event.message.content
      if (content) {
        const newPart = content.slice(lastContentLength)  // 只输出新增部分
        if (newPart) process.stdout.write(newPart)
        lastContentLength = content.length
      }
      break
    }
    case 'message_end':
      if (event.message.role === 'assistant') {
        process.stdout.write(EOL + EOL)  // 消息结束后换行
      }
      break
  }
})
```

**从哪里来、到哪里去**：
- **来源**：`src/interface/` 目录下的 4 个界面实现
- **去向**：界面层通过 `agent.subscribe()` 订阅事件，将 Agent 的输出渲染到终端或其他输出目标

## 5. 运行与验证

### 5.1 查看完整启动流程

执行以下命令，观察 my-easy-pi 的启动过程：

```bash
# 使用 --help 查看所有参数
node dist/cli.js --help

# 使用 Print 模式发送一条消息（观察流程）
echo "你好" | node dist/cli.js -p "请用中文回复"

# 使用 JSON 模式查看事件流
node dist/cli.js -m "你好" --output json
```

### 5.2 验证各模块初始化

```bash
# 1. 验证配置加载
ls -la ~/.my-easy-pi/config.json       # 用户配置
ls -la .my-easy-pi/settings.json       # 项目配置（如果存在）

# 2. 验证会话目录
ls -la .my-easy-pi/sessions/           # 会话文件

# 3. 验证会话列表
node dist/cli.js -l                  # 列出所有会话

# 4. 验证会话恢复
node dist/cli.js -c                  # 继续上次会话

# 5. 验证初始化流程
node dist/cli.js --init              # 初始化配置和沙箱
```

### 5.3 预期输出

```bash
$ echo "帮我读 config.json" | node dist/cli.js -p "请用中文回答"
# 输出：流式输出 LLM 的回复，最终显示 "--- 完成 ---"

$ node dist/cli.js -l
# 输出：
# 会话列表:
#   session-1734567890000  |  帮我读 config.json...  |  3 条  |  2026/8/8 10:00:00
```

## 6. 小结

### 6.1 关键要点回顾

1. **CLI 入口是组装工**：`src/cli.ts` 不实现业务逻辑，只负责创建和连接各模块
2. **初始化顺序严格**：配置 → 模型 → 工具 → 会话 → Agent → 界面，每一步都依赖上一步的结果
3. **钩子系统解耦关注点**：`beforeToolCall`（权限）和 `transformContext`（压缩）作为钩子注入，不影响 Agent 核心逻辑
4. **事件驱动 UI**：界面层通过 `subscribe()` 订阅 Agent 事件，与核心逻辑完全解耦
5. **自动保存无侵入**：通过订阅机制实现会话自动保存，Agent 核心不需要感知持久化

### 6.2 各模块的"来龙去脉"速查表

| 步骤 | 模块 | 从哪里来 | 用到哪个模块的能力 | 到哪里去 |
|------|------|----------|-------------------|---------|
| ① | `parseArgs` | `process.argv` | — | 返回参数对象 |
| ② | `ConfigManager` | `src/config/settings.ts` | 文件系统 | 提供 API 密钥、默认模型 |
| ③ | `ModelRegistry` | `src/ai/registry.ts` | 3 个 Provider | 提供 Model 实例 |
| ④ | `ToolRegistry` | `src/tools/registry.ts` | 7 个内置工具 | 提供工具列表 |
| ⑤ | `SessionManager` | `src/session/manager.ts` | JSONL 文件系统 | 提供会话恢复 |
| ⑥ | `Agent` | `src/agent/loop.ts` | Model + Tools + 钩子 | 核心运行实例 |
| ⑦ | `subscribe` | Agent 事件系统 | SessionManager | 自动保存 |
| ⑧ | Interface | `src/interface/` | Agent 事件流 | 用户终端 |

### 6.3 思考题

1. 如果要在启动时加载一个自定义工具，应该在 `main()` 函数的哪个位置添加代码？为什么？
2. `PermissionManager` 和 `Compactor` 作为钩子注入有什么好处？如果直接在 Agent 构造函数中硬编码会怎样？
3. 为什么 `parseArgs` 的默认 output 是 `'print'`，但代码中又会检测 `process.stdin.isTTY` 来决定是否使用 TUI？
4. 尝试修改 `cli.ts`，让 Agent 启动时自动加载 `~/.my-easy-pi/extensions/` 目录下的所有扩展文件，应该在哪里添加代码？
5. 如果用户同时传了 `-m "你好"` 和 `-i`（TUI）两个参数，代码会优先使用哪个模式？为什么？

> ← [上一节](../09-putting-it-together/README.md) · [下一节](./02-end-to-end-flow.md) →
>
> [📚 返回章节首页](../09-putting-it-together/README.md)