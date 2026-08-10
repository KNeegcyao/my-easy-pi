---
对应源码: tests/unit/**, vitest.config.ts, .github/workflows/ci.yml, package.json
最后更新: 2026-08-08
适用版本: 0.1.0
---

# 测试

## 1. 本节目标

了解 piagent 的测试体系，掌握如何编写和运行测试，理解 CI 集成的流程。

## 2. 前置知识

- 了解基本的测试概念（单元测试、断言、Mock）
- 了解 `vitest` 测试框架的基本用法
- 了解 GitHub Actions 的基本概念

## 3. 核心概念

### 测试框架：Vitest

项目使用 **Vitest** 作为测试框架。Vitest 是一个基于 Vite 的现代测试框架，与 TypeScript 原生兼容，速度极快。

配置位于 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

### 测试文件结构

所有测试文件位于 `tests/unit/` 目录下，按照源码结构组织：

```
tests/unit/
├── agent/
│   ├── compactor.test.ts    # 对话压缩器测试
│   ├── permission.test.ts   # 权限管理器测试
│   └── queue.test.ts        # 消息队列测试
├── ai/
│   ├── registry.test.ts     # 模型注册表测试
│   └── retry.test.ts        # 重试机制测试
├── config/
│   └── settings.test.ts     # 配置管理器测试
├── extension/
│   └── loader.test.ts       # 扩展加载器测试
└── tools/
    └── registry.test.ts     # 工具注册表测试
```

共 **8 个测试文件**，**34 个测试用例**。

### 测试覆盖的核心模块

| 测试文件 | 测试用例数 | 覆盖的核心功能 |
|---------|-----------|---------------|
| `tools/registry.test.ts` | 7 | 工具注册、获取、注销、列表、内置工具属性验证 |
| `agent/compactor.test.ts` | 6 | 对话压缩阈值、保留最近消息、自定义配置 |
| `agent/queue.test.ts` | 6 | 消息队列优先级、清空、Steering/Follow-up 隔离 |
| `agent/permission.test.ts` | 4 | 安全命令放行、危险命令拦截、非 bash 工具放行、缓存重置 |
| `config/settings.test.ts` | 7 | 默认值、环境变量读取、API Key 获取、Provider/Model 检测 |
| `ai/registry.test.ts` | 2 | 空注册表、未知 Provider 返回 null |
| `ai/retry.test.ts` | 1 | 连接失败重试抛出 |
| `extension/loader.test.ts` | 3 | 工具注册/注销、命令列表 |

## 4. 代码实现

### 4.1 测试文件结构详解

每个测试文件遵循以下结构：

```typescript
import { describe, test, expect } from 'vitest'
import { ClassUnderTest } from '../../../src/path/to/module.js'

describe('ClassName', () => {
  test('测试场景描述', () => {
    // 1. 准备（Arrange）
    const instance = new ClassUnderTest()

    // 2. 执行（Act）
    const result = instance.someMethod()

    // 3. 断言（Assert）
    expect(result).toBe(expectedValue)
  })
})
```

### 4.2 关键测试模式

**模式 1：注册表测试**

以 `ToolRegistry` 测试为例（`tests/unit/tools/registry.test.ts`）：

```typescript
describe('ToolRegistry', () => {
  test('注册和获取工具', () => {
    const registry = new ToolRegistry()
    registry.registerTool(bashTool)
    // 验证：注册后可以获取到
    expect(registry.getTool('bash')).toBeDefined()
    expect(registry.getTool('bash')?.name).toBe('bash')
  })

  test('获取不存在的工具返回 undefined', () => {
    const registry = new ToolRegistry()
    // 验证：不存在的工具返回 undefined
    expect(registry.getTool('nonexistent')).toBeUndefined()
  })

  test('注销工具', () => {
    const registry = new ToolRegistry()
    registry.registerTool(bashTool)
    registry.unregisterTool('bash')
    // 验证：注销后获取不到
    expect(registry.getTool('bash')).toBeUndefined()
  })
})
```

**模式 2：工具属性验证**

```typescript
test('bash 工具定义了必要的属性', () => {
  // 验证工具必须的四个属性
  expect(bashTool.name).toBe('bash')
  expect(bashTool.description).toBeTruthy()
  expect(bashTool.parameters).toBeDefined()
  expect(bashTool.execute).toBeInstanceOf(Function)
})
```

**模式 3：工具执行测试**

```typescript
test('bash 工具执行失败时返回 ToolResult 而不是 throw', async () => {
  const result = await bashTool.execute(
    'test-call',
    { command: 'exit 1' },
    new AbortController().signal,
  )
  // 验证：即使命令失败，也返回 content 而不是抛出异常
  expect(result.content).toBeDefined()
  expect(result.content.length).toBeGreaterThan(0)
})
```

**模式 4：权限测试**

```typescript
test('危险命令在非交互环境被拒绝', async () => {
  const pm = new PermissionManager()
  const result = await pm.check(createContext('bash', 'rm -rf /'))
  // 验证：危险命令被拦截
  expect(result).toBeDefined()
  expect(result?.block).toBe(true)
  expect(result?.reason).toContain('已自动拒绝')
})
```

**模式 5：队列优先级测试**

```typescript
test('steer 添加的消息优先于 followUp', () => {
  const queue = new MessageQueue()
  queue.followUp('普通任务')
  queue.steer('紧急插入')

  // 验证：紧急插入优先于普通任务
  const first = queue.next()
  expect(first?.content).toBe('紧急插入')

  const second = queue.next()
  expect(second?.content).toBe('普通任务')
})
```

### 4.3 如何写一个新的测试

假设我们要为 `curlTool`（上一节创建的工具）编写测试：

```typescript
// tests/unit/tools/curl.test.ts
import { describe, test, expect } from 'vitest'
import { curlTool } from '../../../src/tools/builtin/curl.js'

describe('curlTool', () => {
  // 1. 验证工具属性
  test('工具定义正确', () => {
    expect(curlTool.name).toBe('curl')
    expect(curlTool.description).toBeTruthy()
    expect(curlTool.parameters).toBeDefined()
    expect(curlTool.execute).toBeInstanceOf(Function)
  })

  // 2. 验证参数 Schema
  test('参数 Schema 包含 url 必填字段', () => {
    const schema = curlTool.parameters as any
    expect(schema.properties?.url).toBeDefined()
    expect(schema.required).toContain('url')
  })

  // 3. 验证错误处理
  test('请求失败时返回 ToolResult 而不是 throw', async () => {
    const result = await curlTool.execute(
      'test-call',
      { url: 'http://localhost:1', timeout: 100 },
      new AbortController().signal,
    )
    // 应返回错误信息，而不是抛出异常
    expect(result.content).toBeDefined()
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('请求失败')
  })
})
```

### 4.4 运行测试

```bash
# 运行所有测试（推荐）
npm test

# 运行测试并监听文件变化
npm run test:watch

# 指定测试文件
npx vitest run tests/unit/tools/registry.test.ts

# 指定测试名称模式
npx vitest run -t "ToolRegistry"
```

### 4.5 CI 集成

项目使用 GitHub Actions 进行持续集成，配置位于 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [22]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Run tests
        run: npm test

      - name: Security audit
        run: npm run audit:prod
```

CI 流程包含四个步骤：

1. **Install dependencies**：使用 `npm ci` 安装依赖（比 `npm install` 更快、更可靠）
2. **Type check**：使用 `tsc --noEmit` 做类型检查，确保没有类型错误
3. **Run tests**：运行所有测试用例
4. **Security audit**：运行 `npm audit` 检查依赖安全漏洞

## 5. 运行与验证

```bash
# 运行测试看看效果
npm test
```

输出示例：

```
✓ tests/unit/tools/registry.test.ts (7 tests)
✓ tests/unit/agent/compactor.test.ts (6 tests)
✓ tests/unit/agent/queue.test.ts (6 tests)
✓ tests/unit/agent/permission.test.ts (4 tests)
✓ tests/unit/config/settings.test.ts (7 tests)
✓ tests/unit/ai/registry.test.ts (2 tests)
✓ tests/unit/ai/retry.test.ts (1 test)
✓ tests/unit/extension/loader.test.ts (3 tests)

Tests: 34 passed
Time: 2.34s
```

## 6. 小结

piagent 的测试体系具有以下特点：

- **框架**：使用 Vitest，与 TypeScript 原生兼容
- **结构**：测试文件与源码目录结构对应，位于 `tests/unit/`
- **覆盖**：8 个测试文件，34 个测试用例，覆盖核心模块
- **模式**：注册表测试、属性验证、执行测试、权限测试、队列测试
- **CI**：GitHub Actions 自动运行测试、类型检查、安全审计

### 思考题

1. 为什么要为工具编写测试？测试应该覆盖哪些方面？
2. 查看 `tests/unit/ai/registry.test.ts`，它只有 2 个测试用例。你觉得应该补充哪些测试？
3. 如果要为 `GeminiProvider` 编写测试，如何在不实际调用 API 的情况下测试？
4. 查看 `.github/workflows/ci.yml`，如果想让 CI 在 Node.js 20 和 22 上都运行，应该怎么修改？

> ← [上一节](./03-creating-extension.md) · [下一节](./practice.md) →
>
> [📚 返回章节首页](../10-advanced-topics/README.md)