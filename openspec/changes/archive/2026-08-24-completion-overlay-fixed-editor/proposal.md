# 补全改为 overlay 浮层（输入框恒固定 + 平时无空白）

## Why

补全槽此前从「固定高度空占 8 行」改为「动态高度」，又引入输入框浮动：补全出现/消失时 bottomDock 高度变化挤压 chatScrollView，输入框上下抖动。根因是补全槽作为 bottomDock 文档流的一部分。

## What Changes

- 补全/树导航改用**绝对定位 overlay** 浮层：渲染在 editor 正上方 N 行，覆盖 chat 底部对应行；不进入 bottomDock 文档流。
- bottomDock 移除 completionSlot，高度恒定 → 输入框永远固定、平时无空白。
- /tree 撤回节点保留树形分支线（仅灰化），与活跃节点层级一致。

## Capabilities

- **Modified Capabilities**
  - `interface` — 补全/树以 overlay 浮层展示，不改变底部布局高度；撤回节点保留分支线。

- **New Capabilities**
  - (none)

## Impact

- 代码：`src/tui/renderer-alt.ts`(overlay 渲染钩子)、`src/tui/host.ts`(挂载点改 overlay、撤回节点渲染)、`src/tui/layout/stack.ts`(VStack 量高 API，如需)。
- 测试：renderer/host 相关。
- 依赖：无。

## 缺口证据

- completionSlot 在 bottomDock → 补全时 bottomDock 高度变 → 输入框浮动。
- 撤回节点渲染未带 branchMark，层级感弱。