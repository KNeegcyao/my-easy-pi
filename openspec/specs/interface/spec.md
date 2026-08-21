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