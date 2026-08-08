---
对应源码: src/tools/ 及 src/agent/types.ts
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# 工具层 — 章节概览

## 1. 本节目标

理解 piagent 工具层的设计与实现，包括：

- **AgentTool 接口**：LLM 调用工具的统一契约
- **7 个内置工具**：Bash、Read、Write、Edit、Grep、Find、Ls
- **ToolRegistry 注册表**：工具的注册、发现与生命周期管理
- **工具与 Agent 层的集成**：Agent 循环如何调用工具
- **沙箱与权限系统**：安全执行用户命令

## 2. 前置知识

- 了解 [02-ai-layer](../02-ai-layer/README.md) 中的 `Tool` 基础接口和 `ToolResult` 类型
- 了解 [03-agent-layer](../03-agent-layer/README.md) 中的 Agent 核心循环
- 熟悉 TypeScript 的 `interface`、`async/await`、`Map` 数据结构
- 了解 `@sinclair/typebox` 的基本用法（用于 JSON Schema 定义）

## 3. 核心概念

### 3.1 工具层的位置

工具层位于 Agent 层之下，是 LLM 与操作系统之间的"手"：

```
┌─────────────────────────┐
│      Agent 层           │  ← 核心循环，决定"何时调用工具"
├─────────────────────────┤
│      工具层             │  ← 提供"可以调用什么工具"
│  ┌───────────────────┐  │
│  │   ToolRegistry    │  │  ← 注册表，管理所有工具
│  ├───────────────────┤  │
│  │  bash │ read      │  │
│  │  write│ edit      │  │  ← 7 个内置工具
│  │  grep │ find │ ls │  │
│  └───────────────────┘  │
├─────────────────────────┤
│    沙箱层               │  ← 安全执行环境
└─────────────────────────┘
```

### 3.2 AgentTool 接口

所有工具都必须实现 `AgentTool` 接口（定义在 `src/agent/types.ts`）：

```typescript
export interface AgentTool extends Tool {
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate?: (update: ToolUpdate) => void
  ): Promise<ToolResult>
}
```

其中 `Tool` 基础接口（定义在 `src/ai/types.ts`）提供工具的元信息：

```typescript
export interface Tool {
  name: string          // 工具名（LLM 调用时用的标识）
  label?: string        // 显示名（UI 展示用）
  description: string   // 描述（LLM 理解工具用途）
  parameters: JSONSchema // 参数 Schema
  executionMode?: 'parallel' | 'sequential'
}
```

**设计原则**：`Tool` 是纯类型定义（无运行时行为），`AgentTool` 扩展了 `execute` 方法，遵循"类型递进扩展"模式。

### 3.3 7 个内置工具一览

| 工具名 | 源码 | 作用 | 底层实现 |
|--------|------|------|----------|
| `bash` | `src/tools/builtin/bash.ts` | 执行 shell 命令 | Docker 沙箱 / 本地 `exec` |
| `read` | `src/tools/builtin/read.ts` | 读取文件 | `fs.readFile` |
| `write` | `src/tools/builtin/write.ts` | 写入文件 | `fs.writeFile` |
| `edit` | `src/tools/builtin/edit.ts` | 精确替换文本 | `readFile` + `replace` + `writeFile` |
| `grep` | `src/tools/builtin/grep.ts` | 搜索文本 | `grep -rn` |
| `find` | `src/tools/builtin/find.ts` | 查找文件 | `find -name` |
| `ls` | `src/tools/builtin/ls.ts` | 列出目录 | `fs.readdir` |

### 3.4 与 Agent 层的集成方式

Agent 构造函数接收 `tools: AgentTool[]` 数组，将其全部注册到 `ToolRegistry`：

```typescript
// src/agent/loop.ts
this.toolRegistry = new ToolRegistry()
for (const tool of config.tools) {
  this.toolRegistry.registerTool(tool)
}
```

在 Agent 核心循环中，当 LLM 返回工具调用请求时，Agent 通过 `toolRegistry.getTool(name)` 查找工具并执行：

```typescript
const tool = this.toolRegistry.getTool(tc.name)
if (!tool) {
  // 工具未注册，返回错误
  results.push({ content: `工具 "${tc.name}" 未找到`, isError: true, terminate: false })
  continue
}
const result = await tool.execute(tc.id, tc.args, signal)
```

## 4. 代码实现

### 4.1 类型递进扩展

类型定义分为两层：

- **`src/ai/types.ts`**：定义 `Tool` 基础接口（纯数据，无方法）
- **`src/agent/types.ts`**：定义 `AgentTool extends Tool`（添加 `execute` 方法）

这种分离的原因是：`Tool` 类型在 AI 层（发送给 LLM 的 tool schema）和 Agent 层（实际执行）都会用到，但 AI 层不需要知道执行细节。

### 4.2 工具注册与初始化

在 Agent 启动时，所有工具通过构造函数注入：

```typescript
// 典型用法
const agent = new Agent({
  model: myModel,
  tools: [
    bashTool,
    readTool,
    writeTool,
    editTool,
    grepTool,
    findTool,
    lsTool,
  ],
  systemPrompt: '你是一个 AI 编程助手...',
})
```

## 5. 运行与验证

验证工具层是否正常工作：

```bash
# 1. 确认项目能编译
cd /workspace
npm run build

# 2. 运行测试（如果有工具层相关测试）
npx vitest run src/tools/ --reporter=verbose 2>&1 | head -30
```

## 6. 小结

工具层是 piagent 中 LLM 与操作系统交互的桥梁。通过 `AgentTool` 接口和 `ToolRegistry` 注册表模式，实现了：

- **统一的工具契约**：所有工具遵循相同的 `execute` 签名
- **灵活的注册机制**：可以动态增删工具
- **清晰的关注点分离**：工具只负责执行，Agent 负责何时调用
- **可扩展性**：通过 Extension API 可以注册自定义工具

### 思考题

1. 为什么 `Tool` 和 `AgentTool` 要分成两个接口？如果合并在一个接口中会有什么问题？
2. 在 `executeToolCalls` 方法中，Agent 使用 `this.toolRegistry.getTool()` 查找工具。如果我想让某个工具只对特定会话可见，应该如何修改设计？
3. 如果你要添加一个 `curl` 工具（发送 HTTP 请求），它的 `execute` 方法应该返回什么格式？

---

## 下一章

→ [工具注册与发现](01-tool-registry.md)