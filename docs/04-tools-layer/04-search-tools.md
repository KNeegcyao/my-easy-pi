---
对应源码: src/tools/builtin/grep.ts, src/tools/builtin/find.ts, src/tools/builtin/ls.ts
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# 搜索工具（Grep / Find / Ls）

## 1. 本节目标

理解三个搜索/浏览工具的实现，包括：

- `grep`：在文件中搜索文本内容（基于 `grep -rn`）
- `find`：按文件名模式查找文件（基于 `find -name`）
- `ls`：列出目录内容（基于 `fs.readdir`）
- 三个工具的实现差异和适用场景

## 2. 前置知识

- 了解 Linux 命令行工具 `grep`、`find` 的基本用法
- 了解 Node.js `fs/promises` 模块的 `readdir`
- 了解 `AgentTool` 接口的 `execute` 签名

## 3. 核心概念

### 3.1 搜索工具的分工

在代码浏览和搜索场景中，三个工具各司其职：

```
你想知道什么？               对应工具
─────────────────────────────────────────
"变量 X 在哪里定义的？"       → grep（搜索内容）
"有哪些 .ts 文件？"          → find（搜索文件名）
"这个目录下有什么？"          → ls（浏览目录）
```

### 3.2 实现方式对比

| 工具 | 实现方式 | 执行环境 | 适用场景 |
|------|----------|----------|----------|
| `grep` | 调用系统 `grep` 命令 | shell（子进程） | 搜索代码中的函数、变量、字符串 |
| `find` | 调用系统 `find` 命令 | shell（子进程） | 按文件名模式查找文件 |
| `ls` | Node.js `fs.readdir` | 进程内 | 浏览目录内容 |

注意：`grep` 和 `find` 通过 `exec` 子进程调用系统命令，而 `ls` 使用 Node.js 原生 API。这种差异反映了工具的设计哲学——前者利用已有的成熟工具，后者需要解析文件类型（区分文件/目录），用原生 API 更方便。

## 4. 代码实现

### 4.1 Grep 工具

```typescript
// src/tools/builtin/grep.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

const execAsync = promisify(exec)  // 将 exec 转为 Promise 版本

export const grepTool: AgentTool = {
  name: 'grep',
  label: 'Grep',
  description: '在文件中搜索关键词（支持正则），返回匹配的行',
  parameters: Type.Object({
    pattern: Type.String({ description: '要搜索的关键词或正则表达式' }),
    path: Type.Optional(Type.String({ description: '搜索路径或文件（默认当前目录）' })),
  }),

  async execute(toolCallId, params) {
    const pattern = params.pattern as string
    const path = (params.path as string) || '.'
    try {
      // grep -rn: 递归搜索，显示行号
      // 2>/dev/null: 忽略权限错误等噪音
      // || true: 防止 grep 无匹配时返回非零退出码导致 execAsync 抛出异常
      const { stdout } = await execAsync(
        `grep -rn "${pattern}" "${path}" 2>/dev/null || true`,
        { timeout: 10000 },  // 10 秒超时
      )
      return { content: [{ type: 'text', text: stdout || '(无匹配结果)' }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `搜索失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}
```

**关键设计点**：

- **`grep -rn`**：`-r` 表示递归搜索子目录，`-n` 表示显示行号。输出格式为 `文件路径:行号:匹配行内容`。
- **`2>/dev/null`**：忽略权限错误（如无法读取某些目录），避免输出被噪音污染。
- **`|| true`**：这是重要的容错技巧。`grep` 在没有匹配时会返回退出码 1，而 `execAsync` 会将非零退出码视为异常抛出。`|| true` 确保了无论是否有匹配，命令都返回退出码 0。
- **`timeout: 10000`**：10 秒超时，防止搜索大型目录耗时过长。
- **路径参数可选**：默认搜索当前目录 `.`，LLM 可以指定搜索范围。

### 4.2 Find 工具

```typescript
// src/tools/builtin/find.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

const execAsync = promisify(exec)

export const findTool: AgentTool = {
  name: 'find',
  label: 'Find',
  description: '按名称模式查找文件和目录（支持通配符 *）',
  parameters: Type.Object({
    pattern: Type.String({ description: '文件名模式（如 "*.ts"、"main*"）' }),
    path: Type.Optional(Type.String({ description: '搜索起点目录（默认当前目录）' })),
  }),

  async execute(toolCallId, params) {
    const pattern = params.pattern as string
    const path = (params.path as string) || '.'
    try {
      // find -name: 按文件名模式匹配
      // head -50: 限制输出最多 50 行，防止结果过多
      const { stdout } = await execAsync(
        `find "${path}" -name "${pattern}" 2>/dev/null | head -50 || true`,
        { timeout: 10000 },
      )
      return { content: [{ type: 'text', text: stdout || '(无匹配文件)' }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `查找失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}
```

**关键设计点**：

- **`find -name`**：`-name` 支持通配符，如 `*.ts`、`main*`、`*config*`。
- **`head -50`**：限制结果数量，防止匹配到大量文件时输出过长。LLM 的上下文窗口有限，50 条是一个合理的上限。
- **与 grep 的区别**：`find` 搜索的是**文件名**，`grep` 搜索的是**文件内容**。

### 4.3 Ls 工具

```typescript
// src/tools/builtin/ls.ts
import { readdir } from 'fs/promises'
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'

export const lsTool: AgentTool = {
  name: 'ls',
  label: 'List',
  description: '列出指定目录下的文件和子目录',
  parameters: Type.Object({
    path: Type.Optional(Type.String({ description: '目录路径（默认当前目录）' })),
  }),

  async execute(toolCallId, params) {
    const path = (params.path as string) || '.'
    try {
      // withFileTypes: true 让 readdir 返回 Dirent 对象（包含文件类型信息）
      const entries = await readdir(path, { withFileTypes: true })
      const result = entries.map(e => {
        const prefix = e.isDirectory() ? '📁' : '📄'  // 区分文件/目录
        return `${prefix} ${e.name}`
      }).join('\n')
      return { content: [{ type: 'text', text: result || '(空目录)' }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `列出目录失败: ${error instanceof Error ? error.message : String(error)}` }],
      }
    }
  },
}
```

**关键设计点**：

- **`withFileTypes: true`**：传给 `readdir` 的选项。如果不传，`readdir` 只返回文件名（字符串数组）。传了之后，返回的是 `Dirent` 对象，可以通过 `e.isDirectory()` 判断文件类型。
- **`📁` / `📄` 前缀**：用 emoji 区分文件和目录，使输出更直观。LLM 可以通过前缀快速判断是否需要进一步 `ls` 进入子目录。
- **进程内执行**：与前两个工具不同，`ls` 使用 Node.js 原生 API，不需要创建子进程，性能更好。

### 4.4 三个工具的实现差异

| 特性 | grep | find | ls |
|------|------|------|----|
| 执行方式 | 子进程（`exec`） | 子进程（`exec`） | 进程内（`fs.readdir`） |
| 超时 | ✅ 10s | ✅ 10s | ❌ 不需要 |
| 结果限制 | ❌ 无限制 | ✅ head -50 | ❌ 无限制 |
| 通配符 | ✅ 正则 | ✅ glob 通配符 | ❌ 不支持 |
| 权限错误处理 | 2>/dev/null | 2>/dev/null | try-catch |
| 空结果处理 | '(无匹配结果)' | '(无匹配文件)' | '(空目录)' |

## 5. 运行与验证

```bash
# 1. 确认代码编译通过
cd /workspace
npm run build

# 2. 测试 grep 工具
node -e "
import('./dist/tools/builtin/grep.js').then(({ grepTool }) => {
  grepTool.execute('test-1', { pattern: 'AgentTool', path: 'src' })
    .then(r => console.log(r.content[0].text))
})
"

# 3. 测试 find 工具
node -e "
import('./dist/tools/builtin/find.js').then(({ findTool }) => {
  findTool.execute('test-2', { pattern: '*.ts', path: 'src/tools' })
    .then(r => console.log(r.content[0].text))
})
"

# 4. 测试 ls 工具
node -e "
import('./dist/tools/builtin/ls.js').then(({ lsTool }) => {
  lsTool.execute('test-3', { path: 'src' })
    .then(r => console.log(r.content[0].text))
})
"
```

## 6. 小结

三个搜索工具覆盖了代码浏览的三种基本需求：

- **`grep`**：搜索文件内容，定位函数定义、变量引用等
- **`find`**：按文件名模式查找，快速定位特定类型的文件
- **`ls`**：浏览目录结构，了解项目的组织方式

实现方式上，`grep` 和 `find` 调用系统命令（复用成熟工具），`ls` 使用原生 API（需要解析文件类型）。三种工具配合使用，LLM 可以高效地探索和理解代码库。

### 思考题

1. `grep` 和 `find` 通过 `exec` 调用系统命令，这意味着它们依赖宿主机的环境（如 Windows 就没有 `grep` 命令）。如果要跨平台支持，应该怎么做？
2. `ls` 工具目前只显示了一级目录。如果 LLM 想了解完整的目录树结构（类似 `tree` 命令），应该如何实现？需要修改 `ls` 工具还是添加一个新工具？
3. 当前的 `grep` 实现中，`pattern` 直接插入了 shell 命令字符串。如果 LLM 传入的 `pattern` 包含特殊字符（如 `"` 或 `;`），会发生什么？如何防御？

---

## 下一章

→ [本章练习](practice.md)