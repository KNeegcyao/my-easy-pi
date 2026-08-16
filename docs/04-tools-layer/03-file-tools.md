---
对应源码: src/tools/builtin/read.ts, src/tools/builtin/write.ts, src/tools/builtin/edit.ts
最后更新: 2026-08-08
适用版本: my-easy-pi v0.1.0
---

# 文件工具（Read / Write / Edit）

## 1. 本节目标

理解三个文件操作工具的实现，包括：

- `read`：读取文件内容，支持行数限制
- `write`：写入文件内容
- `edit`：精确字符串替换（类似 sed 但更安全）
- 每个工具的参数 schema 和返回值格式
- 与 Bash 工具的功能对比

## 2. 前置知识

- 了解 Node.js `fs/promises` 模块的 `readFile` 和 `writeFile`
- 了解 `AgentTool` 接口的 `execute` 签名
- 了解 `@sinclair/typebox` 的基本用法

## 3. 核心概念

### 3.1 为什么需要专门的文件工具

你可能会问：既然有 `bash` 工具可以执行任何 shell 命令（包括 `cat`、`echo`、`sed`），为什么还要专门实现 read/write/edit 三个工具？

原因有三：

1. **可靠性**：`fs.readFile` 和 `fs.writeFile` 是 Node.js 原生 API，不会受到 shell 环境差异、特殊字符转义等问题的影响
2. **安全性**：文件操作在 Node.js 进程内执行，不需要经过 shell，避免了命令注入风险
3. **精确性**：`edit` 工具执行的是**精确字符串匹配**替换，而不是正则或 sed 模式匹配，对 LLM 来说更容易预测结果

### 3.2 三个工具的分工

| 工具 | 操作 | 适用场景 | 失败风险 |
|------|------|----------|----------|
| `read` | 读取 | 查看文件内容、代码审查 | 低（文件不存在才会失败） |
| `write` | 写入 | 创建新文件、覆盖已有文件 | 中（会覆盖已有内容） |
| `edit` | 修改 | 修改文件中的特定部分 | 低（替换失败会报错，不会损坏文件） |

## 4. 代码实现

### 4.1 Read 工具

```typescript
// src/tools/builtin/read.ts
import { readFile } from 'fs/promises'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

export const readTool: AgentTool = {
  name: 'read',
  label: 'Read',
  description: '读取指定文件的完整内容',
  parameters: Type.Object({
    path: Type.String({ description: '文件路径' }),
    limit: Type.Optional(Type.Number({ description: '最大读取行数（默认全部）' })),
  }),

  async execute(toolCallId, params) {
    const path = params.path as string
    try {
      const content = await readFile(path, 'utf-8')  // 读取文件，编码为 UTF-8
      const lines = content.split('\n')               // 按换行符分割
      const limit = params.limit as number | undefined
      const result = limit ? lines.slice(0, limit).join('\n') : content  // 截取前 N 行
      return { content: [{ type: 'text', text: result || '(空文件)' }] }  // 空文件提示
    } catch (error) {
      return {
        content: [{ type: 'text', text: `读取失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}
```

**关键设计点**：

- **`limit` 参数**：可选参数，用于限制读取的行数。当文件很大时（如一个 10 万行的日志文件），LLM 可以通过 `limit: 100` 只读取前 100 行，避免上下文窗口被撑爆。
- **`split('\n')` 再 `join('\n')`**：这里用了一个小技巧——先按行分割再重组，可以确保返回的内容末尾没有多余的换行符。
- **空文件处理**：如果文件为空，`readFile` 返回空字符串，`result || '(空文件)'` 会显示友好的提示。

### 4.2 Write 工具

```typescript
// src/tools/builtin/write.ts
import { writeFile } from 'fs/promises'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

export const writeTool: AgentTool = {
  name: 'write',
  label: 'Write',
  description: '写入内容到指定文件（会覆盖已有内容）',
  parameters: Type.Object({
    path: Type.String({ description: '文件路径' }),
    content: Type.String({ description: '要写入的内容' }),
  }),

  async execute(toolCallId, params) {
    const path = params.path as string
    const content = params.content as string
    try {
      await writeFile(path, content, 'utf-8')  // 写入文件
      return { content: [{ type: 'text', text: `已写入 ${path}（${content.length} 字符）` }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `写入失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}
```

**注意事项**：

- `writeFile` 默认会覆盖已有文件，不会追加。LLM 需要先用 `read` 读取，修改后再 `write`。
- 写入成功时，返回消息中包含了文件路径和字符数，方便 LLM 确认操作结果。
- 如果父目录不存在，`writeFile` 会抛出 `ENOENT` 错误。当前实现没有自动创建父目录（这与 `mkdir -p` 的行为不同）。

### 4.3 Edit 工具

```typescript
// src/tools/builtin/edit.ts
import { readFile, writeFile } from 'fs/promises'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

export const editTool: AgentTool = {
  name: 'edit',
  label: 'Edit',
  description: '在指定文件中查找并替换文本（只替换第一个匹配）',
  parameters: Type.Object({
    path: Type.String({ description: '文件路径' }),
    old: Type.String({ description: '要被替换的原文（必须完整匹配）' }),
    new: Type.String({ description: '替换后的新内容' }),
  }),

  async execute(toolCallId, params) {
    const path = params.path as string
    const oldStr = params.old as string
    const newStr = params.new as string

    try {
      const content = await readFile(path, 'utf-8')  // 1. 读取文件
      if (!content.includes(oldStr)) {                // 2. 检查原文是否存在
        return { content: [{ type: 'text', text: `替换失败：在 ${path} 中未找到匹配的文本` }] }
      }
      const result = content.replace(oldStr, newStr)  // 3. 替换（只替换第一个匹配）
      await writeFile(path, result, 'utf-8')          // 4. 写回文件
      return { content: [{ type: 'text', text: `已替换 ${path} 中的内容` }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `替换失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}
```

**Edit 工具的设计巧思**：

1. **先读后写**：edit 工具内部组合了 read 和 write 两个操作，但对外呈现为一个原子操作。
2. **精确匹配**：使用 `String.replace()` 而不是正则表达式，避免了正则转义和模式匹配的复杂性。LLM 只需要提供完全匹配的原文即可。
3. **只替换第一个**：`replace` 方法默认只替换第一个匹配项，这对代码修改非常合适——你通常只想改一处，而不是全局替换。
4. **失败预检**：在替换前先检查 `content.includes(oldStr)`，如果原文不存在，返回明确的错误信息，而不是静默执行无效果的替换。

### 4.4 三个工具的对比

| 特性 | read | write | edit |
|------|------|-------|------|
| 底层 API | `fs.readFile` | `fs.writeFile` | `fs.readFile` + `String.replace` + `fs.writeFile` |
| 参数 | path, limit? | path, content | path, old, new |
| 副作用 | 无 | 覆盖文件 | 修改文件 |
| 失败模式 | 文件不存在 | 目录不存在 | 原文不匹配 |
| 行数限制 | ✅ limit 参数 | ❌ | ❌ |
| 自动创建目录 | ❌ | ❌ | ❌ |

## 5. 运行与验证

```bash
# 1. 确认代码编译通过
cd /workspace
npm run build

# 2. 测试 read 工具
node -e "
import('./dist/tools/builtin/read.js').then(({ readTool }) => {
  // 读取自身（限制 3 行）
  readTool.execute('test-1', { path: 'src/tools/builtin/read.ts', limit: 3 })
    .then(r => console.log(r.content[0].text))
})
"

# 3. 测试 write 工具
node -e "
import('./dist/tools/builtin/write.js').then(({ writeTool }) => {
  writeTool.execute('test-2', { path: '/tmp/test.txt', content: 'Hello World' })
    .then(r => console.log(r.content[0].text))
})
"

# 4. 测试 edit 工具
node -e "
import('./dist/tools/builtin/edit.js').then(({ editTool }) => {
  editTool.execute('test-3', { path: '/tmp/test.txt', old: 'World', new: 'my-easy-pi' })
    .then(r => console.log(r.content[0].text))
})
"
```

## 6. 小结

三个文件工具构成了 LLM 操作文件系统的基础能力：

- **`read`**：轻量读取，支持行数限制，适合大文件预览
- **`write`**：直接写入，适合创建新文件或全量覆盖
- **`edit`**：精确替换，适合修改已有文件的特定部分

与 `bash` 工具相比，文件工具更安全、更可靠，但功能也更单一。在实际使用中，LLM 会根据具体需求选择合适的工具。

### 思考题

1. `write` 工具目前没有自动创建父目录。如果写入 `/tmp/a/b/c/file.txt` 而 `/tmp/a/b/` 不存在，会报错。你认为应该自动创建父目录吗？为什么？
2. `edit` 工具使用的是 `replace`（只替换第一个匹配）。如果文件中有多个相同的字符串需要替换，LLM 应该怎么做？你应该如何改进 `edit` 工具来支持这个场景？
3. 三个文件工具都没有使用 `onUpdate` 回调。如果要在读取大文件时通知调用方"正在读取..."，应该在哪里加入 `onUpdate` 调用？

---

---

> ← [上一节](./02-bash-tool.md) · [下一节](./04-search-tools.md) →
>
> [📚 返回章节首页](../04-tools-layer/README.md)