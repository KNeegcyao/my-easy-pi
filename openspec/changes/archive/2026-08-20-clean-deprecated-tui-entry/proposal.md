# 清理废弃的旧 TUI 入口

## Why

`src/interface/tui/index.ts` 是 Phase 4 前的旧 TUI 入口，已标注 `@deprecated`，实际运行入口在 `src/tui/index.ts`（host 版）。保留旧入口造成"双实现分叉"，对教学读代码的初学者是误导。本次做最小清理：仅删除该孤立死文件及其 re-export，不触碰仍被新版共享的 `editor.ts`/`theme.ts`/`commands.ts`/`renderer.ts`。

## What Changes

- 删除 `src/interface/tui/index.ts`（旧 startTUI 入口）。
- 从 `src/interface/index.ts` 移除对它的 re-export，并加注释说明 TUI 主入口统一从 `src/tui/index.ts` 导出。
- 无行为变更（该入口未被任何运行路径引用）。

## Capabilities

- 纯死代码清理，无 spec 级行为变化。已在 `.openspec.yaml` 置 `skip_specs: true`。

## Impact

- 代码：删除 1 文件 + 改 1 文件 re-export。
- 测试：无新用例；全量 `npm test` 需保持 377 通过。
- 依赖：无。