# 会话与持久化

## Purpose

定义 my-easy-pi 的会话生命周期管理:创建、加载、删除、列出会话,以 JSONL 文件持久化消息,支持 parentId 分支结构与会话自动命名,并在恢复时提供活跃分支路径。

## Requirements

### Requirement: 会话存储格式
系统 SHALL 将每个会话持久化为独立的 JSONL 文件(每行一条 JSON 消息),文件名即会话 ID。

#### Scenario: 追加消息落盘
- **WHEN** 一条非 notification 消息产生
- **THEN** 系统把它序列化为一行追加到对应当前会话的 JSONL 文件

#### Scenario: 损坏行容错
- **WHEN** 读取会话时某行 JSON 解析失败
- **THEN** 系统跳过该行并在可能时重写文件以移除坏行,不中断其余消息读取

### Requirement: 会话元数据
系统 SHALL 通过 id 为 "meta" 的通知消息承载会话名称。

#### Scenario: 创建会话携带名称
- **WHEN** 创建新会话
- **THEN** 系统写入一条 meta 消息作为会话名

#### Scenario: 重命名会话
- **WHEN** 调用 renameSession
- **THEN** 系统重建会话文件,把 meta 消息置于文件首并替换为新的会话名

### Requirement: 会话自动命名
系统 SHALL 用首条用户消息内容为会话自动生名。

#### Scenario: 首条用户消息命名
- **WHEN** 会话收到第一条 user 消息且尚未命名
- **THEN** 系统以该消息前 40 字符(超长加省略号)作为会话名,并仅执行一次

### Requirement: 会话管理与恢复
系统 SHALL 支持列出、删除会话,并记录/恢复最后活跃会话。

#### Scenario: 列出会话摘要
- **WHEN** 调用 listSessions
- **THEN** 返回每个会话的 id、名称、消息条数与创建时间

#### Scenario: 恢复最后会话
- **WHEN** 调用 getLastSession 且存在 last-session 记录
- **THEN** 返回最后活跃会话 id,用于 continue 恢复

#### Scenario: 删除会话
- **WHEN** 调用 deleteSession
- **THEN** 系统删除对应的 JSONL 会话文件

### Requirement: 分支路径解析
系统 SHALL 依据 parentId 从根部到最新活跃消息解析一条直线分支,并跳过已撤回消息。

#### Scenario: 沿 parentId 回溯
- **WHEN** 提供含 parentId 树的会话消息
- **THEN** 系统从最后一条未撤回消息沿祖先链回溯出活跃分支

#### Scenario: 跳过已撤回
- **WHEN** 分支中某消息标记为 revoked
- **THEN** 该消息(及其后续)不入活跃分支,且根部继续向上回溯到第一个未撤回祖先

### Requirement: 上下文压缩
当对话历史超过阈值时，系统 SHALL 生成包含旧内容要点的摘要，并保证该摘要可进入后续 LLM 上下文。

#### Scenario: 超过阈值触发压缩
- **WHEN** 消息总数超过压缩阈值且存在早于保留窗口的消息
- **THEN** 系统生成一条摘要消息,它包含旧对话的可观测要点(而非固定占位文案)
- **AND** 摘要置于保留的最近消息之前,共同构成后续上下文

#### Scenario: 摘要进入 LLM 上下文
- **WHEN** 代理把压缩后的消息列表交给模型
- **THEN** 该压缩摘要不被当作纯 UI 消息过滤,而是作为上下文的一部分发送给模型

#### Scenario: 未超阈值不压缩
- **WHEN** 消息总数未超过阈值
- **THEN** 系统保持消息列表不变,不做任何截断或摘要
