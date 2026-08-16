---
对应源码: 'src/ai/errors.ts'
最后更新: 2026-08-08
适用版本: my-easy-pi v0.1+
---

# 统一错误码

## 1. 本节目标

理解 my-easy-pi 的统一错误码体系设计，以及如何通过类型守卫和友好提示改善开发者体验。

## 2. 前置知识

- 了解 TypeScript 的 `type guard` 用法
- 了解错误处理的基本模式

## 3. 核心概念

### 3.1 为什么需要统一错误码？

在大型项目中，错误处理很容易变得混乱：
- 有的地方 `throw new Error('xxx')`，有的地方返回 `{ error: 'xxx' }`
- 错误信息不统一，有的中文有的英文
- 遇到错误不知道如何修复

统一错误码体系通过以下方式解决这些问题：

1. **机器可读** — `code` 字段可以用于程序化的错误处理（如重试、日志分类）
2. **人类可读** — `message` 字段是友好的中文描述
3. **可操作** — `suggestion` 字段提供修复建议
4. **可扩展** — `details` 字段可携带附加信息

### 3.2 错误码分类

| 前缀 | 分类 | 示例 |
|------|------|------|
| `AUTH_*` | 认证相关 | `AUTH_API_KEY_MISSING` |
| `CONFIG_*` | 配置相关 | `CONFIG_INVALID` |
| `PROVIDER_*` | LLM 调用相关 | `PROVIDER_NOT_FOUND` |
| `TOOL_*` | 工具执行相关 | `TOOL_NOT_FOUND` |
| `INTERNAL_*` | 内部错误 | `INTERNAL_UNEXPECTED` |

## 4. 代码实现

### 4.1 错误类型定义

```typescript
export interface AppError {
  code: string          // 机器可读的错误码，如 "PROVIDER_NOT_FOUND"
  message: string       // 人类可读的错误描述，如 "不支持的提供商: xxx"
  suggestion?: string   // 修复建议，如 "可用: deepseek, anthropic, openai"
  details?: Record<string, unknown>  // 附加信息，如 { reason: "..." }
}
```

### 4.2 工厂函数与类型守卫

```typescript
/** 创建错误对象 */
export function createError(
  code: string,
  message: string,
  suggestion?: string,
  details?: Record<string, unknown>,
): AppError {
  return { code, message, suggestion, details }
}

/** 类型守卫：判断一个值是否为 AppError */
export function isAppError(error: unknown): error is AppError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}
```

`isAppError` 是一个类型守卫，可以在 `catch` 块中使用：

```typescript
try {
  await someOperation()
} catch (error) {
  if (isAppError(error)) {
    // 此时 TypeScript 知道 error 是 AppError 类型
    console.error(`[${error.code}] ${error.message}`)
    if (error.suggestion) {
      console.error(`💡 ${error.suggestion}`)
    }
  } else {
    // 未知错误，降级处理
    console.error('未知错误:', error)
  }
}
```

### 4.3 错误码定义

```typescript
// ── 认证错误 ──
export const AUTH_API_KEY_MISSING = (provider: string): AppError => ({
  code: 'AUTH_API_KEY_MISSING',
  message: `未设置 ${provider} 的 API 密钥`,
  suggestion: `请设置环境变量 ${provider.toUpperCase()}_API_KEY 或 ~/.piagent/config.json`,
  // 示例: 错误信息中包含环境变量名，用户可以直接复制设置
})

export const AUTH_API_KEY_INVALID = (provider: string): AppError => ({
  code: 'AUTH_API_KEY_INVALID',
  message: `${provider} API 密钥无效`,
  // 注意：没有 suggestion，因为密钥无效的原因可能是多种多样的
})

// ── 配置错误 ──
export const CONFIG_INVALID = (path: string, reason: string): AppError => ({
  code: 'CONFIG_INVALID',
  message: `配置文件格式错误: ${path}`,
  details: { reason },
  // 使用 details 字段携带具体原因，方便调试
})

// ── LLM 提供商错误 ──
export const PROVIDER_NOT_FOUND = (provider: string): AppError => ({
  code: 'PROVIDER_NOT_FOUND',
  message: `不支持的提供商: ${provider}`,
  suggestion: '可用: deepseek, anthropic, openai',
  // suggestion 中列出了所有支持的提供商，用户可以直接参考
})

export const MODEL_NOT_FOUND = (model: string, provider: string): AppError => ({
  code: 'MODEL_NOT_FOUND',
  message: `模型 "${model}" 在 ${provider} 中不可用`,
})

export const PROVIDER_RATE_LIMITED = (provider: string, retryAfter?: number): AppError => ({
  code: 'PROVIDER_RATE_LIMITED',
  message: `${provider} 请求频率超限`,
  suggestion: retryAfter ? `请在 ${retryAfter} 秒后重试` : '请稍后重试',
  // 如果 API 返回了 Retry-After 头，可以给出精确的等待时间
})

// ── 工具错误 ──
export const TOOL_NOT_FOUND = (name: string): AppError => ({
  code: 'TOOL_NOT_FOUND',
  message: `工具 "${name}" 不存在`,
})

export const TOOL_EXECUTION_FAILED = (name: string, reason: string): AppError => ({
  code: 'TOOL_EXECUTION_FAILED',
  message: `工具 "${name}" 执行失败`,
  details: { reason },
})

export const TOOL_PERMISSION_DENIED = (name: string, command: string): AppError => ({
  code: 'TOOL_PERMISSION_DENIED',
  message: `用户拒绝了 ${name} 操作`,
  details: { command },
})

// ── Agent 错误 ──
export const AGENT_ALREADY_STREAMING = (): AppError => ({
  code: 'AGENT_ALREADY_STREAMING',
  message: 'Agent 正在处理中，请等待完成后再发送消息',
})

// ── 内部错误 ──
export const INTERNAL_UNEXPECTED = (reason: string): AppError => ({
  code: 'INTERNAL_UNEXPECTED',
  message: `意外错误: ${reason}`,
})
```

### 4.4 使用示例

**在 Provider 中使用：**
```typescript
// 在 Provider 中检查 API Key
if (!apiKey) {
  // 返回友好的错误提示，包含环境变量名
  throw AUTH_API_KEY_MISSING('deepseek')
  // 输出: [AUTH_API_KEY_MISSING] 未设置 deepseek 的 API 密钥
  // 💡 请设置环境变量 DEEPSEEK_API_KEY 或 ~/.piagent/config.json
}

// 在 Registry 中处理不存在的提供商
const factory = this.providers.get(provider)
if (!factory) {
  throw PROVIDER_NOT_FOUND(provider)
  // 输出: [PROVIDER_NOT_FOUND] 不支持的提供商: xxx
  // 💡 可用: deepseek, anthropic, openai
}
```

**在 Agent 中统一处理错误：**
```typescript
try {
  await agent.run(userMessage)
} catch (error) {
  if (isAppError(error)) {
    // 分类处理不同类型的错误
    switch (error.code) {
      case 'AUTH_API_KEY_MISSING':
        // 提示用户配置 API Key
        showConfigurationGuide(error.suggestion!)
        break
      case 'PROVIDER_RATE_LIMITED':
        // 等待后重试
        await sleep(parseRetryAfter(error.suggestion))
        break
      case 'TOOL_PERMISSION_DENIED':
        // 跳过这个工具调用
        continue
      default:
        // 通用错误处理
        console.error(`[${error.code}] ${error.message}`)
    }
  } else {
    // 非 AppError 的未知错误
    console.error('未知错误:', error)
  }
}
```

## 5. 运行与验证

```bash
# 查看所有错误码定义
grep "export const" src/ai/errors.ts

# 验证类型守卫
cat << 'EOF' > /tmp/test-errors.ts
import { isAppError, createError, AUTH_API_KEY_MISSING } from './src/ai/errors.js'

// 测试类型守卫
const error = AUTH_API_KEY_MISSING('anthropic')
console.log('isAppError:', isAppError(error))  // true
console.log('isAppError(null):', isAppError(null))  // false
console.log('isAppError({}):', isAppError({}))  // false
console.log('isAppError("string"):', isAppError('string'))  // false

// 测试 createError 工厂函数
const customError = createError('CUSTOM_ERROR', '自定义错误', '修复建议', { key: 'value' })
console.log('Custom error:', customError)
EOF
```

## 6. 小结

统一错误码体系通过 `AppError` 接口、`createError` 工厂函数、`isAppError` 类型守卫和一系列预定义错误码，提供了一套完整的错误处理方案。每个错误都包含机器可读的 `code`、人类可读的 `message` 和可操作的 `suggestion`，让开发者可以快速定位并修复问题。

### 思考题

1. `isAppError` 类型守卫的实现中，为什么只检查 `code` 和 `message` 字段存在，而不检查它们的类型是否正确？
2. 如果错误需要在多个系统间传递（如通过网络序列化），`AppError` 接口的设计有什么需要改进的地方？
3. 为什么 `AUTH_API_KEY_MISSING` 使用函数返回对象（`() => ({...})`），而 `AGENT_ALREADY_STREAMING` 也使用函数返回对象？直接用对象字面量有什么问题？

> ← [上一节](./04-model-registry.md) · [下一节](./06-retry-mechanism.md) →
>
> [📚 返回章节首页](../02-ai-layer/README.md)