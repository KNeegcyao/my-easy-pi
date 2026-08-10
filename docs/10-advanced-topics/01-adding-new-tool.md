---
对应源码: src/tools/builtin/web_fetch.ts, src/tools/index.ts, src/cli.ts
最后更新: 2026-08-10
适用版本: 0.1.0+
---

# 实践：添加一个自定义工具

## 1. 本节目标

本教程将手把手教你为 piagent 添加一个自定义工具。我们将以项目中真实实现的 **`web_fetch` 工具**（让 LLM 可以直接读取网页内容）为例，完整演示从创建文件到注册测试的全过程。

学完本节，你将能够：

- 理解 `AgentTool` 接口的设计
- 用 `TypeBox` 定义工具参数 Schema
- 将一个工具注册到 Agent
- 让 LLM 在对话中自动调用自定义工具

> 💡 **本教程的代码已实现在项目代码中**，你可以在 `src/tools/builtin/web_fetch.ts` 看到完整源码。我们边看代码边讲解。

---

## 2. 前置知识

- 熟悉 TypeScript 接口和类型
- 了解 `@sinclair/typebox` 的基本用法（用于定义参数 Schema）
- 了解 piagent 的工具注册机制（`ToolRegistry`）
- 建议先阅读 [工具层概览](../04-tools-layer/README.md)

---

## 3. 核心概念

### 3.1 工具的本质

在 piagent 中，一个工具就是一个实现了 `AgentTool` 接口的对象：

```typescript
// src/agent/types.ts
export interface AgentTool extends Tool {
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate?: (update: ToolUpdate) => void
  ): Promise<ToolResult>
}
```

其中 `Tool` 接口定义了工具的"外观"（LLM 看到的部分）：

```typescript
export interface Tool {
  name: string          // 工具名（LLM 调用时的标识）
  label?: string        // 显示名（UI 展示用）
  description: string   // 描述（LLM 理解工具用途）
  parameters: JSONSchema // 参数 Schema（LLM 据此生成参数）
  executionMode?: 'parallel' | 'sequential'
}
```

**核心设计思想：** 工具接口分为两层——`Tool` 是纯数据定义（AI 层），`AgentTool` 在 `Tool` 基础上添加 `execute` 方法（Agent 层）。这样 AI 层只需要知道工具的"形状"，不需要关心执行逻辑。

### 3.2 工具的工作流程

```
LLM 生成回复
    │
    ├── LLM 判断：需要获取外部信息 → 调用 web_fetch
    │         │
    │         ├── LLM 根据 parameters 生成参数
    │         │   {"url": "https://example.com/api"}
    │         │
    │         ▼
    │    Agent 收到 tool_call 事件
    │         │
    │         ├── ToolRegistry.getTool("web_fetch")  ← 查找工具
    │         │
    │         ├── tool.execute("tc-1", {url: "..."}, signal)  ← 执行
    │         │
    │         └── 执行结果以 ToolResult 返回给 LLM
    │
    └── LLM 根据工具结果生成最终回答
```

### 3.3 工具描述的重要性

`description` 字段可能是整个工具定义中**最关键**的部分。LLM 通过 description 来决定是否调用这个工具、以及什么时候调用。一个好的 description 应该：

- **说清楚工具的用途**：LLM 在什么场景下应该想起这个工具
- **说明参数的作用**：帮助 LLM 正确生成参数
- **给出使用示例**：复杂的工具可以提供使用模式

---

## 4. 真实案例：web_fetch 工具

### 4.1 需求分析

在日常使用中，Agent 经常需要查阅 GitHub 上的文件、读取在线文档或调用 API。传统的做法是先用 `git clone` 或 `curl`，但这些方式要么太重量级，要么需要手动处理输出。`web_fetch` 工具的目标就是**让 Agent 可以像读本地文件一样读取网页内容**。

### 4.2 完整源码

下面是对应源码 `src/tools/builtin/web_fetch.ts`：

```typescript
// ============================================================
// Web Fetch 工具
//
// 让 LLM 可以直接读取网页内容（支持 raw.githubusercontent.com、
// GitHub API、文档站点等），无需先 git clone。
//
// 使用 Node.js 内置的 fetch API，不依赖第三方库。
// 只支持 GET 请求，返回纯文本内容。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

/** 创建 web_fetch 工具 */
export const webFetchTool: AgentTool = {
  // ── 1. 工具元信息 ──
  name: 'web_fetch',
  label: 'Web Fetch',
  description: '读取网页内容，支持 GitHub raw 文件、API 响应、文档页面等',
  parameters: Type.Object({
    url: Type.String({ description: '要读取的网页 URL（如 https://raw.githubusercontent.com/xxx/README.md）' }),
  }),

  // ── 2. 工具执行方法 ──
  async execute(toolCallId, params, signal) {
    const url = params.url as string

    try {
      // 2a. 发起 HTTP GET 请求
      const response = await fetch(url, { signal })

      // 2b. 处理 HTTP 错误
      if (!response.ok) {
        return {
          content: [{
            type: 'text',
            text: `HTTP ${response.status}: ${response.statusText}\n${
              await response.text().catch(() => '(无法读取响应体)')}`,
          }],
          isError: true,
        }
      }

      // 2c. 读取响应文本
      const text = await response.text()

      // 2d. 内容截断保护（防止返回过多 token）
      const truncated = text.length > 100_000
        ? text.slice(0, 100_000) + `\n\n...（内容已截断，共 ${text.length} 字符）`
        : text

      return {
        content: [{ type: 'text', text: truncated }],
        details: { url, contentType: response.headers.get('content-type'), size: text.length },
      }
    } catch (error) {
      // 2e. 错误处理：返回错误信息而非抛出异常
      const err = error as Error
      return {
        content: [{ type: 'text', text: `请求失败: ${err.message}` }],
        isError: true,
      }
    }
  },
}
```

### 4.3 逐行解读

#### 工具元信息（第 14-19 行）

```typescript
name: 'web_fetch',            // LLM 调用时的标识（函数名）
label: 'Web Fetch',            // UI 显示用
description: '读取网页内容...', // LLM 理解工具用途
```

- `name` 是 LLM 在生成 tool_call 时使用的标识，LLM 会说"调用 web_fetch"
- `description` 帮助 LLM 在合适的场景下选择这个工具

#### 参数 Schema（第 20-22 行）

```typescript
parameters: Type.Object({
  url: Type.String({ description: '要读取的网页 URL...' }),
})
```

这里使用 `@sinclair/typebox` 库来定义参数。TypeBox 是一个类型安全的 Schema 定义库：

- `Type.Object({...})` — 定义一个对象类型的参数
- `Type.String()` — 定义一个字符串字段
- `Type.Optional(...)` — 标记可选字段（本例中没有）
- 每个字段的 `description` 会被 LLM 读取，帮助它理解如何填充参数

TypeBox 会自动生成 JSON Schema，同时能从 TypeScript 编译器中获得类型检查：

```typescript
// TypeBox 生成的 JSON Schema
{
  type: "object",
  properties: {
    url: { type: "string", description: "要读取的网页 URL..." }
  },
  required: ["url"]
}
```

#### execute 方法（第 24-55 行）

```typescript
async execute(toolCallId, params, signal) {
```

四个参数的作用：

| 参数 | 类型 | 说明 |
|------|------|------|
| `toolCallId` | `string` | 本次工具调用的唯一 ID，用于关联调用和结果 |
| `params` | `Record<string, unknown>` | LLM 生成的参数，需要手动断言类型 |
| `signal` | `AbortSignal` | 取消信号（用户按 Ctrl+C、超时等） |
| `onUpdate` | `(update) => void` | 可选，用于发送中间进度更新 |

#### 内容截断保护（第 44-47 行）

```typescript
const truncated = text.length > 100_000
  ? text.slice(0, 100_000) + `...（内容已截断）`
  : text
```

**为什么需要截断？** LLM 的上下文窗口是有限的。如果返回一个包含数百万字符的文件，不仅浪费 token，还可能导致 LLM 超出上下文限制。100K 字符是一个安全阈值。

#### 为什么不抛出异常？（第 50-54 行）

```typescript
} catch (error) {
  return {
    content: [{ type: 'text', text: `请求失败: ${err.message}` }],
    isError: true,
  }
}
```

这是 piagent 工具设计的一个**重要原则**：
- **❌ 不要 `throw`**：异常会导致 Agent Loop 中断，LLM 看不到错误信息
- **✅ 返回 `ToolResult`**：LLM 可以读到错误信息，并决定重试或向用户解释

设置 `isError: true` 可以让 Agent 层知道这次执行失败了，但仍然把结果返回给 LLM。

### 4.4 注册到系统

工具创建好后，需要三步来注册它：

#### 步骤 1：在统一导出中注册

编辑 `src/tools/index.ts`，添加导出：

```typescript
// src/tools/index.ts
export { webFetchTool } from './builtin/web_fetch.js'  // ← 新增
```

#### 步骤 2：在 CLI 入口注册到 Agent

编辑 `src/cli.ts`：

```typescript
// import 部分（第 3 行）
import { ..., webFetchTool } from './tools/index.js'

// 工具注册处（第 144 行）
const toolRegistry = new ToolRegistry()
for (const t of [bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool, webFetchTool]) {
  toolRegistry.registerTool(t)
}
```

#### 步骤 3：更新系统提示词

在 `src/cli.ts` 的 systemPrompt 中添加工具说明，让 LLM 知道有这个工具可用：

```typescript
systemPrompt: `...\n- web_fetch：读取网页内容（用于在线查看 GitHub 文件、文档等）\n...`,
```

### 4.5 注册流程示意图

```
┌─────────────────────────────────────────────┐
│               piagent 启动                   │
│                                             │
│  cli.ts — 创建 ToolRegistry                 │
│    │                                        │
│    ├── registry.registerTool(webFetchTool)  │ ← 注册工具
│    │                                        │
│    ├── agent.state.tools = 工具列表          │ ← 传给 Agent
│    │                                        │
│    └── systemPrompt 包含工具说明             │ ← 让 LLM 知道
│                                             │
│  LLM: "需要读取网页内容 → 调用 web_fetch"    │
└─────────────────────────────────────────────┘
```

---

## 5. 运行与验证

### 5.1 编译项目

```bash
npm run build
```

确保没有编译错误。如果有类型错误，检查是否在 `src/tools/index.ts` 中正确导出了 `webFetchTool`。

### 5.2 验证工具注册

```bash
# 快速验证
node -e "
const { ToolRegistry } = require('./dist/tools/registry.js');
const { webFetchTool } = require('./dist/tools/builtin/web_fetch.js');
const registry = new ToolRegistry();
registry.registerTool(webFetchTool);
console.log(registry.listTools().map(t => t.name));
"
```

预期输出：`[ 'web_fetch' ]`（以及其他注册的工具名称）

### 5.3 在对话中测试

启动 TUI：

```bash
npx tsx src/cli.ts
```

然后输入：

```
你能读取 https://raw.githubusercontent.com/KNeegcyao/my-easy-pi/main/README.md 的内容吗？
```

观察 Agent 是否会调用 `web_fetch` 工具来读取文件内容。

### 5.4 编写自动化测试

```typescript
// tests/unit/tools/web_fetch.test.ts
import { describe, test, expect } from 'vitest'
import { webFetchTool } from '../../../src/tools/builtin/web_fetch.js'

describe('webFetchTool', () => {
  test('工具定义正确', () => {
    expect(webFetchTool.name).toBe('web_fetch')
    expect(webFetchTool.description).toBeTruthy()
    expect(webFetchTool.parameters).toBeDefined()
    expect(webFetchTool.execute).toBeInstanceOf(Function)
  })

  test('参数 Schema 要求 url 字段', () => {
    const schema = webFetchTool.parameters as any
    expect(schema.properties?.url).toBeDefined()
    expect(schema.required).toContain('url')
  })
})
```

---

## 6. 小结

### 6.1 添加工具的完整流程

```
创建工具文件 (.ts) → 实现 AgentTool 接口
       ↓
在 tools/index.ts 中导出
       ↓
在 cli.ts 中注册到 ToolRegistry
       ↓
在 systemPrompt 中添加说明
       ↓
编译 → 验证 → 测试
```

### 6.2 设计要点回顾

| 要点 | 说明 |
|------|------|
| **description 决定调用** | LLM 通过描述决定何时调用工具 |
| **TypeBox 定义参数** | 类型安全的 Schema 定义，自动生成 JSON Schema |
| **不抛出异常** | 返回 `ToolResult` 让 LLM 自行处理错误 |
| **内容截断** | 防止返回过多数据浪费 token |
| **全局唯一命名** | 工具名在整个项目中必须唯一 |

### 6.3 延伸思考

- `web_fetch` 只支持 GET 请求。如果要支持 POST（调用 REST API），需要加哪些参数？
- 如何给 `web_fetch` 添加超时功能？（提示：`AbortSignal` + `setTimeout`）
- 当前返回纯文本。如果要支持 JSON 响应的结构化提取，应该怎么设计？

### 6.4 思考题

1. 如果要给 `web_fetch` 添加 `headers` 参数（用于设置 Authorization 请求头），参数 Schema 该如何修改？
2. 假设你发现 LLM 经常在不需要读取网页时也调用了 `web_fetch`，问题可能出在哪里？如何解决？
3. 当前的实现在内容超长时会截断。如果要让 LLM 能够分页读取完整内容，应该怎么设计？
4. 对比内置工具和扩展工具（ExtensionAPI）的注册方式有何不同？各自适合什么场景？

---

> ← [上一节](../10-advanced-topics/README.md) · [下一节](./02-adding-new-provider.md) →
>
> [📚 返回章节首页](../10-advanced-topics/README.md)