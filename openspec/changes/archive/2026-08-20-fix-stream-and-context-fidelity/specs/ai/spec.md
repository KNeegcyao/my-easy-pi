## ADDED Requirements

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