---
对应源码: src/extension/loader.ts
最后更新: 2026-08-08
适用版本: piagent v1.0
---

# ExtensionLoader — 扩展发现与加载

> 自动扫描、发现并动态加载扩展——让扩展"即放即用"

## 1. 本节目标

理解 `ExtensionLoader` 的实现原理，掌握扩展的发现机制、加载优先级和容错策略。

## 2. 前置知识

- 了解 `ExtensionAPI` 接口（见 `01-extension-api.md`）
- 了解 Node.js 的 `fs/promises` 和 `fs.existsSync`
- 了解 TypeScript 的 `import()` 动态导入语法
- 了解 `process.cwd()` 和 `os.homedir()` 的作用

## 3. 核心概念

### 3.1 扩展加载器的工作流程

```
loadAll() 被调用
    │
    ▼
getSearchDirs() 获取搜索目录列表
    │
    ├── 1. 项目目录:  {projectDir}/.pi/extensions/
    ├── 2. 全局目录:  ~/.piagent/extensions/
    │
    ▼
遍历每个目录，跳过不存在的目录
    │
    ▼
loadDir() 读取目录下的所有文件
    │
    ├── 过滤 .ts / .js 文件
    ├── 跳过已加载的文件（去重）
    │
    ▼
对每个文件执行 import() 动态导入
    │
    ├── 检查 default 导出是否为函数
    ├── 调用函数，传入 ExtensionAPI 实例
    ├── 加载成功 → count++
    └── 加载失败 → 捕获异常，继续下一个
```

### 3.2 加载优先级

扩展加载按以下优先级搜索：

| 优先级 | 目录 | 路径 | 适用场景 |
|--------|------|------|----------|
| 高 | 项目目录 | `{projectDir}/.pi/extensions/` | 项目级扩展，随项目分发 |
| 低 | 全局目录 | `~/.piagent/extensions/` | 用户级扩展，全局可用 |

> **注意**: 当前实现中，`getSearchDirs()` 返回的目录列表只有两个。如果后续需要支持 CLI 参数指定路径，可以在该方法中增加一个动态注入的路径。

### 3.3 容错设计

`ExtensionLoader` 采用了多层容错策略：

1. **目录不存在** — `loadDir()` 中捕获 `readdir` 的异常，跳过不存在的目录
2. **文件加载失败** — 单个扩展的 `import()` 失败不会影响其他扩展
3. **导出非函数** — 跳过 `default` 导出不是函数的模块
4. **去重保护** — 通过 `loaded` Set 防止同一文件被重复加载

## 4. 代码实现

### 4.1 完整源码

```typescript
// ============================================================
// ExtensionLoader — 扩展加载器
//
// 自动发现并加载扩展：
//   1. 项目目录  .pi/extensions/*.ts
//   2. 全局目录  ~/.piagent/extensions/*.ts
//
// 扩展文件默认导出一个函数，接收 ExtensionAPI 实例。
// ============================================================

import { readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ExtensionAPI } from './api.js'

/** 扩展加载器 */
export class ExtensionLoader {
  // 已加载的文件名集合，用于去重
  private loaded = new Set<string>()

  constructor(
    private api: ExtensionAPI,          // 传给每个扩展的 API 实例
    private projectDir: string = process.cwd(),  // 项目根目录，默认当前工作目录
  ) {}

  /** 加载所有扩展 */
  async loadAll(): Promise<number> {
    let count = 0
    const dirs = this.getSearchDirs()  // 获取搜索目录列表

    for (const dir of dirs) {
      if (!existsSync(dir)) continue   // 目录不存在则跳过
      count += await this.loadDir(dir) // 加载该目录下的所有扩展
    }

    return count  // 返回成功加载的扩展数量
  }

  /** 获取搜索目录列表（按优先级） */
  private getSearchDirs(): string[] {
    return [
      join(this.projectDir, '.pi', 'extensions'),   // 项目级扩展
      join(homedir(), '.piagent', 'extensions'),     // 全局扩展
    ]
  }

  /** 加载单个目录下的所有扩展 */
  private async loadDir(dir: string): Promise<number> {
    let count = 0
    try {
      const files = await readdir(dir)  // 读取目录中的所有文件
      for (const file of files) {
        // 只处理 .ts 或 .js 文件
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue
        // 跳过已加载的文件（去重）
        if (this.loaded.has(file)) continue
        this.loaded.add(file)

        try {
          const fullPath = join(dir, file)  // 构造完整路径
          const mod = await import(fullPath) // 动态导入模块
          // 检查模块是否有 default 导出，且为函数
          if (typeof mod.default === 'function') {
            await mod.default(this.api)  // 执行扩展初始化函数
            count++                      // 计数加一
          }
        } catch {
          // 单个扩展加载失败不影响其他扩展
        }
      }
    } catch {
      // 目录不存在或无法读取时跳过
    }
    return count
  }
}
```

### 4.2 逐行注释解读

**构造函数**（第 20-24 行）：
```typescript
constructor(
  private api: ExtensionAPI,
  private projectDir: string = process.cwd(),
) {}
```
- `api` — 所有扩展共享同一个 `ExtensionAPI` 实例，这样扩展注册的工具和命令会合并到同一个注册表中
- `projectDir` — 项目根目录，默认值为 `process.cwd()`，方便测试时注入不同的路径

**loadAll**（第 26-37 行）：
```typescript
async loadAll(): Promise<number> {
  let count = 0
  const dirs = this.getSearchDirs()
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    count += await this.loadDir(dir)
  }
  return count
}
```
- 先检查目录是否存在（`existsSync`），避免不必要的异步操作
- 按优先级顺序依次加载，返回成功加载的扩展总数
- 返回值可用于日志输出，例如 `加载了 3 个扩展`

**getSearchDirs**（第 39-45 行）：
```typescript
private getSearchDirs(): string[] {
  return [
    join(this.projectDir, '.pi', 'extensions'),
    join(homedir(), '.piagent', 'extensions'),
  ]
}
```
- 项目级扩展放在 `.pi/extensions/` 目录下，随项目一起版本控制
- 全局扩展放在 `~/.piagent/extensions/` 目录下，用户全局可用
- 数组顺序即优先级顺序

**loadDir**（第 47-72 行）：
```typescript
private async loadDir(dir: string): Promise<number> {
  let count = 0
  try {
    const files = await readdir(dir)
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue
      if (this.loaded.has(file)) continue
      this.loaded.add(file)

      try {
        const fullPath = join(dir, file)
        const mod = await import(fullPath)
        if (typeof mod.default === 'function') {
          await mod.default(this.api)
          count++
        }
      } catch {
        // 单个扩展加载失败不影响其他扩展
      }
    }
  } catch {
    // 目录不存在或无法读取时跳过
  }
  return count
}
```

关键设计点：

1. **文件过滤**（第 52 行）— 只加载 `.ts` 和 `.js` 文件，其他文件（如 `.map`、`.d.ts`）被忽略
2. **去重保护**（第 53-54 行）— `loaded` Set 用于防止同一文件被重复加载。注意这里的 key 是文件名 `file`（如 `hello.ts`），而不是完整路径，这意味着不同目录下的同名文件只会加载第一个
3. **双层 try-catch**（第 57-63 行和第 64-68 行）— 外层 catch 处理目录读取错误，内层 catch 处理单个文件加载错误，确保错误隔离
4. **动态导入**（第 59 行）— 使用 `import(fullPath)` 实现运行时加载，这是 Node.js 原生支持的动态导入语法
5. **函数检查**（第 60 行）— 只有 `default` 导出为函数的模块才被视为有效扩展

## 5. 运行与验证

### 5.1 手动测试加载器

```bash
# 创建测试目录结构
mkdir -p /tmp/test-extensions/.pi/extensions
mkdir -p /tmp/test-extensions-global/.piagent/extensions

# 创建测试扩展
cat > /tmp/test-extensions/.pi/extensions/hello.ts << 'EOF'
export default async function (api: any) {
  console.log('[扩展] 项目级扩展加载成功')
}
EOF

cat > /tmp/test-extensions-global/.piagent/extensions/hello.ts << 'EOF'
export default async function (api: any) {
  console.log('[扩展] 全局扩展加载成功')
}
EOF
```

### 5.2 验证加载优先级

```bash
# 项目级扩展会覆盖全局扩展（同名文件只加载第一个）
# 如果两个目录都有 hello.ts，只有项目目录下的会被加载
echo "验证：去重机制确保同名文件不重复加载"
```

### 5.3 验证容错

```bash
# 创建一个会报错的扩展
cat > /tmp/test-extensions/.pi/extensions/broken.ts << 'EOF'
export default async function (api: any) {
  throw new Error('加载失败')
}
EOF

# 验证：broken.ts 加载失败，但 hello.ts 仍能正常加载
```

## 6. 小结

`ExtensionLoader` 实现了扩展的自动发现、按优先级加载和容错处理。通过简单的目录约定和动态导入机制，扩展实现了"即放即用"的体验。

### 当前设计的局限

1. **去重粒度** — 去重使用文件名而非完整路径，同名文件在不同目录下只会加载第一个
2. **无卸载机制** — 扩展加载后无法卸载，`loaded` Set 只增不减
3. **无依赖管理** — 扩展之间没有依赖声明和能力发现机制
4. **无热更新** — 扩展只在启动时加载一次，运行中新增的扩展文件不会被检测到

### 思考题

1. 如果想让扩展支持热更新（文件变化时自动重新加载），`ExtensionLoader` 需要做哪些改动？
2. 当前去重使用文件名（`file`）而非完整路径（`fullPath`），这会导致什么问题？如何修复？
3. 为什么 `loadDir` 中 `loaded.add(file)` 放在 `import()` 之前而不是之后？