# TUI 模式 — 全屏终端交互界面

| 元信息 | 内容 |
|--------|------|
| 对应源码 | `src/interface/tui/` 目录 |
| 最后更新 | 2026-08-08 |
| 适用版本 | piagent v0.1.0 |

---

## 1. 本节目标

理解 TUI（Terminal User Interface）模式的设计与实现：它使用 alternate screen 技术创建全屏交互体验，提供输入/输出区域分离、多行输入编辑、Slash 命令系统和消息渲染样式，是 piagent 的默认交互方式。

---

## 2. 前置知识

- ANSI 转义序列基础
- Node.js `readline` 模块
- 事件发布/订阅模式
- 终端 alternate screen 概念

---

## 3. 核心概念

### 3.1 Alt Screen 模式

TUI 使用终端的 alternate screen 缓冲区（通过 `\x1b[?1049h` 进入，`\x1b[?1049l` 退出），类似于 `vim`、`htop` 等工具的全屏效果：

- **进入时**：保存当前终端内容，切换到独立的缓冲区
- **退出时**：恢复原始终端内容，不会留下 UI 痕迹
- **光标隐藏**：进入时隐藏光标，退出时恢复

### 3.2 模块化架构

TUI 由四个独立的模块组成，各司其职：

```
tui/
├── index.ts      # 入口：初始化 Alt Screen，启动各模块
├── editor.ts     # 编辑器：读取用户输入，处理 Slash 命令
├── renderer.ts   # 渲染器：订阅 Agent 事件，渲染到屏幕
├── commands.ts   # 命令系统：/help /model /cost /clear /exit
└── theme.ts      # 主题：ANSI 颜色和控制序列工具函数
```

### 3.3 事件驱动渲染

TUI 的渲染器与 Print 模式类似，但增加了对工具执行事件的支持，以及更精细的 UI 反馈（如"thinking..."提示、工具执行指示器）。

---

## 4. 代码实现

### 4.1 入口 — `tui/index.ts`

```typescript
import type { Agent } from '../../agent/index.js'
import { createTUIRenderer } from './renderer.js'
import { startEditor } from './editor.js'
import { green, gray, enterAltScreen, exitAltScreen, hideCursor, showCursor } from './theme.js'

export function startTUI(agent: Agent): void {
  // 进入 alternate screen，隐藏光标
  process.stdout.write(enterAltScreen() + hideCursor())

  // 注册退出清理函数
  const cleanup = () => {
    process.stdout.write(showCursor() + exitAltScreen())
  }
  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  // 创建渲染器（订阅 Agent 事件）
  createTUIRenderer(agent)

  // 显示模型信息
  const model = agent.state.model
  process.stdout.write(
    `  ${green('piagent')} — ${gray(`${model.provider}/${model.id}`)}\n\n`
  )

  // 启动交互式编辑器
  startEditor({
    agent,
    onExit: () => { cleanup(); process.exit(0) },
  })
}
```

**逐行注释说明：**

| 行号 | 代码 | 说明 |
|------|------|------|
| 1-4 | 导入语句 | 引入主题函数、渲染器和编辑器 |
| 8 | `enterAltScreen() + hideCursor()` | 进入全屏模式并隐藏光标 |
| 11 | `cleanup` | 退出时恢复终端原始状态 |
| 13-15 | 信号处理 | 注册 SIGINT（Ctrl+C）和 SIGTERM 信号处理 |
| 19 | `createTUIRenderer(agent)` | 创建渲染器，订阅事件 |
| 24 | 显示模型信息 | 在顶部显示当前模型名称 |
| 28 | `startEditor(...)` | 启动交互式输入循环 |

### 4.2 编辑器 — `tui/editor.ts`

```typescript
import * as readline from 'readline'
import type { Agent } from '../../agent/index.js'
import { printThinking, printPrompt } from './renderer.js'
import { dim, gray } from './theme.js'
import { executeCommand } from './commands.js'

export interface EditorOptions {
  agent: Agent
  onExit: () => void
}

export function startEditor(options: EditorOptions): void {
  const { agent } = options
  printPrompt()  // 显示初始提示符

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  })

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) { printPrompt(); return }

    // 处理 Slash 命令
    if (trimmed.startsWith('/')) {
      const result = executeCommand(trimmed, agent)
      if (result) {
        if (result.output) process.stdout.write(result.output + '\n')
        if (trimmed === '/exit' || trimmed === '/quit') {
          rl.close()
          return
        }
        printPrompt()
        return
      }
    }

    // Agent 忙时排入队列
    if (agent.state.isStreaming) {
      agent.followUp(trimmed)
      process.stdout.write(`\r${dim(gray('→ 已加入队列'))}\n\n`)
      printPrompt()
      return
    }

    printThinking()  // 显示 "thinking..." 提示

    try {
      await agent.prompt(trimmed)
    } catch (error) {
      process.stdout.write(`\n错误: ${error instanceof Error ? error.message : String(error)}\n`)
    }

    printPrompt()
  })

  rl.on('close', () => { console.log(''); options.onExit() })
  rl.on('SIGINT', () => rl.close())
}
```

**关键设计点：**

| 特性 | 实现方式 |
|------|----------|
| Slash 命令 | 输入以 `/` 开头时，调用 `executeCommand()` |
| 消息队列 | Agent 忙时，调用 `agent.followUp()` 将消息加入队列 |
| Thinking 提示 | 调用 `printThinking()` 显示斜体灰色提示 |
| 错误处理 | try/catch 捕获异常，输出到屏幕 |
| 优雅退出 | Ctrl+C 触发 `rl.close()`，最终调用 `onExit` |

### 4.3 渲染器 — `tui/renderer.ts`

```typescript
import type { Agent, AgentEvent } from '../../agent/index.js'
import { dim, gray, green, red, clearLine } from './theme.js'

let lastContentLength = 0
let hasReceivedContent = false

export function createTUIRenderer(agent: Agent): void {
  lastContentLength = 0
  hasReceivedContent = false

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        lastContentLength = 0
        hasReceivedContent = false
        break

      case 'message_update': {
        const content = event.message.content
        if (content) {
          if (!hasReceivedContent && content.length > 0) {
            process.stdout.write('\r' + clearLine() + '\r')
            hasReceivedContent = true
          }
          const newPart = content.slice(lastContentLength)
          if (newPart) process.stdout.write(newPart)
          lastContentLength = content.length
        }
        break
      }

      case 'message_end':
        if (event.message.role === 'assistant' && lastContentLength > 0) {
          process.stdout.write('\n')
        }
        break

      case 'tool_execution_start':
        process.stdout.write('\r' + clearLine() + '\r')
        process.stdout.write(`  ${dim('→')} ${event.toolName}` + '\n')
        break

      case 'tool_execution_end':
        process.stdout.write(`  ${green('✓')} 完成\n`)
        break

      case 'error':
        process.stdout.write('\r' + clearLine() + '\r')
        process.stdout.write(`  ${red('✗')} ${event.message}\n`)
        break
    }
  })
}

export function printThinking(): void {
  process.stdout.write(`\r${clearLine()}\r\x1b[90m\x1b[3mpiagent is thinking...\x1b[23m\x1b[0m`)
}

export function printPrompt(): void {
  process.stdout.write(`\n\x1b[32m> \x1b[0m`)
}

export function printUserInput(input: string): void {
  process.stdout.write(`\r${clearLine()}\r\x1b[90m> \x1b[0m${input}\n`)
}
```

**与 Print 模式渲染器的差异：**

| 特性 | Print | TUI |
|------|-------|-----|
| 内容开始标记 | 无 | 清除 "thinking..." 提示 |
| 工具执行 | 不显示 | 显示 `→ toolName` 和 `✓ 完成` |
| 错误样式 | 红色 `[error]` 前缀 | 红色 `✗` 符号 |
| 光标管理 | 无 | 配合光标隐藏/显示 |

### 4.4 命令系统 — `tui/commands.ts`

```typescript
import type { Agent } from '../../agent/index.js'
import { green, yellow, dim, gray } from './theme.js'

export interface CommandResult {
  handled: boolean
  output: string
}

export interface TokenStats {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  callCount: number
}

let tokenStats: TokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 }

export function recordTokenUsage(prompt: number, completion: number): void {
  tokenStats.promptTokens += prompt
  tokenStats.completionTokens += completion
  tokenStats.totalTokens += prompt + completion
  tokenStats.callCount++
}

export function executeCommand(input: string, agent: Agent): CommandResult | null {
  const parts = input.trim().split(/\s+/)
  const cmd = parts[0].toLowerCase()

  switch (cmd) {
    case '/help':
      return {
        handled: true,
        output: [
          '',
          `${gray('可用命令:')}`,
          `  ${green('/help')}      ${gray('显示帮助')}`,
          `  ${green('/model')}     ${gray('显示当前模型')}`,
          `  ${green('/cost')}      ${gray('Token 用量')}`,
          `  ${green('/clear')}     ${gray('清屏')}`,
          `  ${green('/exit')}      ${gray('退出')}`,
          '',
        ].join('\n'),
      }

    case '/model':
      return {
        handled: true,
        output: `  ${green('当前模型:')} ${agent.state.model.provider}/${agent.state.model.id}`,
      }

    case '/cost':
      return {
        handled: true,
        output: [
          `  ${yellow('Token 统计:')}`,
          `  ${dim('├─')} 调用次数:  ${tokenStats.callCount}`,
          `  ${dim('├─')} 提示 Token: ${tokenStats.promptTokens}`,
          `  ${dim('├─')} 生成 Token: ${tokenStats.completionTokens}`,
          `  ${dim('└─')} 总计:      ${tokenStats.totalTokens}`,
        ].join('\n'),
      }

    case '/clear':
      process.stdout.write('\x1b[2J\x1b[H')
      return { handled: true, output: '' }

    case '/exit':
    case '/quit':
      return { handled: true, output: '' }

    default:
      return null  // 未知命令，返回 null 让编辑器处理
  }
}

export function resetTokenStats(): void {
  tokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 }
}
```

**支持的命令列表：**

| 命令 | 功能 | 实现细节 |
|------|------|----------|
| `/help` | 显示帮助 | 返回所有可用命令列表 |
| `/model` | 显示当前模型 | 从 `agent.state.model` 读取 |
| `/cost` | Token 用量统计 | 通过 `recordTokenUsage()` 累计 |
| `/clear` | 清屏 | ANSI 转义序列 `\x1b[2J\x1b[H` |
| `/exit` | 退出 | 触发 `rl.close()` |
| `/quit` | 退出 | `/exit` 的别名 |

### 4.5 主题 — `tui/theme.ts`

```typescript
const RESET = '\x1b[0m'

export function bold(text: string): string   { return `\x1b[1m${text}${RESET}` }
export function dim(text: string): string    { return `\x1b[2m${text}${RESET}` }
export function green(text: string): string  { return `\x1b[32m${text}${RESET}` }
export function yellow(text: string): string { return `\x1b[33m${text}${RESET}` }
export function red(text: string): string    { return `\x1b[31m${text}${RESET}` }
export function gray(text: string): string   { return `\x1b[90m${text}${RESET}` }
export function italic(text: string): string { return `\x1b[3m${text}${RESET}` }

export function clearLine(): string  { return '\x1b[2K' }
export function clearBelow(): string { return '\x1b[J' }
export function enterAltScreen(): string { return '\x1b[?1049h' }
export function exitAltScreen(): string { return '\x1b[?1049l' }
export function hideCursor(): string { return '\x1b[?25l' }
export function showCursor(): string { return '\x1b[?25h' }

export const INPUT_PROMPT = '> '
export const THINKING_TEXT = 'piagent is thinking...'
```

**ANSI 控制序列速查：**

| 序列 | 效果 |
|------|------|
| `\x1b[0m` | 重置所有样式 |
| `\x1b[1m` | 粗体 |
| `\x1b[2m` | 暗色/半透明 |
| `\x1b[3m` | 斜体 |
| `\x1b[31m` | 红色前景 |
| `\x1b[32m` | 绿色前景 |
| `\x1b[33m` | 黄色前景 |
| `\x1b[90m` | 灰色前景 |
| `\x1b[2K` | 清除当前行 |
| `\x1b[J` | 清除光标下方 |
| `\x1b[?1049h` | 进入 alternate screen |
| `\x1b[?1049l` | 退出 alternate screen |
| `\x1b[?25l` | 隐藏光标 |
| `\x1b[?25h` | 显示光标 |
| `\x1b[2J\x1b[H` | 清屏并移动光标到左上角 |

---

## 5. 运行与验证

### 5.1 启动 TUI

```bash
# 直接启动（默认进入 TUI 模式）
piagent

# 或者显式指定
piagent --tui
```

### 5.2 基本操作

```bash
# 在 TUI 界面中：
> 你好                    # 输入消息
> /help                   # 查看帮助
> /model                  # 查看当前模型
> /cost                   # 查看 Token 用量
> /clear                  # 清屏
> /exit                   # 退出
```

### 5.3 观察特性

1. **全屏体验**：进入后终端进入 alternate screen，退出后恢复
2. **流式输出**：消息逐字渲染，thinking 提示在首个字符到达时被清除
3. **工具执行反馈**：看到 `→ toolName` 和 `✓ 完成` 的交互反馈
4. **消息队列**：在 Agent 响应时输入新消息，会看到 `→ 已加入队列`
5. **错误提示**：Agent 出错时显示红色 `✗` 标记

### 5.4 验证快捷键

| 快捷键 | 行为 |
|--------|------|
| Enter | 提交输入 |
| Ctrl+C | 退出 TUI |
| Ctrl+D | 退出 TUI |

---

## 6. 小结

TUI 模式是 piagent 最复杂的接口实现，由 5 个模块共计约 200 行代码组成。它通过纯 ANSI 转义序列实现了零依赖的全屏交互体验，展示了事件驱动架构如何让渲染器与编辑器分离、各模块独立演化。Slash 命令系统为后续扩展提供了清晰的入口——添加新命令只需在 `commands.ts` 的 switch 中增加一个 case。

### 思考题

1. 为什么 TUI 使用 `createTUIRenderer` 加 `startEditor` 两个函数，而不是合并成一个？
2. 如果用户输入非常长（超过一行宽度），当前的实现会如何处理？需要优化吗？
3. 如何为 TUI 添加历史记录功能（按上下键浏览历史输入）？
4. 为什么 theme.ts 使用函数（如 `green('text')`）而不是模板字符串？这有什么好处？

> ← [上一节](./03-rpc-mode.md) · [下一节](./practice.md) →
>
> [📚 返回章节首页](../07-interface-layer/README.md)