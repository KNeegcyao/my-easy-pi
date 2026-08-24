# 会话树导航（/tree)

## Why

当前会话以 `parentId` 构成树，但用户看不到、也回不到历史分支——只能沿当前直线前进。pi 的核心理念是"历史是棵树，不是一条线"：让学习者能可视化会话树、跳回任意节点、从该节点分叉，把"分支"从数据变成可交互的能力。这是教学项目的关键亮点，也回应"跨会话记忆"的 pi 式答案。

## What Changes

- 新增 `/tree` 命令：打开会话树的交互式导航界面（用现有 Selector/浮层）。
- 显示树结构：按缩进展示各分支节点（user/assistant 摘要 + 分支标记）。
- 支持跳转：选择一个节点后，把活动叶切到该节点（编辑并重新提交即创建新分支）。
- 支持 `/fork <节点id>`：从指定节点分叉出新会话（新 JSONL 文件，复制到该节点的路径）。
- 与现有 `-c`（继续最近会话）并存，不破坏既有会话加载。

## Capabilities

- **New Capabilities**
  - `session-tree` — 会话树导航与分叉能力。

- **Modified Capabilities**
  - `session` — 增加分支导航行为（不影响既有存储/压缩/自动命名）。

## Impact

- 代码：`src/session/manager.ts`（树遍历/分支切换 API)、`src/tui/host.ts`（/tree 命令 + 渲染）、`src/interface/tui/commands.ts`（命令注册）。
- 测试：`tests/unit/session/`、`tests/tui/`。
- 依赖：无新增。

## 缺口证据

- 现有 `getActiveBranch` 只能回溯当前直线，无法可视化树或切换分支。
- 教学上，这是理解"pi 会话树 vs 线性历史"的关键。