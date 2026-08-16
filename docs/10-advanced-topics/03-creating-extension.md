---
对应源码: src/extension/*.ts, src/agent/loop.ts
最后更新: 2026-08-08
适用版本: 0.1.0
---

# 实践：创建并发布扩展

## 1. 本节目标

本教程将手把手教你为 my-easy-pi 创建一个扩展。扩展是 my-easy-pi 的插件化机制，允许在不修改核心代码的情况下添加新功能。我们将创建一个**翻译扩展**，它注册一个翻译工具和一个 `/translate` 命令。

## 2. 前置知识

- 了解如何添加自定义工具（建议先阅读 [01-adding-new-tool.md](./01-adding-new-tool.md)）
- 了解 `ExtensionAPI` 提供的接口
- 了解 `ExtensionLoader` 的加载机制

## 3. 核心概念

### 扩展系统架构

```
┌─────────────────────────────────────┐
│  扩展文件 (.pi/extensions/*.ts)      │
│  ── 默认导出函数，接收 ExtensionAPI  │
├─────────────────────────────────────┤
│  ExtensionAPI                       │
│  ── registerTool()  注册工具         │
│  ── unregisterTool() 注销工具        │
│  ── registerCommand() 注册命令       │
│  ── on() 监听 Agent 事件             │
├─────────────────────────────────────┤
│  ExtensionLoader                    │
│  ── 自动发现并加载扩展文件            │
│  ── 搜索路径：                      │
│    1. .pi/extensions/*.ts（项目级）   │
│    2. ~/.my-easy-pi/extensions/*.ts（全局）│
└─────────────────────────────────────┘
```

### 扩展能做什么

通过 `ExtensionAPI`，扩展可以：

1. **注册工具**：调用 `api.registerTool(myTool)` 添加自定义工具
2. **注册命令**：调用 `api.registerCommand('hello', { description, execute })` 添加 CLI 命令
3. **监听事件**：调用 `api.on('agent_start', handler)` 监听 Agent 生命周期事件
4. **注销资源**：调用 `api.unregisterTool(name)` 清理已注册的资源

### 扩展的生命周期

```
Agent 启动
    ↓
ExtensionLoader.loadAll()    ← 自动发现并加载扩展文件
    ↓
扩展的默认导出函数被调用     ← 接收 ExtensionAPI 实例
    ↓
函数内部注册工具/命令/事件监听器
    ↓
Agent 正常运行，扩展的功能可用
    ↓
Agent 退出，扩展自动清理
```

## 4. 代码实现

### 4.1 创建扩展文件

在项目目录下创建 `.pi/extensions/translate.ts`：

```typescript
// ============================================================
// 翻译扩展 — translate
//
// 功能：
//   1. 注册一个 translate 工具，让 LLM 可以调用翻译功能
//   2. 注册一个 /translate 命令，让用户可以直接在 CLI 使用
//   3. 监听 agent_start 事件，打印欢迎信息
//
// 使用说明：
//   将本文件放在 .pi/extensions/ 目录下，
//   重启 my-easy-pi 即可自动加载。
// ============================================================

import { Type } from '@sinclair/typebox'
import type { ExtensionAPI } from 'my-easy-pi'  // 实际使用时为相对路径

// 扩展的默认导出函数
// 在扩展被加载时，my-easy-pi 会调用这个函数，并传入 ExtensionAPI 实例
export default function (api: ExtensionAPI) {
  // ════════════════════════════════════════════════════════════
  // 1. 注册工具
  // ════════════════════════════════════════════════════════════

  api.registerTool({
    // 工具元信息
    name: 'translate',
    label: '翻译',
    description: '将文本翻译成指定语言，支持中、英、日、韩、法、德等多语言',

    // 参数 Schema
    parameters: Type.Object({
      text: Type.String({ description: '要翻译的文本' }),
      targetLang: Type.String({ description: '目标语言代码，如 zh、en、ja、ko、fr、de' }),
      sourceLang: Type.Optional(Type.String({ description: '源语言代码（可选，自动检测）' })),
    }),

    // 执行方法
    async execute(toolCallId, params) {
      const text = params.text as string
      const targetLang = params.targetLang as string
      const sourceLang = params.sourceLang as string | undefined

      // 这里使用一个简单的模拟翻译
      // 在实际项目中，可以调用翻译 API（如 Google Translate、DeepL 等）
      const translated = `[${sourceLang || 'auto'} → ${targetLang}] ${text}`

      return {
        content: [{
          type: 'text',
          text: `翻译结果：${translated}`,
        }],
        details: { text, targetLang, sourceLang },
      }
    },
  })

  console.log('  ✅ 扩展已加载: translate 工具')

  // ════════════════════════════════════════════════════════════
  // 2. 注册命令
  // ════════════════════════════════════════════════════════════

  api.registerCommand('translate', {
    description: '翻译文本 — 用法: /translate <目标语言> <文本>',
    execute(args) {
      if (args.length < 2) {
        console.log('用法: /translate <目标语言> <文本>')
        console.log('示例: /translate en 你好世界')
        return
      }

      const targetLang = args[0]
      const text = args.slice(1).join(' ')
      const translated = `[auto → ${targetLang}] ${text}`

      console.log(`翻译结果：${translated}`)
    },
  })

  console.log('  ✅ 扩展已加载: /translate 命令')

  // ════════════════════════════════════════════════════════════
  // 3. 监听事件
  // ════════════════════════════════════════════════════════════

  api.on('agent_start', async () => {
    console.log('🌐 翻译扩展已就绪，随时可以翻译！')
  })

  console.log('  ✅ 扩展已加载: 事件监听器')
}
```

### 4.2 扩展代码逐行解读

**默认导出函数**：
```typescript
export default function (api: ExtensionAPI) {
```
- 扩展文件必须使用 `export default` 导出一个函数
- 这个函数接收一个 `ExtensionAPI` 实例作为参数
- 函数在扩展加载时被调用，可以是同步或异步

**注册工具**：
```typescript
api.registerTool({
  name: 'translate',
  description: '将文本翻译成指定语言...',
  parameters: Type.Object({ ... }),
  async execute(toolCallId, params) { ... },
})
```
- 与内置工具相同的 `AgentTool` 接口
- 注册后，LLM 可以像使用内置工具一样调用它

**注册命令**：
```typescript
api.registerCommand('translate', {
  description: '翻译文本...',
  execute(args) { ... },
})
```
- 注册 CLI 命令，用户可以通过 `/translate` 调用
- `args` 是命令后面的参数数组

**监听事件**：
```typescript
api.on('agent_start', async (event, signal) => { ... })
```
- 支持监听所有 Agent 事件类型
- 事件类型包括：`agent_start`、`agent_end`、`turn_start`、`turn_end` 等

### 4.3 扩展的加载方式

ExtensionLoader 的加载逻辑（`src/extension/loader.ts`）：

```typescript
// 搜索目录（按优先级）
private getSearchDirs(): string[] {
  return [
    join(this.projectDir, '.pi', 'extensions'),     // 项目级扩展
    join(homedir(), '.my-easy-pi', 'extensions'),       // 全局扩展
  ]
}

// 加载单个目录下的所有扩展
private async loadDir(dir: string): Promise<number> {
  const files = await readdir(dir)
  for (const file of files) {
    if (!file.endsWith('.ts') && !file.endsWith('.js')) continue
    const mod = await import(fullPath)
    if (typeof mod.default === 'function') {
      await mod.default(this.api)
      count++
    }
  }
  return count
}
```

关键点：
- 扩展文件可以是 `.ts` 或 `.js`
- 优先加载项目级扩展（`.pi/extensions/`），再加载全局扩展（`~/.my-easy-pi/extensions/`）
- 默认导出必须是函数
- 单个扩展加载失败不影响其他扩展

### 4.4 如何组织扩展代码

对于简单的扩展，一个文件就够了。但对于复杂的扩展，建议按以下结构组织：

```
.pi/extensions/
  my-extension/
    index.ts          # 入口，导出默认函数
    tools/
      weather.ts      # 自定义工具
      news.ts
    commands/
      admin.ts        # 自定义命令
    utils/
      api.ts          # 工具函数
```

入口文件 `index.ts` 示例：

```typescript
import { Type } from '@sinclair/typebox'
import type { ExtensionAPI } from 'my-easy-pi'

export default async function (api: ExtensionAPI) {
  // 注册多个工具
  const { weatherTool } = await import('./tools/weather.js')
  const { newsTool } = await import('./tools/news.js')
  api.registerTool(weatherTool)
  api.registerTool(newsTool)

  // 注册多个命令
  const { adminCommands } = await import('./commands/admin.js')
  for (const [name, cmd] of Object.entries(adminCommands)) {
    api.registerCommand(name, cmd)
  }

  console.log('  ✅ 我的扩展已加载（工具: 2, 命令: 若干）')
}
```

## 5. 运行与验证

### 5.1 创建扩展目录

```bash
# 创建项目级扩展目录
mkdir -p .pi/extensions

# 将扩展文件放入
# 将上面创建的 translate.ts 放入 .pi/extensions/
```

### 5.2 启动测试

```bash
# 编译项目
npm run build

# 启动 my-easy-pi
npm start
```

如果扩展加载成功，应该能看到类似输出：

```
  ✅ 扩展已加载: translate 工具
  ✅ 扩展已加载: /translate 命令
  ✅ 扩展已加载: 事件监听器
```

### 5.3 验证工具和命令

在交互中，LLM 可以根据需要自动调用 translate 工具。你也可以在代码中直接测试：

```bash
node -e "
import('./dist/extension/api.js').then(({ ExtensionAPI }) => {
  const api = new ExtensionAPI(null, null);
  api.registerCommand('test', {
    description: 'test',
    execute(args) { console.log('Command executed:', args); }
  });
  console.log('Commands:', api.listCommands());
});
"
```

## 6. 小结

通过本教程，你已经学会了如何创建、加载和测试 my-easy-pi 扩展。整个过程可以概括为：

1. **创建扩展文件**：在 `.pi/extensions/` 下创建 `.ts` 文件，默认导出接收 `ExtensionAPI` 的函数
2. **注册功能**：在函数内调用 `api.registerTool()`、`api.registerCommand()`、`api.on()` 注册功能
3. **加载测试**：启动 my-easy-pi，扩展自动加载
4. **组织代码**：复杂扩展可以拆分为多个文件，使用目录结构管理

### 扩展 vs 直接修改源码

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| 添加一个通用工具 | 扩展 | 便于分享和复用 |
| 修改核心行为 | 直接修改源码 | 扩展 API 有限 |
| 团队内部工具 | 扩展 | 不污染核心代码 |
| 接入新 Provider | 直接修改源码 | 扩展 API 不支持注册 Provider |

### 思考题

1. 扩展的加载顺序重要吗？如果两个扩展注册了同名的工具，会发生什么？
2. 如何让扩展支持配置参数？（提示：可以在扩展函数中读取配置文件）
3. 如果要创建一个"命令审核"扩展（记录所有执行的命令），应该监听哪个事件？
4. 扩展中注册的工具和内置工具有什么区别？LLM 能区分它们吗？

> ← [上一节](./02-adding-new-provider.md) · [下一节](./04-testing.md) →
>
> [📚 返回章节首页](../10-advanced-topics/README.md)