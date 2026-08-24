## MODIFIED Requirements

### Requirement: 补全展示槽可折叠
补全/树展示 SHALL 以绝对定位 overlay 浮层呈现，不进入底部布局文档流，使底部布局高度恒定、输入框固定；无内容时不占空间，有内容时按需撑开（覆盖聊天区对应行），超出最大高度截断，关闭后立即消失。

#### Scenario: 无内容时折叠
- **WHEN** 补全/树 overlay 没有挂载内容
- **THEN** overlay 渲染 0 行，底部布局高度不变，不占用布局空间，输入框固定

#### Scenario: 有内容时按需撑开
- **WHEN** overlay 挂载了选择器且其渲染行数小于等于最大高度
- **THEN** 其内容渲染在 editor 正上方（覆盖 chat 底部对应行），底部布局高度仍不变，输入框位置固定

#### Scenario: 超出最大高度截断
- **WHEN** 挂载内容渲染行数超过最大高度
- **THEN** overlay 截断至最大高度，不无限增长

#### Scenario: 关闭后立即折叠
- **WHEN** overlay 内容被移除
- **THEN** overlay 立即不渲染，被覆盖的 chat 行恢复显示，输入框位置不变

## ADDED Requirements

### Requirement: 撤回节点保留树形分支线
系统 SHALL 在 /tree 中对撤回节点保留与其他节点一致的分支线（└─/├─），仅以颜色降权区分。

#### Scenario: 撤回节点带分支线
- **WHEN** 一个被撤回的节点是其父的末位子节点
- **THEN** 该节点显示 └─ 分支线（灰色降权），层级与活跃节点一致