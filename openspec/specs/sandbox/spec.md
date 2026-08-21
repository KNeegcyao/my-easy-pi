# 沙箱执行

## Purpose

定义 my-easy-pi 对 shell 命令的安全执行隔离能力:优先在受资源约束的 Docker 容器内执行命令,并在 Docker 不可用时自动回退到本地执行,以便在保留隔离安全性的同时不阻断命令运行。

## Requirements

### Requirement: 可用性探测
系统 SHALL 探测 Docker 运行环境是否可用,并缓存检测结果以避免重复探测。

#### Scenario: 容器可用
- **WHEN** 调用方查询 sandbox 可用性,且当前主机 Docker 正常运行
- **THEN** 返回可用，并缓存该结果；后续查询不再重新探测

#### Scenario: 容器不可用
- **WHEN** Docker 不可用(如未安装、daemon 未启动或超时）
- **THEN** 返回不可用，并将后续命令执行回退到本地路径

### Requirement: 镜像就绪
执行命令前,系统 SHALL 确保沙箱镜像已存在,缺失时尝试构建。

#### Scenario: 镜像存在
- **WHEN** 查询到沙箱镜像已在本地
- **THEN** 直接复用镜像，无需重新构建

#### Scenario: 镜像缺失构建
- **WHEN** 沙箱镜像不存在且 Docker 可用
- **THEN** 系统从项目 Dockerfile 构建镜像；构建失败则标记 sandbox 不可用并回退

### Requirement: 受限执行
在容器内执行命令时,系统 SHALL 施加资源限制以隔离并约束命令行为。

#### Scenario: 容器资源约束
- **WHEN** 一条命令被放入沙箱容器执行
- **THEN** 容器以内存 512m、单核 CPU、50 个 PID 上限、只读文件系统、受控 /tmp 运行
- **AND** 命令经 base64 编码后传入，避免 shell 转义与注入

#### Scenario: 命令注入防护
- **WHEN** 组装执行命令
- **THEN** 系统使用 spawn 参数数组而非 shell 字符串拼接,避免注入 Docker CLI 本身

### Requirement: 就地回退
Docker 执行失败或不可用时,系统 SHALL 在本地直接执行命令。

#### Scenario: 回退本地执行
- **WHEN** Docker 不可用或容器执行抛错
- **THEN** 命令以本地 `/bin/sh -c` 方式运行,并将结果标记 runtime 为 local

#### Scenario: 结果运行时标记
- **WHEN** 命令完成后返回结果
- **THEN** 结果携带 runtime 字段,区分 docker 与 local 两种实际执行环境

### Requirement: 执行结果契约
沙箱执行 SHALL 返回包含 stdout、stderr 与 exitCode 的结果并进行必要的输出上限保护。

#### Scenario: 输出上限截断
- **WHEN** 容器 stdout 累计超过 10MB
- **THEN** 系统终止子进程并返回已截断的 stdout，标记非零退出码，防止内存溢出

#### Scenario: 资源清理
- **WHEN** 调用清理
- **THEN** 系统按容器名前缀移除残留的动态容器;清理失败不中断主流程