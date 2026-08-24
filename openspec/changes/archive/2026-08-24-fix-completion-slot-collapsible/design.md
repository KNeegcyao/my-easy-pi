# 补全槽可折叠 — 设计

## Context

见 proposal「Why」：固定 8 行槽的副作用是平时空占 8 行。需要折叠。

## Goals / Non-Goals

- 目标：无内容时 0 行；有内容时按需撑开（≤上限）；关闭即回 0。
- 非目标：不引入绝对定位 overlay（Phase 6 未做），不改变补全/树的交互逻辑。

## Decisions

- **决策：让 FixedHeightBox 在空时返回 0 行，有内容时返回实际内容行数（截断至上限）。**
 renominate `maxHeight` 取代 `height`，语义从"固定高"变"最大高"。空（child=null）→ 0 行；非空 → `min(content.length, maxHeight)` 行。理由：最小改动，布局层一处解决。备选：用 Spacer 动态显隐——被否，组件模型不支持高度 0 占位。

- **决策：host bottomDock 把 completionSlot 的 `min` 从 8 改为 0。**
  让 VStack 在槽渲染 0 行时不为其留空白。`grow` 仍 0（不抢空间）。

- **决策：输入框短暂上推是可接受的。**
  补全弹出时输入框被上推一小段，关闭即恢复。这与 pi/Vim 类工具一致，符合直觉；强求"绝不移动"会让槽常驻空白，反而更怪。

## Risks / Trade-offs

- [输入框跳动观感] → 仅在补全出现/消失时发生，且幅度≤8 行，可接受。
- [超大树/补全被截断] → 有上限保护；/tree 节点多时可后续加分页，非本次范围。

## Migration Plan

纯修改，无迁移。

## Open Questions

无。