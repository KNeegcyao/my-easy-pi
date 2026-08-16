---
对应源码: src/tools/builtin/grep.ts, src/tools/builtin/find.ts, src/tools/builtin/ls.ts
最后更新: 2026-08-08
适用版本: my-easy-pi v0.1.0
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

### 3.3 搜索 vs 查找：理解两种思维

初学者经常混淆"搜索"和"查找"这两个概念，它们在 my-easy-pi 中代表两种不同的操作：

| 维度 | 搜索（grep） | 查找（find） |
|------|-------------|-------------|
| **关注点** | 文件内部有什么内容 | 文件本身叫什么名字 |
| **比喻** | 在书本中搜索某个关键词 | 在书架上找某本书 |
| **查询对象** | 文件内容中的文本模式 | 文件的元信息（名称、类型） |
| **匹配机制** | 逐行匹配，找出包含关键词的行 | 逐文件匹配文件名模式 |
| **典型问题** | "哪行代码用到了这个变量？" | "项目里有多少个 .ts 文件？" |
| **输出格式** | `文件路径:行号:匹配行内容` | `文件路径` |
| **是否关心结构** | 不关心，在文本层面上工作 | 关心文件命名规则 |

**简单记忆法**：如果你要问"在哪里"，用 grep（在文件内容中搜索）；如果你要问"有哪些"，用 find（列出符合条件的文件）。

### 3.4 通配符与正则表达式入门

`find` 和 `grep` 都支持模式匹配，但它们使用的"语言"不同。理解这两种语言对正确使用工具有很大帮助。

#### 通配符（Glob）— find 工具使用

通配符是一种简单的文件名匹配语法，用于 `find -name` 参数：

| 通配符 | 含义 | 示例 | 匹配 | 不匹配 |
|--------|------|------|------|--------|
| `*` | 匹配任意数量的任意字符（含空） | `*.ts` | `index.ts`, `app.ts` | `index.js` |
| `?` | 匹配恰好一个任意字符 | `?.ts` | `a.ts`, `b.ts` | `ab.ts`, `index.ts` |
| `[...]` | 匹配方括号内的任一字符 | `[ab].ts` | `a.ts`, `b.ts` | `c.ts` |
| `[!...]` | 匹配不在方括号内的任一字符 | `[!a].ts` | `b.ts`, `c.ts` | `a.ts` |

**实际例子**：
- `find . -name "*.config.*"` — 查找所有配置文件（如 `webpack.config.js`、`tsconfig.json`）
- `find . -name "test_??.py"` — 查找 `test_aa.py`、`test_01.py`，但不匹配 `test_a.py`
- `find . -name "[A-Z]*"` — 查找所有以大写字母开头的文件

#### 正则表达式（Regex）— grep 工具默认使用

正则表达式是一种更强大的文本匹配语言，用于 `grep` 的 pattern 参数：

| 元字符 | 含义 | 示例 | 匹配 |
|--------|------|------|------|
| `.` | 匹配任意单个字符 | `a.b` | `aab`, `acb`, `a-b` |
| `*` | 匹配前一个字符零次或多次 | `ab*c` | `ac`, `abc`, `abbc` |
| `^` | 匹配行首 | `^import` | `import ...`（位于行首） |
| `$` | 匹配行尾 | `;$` | `statement;`（以分号结尾） |
| `[abc]` | 匹配任一字符 | `gr[ae]y` | `gray`, `grey` |
| `(x|y)` | 匹配 x 或 y | `cat|dog` | `cat`, `dog` |

**实际例子**：
- `grep -rn "^import " src/` — 查找文件中所有的 import 声明
- `grep -rn "function.*=>" src/` — 查找箭头函数定义
- `grep -rn "console\.\(log\|error\|warn\)" src/` — 查找 console.log/error/warn 调用

#### 初学者最容易混淆的点

> **find 的 `-name` 使用的是通配符（glob），不是正则表达式！**
> 在 `find -name "*.ts"` 中，`*` 是通配符（匹配任意字符）。
> 而 `grep` 默认使用正则表达式，`grep "*" file` 中的 `*` 有不同含义。
>
> 简单规则：操作文件名 → 用通配符；操作文件内容 → 用正则表达式。

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

### 4.5 实际运行示例：输入与预期输出

以下示例展示在 my-easy-pi 源码目录下执行每个工具的实际效果。假设你在 my-easy-pi 项目根目录运行。

#### Grep 示例

**输入** — 搜索 `src/` 目录下所有包含 `registerTool` 的代码行：
```bash
# 实际调用的命令等效于：
grep -rn "registerTool" src/ 2>/dev/null || true
```

**预期输出**（简化）：
```
src/extension/api.ts:42:    this.toolRegistry.registerTool(tool)
src/extension/loader.ts:114:    await mod.default(this.api)  // 调用扩展初始化函数
src/tools/registry.ts:12:  registerTool(tool: AgentTool): void { ... }
```

**输出格式解读**：`文件路径:行号:该行的内容`

---

**输入** — 搜索 `export class` 但只看 `src/session/` 目录：
```bash
grep -rn "export class" src/session/ 2>/dev/null || true
```

**预期输出**：
```
src/session/manager.ts:5:export class SessionManager {
src/session/storage.ts:3:export class SessionStorage {
```

#### Find 示例

**输入** — 在 `src/` 下查找所有 `.ts` 文件（限制最多 50 条）：
```bash
# 实际调用的命令等效于：
find "src" -name "*.ts" 2>/dev/null | head -50 || true
```

**预期输出**（节选）：
```
src/agent/index.ts
src/agent/types.ts
src/session/manager.ts
src/session/storage.ts
src/tools/builtin/grep.ts
src/tools/builtin/find.ts
src/tools/builtin/ls.ts
src/tools/registry.ts
...
```

**输出格式解读**：每行一个完整路径，从查找根目录开始。

---

**输入** — 查找所有以 `test_` 开头的 Python 文件：
```bash
find . -name "test_*.py" 2>/dev/null | head -50 || true
```

**预期输出**（如果没有这样的文件）：
```
(无匹配文件)
```

#### Ls 示例

**输入** — 列出 `src/` 目录下的文件和子目录：
```typescript
// 实际调用的代码等效于：
const entries = await readdir('src', { withFileTypes: true })
entries.map(e => {
  const prefix = e.isDirectory() ? '📁' : '📄'
  return `${prefix} ${e.name}`
}).join('\n')
```

**预期输出**：
```
📁 agent
📁 extension
📁 session
📁 tools
📄 index.ts
📄 types.ts
```

**输出格式解读**：📁 表示目录（可进一步 `ls` 进入），📄 表示文件。

---

**输入** — 列出空目录：
```typescript
// 调用
lsTool.execute('test', { path: 'empty-dir' })
```

**预期输出**：
```
(空目录)
```

## 5. 运行与验证

### 5.1 编译确认

```bash
cd /workspace
npm run build
```

### 5.2 执行测试脚本

```bash
# 测试 grep 工具
node -e "
import('./dist/tools/builtin/grep.js').then(({ grepTool }) => {
  grepTool.execute('test-1', { pattern: 'AgentTool', path: 'src' })
    .then(r => console.log(r.content[0].text))
})
"

# 测试 find 工具
node -e "
import('./dist/tools/builtin/find.js').then(({ findTool }) => {
  findTool.execute('test-2', { pattern: '*.ts', path: 'src/tools' })
    .then(r => console.log(r.content[0].text))
})
"

# 测试 ls 工具
node -e "
import('./dist/tools/builtin/ls.js').then(({ lsTool }) => {
  lsTool.execute('test-3', { path: 'src' })
    .then(r => console.log(r.content[0].text))
})
"
```
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

## 7. 常见问题（FAQ）

### Q1: 为什么 grep 搜不到中文内容？

可能的原因和解决方案：

```bash
# 原因 1：文件编码不是 UTF-8
# 解决方案：先确认文件编码
file myfile.txt
# myfile.txt: Big5 text ...  ← 说明是 Big5 编码

# 解决方案：使用 -a（将二进制文件视为文本）或指定编码
grep -rn "中文" src/ 2>/dev/null || true

# 原因 2：locale 环境变量影响字符处理
# 解决方案：设置 LC_ALL
LC_ALL=C grep -rn "中文" src/ 2>/dev/null || true

# 更可靠的方案：先确认终端和文件编码一致
```

**根本原因**：`grep` 按字节模式匹配，如果文件的编码与 `grep` 期望的编码不一致（例如文件是 GBK 编码而 shell 是 UTF-8），中文字符会被拆解为错误的字节序列，自然无法匹配。

### Q2: 为什么 find 在某些目录下很慢？

```bash
# 慢的原因：find 会递归遍历每个子目录
# 如果目录包含 node_modules、.git 等大型目录，会很慢

# 解决方案 1：限制搜索深度
find . -maxdepth 3 -name "*.ts" 2>/dev/null | head -50 || true

# 解决方案 2：排除特定目录（注意当前代码没有实现这个功能）
# find . -name "*.ts" -not -path "./node_modules/*" 2>/dev/null | head -50 || true
```

**为什么当前代码没有 -maxdepth**？因为代码是 LLM 使用的，搜索范围通常较小。如果在大型项目中使用，建议添加 `-maxdepth` 参数或排除 `node_modules`、`.git` 等目录。

### Q3: grep 搜索返回 "(无匹配结果)"，但我确定关键词存在

检查以下几点：

1. **大小写问题**：`grep` 默认区分大小写，用 `-i` 参数可忽略大小写
   ```bash
   grep -rni "keyword" src/ 2>/dev/null || true
   ```
2. **路径问题**：确认搜索路径是否正确，LLM 可能在工作目录之外搜索
3. **权限问题**：检查是否因为权限不足无法读取某些文件（`2>/dev/null` 会静默忽略这些错误）
4. **文件类型**：有些文件（如二进制文件）`grep` 默认会跳过

### Q4: find 结果太多，超出了 `head -50` 的限制

`head -50` 是 my-easy-pi 内置的限制。如果你需要更多结果：

- **更精确的模式**：使用更具体的通配符缩小范围
  - `find . -name "*.ts"` → 改为 `find . -name "*Service.ts"`
- **分层查找**：先在较浅的目录中查找，确认后再深入
  - `find src -maxdepth 2 -name "*.ts"`（注意当前代码不支持 `-maxdepth`）

### Q5: grep 和 find 在 Windows 上能用吗？

**不能直接使用**，因为：
- `grep` 是 Unix 命令，Windows 没有内建
- `find` 在 Windows 上是完全不同的命令（搜索文件内容的命令）

解决方案：
- **使用 WSL（Windows Subsystem for Linux）** — 最推荐
- **使用 Git Bash 或 MSYS2** — 提供 Unix 工具集
- **使用纯 Node.js 实现** — 跨平台兼容，但需要修改代码

---

---

> ← [上一节](./03-file-tools.md) · [下一节](./practice.md) →
>
> [📚 返回章节首页](../04-tools-layer/README.md)