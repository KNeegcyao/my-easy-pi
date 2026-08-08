# piagent 学习文档计划

## 概述

为 piagent 项目创建一套完整的**中文学习文档**，像 GitHub 上流行的教学项目（如 `pguso/ai-agents-from-scratch`、`ShiboSusu/LLM-from-scratch`）一样，采用**按模块分章节、逐步深入**的结构，让学习者可以跟着文档从零理解并自己实现一个 AI Coding Agent。

---

## 当前状态分析

### 已存在的文档
- `README.md` — 项目总览、特性列表、快速开始、架构图、使用指南
- `pi-agent-architecture.md` — 详细的 6 层架构设计文档（含类型定义、流程图）

### 缺少的内容
- ❌ 没有分章节的渐进式学习路径
- ❌ 没有每个模块的"从原理到代码"讲解
- ❌ 没有动手练习/项目实践
- ❌ 没有按模块组织的 docs/ 目录
- ❌ 没有代码注释风格的学习引导

---

## 计划创建的文档结构

```
docs/
├── README.md                          # 学习路线图总览
│
├── 01-before-start/                   # 前置准备
│   ├── README.md                      # 本章概览
│   ├── 01-what-is-coding-agent.md     # AI Coding Agent 是什么？
│   ├── 02-environment-setup.md        # 环境搭建（Node.js、TypeScript、依赖安装）
│   └── 03-project-structure.md        # 项目结构一览
│
├── 02-ai-layer/                       # 第2章：AI 层（基础）
│   ├── README.md                      # 本章概览
│   ├── 01-core-types.md               # 核心类型：Tool、AgentMessage、Model
│   ├── 02-model-interface.md          # Model 抽象接口与 AsyncIterable 流
│   ├── 03-provider-pattern.md         # 策略模式：ProviderFactory
│   ├── 04-model-registry.md           # 模型注册中心：ModelRegistry
│   ├── 05-error-handling.md           # 统一错误码：AppError
│   ├── 06-retry-mechanism.md          # 指数退避重试：fetchWithRetry
│   └── practice.md                    # 本章练习
│
├── 03-agent-layer/                    # 第3章：Agent 层（核心）
│   ├── README.md                      # 本章概览
│   ├── 01-agent-loop.md               # ⭐ 核心：Agent Loop 详解
│   ├── 02-state-management.md         # 状态管理：AgentState
│   ├── 03-message-queue.md            # 消息队列：Steering / Follow-up
│   ├── 04-permission-system.md        # 权限系统：三级风险控制
│   ├── 05-event-system.md             # 事件驱动：subscribe/emit 模式
│   └── practice.md                    # 本章练习
│
├── 04-tools-layer/                    # 第4章：工具层
│   ├── README.md                      # 本章概览
│   ├── 01-tool-registry.md            # 工具注册与发现：ToolRegistry
│   ├── 02-bash-tool.md                # 工具实现：bash（含沙箱集成）
│   ├── 03-file-tools.md               # 工具实现：read / write / edit
│   ├── 04-search-tools.md             # 工具实现：grep / find / ls
│   └── practice.md                    # 本章练习：自己写一个工具
│
├── 05-session-layer/                  # 第5章：会话层
│   ├── README.md                      # 本章概览
│   ├── 01-session-manager.md          # 会话管理：CRUD 操作
│   ├── 02-jsonl-storage.md            # JSONL 存储格式与追加写
│   ├── 03-context-compaction.md       # 上下文压缩：Compactor
│   └── practice.md                    # 本章练习
│
├── 06-extension-layer/                # 第6章：扩展层
│   ├── README.md                      # 本章概览
│   ├── 01-extension-api.md            # ExtensionAPI 接口设计
│   ├── 02-extension-loader.md         # 扩展发现与加载
│   └── practice.md                    # 本章练习：写一个扩展
│
├── 07-interface-layer/                # 第7章：接口层
│   ├── README.md                      # 本章概览
│   ├── 01-print-mode.md               # Print 模式：终端输出
│   ├── 02-json-mode.md                # JSON 模式：事件流
│   ├── 03-rpc-mode.md                 # RPC 模式：进程间通信
│   ├── 04-tui.md                      # TUI 模式：全屏交互
│   └── practice.md                    # 本章练习
│
├── 08-config-and-sandbox/            # 第8章：配置与沙箱
│   ├── README.md                      # 本章概览
│   ├── 01-config-manager.md           # 分层配置管理
│   ├── 02-logger.md                   # 日志系统
│   ├── 03-docker-sandbox.md           # Docker 沙箱
│   └── practice.md                    # 本章练习
│
├── 09-putting-it-together/            # 第9章：串联一切
│   ├── README.md                      # 本章概览
│   ├── 01-cli-entry.md                # CLI 入口：组装所有模块
│   ├── 02-end-to-end-flow.md          # ⭐ 完整请求链路追踪
│   └── practice.md                    # 本章练习
│
├── 10-advanced-topics/                # 第10章：进阶主题
│   ├── README.md                      # 本章概览
│   ├── 01-adding-new-tool.md          # 实践：添加一个自定义工具
│   ├── 02-adding-new-provider.md      # 实践：接入新的 LLM 提供商
│   ├── 03-creating-extension.md       # 实践：创建并发布扩展
│   └── 04-testing.md                  # 测试：单元测试与集成测试
│
└── assets/                            # 资源文件
    ├── images/                        # 图片
    └── diagrams/                      # 架构图源文件
```

---

## 每章文档格式规范

每篇文档统一采用以下格式：

```markdown
# 标题

## 1. 本节目标
- 学完本节你能理解什么
- 学完本节你能做什么

## 2. 前置知识
- 需要了解的前置概念

## 3. 核心概念
- 用通俗语言解释原理
- 配合类比/示意图

## 4. 代码实现
- 关键代码片段（带详细注释）
- 逐行解释

## 5. 运行与验证
- 如何运行/测试
- 预期输出

## 6. 小结
- 本节要点回顾
- 思考题
```

---

## 现有文档利用

- `README.md` → 保留不动，作为项目首页
- `pi-agent-architecture.md` → 作为 docs/ 的**附录**或**参考资料**，不重复创建

---

## 实施步骤

### 第1步：创建 docs/ 目录结构和 README.md
- 创建 `docs/` 目录
- 创建 `docs/README.md`（学习路线图总览）
- 创建 `docs/assets/` 目录

### 第2步：创建 01-before-start/ （3 篇文档）
- 前置准备章节

### 第3步：创建 02-ai-layer/ （7 篇文档）
- AI 层完整讲解

### 第4步：创建 03-agent-layer/ （6 篇文档）
- Agent 层核心讲解，重点在 Agent Loop

### 第5步：创建 04-tools-layer/ （5 篇文档）
- 工具层讲解

### 第6步：创建 05-session-layer/ （4 篇文档）
- 会话层讲解

### 第7步：创建 06-extension-layer/ （3 篇文档）
- 扩展层讲解

### 第8步：创建 07-interface-layer/ （5 篇文档）
- 接口层讲解

### 第9步：创建 08-config-and-sandbox/ （4 篇文档）
- 配置与沙箱

### 第10步：创建 09-putting-it-together/ （3 篇文档）
- 串联所有模块

### 第11步：创建 10-advanced-topics/ （5 篇文档）
- 进阶主题与练习

---

## 关键设计决策

1. **使用中文编写** — 降低学习门槛，与国内开发者群体匹配
2. **每篇文档独立可读** — 不假设读者读过前文，但提供推荐阅读顺序
3. **代码片段为主** — 不贴完整文件，只展示关键代码并逐行解释
4. **每章末尾有练习** — 动手实践题，巩固所学
5. **从底层到顶层** — 按 AI 层 → Agent 层 → 工具层 → 会话层 → 扩展层 → 接口层 → 配置的顺序，逐步构建
6. **复用现有文档** — 不重复创建 README.md 和 pi-agent-architecture.md 中已有的内容

---

## 验证方式

- 文档创建完成后，在仓库根目录执行 `ls docs/` 确认目录结构完整
- 检查每个文档的文件头格式一致性
- 确认所有跨文档链接可用