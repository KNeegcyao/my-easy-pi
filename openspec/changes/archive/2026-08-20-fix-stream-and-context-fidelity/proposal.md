# 修复流式保真与上下文压缩失真

## Why

两个功能缺陷破坏了数据保真度:(1) 会话压缩只生成一句固定占位文案、不携带旧内容,且产物是 notification 角色会被 LLM 上下文过滤,等于"压缩形同虚设";(2) OpenAI 兼容流式解析在文本与工具调用并存时提前返回,丢弃同一 chunk 里的工具增量,导致流式工具参数偶发缺失。

## What Changes

- **压缩改为携带旧内容实质**：压缩摘要不再是固定文案，而是包含旧消息的可观测要点（如用户请求与关键结论的摘录），并保证该摘要能进入 LLM 上下文（而非被消息转换过滤）。
- **压缩触发与产物契约**：明确保留"最近 N 条 + 前置一条压缩摘要"的结构，且摘要计入下一步对话。
- **流式解析不丢段**：同一 SSE chunk 同时含文本与工具增量时，两者都被消费；文本增量与工具增量各自正确发射，不再因先取 content 而丢弃 tool_calls。
- **边界修正**：将压缩产物从 notification 移到能被下发到 LLM 的消息形态。

## Capabilities

- **Modified Capabilities**
  - `session` — 压缩行为从"截断丢弃"改为"可进入上下文的摘要压缩"。
  - `ai` — OpenAI 兼容流式解析对"文本 + 工具并存"的 chunk 完整处理。

- **New Capabilities**
  - (none)

## Impact

- 代码：`src/session/compaction.ts`、`src/ai/openai-compat.ts`、`src/agent/loop.ts`（若引入过滤路径调整）。
- 测试：`tests/unit/agent/compactor.test.ts`、`tests/unit/ai/registry.test.ts`（流式转换单测）或新增用例文件。
- 依赖：无新增。
- 兼容：压缩是替代既有损截断,属于行为增强;流式为纯修正,不破坏既有工具调用。

## 缺口依证据参照

见 `docs/openspec-audit.md` 高/中风险第 1、2 条。