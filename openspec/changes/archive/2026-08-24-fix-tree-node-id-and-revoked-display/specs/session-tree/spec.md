## MODIFIED Requirements

### Requirement: 分支标识
系统 SHALL 在每个节点显示其角色（user/assistant/toolResult)、是否为分支点、可定位的唯一短标识，并标记被撤回的节点。

#### Scenario: 分支点标记
- **WHEN** 一个节点有多个子节点（分叉点）
- **THEN** 树形展示中该节点带有分支标记，便于用户识别可分叉处

#### Scenario: 节点短标识唯一可定位
- **WHEN** 树中存在多个节点
- **THEN** 每个节点的短标识互不相同，足以供 /fork 唯一定位

#### Scenario: 撤回节点显式标记
- **WHEN** 一个节点已被撤回（revoked=true）
- **THEN** 树形展示中该节点带撤回标识（如灰色 + 已撤回前缀），与活跃节点区分