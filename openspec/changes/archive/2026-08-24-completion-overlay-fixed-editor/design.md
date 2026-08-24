# 补全 overlay 浮层 — 设计

## Context

见 proposal「Why」：completionSlot 在 bottomDock 文档流 → 补全时 bottomDock 高度变 → 输入框浮动。需把补全移出文档流，做绝对定位 overlay。

## Goals / Non-Goals

- 目标：补全/树以 overlay 浮在 editor 上方；bottomDock 高度恒定 → 输入框固定、平时无空白。
- 非目标：不做通用模态 overlay 系统（只做 bottom overlay）；不改 main-screen 渲染器（教学主用 alt）。

## Decisions

- **决策：renderer-alt 增加 `setBottomOverlay(component)`，doRender 末尾把 overlay 行覆盖到「editor 顶部之上」位置。**
  渲染流程：① root.render 得整屏行；② 算 bottomDock 高度（height - chatScrollView 占用 = bottomDock 行数）；③ overlay 行覆盖到 `[height - bottomDockHeight - overlayLines, ...)` 区间。理由：不动布局树，纯渲染层叠加。备选：VStack 量高 API——被否，渲染时按 root 已经分配的高度反推即可。

- **决策：bottomDock 移除 completionSlot，改为固定结构（status + 分隔线 + editor + statusbar）。**
  高度恒定。补全/树改挂 `setBottomOverlay`。

- **决策：bottomDock 高度由「editor 行数 + status + 分隔线 + statusbar」常量推算。**
  教学项目 editor 固定，可计算；或让 VStack 报告已用高度。先按 render 后底部行数反推：渲染后从末尾向上找到 editor 起始行。

## Risks / Trade-offs

- [overlay 覆盖 chat 行的滚动协调] → overlay 出现时 chat 仍 stickyBottom，被覆盖的是最旧可见行，可接受；overlay 消失自动恢复。
- [main-screen 不支持 overlay] → main-screen 是降级路径，overlay 在其上回退为不显示（或仍用旧槽），不影响主路径。

## Migration Plan

无迁移。

## Open Questions

无。