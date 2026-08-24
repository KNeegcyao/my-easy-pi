# 会话树导航 — 设计

## Context

见 proposal「Why」：现有 `parentId` 树形结构与 `getActiveBranch` 只能回溯直线，无法可视化分支或切换。pi 的 `/tree` 是让"历史是棵树"可交互的核心。

## Goals / Non-Goals

- 目标：`/tree` 打开树导航选择器，可跳转到任意节点；`/fork <id>` 分叉新会话。
- 非目标：不做分支摘要（/tree 切分支时的自动总结），那是后续增强；不做 `/resume` 全局选择器。

## Decisions

- **决策：在 SessionManager 增加树遍历 API,UI 只读不写。**
  新增 `getTree(messages)` 返回缩进树形结构（每节点带 id/角色/摘要/深度/是否分支点），供 host 渲染。理由：树形构造属会话层逻辑，UI 只消费。备选：在 host 现场组装——被否，逻辑泄漏到 UI。

- **决策：跳转 = 把 agent.state.messages 截断到目标节点路径。**
  用 `getActiveBranch` 找到从根到该节点的路径，替换当前消息列表。新消息以该节点为父（因 prompt 的 parentId 指向最后一条）。理由：最小改动，复用现有路径解析。

- **决策：/fork 用 SessionManager 复制路径到新会话文件。**
  读当前会话，取根到目标节点的路径，写入新会话 id，设为新会话名（"fork of ..."）。理由：会话分叉是持久层操作，属 SessionManager 职责。

- **决策：树导航复用 Selector 组件，挂 completionSlot。**
  与 slash 补全一致，不改变布局高度，输入框固定。

## Risks / Trade-offs

- [大树的渲染性能] → Selector 行数受限于 completionSlot 高度（8 行），超出截断；教学规模足够。
- [跳转到中间节点后上下文断裂] → 跳转即替换 agent.state.messages,LLM 只看到该路径，符合预期。

## Migration Plan

纯增量，无数据迁移。

## Open Questions

无。