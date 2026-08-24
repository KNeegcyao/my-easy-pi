# 修复 /tree 节点 id 撞名 与 撤回节点未标记 — 设计

## Context

见 proposal「Why」：id 前缀撞名 + 撤回未显示。

## Goals / Non-Goals

- 目标：shortId 唯一可定位；撤回节点在树中显式标记。
- 非目标：不改变 id 生成格式（只改展示的短标识取法）；不删除撤回节点（pi 风格保留历史）。

## Decisions

- **决策：shortId 取 id 末段（counter+时间戳尾）而非前 8 字符。**
  id 为 `msg-{ts}-{counter}`。取最后一段 `-` 之后的部分（counter），若不够唯一则取更长后缀。理由：时间戳末位+counter 对人可读且互异。备选：UUID——被否，项目用 msg-ts-counter。

- **决策：getTree 增加 `isRevoked` 字段，透传 revoked 状态。**
  host 渲染时对 isRevoked 节点用灰色 + `(已撤回)` 前缀。撤回节点仍保留在树里（pi 风格），但视觉降权。

## Risks / Trade-offs

- [短 id 仍可能极小概率撞] → counter 全局递增，碰撞概率极低；教学可接受。
- [撤回节点占行] → 保留可见利于教学理解撤销语义；若太杂可后续折叠。

## Migration Plan

无迁移。

## Open Questions

无。