# 修复流式保真与上下文压缩失真 — 设计

## Context

见 proposal「Why」两处缺陷。当前实现:Compactor 生成 `role: 'notification'` 固定文案且被 `defaultConvertToLlm` 过滤;`convertOpenAIEvent` 先取 content、早 return 导致 tool_calls 增量丢失。

## Goals / Non-Goals

- 目标:让压缩摘要实质携带旧内容且进入 LLM;流式 chunk 同时含文本+工具时不丢段。
- 非目标:不做真正的 LLM 语义摘要(教学项目避免引入二次模型调用成本);不改风险/权限。

## Decisions

- **决策:压缩摘要使用 `role: 'user'` + 规范前缀。**
  旧消息被折叠为一条 `user` 消息，内容以 `[上下文压缩]` 开头并摘录要点（最近用户请求、关键结论）。理由:user 是既能落盘又能进 LLM 的既有角色,不触碰 notifications 过滤语义。备选:改用 assistant —— 会污染"模型发言"语义。

- **决策:摘要采用确定性摘录而非调 LLM。**
  从旧消息里提取可观测要点(用户消息前 N 字符、assistant 文本首位段)。理由:无新增依赖、可测试、教学清晰。备选:调 model 生成——引入硬件成本与失败路径,非 Goal。

- **决策:流式转换按字段完备消费。**
  同一 chunk 若同时有 content 与 tool_calls,先发射文本增量并把工具增量一并产出(通过返回数组或优先完整消费)。不再对 content 分支裸 return。选用**返回数组**给调用方逐条消费,最小改动且不破坏单事件语义。

## Risks / Trade-offs

- [摘要丢失细节] → 挂摘录要点而非全文,接受取舍;场景标注清楚。
- [返回数组改动调用方] → Agent.processLLMStream 需适配多事件;改动面可控,单测覆盖。

## Migration Plan

纯 bug 修复,无迁移。

## Open Questions

无。