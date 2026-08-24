# 修复 /tree 节点 id 撞名 与 撤回节点未标记

## Why

实测 /tree 暴露两个 bug:
1. `shortId` 取 id 前 8 字符，而消息 id 格式 `msg-{timestamp}-{counter}` 同秒创建时前缀恒为 `msg-178`，导致所有节点显示同一短 id，`/fork <id>` 无法定位。
2. `/undo` 撤回的回合（user+assistant 标记 revoked）在 /tree 中仍照常显示，无任何撤回标识，学习者看不出"哪条被撤回了"。

## What Changes

- `getTree` 的 `shortId` 改取 id 的**唯一后缀段**（counter+时间戳末位），保证节点间互异。
- `getTree` 给被撤回节点加 `isRevoked` 标记。
- host /tree 渲染：被撤回节点标灰并加 `(已撤回)` 前缀，区分于活跃分支。

## Capabilities

- **Modified Capabilities**
  - `session-tree` — 节点短 id 唯一可定位；撤回节点在树中显式标记。

- **New Capabilities**
  - (none)

## Impact

- 代码：`src/session/manager.ts`(getTree)、`src/tui/host.ts`(渲染)。
- 测试：`tests/unit/session/tree.test.ts` 补 shortId 唯一性 + isRevoked 用例。
- 依赖：无。