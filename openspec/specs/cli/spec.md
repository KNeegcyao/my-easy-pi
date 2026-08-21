# CLI 入口与配置

## Purpose

定义 my-easy-pi 的命令行入口、参数解析、分派逻辑,以及分层配置管理——CLI 参数、环境变量、用户配置、项目配置、默认值之间的优先级与解析规则。

## Requirements

### Requirement: 参数解析
系统 SHALL 使用纯函数 parseArgs 将命令行参数解析为结构化配置,不产生副作用。

#### Scenario: 单次消息
- **WHEN** 传入 `-m` / `--message` 参数
- **THEN** 解析结果携带对应文本作为本次要发送的消息

#### Scenario: 会话管理命令
- **WHEN** 传入 `-l` / `--list` 或 `--delete <id>`
- **THEN** 解析结果触发对应的会话列举或删除流程

#### Scenario: 帮助与输出模式
- **WHEN** 传入 `-o json` / `-o rpc` 或 `-h`
- **THEN** 解析结果按指定输出模式运行,或打印帮助文本并退出

### Requirement: 配置分层优先级
系统 SHALL 按下述顺序解析配置:CLI 参数 > 环境变量 > 用户配置 `~/.my-easy-pi/config.json` > 项目配置 `.my-easy-pi/settings.json` > 默认值。

#### Scenario: API 密钥解析
- **WHEN** 组合提供了环境变量与用户配置中的同一 provider 密钥
- **THEN** 系统采用环境变量优先级更高的值

#### Scenario: 默认提供商推断
- **WHEN** 未显式指定 provider
- **THEN** 系统依据已设置的环境变量推断(DEEPSEEK 优先,次 OpenAI,次 Anthropic),否则回退配置或 deepseek 默认

### Requirement: 模型装配前置校验
系统 SHALL 在进入主装配前完成 provider、model、apiKey 三类校验,确保所有常见启动错误在此一处可达。

#### Scenario: 无效 provider
- **WHEN** provider 不在 deepseek/anthropic/openai 中
- **THEN** 系统返回 PROVIDER_NOT_FOUND,不进入后续装配

#### Scenario: 缺 key 与缺模型
- **WHEN** 密钥缺失或模型不存在
- **THEN** 系统分别返回 AUTH_API_KEY_MISSING、MODEL_NOT_FOUND,并带修复建议

### Requirement: 运行模式分派
系统 SHALL 按解析结果在 TUI、print、json、rpc 四种运行模式间分派。

#### Scenario: 无参 TTY 进入 TUI
- **WHEN** 无参数、非管理命令且 stdin 为 TTY
- **THEN** 系统自动进入 TUI 交互模式

#### Scenario: JSON 模式错误格式化
- **WHEN** json 模式运行中发生 AppError
- **THEN** 系统以 [code] message + suggestion 形式输出并退出码为 1