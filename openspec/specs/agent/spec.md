# Agent 循环

## Purpose

定义 my-easy-pi 的核心运行循环:接收用户输入、流式调用 LLM、有监督地执行工具,并重复该过程直到 LLM 不再请求工具为止,全程以事件流对外暴露可观察的行为。

## Requirements

### Requirement: 消息驱动运行循环
The system SHALL 接受用户输入,将其作为 user 消息加入对话历史,并持续运行循环直至完成。

#### Scenario: 单轮普通对话
- **WHEN** 用户在非流式空闲状态下发送一条 user 消息
- **THEN** 系统调用模型流式生成一段 assistant 回复,期间若模型不请求工具
- **AND** 系统在该回合结束后结束整个 process,不再继续调用模型

#### Scenario: 工具迭代直至停止
- **WHEN** 模型在某个回合返回至少一个工具调用请求
- **THEN** 系统执行这些工具,把 toolResult 写回对话历史
- **AND** 继续下一个回合,直到某回合模型不再请求任何工具为止

### Requirement: 工具调用执行
系统 SHALL 执行模型请求的工具调用,并将文本结果与错误标记回填到对话历史。

#### Scenario: 工具正常执行
- **WHEN** 模型请求执行一个已注册工具
- **THEN** 系统调用该工具,把文本内容并入历史,isError 为 false
- **AND** 发出一条 tool_execution_start 与 tool_execution_end 事件

#### Scenario: 工具不存在
- **WHEN** 模型请求一个未注册的工具名
- **THEN** 系统把失败原因写入历史并标记 isError,且不中断整个循环

#### Scenario: 工具执行抛错
- **WHEN** 执行工具时抛出异常
- **THEN** 系统把异常信息作为工具结果回填历史并标记 isError
- **AND** 发出 tool_execution_end 事件,避免 UI 端 pending 工具悬挂

### Requirement: 工具后置终止
系统 SHALL 支持工具返回 terminate 标记以结束后续调用。

#### Scenario: 全部工具请求终止
- **WHEN** 某回合所有工具执行结果都携带 terminate=true
- **THEN** 系统在该回合结束后结束循环,不再发起新的 LLM 调用

### Requirement: 并发保护
系统 SHALL 拒绝在已有流式处理进行期间接收新的 prompt。

#### Scenario: 处理中再次发消息
- **WHEN** 当前已有 prompt 正在流式处理,又调用 prompt
- **THEN** 系统抛出一个 AGENT_ALREADY_STREAMING 错误

### Requirement: 取消与重置
系统 SHALL 支持中止当前操作并重置循环状态。

#### Scenario: 中止进行中处理
- **WHEN** 调用 abort
- **THEN** 系统中止底层模型流并结束流式标记

#### Scenario: 重置到初始态
- **WHEN** 调用 reset
- **THEN** 系统清空消息历史、错误、挂起工具与各类队列