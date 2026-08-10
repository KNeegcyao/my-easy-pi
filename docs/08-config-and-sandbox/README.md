# 配置与沙箱

| 元信息 | 内容 |
|--------|------|
| 对应源码 | `src/config/`、`src/sandbox/` |
| 最后更新 | 2026-08-10 |
| 适用版本 | piagent v0.1.0 |

---

## 1. 本章学习目标

完成本章学习后，你应该能够：

- **理解分层配置架构**：掌握 CLI 参数、环境变量、用户配置、项目配置、默认值五层加载优先级
- **管理 API 密钥**：通过配置文件和环境变量两种方式设置提供商密钥，并理解优先级规则
- **使用日志系统**：理解日志分级（debug/info/warn/error）、JSONL 格式、按天轮转和审计日志
- **理解沙箱隔离原理**：掌握 Docker 沙箱的安全机制（网络隔离、只读文件系统、资源限制）
- **掌握透明降级机制**：理解沙箱不可用时如何自动回退到本地执行且不影响主流程
- **理解配置与工具层的协作**：了解 bash 工具如何集成沙箱，审计日志如何记录工具调用

---

## 2. 架构总览

### 2.1 配置层和沙箱层的定位

配置层和沙箱层是 piagent 的 **基础设施层**，位于架构的最底层，为上层所有模块提供服务。

```
┌──────────────────────────────────────────────────────────────┐
│                    piagent 分层架构                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Interface 层 (07)                     │   │
│  │         Print / JSON / RPC / TUI                     │   │
│  └─────────────────────────┬────────────────────────────┘   │
│                            │                                 │
│  ┌─────────────────────────▼────────────────────────────┐   │
│  │                   Agent 层 (03)                      │   │
│  │           Agent Loop · 状态管理 · 队列 · 权限        │   │
│  └────────┬──────────────┬──────────────┬───────────────┘   │
│           │              │              │                    │
│  ┌────────▼──┐  ┌───────▼───────┐  ┌───▼────────────┐      │
│  │  AI 层   │  │  工具层       │  │  会话层        │      │
│  │  (02)    │  │  (04)         │  │  (05)          │      │
│  │ LLM 调用 │  │ Bash/FS/Git   │  │ 持久化         │      │
│  └──────────┘  └───────┬───────┘  └────────────────┘      │
│                        │                                    │
│         ┌──────────────┴──────────────┐                     │
│         │                             │                     │
│  ┌──────▼──────┐              ┌──────▼──────┐              │
│  │  配置层     │              │  沙箱层     │              │
│  │  (08)      │◄─────────────┤  (08)      │              │
│  │  Config    │  使用配置     │  Docker     │              │
│  │  Logger    │               │  Local 降级  │              │
│  └─────────────┘              └─────────────┘              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 核心职责

- **配置层**（`src/config/`） — 为所有上层模块提供统一的配置读取能力，包括用户配置文件读写、环境变量解析、API 密钥管理、日志系统和初始化流程。它是 piagent 启动时第一个被初始化的模块。
- **沙箱层**（`src/sandbox/`） — 为 bash 工具提供安全的命令执行环境。通过 Docker 容器隔离宿主机，防止恶意命令影响系统安全。当 Docker 不可用时，自动降级到本地执行，保证工具层的功能不受影响。

### 2.3 核心设计原则

#### 分层配置优先级

```
 高                    1. CLI 参数 (--model, --provider ...)
 优                      │
 先                      ▼
 级                2. 环境变量 (DEEPSEEK_API_KEY, ANTHROPIC_API_KEY ...)
                        │
                        ▼
                  3. 用户配置 (~/.piagent/config.json)
                        │
                        ▼
                  4. 项目配置 (.piagent/settings.json)
                        │
                        ▼
                  5. 硬编码默认值 (fallbackModel)
 低
```

每个配置项从高优先级层读取，找到即返回。这种设计让用户可以灵活地在不同层级覆盖配置，而不需要修改所有层的配置。

#### 安全隔离原则

沙箱层遵循 **纵深防御** 的安全设计理念：

- **网络隔离**：`--network none` 禁止容器访问外部网络
- **文件系统隔离**：`--read-only` 禁止容器写入持久化存储（除 `/tmp`）
- **资源限制**：`--memory 512m`、`--cpus 1`、`--pids-limit 50` 防止资源耗尽攻击
- **命令编码**：通过 base64 编码传递命令，彻底避免 shell 注入 Docker 命令本身
- **非 root 运行**：容器内使用专有 `sandbox` 用户运行，非 root 权限
- **自动清理**：容器退出时自动删除（`--rm`），不留残留

#### 透明降级原则

沙箱层遵循 **功能可用性优先于安全隔离** 的设计哲学：

```
checkDocker() ──┬── 可用 ──► executeInDocker() ──┬── 成功 ──► 返回沙箱结果
                │                                  │
                │                                  └── 失败 ──┐
                └── 不可用 ────────────────────────────────────┤
                                                               ▼
                                                     executeLocal() ◄── 降级
                                                               │
                                                               ▼
                                                      返回本地结果
                                                        (runtime: 'local')
```

降级对上层调用者完全透明 —— 调用者通过 `result.runtime` 字段获知实际执行环境，但不需要为此调整自己的逻辑。

#### 日志分离原则

日志系统采用 **三层分离** 设计，通过不同的日志文件隔离不同用途的记录：

| 日志类型 | 文件 | 用途 | 终端输出 |
|----------|------|------|----------|
| 访问日志 | `access-YYYY-MM-DD.jsonl` | 记录程序运行事件 | 是 |
| 错误日志 | `error-YYYY-MM-DD.jsonl` | 记录错误信息 | 是 |
| 审计日志 | `audit-YYYY-MM-DD.jsonl` | 记录关键操作（如工具执行） | 否 |

审计日志不输出到终端，而是写入文件。这确保了安全审计记录的完整性——即使终端输出被忽略或被截断，审计日志仍然完整可查。

---

## 3. 文件列表

| 文件 | 职责 | 重要性 |
|------|------|--------|
| `src/config/settings.ts` | `ConfigManager` 类 — 分层配置加载、API 密钥管理、配置文件的读写保存 | ⭐⭐⭐ |
| `src/config/logger.ts` | 日志系统 — 四级日志分级（debug/info/warn/error）、JSONL 格式输出、按天自动轮转、审计日志 | ⭐⭐⭐ |
| `src/config/init.ts` | `pi --init` 初始化命令 — 创建用户配置目录与文件、构建 Docker 沙箱镜像、检查 Node.js/Docker/API Keys 环境 | ⭐⭐ |
| `src/config/index.ts` | 配置层统一导出入口 | ⭐ |
| `src/sandbox/docker.ts` | `DockerSandbox` 类 — Docker 沙箱执行器、自动降级到本地、单例工厂函数、启动/停止/清理 | ⭐⭐⭐ |
| `src/sandbox/index.ts` | 沙箱层统一导出入口 | ⭐ |
| `src/tools/builtin/bash.ts` | bash 工具 — 示例：沙箱如何被工具层消费、审计日志记录每次工具调用 | ⭐⭐ |
| `Dockerfile` | 沙箱镜像定义 — 基于 Alpine Linux，安装 bash/coreutils/grep/curl/git 等最小工具集 | ⭐ |

---

## 4. 配置加载优先级详解

### 4.1 五层模型

`ConfigManager` 实现了标准的 **分层配置加载** 模式：

```typescript
// 1. 项目配置（最低优先级） — 项目级默认值
this.projectConfig = await this.loadFile(PROJECT_CONFIG_PATH)  // .piagent/settings.json

// 2. 用户配置（中等优先级）
this.userConfig = await this.loadFile(USER_CONFIG_PATH)  // ~/.piagent/config.json

// 3. 合并：项目配置为底，用户配置覆盖
Object.assign(merged, this.projectConfig)
Object.assign(merged, this.userConfig)
```

> CLI 参数和环境变量由调用的上层代码处理，ConfigManager 不直接管理它们，而是通过 `getApiKey()` 和 `getDefaultProvider()` 在读取时检查环境变量。

### 4.2 API 密钥管理的两层优先级

API 密钥的加载逻辑展示了配置优先级的实际应用：

```typescript
getApiKey(provider: string): string | undefined {
  // 第一优先级：环境变量
  const envMap = { deepseek: 'DEEPSEEK_API_KEY', anthropic: 'ANTHROPIC_API_KEY', ... }
  if (envVar && process.env[envVar]) return process.env[envVar]

  // 第二优先级：用户配置文件
  return this.userConfig.apiKeys?.[provider]
}
```

这种设计的意图：
- **环境变量**适合 CI/CD 和服务器部署（不写文件到磁盘）
- **配置文件**适合日常开发（一次配置永久生效）
- 当两者冲突时，环境变量胜出，这符合"敏感信息最短停留时间"的安全原则

---

## 5. 沙箱层与工具层的关系

沙箱层本身不是一个独立的模块——它的存在是为了被 **工具层** 消费。最典型的使用场景是 bash 工具：

### 5.1 调用链路

```
Agent Loop (src/agent/loop.ts)
       │
       │  检测到 LLM 要调用 bash 工具
       ▼
bash 工具 (src/tools/builtin/bash.ts)
       │
       │  1. 调用 getSandbox() 获取沙箱单例
       │  2. 调用 sandbox.isAvailable() 检查 Docker
       │  3. 发送执行状态通知（onUpdate）
       │  4. 调用 sandbox.execute(command, timeout)
       ▼
DockerSandbox (src/sandbox/docker.ts)
       │
       ├── Docker 可用 ──► docker run --rm ... base64-decode | sh
       │
       └── Docker 不可用 ──► /bin/sh -c <command> (本地执行)
```

### 5.2 审计日志示例

每次 bash 工具被调用，都会记录一条审计日志：

```json
{"timestamp":"2026-08-10T10:30:00.000Z","level":"info","message":"tool_execution",
 "tool":"bash","command":"ls -la","exitCode":0,"runtime":"docker"}
```

### 5.3 设计要点

- **延迟初始化**：沙箱实例在首次使用时才创建（`getSandbox()` 单例工厂），不影响 piagent 启动速度
- **惰性检测**：`isAvailable()` 只在首次调用时运行 `docker info`，结果被缓存到 `available` 字段
- **异常安全**：Docker 执行过程中任何异常都会被捕获并触发降级，不会向工具层抛出未处理错误
- **输出限流**：`spawnAndCollect` 对 stdout 做 10MB 上限保护，防止恶意命令导致内存溢出

---

## 6. 前置知识

在阅读本章前，请确保已了解：

- **TypeScript 基础知识**：类、接口、async/await、模块导入/导出
- **Node.js 基础知识**：`process.env`、`fs/promises`、`child_process` 模块
- **Docker 基础概念**：容器、镜像、`docker run`/`docker build` 命令
- **[AI 层](../02-ai-layer/README.md)** 的核心概念（可选，主要用于理解 bash 工具如何被 Agent 调用）
- **[Agent 层](../03-agent-layer/README.md)** 的 Agent Loop 概念（可选，理解工具执行的上下文）
- **[工具层](../04-tools-layer/README.md)** 的 AgentTool 接口（有助于理解 bash 工具在工具层中的定位）

---

## 7. 阅读顺序

1. **[01-config-manager.md](./01-config-manager.md)** — ⭐ 分层配置管理：ConfigManager 实现、配置加载优先级、API 密钥管理（最核心的文档）
2. **[02-logger.md](./02-logger.md)** — 日志系统：分级日志、JSONL 格式、按天轮转、审计日志
3. **[03-docker-sandbox.md](./03-docker-sandbox.md)** — ⭐ Docker 沙箱：安全隔离、接口抽象、自动降级、bash 工具集成（核心设计文档）
4. **[practice.md](./practice.md)** — 本章练习：配置 API 密钥、查看日志、理解沙箱启动

---

## 8. 小结

配置层和沙箱层虽然位于架构的底部，却是 piagent 能够稳定、安全运行的基础。配置层的分层设计让用户可以灵活定制行为方式，沙箱层的隔离和降级机制让 bash 工具可以安全地在各种环境中执行。理解这两个模块的设计哲学，有助于你更深入地理解 piagent 的"安全优先、灵活降级"的工程理念。

### 思考题

1. 配置层为什么要采用"覆盖"而不是"合并"策略？如果用户配置只写了 `apiKeys`，项目配置中的 `defaultProvider` 会丢失吗？
2. 沙箱的 `--read-only` 模式如何与 `--tmpfs` 配合使用？为什么不直接允许写 `/tmp` 目录？
3. 如果需要在沙箱中访问宿主机的网络（例如 `npm install`），除了修改 `--network`，还需要考虑哪些安全问题？
4. 降级到本地执行时，失去了哪些安全保护？如何通过日志发现当前是否处于降级状态？

> ← [📚 返回学习指南](../README.md) · [下一章](../09-putting-it-together/README.md) →
>
> → 下一篇: [01-config-manager.md](./01-config-manager.md)