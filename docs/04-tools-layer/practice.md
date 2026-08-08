---
对应源码: src/tools/ 全部
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# 本章练习

## 练习 1：阅读所有工具的实现代码

打开本章涉及的所有源码文件，逐行阅读并理解：

```
src/tools/registry.ts           # 工具注册表
src/tools/builtin/bash.ts       # Bash 工具
src/tools/builtin/read.ts       # Read 工具
src/tools/builtin/write.ts      # Write 工具
src/tools/builtin/edit.ts       # Edit 工具
src/tools/builtin/grep.ts       # Grep 工具
src/tools/builtin/find.ts       # Find 工具
src/tools/builtin/ls.ts         # Ls 工具
src/agent/types.ts              # AgentTool 接口
src/sandbox/docker.ts           # Docker 沙箱
```

**要求**：对每个文件，回答以下问题：

1. 这个工具的 `name` 是什么？LLM 用什么名字调用它？
2. 它接受哪些参数？哪些是必填的，哪些是可选的？
3. 它的 `execute` 方法返回什么格式的结果？
4. 如果执行失败，它会如何报告错误？

## 练习 2：自己写一个工具

在 `src/tools/builtin/` 目录下创建一个新的工具文件。以下提供两个方案，任选其一：

### 方案 A：`cat` 工具

创建一个 `cat.ts` 工具，功能类似于 Linux 的 `cat` 命令——读取文件内容并在前面加上行号。

```typescript
// src/tools/builtin/cat.ts
// 要求：
// - 参数：path（文件路径，必填）
// - 功能：读取文件，每行前面加上行号（从 1 开始）
// - 返回值：带行号的文件内容
// - 大文件限制：最多显示 100 行
// - 提示：可以复用 read 工具的逻辑，再加上行号格式化
```

**参考实现**（先尝试自己写，写不出来再看）：

```typescript
import { readFile } from 'fs/promises'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

export const catTool: AgentTool = {
  name: 'cat',
  label: 'Cat',
  description: '读取文件内容并显示行号（最多 100 行）',
  parameters: Type.Object({
    path: Type.String({ description: '文件路径' }),
  }),

  async execute(toolCallId, params) {
    const path = params.path as string
    try {
      const content = await readFile(path, 'utf-8')
      const lines = content.split('\n')
      const maxLines = 100
      const display = lines.slice(0, maxLines)
      const numbered = display.map((line, i) => `${String(i + 1).padStart(4, ' ')} │ ${line}`).join('\n')
      const truncated = lines.length > maxLines ? `\n... (还有 ${lines.length - maxLines} 行未显示)` : ''
      return { content: [{ type: 'text', text: numbered + truncated }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `读取失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}
```

### 方案 B：`curl` 工具

创建一个 `curl.ts` 工具，功能类似于 Linux 的 `curl` 命令——发送 HTTP 请求。

```typescript
// src/tools/builtin/curl.ts
// 要求：
// - 参数：url（请求地址，必填）、method（请求方法，可选，默认 GET）
// - 功能：发送 HTTP 请求并返回响应内容
// - 返回值：状态码和响应体
// - 超时：10 秒
// - 提示：使用 Node.js 内置的 fetch API（Node 18+）
```

**参考实现**（先尝试自己写，写不出来再看）：

```typescript
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

export const curlTool: AgentTool = {
  name: 'curl',
  label: 'Curl',
  description: '发送 HTTP 请求，获取响应内容',
  parameters: Type.Object({
    url: Type.String({ description: '请求地址（URL）' }),
    method: Type.Optional(Type.String({ description: '请求方法，默认 GET' })),
  }),

  async execute(toolCallId, params) {
    const url = params.url as string
    const method = (params.method as string) || 'GET'
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(url, { method, signal: controller.signal })
      clearTimeout(timeout)
      const text = await response.text()
      return {
        content: [{ type: 'text', text: `[${response.status} ${response.statusText}]\n${text}` }],
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `请求失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}
```

## 练习 3：将工具注册到 Agent 中测试

完成练习 2 后，将新工具注册到 Agent 中并测试。

### 步骤 1：找到 Agent 初始化代码

在项目中搜索创建 Agent 实例的地方（通常在 `src/cli.ts` 或 `src/interface/cli.ts`）：

```bash
grep -rn "new Agent" src/ --include="*.ts"
```

### 步骤 2：在工具列表中添加新工具

找到 `tools: [...]` 数组，将你创建的工具添加进去：

```typescript
import { catTool } from './tools/builtin/cat.js'

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
    catTool,     // ← 添加新工具
  ],
  systemPrompt: '...',
})
```

### 步骤 3：编译并测试

```bash
npm run build
# 然后启动 Agent，发送一条消息让 LLM 使用新工具
npm start
```

## 拓展思考

1. 本章的 7 个工具都是"一对一"的（一个工具对应一个操作）。如果要实现一个"更智能"的工具，比如 `smart_edit`（自动识别代码中的函数并修改），应该如何设计 `execute` 方法？它应该返回什么？

2. 当前所有工具都是通过 `import` 静态引入的。如果工具数量增长到 50 个、100 个，每次启动都加载全部工具是否合理？如何实现工具的**懒加载**（只在需要时才加载）？

3. 工具执行的结果目前都是纯文本。如果工具返回的是富格式数据（如表格、图表、文件树），应该如何扩展 `ToolResult` 的 `content` 类型？

4. 在 `src/extension/api.ts` 中，`ExtensionAPI` 暴露了 `registerTool` 和 `unregisterTool` 方法。这意味着第三方插件可以注册工具。请思考：如果两个插件注册了同名的工具，应该如何处理？插件注册的工具和内置工具谁优先级更高？

---

## 参考答案（简要）

遇到困难时可以参考以下思路：

- **练习 2 方案 A**：`cat` 工具的核心是 `readFile` + 行号格式化，注意 '│' 字符的对齐
- **练习 2 方案 B**：`curl` 工具使用 Node.js 内置的 `fetch`，注意设置超时和错误处理
- **练习 3**：Agent 的构造函数接受 `tools: AgentTool[]`，只需在数组中添加新工具即可
- **拓展思考 1**：可以考虑返回 `ToolResult` 的 `details` 字段，在其中放入结构化数据
- **拓展思考 3**：可以扩展 `ContentBlock` 类型，支持 `table`、`tree` 等新类型