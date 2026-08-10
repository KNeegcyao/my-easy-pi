---
对应源码: src/extension/
最后更新: 2026-08-08
适用版本: piagent v1.0
---

# 本章练习

> 动手编写扩展，巩固对扩展层的理解

## 练习 1：编写一个 Hello 扩展

**目标**：创建一个最简单的扩展，验证扩展加载流程。

### 步骤

1. 创建全局扩展目录：

```bash
mkdir -p ~/.piagent/extensions
```

2. 创建扩展文件 `~/.piagent/extensions/hello-world.ts`：

```typescript
// ~/.piagent/extensions/hello-world.ts
import type { ExtensionAPI } from 'piagent'

export default async function (api: ExtensionAPI) {
  console.log('🌍 Hello World 扩展已加载！')

  // 注册一个 CLI 命令
  api.registerCommand('hello:greet', {
    description: '打印问候信息',
    execute(args: string[]) {
      const name = args[0] || 'World'
      console.log(`Hello, ${name}!`)
    },
  })
}
```

3. 模拟加载过程，验证扩展可以被加载器识别：

```bash
# 检查文件是否在正确的位置
ls -la ~/.piagent/extensions/hello-world.ts
```

### 验证标准

- [ ] 扩展文件位于 `~/.piagent/extensions/` 目录下
- [ ] 扩展使用 `export default` 导出一个函数
- [ ] 函数接收 `ExtensionAPI` 类型的参数
- [ ] 注册了 `hello:greet` 命令

---

## 练习 2：注册一个自定义工具并通过 LLM 调用

**目标**：创建一个 Weather 工具扩展，让 Agent 能够查询天气信息。

### 步骤

1. 创建扩展文件 `~/.piagent/extensions/weather.ts`：

```typescript
// ~/.piagent/extensions/weather.ts
import type { ExtensionAPI, AgentTool } from 'piagent'

/**
 * 模拟天气查询工具
 * 在实际项目中，这里可以调用真实的天气 API
 */
const weatherTool: AgentTool = {
  name: 'get_weather',
  description: '查询指定城市的当前天气情况',
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称，例如：北京、上海、深圳',
      },
    },
    required: ['city'],
  },

  async execute(toolCallId, params, signal, onUpdate) {
    const city = params.city as string

    // 模拟天气数据
    const weatherData: Record<string, { temp: number; condition: string }> = {
      '北京': { temp: 22, condition: '晴' },
      '上海': { temp: 26, condition: '多云' },
      '深圳': { temp: 30, condition: '阵雨' },
      '广州': { temp: 28, condition: '阴' },
    }

    const data = weatherData[city]

    if (!data) {
      return {
        content: [{ type: 'text', text: `抱歉，没有找到 ${city} 的天气数据` }],
        isError: true,
      }
    }

    return {
      content: [{
        type: 'text',
        text: `${city} 天气：${data.condition}，温度 ${data.temp}°C`,
      }],
    }
  },
}

export default async function (api: ExtensionAPI) {
  // 注册天气查询工具
  api.registerTool(weatherTool)
  console.log('[weather] 天气查询工具已注册')

  // 注册一个 CLI 命令，用于手动测试
  api.registerCommand('weather:check', {
    description: '手动查询天气，用法：weather:check <城市名>',
    execute(args: string[]) {
      const city = args[0]
      if (!city) {
        console.error('请指定城市名，例如：weather:check 北京')
        return
      }
      console.log(`正在查询 ${city} 的天气...`)
      // 这里只是演示，实际 CLI 命令也可以直接调用 execute 逻辑
    },
  })
}
```

2. 验证扩展的 TypeScript 类型：

```bash
# 检查类型是否正确
npx tsc --noEmit ~/.piagent/extensions/weather.ts
```

### 验证标准

- [ ] 工具 `get_weather` 的 `parameters` 符合 JSON Schema 格式
- [ ] 工具执行时能根据城市名返回对应的天气信息
- [ ] 城市不存在时返回 `isError: true`
- [ ] 扩展同时注册了 CLI 命令 `weather:check`

### 扩展要求

- 修改 `weatherData`，添加你所在城市的天气数据
- 为 `get_weather` 工具添加 `unit` 参数，支持摄氏度和华氏度切换

---

## 练习 3：监听 Agent 事件并打印日志

**目标**：创建一个日志扩展，监听 Agent 的生命周期事件并输出结构化的日志信息。

### 步骤

1. 创建扩展文件 `~/.piagent/extensions/event-logger.ts`：

```typescript
// ~/.piagent/extensions/event-logger.ts
import type { ExtensionAPI, AgentEvent } from 'piagent'

export default async function (api: ExtensionAPI) {
  console.log('[event-logger] 事件日志扩展已加载')

  // 订阅所有 Agent 事件
  api.on('*', async (event: AgentEvent, signal: AbortSignal) => {
    // 按事件类型分类处理
    switch (event.type) {
      case 'agent_start':
        console.log('═══════════════════════════════════════')
        console.log('[事件] Agent 开始运行')
        break

      case 'agent_end':
        console.log('[事件] Agent 运行结束')
        console.log(`[事件] 共产生 ${event.messages.length} 条消息`)
        console.log('═══════════════════════════════════════')
        break

      case 'turn_start':
        console.log('───────────────────────────────────────')
        console.log('[事件] 新一轮处理开始')
        break

      case 'turn_end':
        console.log('[事件] 本轮处理结束')
        console.log(`[事件] 产生了 ${event.toolResults.length} 个工具调用结果`)
        break

      case 'tool_execution_start':
        console.log(`[工具] 开始执行: ${event.toolName}`)
        console.log(`[工具] 参数: ${JSON.stringify(event.args)}`)
        break

      case 'tool_execution_end':
        console.log(`[工具] 执行完成: ${event.toolCallId}`)
        break

      case 'message_start':
        console.log(`[消息] 新消息 (${event.message.role})`)
        break

      case 'error':
        console.error(`[错误] ${event.message}`)
        break

      default:
        // 其他事件类型
        console.log(`[事件] ${(event as any).type}`)
    }
  })
}
```

2. 验证扩展能够正确订阅事件：

```bash
# 检查文件语法
npx tsc --noEmit ~/.piagent/extensions/event-logger.ts
```

### 验证标准

- [ ] 扩展通过 `api.on()` 订阅了 Agent 事件
- [ ] 事件处理函数使用 `switch` 语句按事件类型分类处理
- [ ] 对 `agent_start` 和 `agent_end` 事件输出格式化的日志
- [ ] 对 `tool_execution_start` 事件输出工具名和参数
- [ ] 对 `error` 事件使用 `console.error` 输出

### 扩展要求

- 为事件日志添加时间戳，格式为 `HH:mm:ss`
- 添加日志级别控制（`verbose`、`normal`、`quiet`），通过 CLI 命令切换
- 将日志输出到文件而不是控制台

---

## 综合挑战：创建一个完整的扩展

将练习 1-3 整合成一个完整的扩展，同时包含工具、命令和事件监听。

```typescript
// ~/.piagent/extensions/piagent-starter-kit.ts
import type { ExtensionAPI, AgentTool, AgentEvent } from 'piagent'

// ===== 工具定义 =====

const greetTool: AgentTool = {
  name: 'greet',
  description: '向用户打招呼，返回个性化的问候语',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '用户的名字' },
      language: {
        type: 'string',
        enum: ['zh', 'en'],
        description: '语言（zh=中文，en=英文）',
      },
    },
    required: ['name'],
  },
  async execute(toolCallId, params) {
    const name = params.name as string
    const lang = (params.language as string) || 'zh'
    const greeting = lang === 'zh' ? `你好，${name}！` : `Hello, ${name}!`
    return {
      content: [{ type: 'text', text: greeting }],
    }
  },
}

const timeTool: AgentTool = {
  name: 'get_current_time',
  description: '获取当前时间',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['full', 'date', 'time'],
        description: '时间格式',
      },
    },
  },
  async execute(toolCallId, params) {
    const now = new Date()
    const format = (params.format as string) || 'full'
    const map: Record<string, string> = {
      full: now.toISOString(),
      date: now.toLocaleDateString('zh-CN'),
      time: now.toLocaleTimeString('zh-CN'),
    }
    return {
      content: [{ type: 'text', text: map[format] || map.full }],
    }
  },
}

// ===== 扩展入口 =====

export default async function (api: ExtensionAPI) {
  console.log('[starter-kit] Starter Kit 扩展加载中...')

  // 注册工具
  api.registerTool(greetTool)
  api.registerTool(timeTool)
  console.log('[starter-kit] 已注册工具: greet, get_current_time')

  // 注册命令
  api.registerCommand('kit:status', {
    description: '查看 Starter Kit 状态',
    execute() {
      console.log('Starter Kit 扩展状态: 运行中')
      console.log('- 已注册工具: greet, get_current_time')
      console.log('- 事件监听: 已启用')
    },
  })

  api.registerCommand('kit:tools', {
    description: '列出 Starter Kit 注册的所有工具',
    execute() {
      console.log('Starter Kit 工具列表:')
      console.log('  - greet: 向用户打招呼')
      console.log('  - get_current_time: 获取当前时间')
    },
  })

  // 监听事件
  api.on('*', (event: AgentEvent) => {
    if (event.type === 'tool_execution_start') {
      const elapsed = Date.now()
      // 在 tool_execution_end 时计算耗时
      // 当前 API 不提供跨事件上下文，这是个演示
      console.log(`[kit] 工具 ${event.toolName} 开始执行`)
    }
  })

  console.log('[starter-kit] Starter Kit 扩展加载完成')
}
```

### 验证清单

| 功能 | 预期结果 | 完成状态 |
|------|----------|----------|
| `greet` 工具注册 | Agent 可以调用 `greet` 工具 | □ |
| `get_current_time` 工具注册 | Agent 可以查询当前时间 | □ |
| `kit:status` 命令 | CLI 执行后显示扩展状态 | □ |
| `kit:tools` 命令 | CLI 执行后列出所有工具 | □ |
| 事件监听 | 工具调用时控制台输出日志 | □ |

---

## 参考答案提示

练习中可能遇到的问题和解决方法：

1. **扩展加载失败但无错误信息**
   - 检查扩展文件是否以 `.ts` 或 `.js` 结尾
   - 检查 `export default` 是否导出了一个函数
   - 检查函数中是否有未捕获的异常

2. **工具注册后 LLM 不调用**
   - 检查工具的 `description` 是否清晰描述了工具的用途
   - 检查 `parameters` 是否符合 JSON Schema 规范
   - 检查 `name` 是否与已注册工具重名

3. **事件监听器不触发**
   - 确认事件类型字符串拼写正确（如 `tool_execution_start`）
   - 确认 `on()` 注册在扩展加载函数中
   - 确认 Agent 确实产生了对应类型的事件

> [📚 返回章节首页](../06-extension-layer/README.md)
>
> [下一章 →](../07-interface-layer/README.md)