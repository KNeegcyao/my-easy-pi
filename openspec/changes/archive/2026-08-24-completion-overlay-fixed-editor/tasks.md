# 补全 overlay 浮层 — 任务清单

## 1. renderer overlay 能力

- [x] 1.1 renderer-alt 增加 `setBottomOverlay(c: Component | null)` 与 overlay 状态
- [x] 1.2 doRender 末尾：若有 overlay，将其渲染行覆盖到 editor 顶部之上（按底部布局高度反推位置）
- [x] 1.3 overlay 为空时不产生任何覆盖

## 2. host 挂载点迁移

- [x] 2.1 bottomDock 移除 completionSlot（高度恒定）
- [x] 2.2 补全（slash/@）与 /tree 选择器改挂 `screen.setBottomOverlay(...)`
- [x] 2.3 closeAutocomplete 改为 `setBottomOverlay(null)`

## 3. 撤回节点分支线

- [x] 3.1 /tree 撤回节点保留 branchMark（└─/├─ + 分叉◆），仅整行灰化降权

## 4. 测试与验收

- [x] 4.1 renderer setBottomOverlay 单测：overlay 行出现在 editor 上方位置
- [x] 4.2 全量 npm test 无回归
- [x] 4.3 实测：补全出现/消失输入框不浮动；平时无空白；撤回节点带分支线

## 5. 收尾

- [x] 5.1 openspec validate 通过
- [x] 5.2 归档 change