# 工具层

## Purpose

定义 my-easy-pi 可调用的系统操作能力,并通过注入的 Operations 抽象保证工具与真实文件系统、进程、沙箱解耦,使同一套工具能在本地、测试与沙箱环境复用。

## Requirements

### Requirement: 内置工具清单
系统 SHALL 提供内置工具:bash、read、write、edit、grep、find、ls 共 7 个。

#### Scenario: 启动装配内置工具
- **WHEN** 通过 buildTools 装配工具注册表(注入 Operations 实现)
- **THEN** 注册表中注册上述 7 个内置工具

#### Scenario: 验证注入 Operations
- **WHEN** buildTools 未显式注入 Operations
- **THEN** 工具使用默认 LocalOperations 单例兜底

### Requirement: 系统操作抽象
系统 SHALL 通过 Operations 接口实现所有系统访问,工具不得直接访问真实文件系统、进程或沙箱。

#### Scenario: 本地实现覆盖各操作
- **WHEN** 使用 LocalOperations
- **THEN** bash 优先走可用沙箱,沙箱不可用时回退本地流式 spawn
- **AND** 文件操作走 fs/promises,搜索走 child_process,URL 抓取走全局 fetch

#### Scenario: 错误以返回值表达
- **WHEN** 任一 Operations 方法内部发生异常
- **THEN** 方法通过返回值(空串、错误字段、exitCode)表达错误,而非向调用方抛出未捕获异常

### Requirement: 工具注册表
系统 SHALL 提供 ToolRegistry,支持注册、注销、查询与列出工具。

#### Scenario: 注册与查询
- **WHEN** 调用 registerTool 注册一个工具
- **THEN** 可通过 getTool 按名称取回,listTools 列出包含它的完整列表

#### Scenario: 注销工具
- **WHEN** 调用 unregisterTool 移除一个已注册工具
- **THEN** 该工具不再被 getTool 返回,也不再出现在 listTools 中

### Requirement: 流式命令输出
系统 SHALL 在本地执行路径通过 onUpdate 回调把 stdout 分块透传给 UI。

#### Scenario: 沙箱输出流向 TUI
- **WHEN** 本地 shell 执行命令产出 stdout
- **THEN** 每个数据块以 onUpdate(chunk) 回调,同时累计到最终 stdout
- **AND** 跨平台使用 cmd.exe(Windows)或 /bin/sh(类 Unix)