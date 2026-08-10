# 配置与沙箱

> 对应源码：`src/config/`、`src/sandbox/`
> 最后更新：2026-08-08
> 适用版本：piagent v0.1.0

## 章节职责

本章介绍 piagent 的两个基础设施层：**配置管理** 和 **沙箱执行**。

- **配置层**（`src/config/`）负责管理系统配置，包括用户配置文件的读写、环境变量解析、API 密钥管理、日志记录以及初始化流程。
- **沙箱层**（`src/sandbox/`）负责安全执行 bash 命令，通过 Docker 容器隔离宿主机环境，并在 Docker 不可用时自动降级到本地执行。

## 文件列表

| 文件 | 职责 |
|------|------|
| `src/config/settings.ts` | `ConfigManager` 类，实现分层配置加载与 API 密钥管理 |
| `src/config/init.ts` | `pi --init` 初始化命令：创建配置、构建 Docker 镜像、检查环境 |
| `src/config/logger.ts` | 分层日志系统：访问日志、错误日志、审计日志，JSONL 格式，按天轮转 |
| `src/config/index.ts` | 配置层统一导出入口 |
| `src/sandbox/docker.ts` | `DockerSandbox` 类，Docker 沙箱执行器，含自动降级逻辑 |
| `src/sandbox/index.ts` | 沙箱层统一导出入口 |
| `src/tools/builtin/bash.ts` | bash 工具，集成沙箱执行命令 |
| `Dockerfile` | 沙箱镜像定义，基于 Alpine Linux |

## 本章内容

1. [01-config-manager.md](./01-config-manager.md) — 分层配置管理：ConfigManager 实现、配置加载优先级、API 密钥管理
2. [02-logger.md](./02-logger.md) — 日志系统：分级日志、JSONL 格式、按天轮转、审计日志
3. [03-docker-sandbox.md](./03-docker-sandbox.md) — Docker 沙箱：安全隔离、接口抽象、自动降级、bash 工具集成
4. [practice.md](./practice.md) — 本章练习：配置 API 密钥、查看日志、理解沙箱启动