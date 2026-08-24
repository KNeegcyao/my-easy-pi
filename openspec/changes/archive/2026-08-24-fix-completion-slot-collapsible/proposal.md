# 补全槽可折叠（平时不占空间）

## Why

为防补全弹窗时输入框上移，上一版引入了固定高度 8 行的 `completionSlot`。副作用：**即使没有补全、没有 /tree，该槽也始终占 8 行空白**，把对话框往上压、输入区上方出现一片无用空区。需要让它在无内容时折叠为 0 行。

## What Changes

- `FixedHeightBox` 改为**可折叠**：无内容时 `render` 返回 0 行；有内容时按实际内容行数渲染，并以最大高度截断（上限 8 行）。
- host 装配：`completionSlot` 的 `min` 改为 0（不再强制 8），让 VStack 在槽为空时折叠。
- 行为：补全/树出现时槽按需撑开（输入框被上推一小段，符合直觉）；关闭即恢复为 0 行空白。

## Capabilities

- **Modified Capabilities**
  - `interface` — 补全/树展示槽在无内容时不再占用布局高度。

- **New Capabilities**
  - (none)

## Impact

- 代码：`src/tui/layout/fixed-height.ts`、`src/tui/host.ts`（bottomDock min 调整）。
- 测试：`tests/unit/tui/fixed-height.test.ts`（新增）。
- 依赖：无。

## 缺口证据

- `FixedHeightBox.render` 空时仍 `while (lines.length < this.height) lines.push('')` 返回 8 空 行 → 布局恒占 8 行。