# 会话树导航 — 任务清单

## 1. 会话层树遍历 API

- [x] 1.1 `SessionManager.getTree(messages)` 返回缩进树形结构（节点含 id/role/内容摘要/深度/是否分支点/是否当前叶）
- [x] 1.2 `SessionManager.getPathToNode(messages, nodeId)` 返回根到指定节点的路径
- [x] 1.3 `SessionManager.forkSession(sourceId, nodeId, name?)` 从指定节点分叉新会话并返回新 id

## 2. 命令与 UI

- [x] 2.1 在 `SLASH_COMMANDS` 注册 `/tree` 与 `/fork`
- [x] 2.2 host `/tree`：构建树节点列表，用 Selector 挂 completionSlot 展示
- [x] 2.3 Selector 确认后跳转：用 `getPathToNode` 替换 `agent.state.messages`，并 `screen.requestRender()`
- [x] 2.4 host `/fork <节点id>`：调用 `forkSession`，创建新会话并切换

## 3. 测试与验收

- [x] 3.1 单测：getTree 输出树形结构与分支点标记正确
- [x] 3.2 单测：getPathToNode 返回正确路径
- [x] 3.3 单测：forkSession 生成新会话文件且内容正确
- [x] 3.4 单测：/tree 与 /fork 命令注册且可执行
- [x] 3.5 全量 `npm test` 无回归（393/393）

## 4. 收尾

- [x] 4.1 `openspec validate` 通过
- [ ] 4.2 归档 change