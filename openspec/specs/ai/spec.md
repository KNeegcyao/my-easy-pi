# AI 提供商层

## Purpose

定义 my-easy-pi 对 LLM 提供商的统一抽象:为每个提供商实现统一的 Model 流式接口,由注册表按 provider + modelId 解析模型,并把提供商差异限制在 Provider 内部。

## Requirements

### Requirement: 提供商支持
系统 SHALL 支持 deepseek、anthropic、openai 三个提供商。

#### Scenario: 注册提供商工厂
- **WHEN** 通过 ModelRegistry 注册 AnthropicProvider、DeepSeekProvider、OpenAIProvider
- **THEN** 系统可按 provider 名称查找并解析模型

#### Scenario: 模型解析
- **WHEN** 给定提供商、模型 id 与 apiKey
- **THEN** 系统返回匹配的 Model 实例;无匹配时返回 MODEL_NOT_FOUND 错误

### Requirement: 统一流式接口
系统 SHALL 通过同一 Model.stream 契约对所有提供商流式 emit 文本增量与工具调用事件。

#### Scenario: 文本流式输出
- **WHEN** 模型在流中产出文本
- **THEN** 系统持续发出 text_delta 事件

#### Scenario: 工具调用解析
- **WHEN** 模型请求工具(含流式增量与一次性两种形态)
- **THEN** 系统聚合为完整的 ToolCall{id,name,args},供 Agent 循环执行

### Requirement: 错误与重试契约
系统 SHALL 以统一 AppError{code,message,suggestion,details} 表达 AI 层错误,并对可重试的提供商错误执行重试策略。

#### Scenario: 未配置密钥
- **WHEN** 请求模型但缺少对应 provider 的 API 密钥
- **THEN** 系统返回 AUTH_API_KEY_MISSING 并提供设置环境变量的修复建议

#### Scenario: 未知提供商
- **WHEN** 传入不在 deepseek/anthropic/openai 中的 provider
- **THEN** 系统返回 PROVIDER_NOT_FOUND,并在 suggestion 列出可用的提供商

#### Scenario: 频率超限重试
- **WHEN** 提供商返回限流错误且带 retryAfter
- **THEN** 系统按退避策略重试,并提供"等待 N 秒后重试"的建议

### Requirement: 文本与工具并存增量
系统 SHALL 在单个流式 chunk 同时携带文本与工具增量时完整消费两者，不因处理其一而丢弃另一个。

#### Scenario: 同 chunk 文本与工具并存
- **WHEN** 一个 SSE chunk 的 delta 同时含 content 与 tool_calls 字段
- **THEN** 系统分别发射对应的文本增量与工具增量事件，二者都不丢失

#### Scenario: 纯文本 chunk
- **WHEN** 一个 chunk 仅含 content
- **THEN** 系统发射文本增量事件，不产生工具事件

#### Scenario: 纯工具 chunk
- **WHEN** 一个 chunk 仅含 tool_calls
- **THEN** 系统发射工具增量/开始事件，不产生文本事件
