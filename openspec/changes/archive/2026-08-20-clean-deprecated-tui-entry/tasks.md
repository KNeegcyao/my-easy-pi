# 清理废弃的旧 TUI 入口 — 任务清单

## 1. 删除

- [x] 1.1 删除 `src/interface/tui/index.ts`（旧 startTUI 入口）
- [x] 1.2 从 `src/interface/index.ts` 移除对旧入口的 re-export，并注释主入口位置

## 2. 验证

- [x] 2.1 `npx tsc --noEmit` 通过
- [x] 2.2 全量 `npm test` 377/377 通过，无回归

## 3. 收尾

- [x] 3.1 确认 `.openspec.yaml` 已置 `skip_specs: true`
- [ ] 3.2 归档 change