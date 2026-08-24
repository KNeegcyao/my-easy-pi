# 输出接口与交互

## Purpose

定义 my-easy-pi 面向用户/外部程序的输出与交互能力:print 纯文本、JSONL 结构化、RPC 协议与全屏 TUI 四种模式,分别服务人工阅读、管道消费、程序对接与沉浸式交互。

## Requirements

### Requirement: 输出模式选择
系统 SHALL 支持 print、json、rpc 三种输出模式,并按 CLI 参数分派。

#### Scenario: 默认 print
- **WHEN** 用户未指定 `-o`
- **THEN** 系统以 print 模式输出,去除 Markdown 标记的纯文本流式呈现

#### Scenario: JSON 结构化输出
- **WHEN** 用户指定 `-o json`
- **THEN** 系统把每个 Agent 事件以一行 JSON（JSONL）写入 stdout,便于 `jq` 等工具消费

#### Scenario: RPC 程序对接
- **WHEN** 用户指定 `-o rpc`
- **THEN** 系统从 stdin 读取 JSONL 指令（message/exit）,将事件流以 JSONL 写回 stdout,提示走 stderr 不污染协议

### Requirement: 程序化通信协议
RPC 模式 SHALL 提供基于 stdin/stdout 的行式 JSON 协议,并安全处理退出。

#### Scenario: 消息收发
- **WHEN** 外部程序向 stdin 写入 `{"type":"message","content":"..."}`
- **THEN** 系统触发 agent.prompt 并把事件以 JSONL 输出到 stdout

#### Scenario: 优雅退出
- **WHEN** 收到 exit 请求或 stdin 关闭
- **THEN** 系统等待当前流式响应完成（agent_end）后再退出,避免截断进行中的响应

#### Scenario: 非法输入容错
- **WHEN** stdin 内容无法解析为 JSON 或携带未知消息类型
- **THEN** 系统向 stderr 写入人类可读错误并继续监听,不崩溃

### Requirement: 全屏 TUI 交互
系统 SHALL 在 `-i` 模式下启动全屏终端交互界面,提供输入、流式渲染、slash 命令与工具执行可视化。

#### Scenario: 全屏启动
- **WHEN** 用户以 TUI 模式启动
- **THEN** 系统进入 alt-screen 全屏渲染,并注册退出时的光标/屏幕恢复与信号清理

#### Scenario: 扩展命令入口
- **WHEN** 用户在 TUI 输入 `/命令名 args` 或以扩展命令名作为首词
- **THEN** 系统执行对应扩展命令,普通消息照常发送给 Agent

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

### Requirement: 撤回节点保留树形分支线
系统 SHALL 在 /tree 中对撤回节点保留与其他节点一致的分支线（└─/├─），仅以颜色降权区分。

#### Scenario: 撤回节点带分支线
- **WHEN** 一个被撤回的节点是其父的末位子节点
- **THEN** 该节点显示 └─ 分支线（灰色降权），层级与活跃节点一致
