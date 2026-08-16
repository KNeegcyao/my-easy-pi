---
对应源码: 全项目
最后更新: 2026-08-08
适用版本: 0.1.0
---

# 本章练习

## 练习说明

本章提供了四个练习，难度递增。建议按顺序完成，每个练习都基于前一个练习的知识。

## 练习 1：实现一个 weather 工具

### 目标

创建一个天气查询工具，让 LLM 可以查询指定城市的天气。

### 需求

1. 在 `src/tools/builtin/` 下创建 `weather.ts`
2. 工具名称：`weather`
3. 参数：`city`（必填，字符串）、`days`（可选，数字，默认 1）
4. 由于没有真实的天气 API，使用模拟数据返回
5. 在 `src/tools/index.ts` 和 `src/cli.ts` 中注册

### 提示

```typescript
// 模拟天气数据
const mockWeather: Record<string, { temp: number; condition: string }> = {
  '北京': { temp: 25, condition: '晴' },
  '上海': { temp: 28, condition: '多云' },
  '深圳': { temp: 30, condition: '阵雨' },
  '东京': { temp: 22, condition: '阴' },
  '纽约': { temp: 18, condition: '小雨' },
  '伦敦': { temp: 15, condition: '雾' },
}

// 如果城市不在列表中，返回 "暂不支持该城市"
```

### 验收标准

- [ ] 编译通过，无类型错误
- [ ] 工具注册后，LLM 可以看到并使用
- [ ] 已知城市返回正确的模拟数据
- [ ] 未知城市返回友好的提示信息
- [ ] 工具执行失败时返回 `ToolResult` 而不是抛出异常

## 练习 2：接入一个免费的 LLM API

### 目标

为 my-easy-pi 接入一个免费的 LLM API。推荐使用以下之一：

- **Ollama**（本地运行）：`http://localhost:11434/v1/chat/completions`（兼容 OpenAI 格式）
- **DeepSeek 开放平台**：提供免费额度，API 兼容 OpenAI 格式
- **Groq**：提供免费额度，API 兼容 OpenAI 格式

### 需求

1. 创建 Provider 文件（如果 API 兼容 OpenAI 格式，可以直接复用 `OpenAIProvider`）
2. 在 `ModelRegistry` 中注册
3. 配置 API Key
4. 通过 CLI 切换测试

### 提示

如果 API 兼容 OpenAI 格式，最简单的接入方式是：

```typescript
// 在 cli.ts 中直接复用 OpenAIProvider，改 baseUrl 即可
registry.setProvider('ollama', OpenAIProvider)
// 使用时通过环境变量或配置设置 baseUrl
// export OLLAMA_BASE_URL=http://localhost:11434/v1
// pi --provider ollama --model llama3.2
```

但更好的做法是创建一个独立的 Provider：

```typescript
// src/ai/providers/ollama.ts
// 复用 OpenAIProvider 的大部分逻辑，但修改 baseUrl 和模型列表
export const OllamaProvider: ProviderFactory = {
  create(config) {
    const baseUrl = config.baseUrl || 'http://localhost:11434'
    // ... 复用 OpenAI 的 Model 实现，修改 baseUrl 和模型列表
  },
}
```

### 验收标准

- [ ] 编译通过，无类型错误
- [ ] 可以通过 `--provider` 参数切换到新 Provider
- [ ] 可以正常发送消息并获取回复
- [ ] 错误处理正常（API 不可用时显示友好错误）

## 练习 3：写一个扩展并测试

### 目标

创建一个"时间工具"扩展，提供当前时间查询功能。

### 需求

1. 在 `.pi/extensions/` 下创建 `datetime.ts`
2. 注册一个 `datetime` 工具，返回当前日期和时间
3. 注册一个 `/datetime` 命令，在 CLI 中直接使用
4. 监听 `agent_start` 事件，打印当前时间

### 提示

```typescript
import { Type } from '@sinclair/typebox'
import type { ExtensionAPI } from 'piagent'

export default function (api: ExtensionAPI) {
  api.registerTool({
    name: 'datetime',
    label: '日期时间',
    description: '获取当前日期和时间，支持时区查询',
    parameters: Type.Object({
      timezone: Type.Optional(Type.String({
        description: '时区，如 Asia/Shanghai、America/New_York（默认本地时区）',
      })),
    }),

    async execute(toolCallId, params) {
      const timezone = (params.timezone as string) || 'Asia/Shanghai'

      try {
        const now = new Date()
        const options: Intl.DateTimeFormatOptions = {
          timeZone: timezone,
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }

        const formatted = new Intl.DateTimeFormat('zh-CN', options).format(now)
        const timestamp = now.getTime()

        return {
          content: [{
            type: 'text',
            text: `当前时间（${timezone}）：${formatted}\n时间戳：${timestamp}`,
          }],
          details: { timezone, timestamp, formatted },
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `时区无效：${timezone}。请使用 IANA 时区格式，如 Asia/Shanghai`,
          }],
        }
      }
    },
  })

  api.registerCommand('datetime', {
    description: '显示当前时间 — 用法: /datetime [时区]',
    execute(args) {
      const timezone = args[0] || 'Asia/Shanghai'
      const now = new Date()
      const formatted = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        year: 'numeric', month: 'long', day: 'numeric',
        weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(now)
      console.log(`当前时间（${timezone}）：${formatted}`)
    },
  })

  api.on('agent_start', async () => {
    const now = new Date()
    console.log(`🕐 时间扩展已加载，当前时间：${now.toLocaleString('zh-CN')}`)
  })
}
```

### 验收标准

- [ ] 扩展文件创建在正确的目录
- [ ] 启动 my-easy-pi 时能看到扩展加载成功信息
- [ ] LLM 可以调用 datetime 工具
- [ ] `/datetime` 命令在 CLI 中可用
- [ ] 无效时区返回友好错误提示

## 练习 4：为你的工具写单元测试

### 目标

为练习 1 中创建的 weather 工具编写完整的单元测试。

### 需求

1. 在 `tests/unit/tools/` 下创建 `weather.test.ts`
2. 测试覆盖以下方面：
   - 工具属性验证（name、description、parameters、execute）
   - 参数 Schema 验证（city 必填）
   - 已知城市返回正确数据
   - 未知城市返回友好提示
   - 执行失败时返回 ToolResult 而不是 throw

### 参考代码

```typescript
// tests/unit/tools/weather.test.ts
import { describe, test, expect } from 'vitest'
import { weatherTool } from '../../../src/tools/builtin/weather.js'

describe('weatherTool', () => {
  // 测试工具定义
  test('工具定义正确', () => {
    expect(weatherTool.name).toBe('weather')
    expect(weatherTool.description).toBeTruthy()
    expect(weatherTool.parameters).toBeDefined()
    expect(weatherTool.execute).toBeInstanceOf(Function)
  })

  // 测试参数 Schema
  test('city 是必填参数', () => {
    const schema = weatherTool.parameters as any
    expect(schema.properties?.city).toBeDefined()
    expect(schema.required).toContain('city')
  })

  // 测试已知城市
  test('已知城市返回正确的天气数据', async () => {
    const result = await weatherTool.execute(
      'test-call',
      { city: '北京' },
      new AbortController().signal,
    )
    const text = result.content[0].text
    expect(text).toContain('北京')
    expect(text).toContain('25°C')
    expect(text).toContain('晴')
  })

  // 测试未知城市
  test('未知城市返回友好提示', async () => {
    const result = await weatherTool.execute(
      'test-call',
      { city: '不存在的城市' },
      new AbortController().signal,
    )
    const text = result.content[0].text
    expect(text).toContain('暂不支持')
  })

  // 测试错误处理
  test('参数缺失时返回 ToolResult 而不是 throw', async () => {
    const result = await weatherTool.execute(
      'test-call',
      {},
      new AbortController().signal,
    )
    // 应返回 content 而不是抛出异常
    expect(result.content).toBeDefined()
    expect(result.content.length).toBeGreaterThan(0)
  })
})
```

### 验收标准

- [ ] 所有测试用例通过（`npm test`）
- [ ] 测试覆盖了正常路径和异常路径
- [ ] 使用了正确的测试模式（describe/test/expect）
- [ ] 测试文件放在正确的目录位置

## 参考答案

完成练习后，可以对照以下要点自检：

### 练习 1 要点

- weather 工具应该放在 `src/tools/builtin/weather.ts`
- 需要在 `src/tools/index.ts` 和 `src/cli.ts` 中注册
- 模拟数据应该覆盖常用城市，并对未知城市返回友好提示

### 练习 2 要点

- Ollama Provider 可以复用 OpenAI 的 Model 实现
- 主要区别在于：baseUrl 不同、模型列表不同、不需要 API Key
- 如果 API 兼容 OpenAI 格式，甚至可以直接用 `OpenAIProvider` 加 `baseUrl` 参数

### 练习 3 要点

- 扩展文件放在 `.pi/extensions/datetime.ts`
- 使用 `Intl.DateTimeFormat` 处理时区
- 工具和命令共享相同的逻辑

### 练习 4 要点

- 测试文件放在 `tests/unit/tools/weather.test.ts`
- 使用 `vitest` 的 `describe`/`test`/`expect` API
- 测试应该覆盖正常路径和异常路径

> [📚 返回章节首页](../10-advanced-topics/README.md)