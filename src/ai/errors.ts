// ============================================================
// errors — 统一错误码体系
//
// 所有错误使用统一格式：
//   code: 机器可读错误码, message: 人类可读描述
//   suggestion: 修复建议, details: 附加信息
//
// 错误码分类：
//   AUTH_*      认证相关
//   CONFIG_*    配置相关
//   PROVIDER_*  LLM 调用相关
//   TOOL_*      工具执行相关
//   INTERNAL_*  内部错误
// ============================================================

export interface AppError {
  code: string
  message: string
  suggestion?: string
  details?: Record<string, unknown>
}

export function createError(
  code: string, message: string,
  suggestion?: string, details?: Record<string, unknown>,
): AppError {
  return { code, message, suggestion, details }
}

export function isAppError(error: unknown): error is AppError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

// ── 认证错误 ──
export const AUTH_API_KEY_MISSING = (provider: string): AppError => ({
  code: 'AUTH_API_KEY_MISSING',
  message: `未设置 ${provider} 的 API 密钥`,
  suggestion: `请设置环境变量 ${provider.toUpperCase()}_API_KEY 或 ~/.piagent/config.json`,
})

export const AUTH_API_KEY_INVALID = (provider: string): AppError => ({
  code: 'AUTH_API_KEY_INVALID',
  message: `${provider} API 密钥无效`,
})

// ── 配置错误 ──
export const CONFIG_INVALID = (path: string, reason: string): AppError => ({
  code: 'CONFIG_INVALID',
  message: `配置文件格式错误: ${path}`,
  details: { reason },
})

// ── LLM 提供商错误 ──
export const PROVIDER_NOT_FOUND = (provider: string): AppError => ({
  code: 'PROVIDER_NOT_FOUND',
  message: `不支持的提供商: ${provider}`,
  suggestion: '可用: deepseek, anthropic, openai',
})

export const MODEL_NOT_FOUND = (model: string, provider: string): AppError => ({
  code: 'MODEL_NOT_FOUND',
  message: `模型 "${model}" 在 ${provider} 中不可用`,
})

export const PROVIDER_RATE_LIMITED = (provider: string, retryAfter?: number): AppError => ({
  code: 'PROVIDER_RATE_LIMITED',
  message: `${provider} 请求频率超限`,
  suggestion: retryAfter ? `请在 ${retryAfter} 秒后重试` : '请稍后重试',
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