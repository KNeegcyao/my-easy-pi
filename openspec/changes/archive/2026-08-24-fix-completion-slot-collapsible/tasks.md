# 补全槽可折叠 — 任务清单

## 1. 布局层改造

- [x] 1.1 `FixedHeightBox` 重命名 `height`→`maxHeight`，空内容返回 0 行，非空返回 min(content, maxHeight) 行
- [x] 1.2 保留 setHeight/setContent/hasContent 公开 API（语义调整为最大高度）

## 2. 宿主装配

- [x] 2.1 `host.ts`：completionSlot 的 `min` 从 8 改为 0（变量名沿用 COMPLETION_SLOT_HEIGHT 作为上限）

## 3. 测试与验收

- [x] 3.1 单测：空内容返回 0 行
- [x] 3.2 单测：有内容返回等高行数（≤max）
- [x] 3.3 单测：超出 max 截断
- [x] 3.4 全量 `npm test` 无回归

## 4. 收尾

- [x] 4.1 `openspec validate` 通过
- [x] 4.2 归档 change