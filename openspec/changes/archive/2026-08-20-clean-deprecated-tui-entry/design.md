# 清理废弃的旧 TUI 入口 — 设计

## Context

见 proposal「Why」：旧 `src/interface/tui/index.ts` 是 Phase 4 前入口，已被 `src/tui/index.ts` 取代。

## Goals / Non-Goals

- 目标：删除孤立死入口，消除双实现分叉的误导。
- 非目标：不重构 `editor.ts`/`theme.ts`/`renderer.ts`/`commands.ts` —— 其中工具仍被新版共享，动它们有破坏依赖风险。

## Decisions

- **仅删除 `index.ts`**：引用分析确认它只被 `interface/index.ts` 的 re-export 使用，且 cli.ts 未 import 该 startTUI，删除安全。
- **同步移除 re-export 并加注释**：保持导出集一致，标注新入口位置，避免后续误导。

## Risks / Trade-offs

- [遗漏其他引用] → 已 grep 全量确认无外部消费；tsc + 全量测试兜底验证。

## Migration Plan

无迁移。

## Open Questions

无。