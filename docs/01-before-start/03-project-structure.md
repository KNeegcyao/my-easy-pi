---
对应源码: src/ 目录整体
最后更新: 2026-08-08
适用版本: v0.1.0+
---

# 项目结构一览

> 在深入每个模块之前，先鸟瞰整个项目的结构。知道每一层负责什么、关键文件在哪，后续学习会顺畅很多。

---

## 1. 本节目标

- 了解 my-easy-pi 的顶层目录结构
- 理解 6 层架构的设计理念和每层职责
- 知道每个 `src/` 子目录包含什么文件、负责什么功能
- 能快速定位关键文件（cli.ts、loop.ts、types.ts 等）

---

## 2. 前置知识

- 完成"环境搭建"一节，项目已正常安装
- 了解 TypeScript 模块系统（import/export）

---

## 3. 核心概念

### 3.1 顶层目录

```
my-easy-pi/
├── src/                   # 源代码（核心）
│   ├── cli.ts             # 入口文件
│   ├── ai/                # AI 层
│   ├── agent/             # Agent 层
│   ├── tools/             # 工具层（7 个内置工具）
│   ├── tui/               # 全屏渲染器（renderer + layout + components）
│   ├── session/           # 会话层
│   ├── extension/         # 扩展层
│   ├── interface/         # 接口层（print / json / rpc 输出）
│   ├── config/            # 配置管理
│   └── sandbox/           # 沙箱层
│
├── tests/                 # 测试代码（31 个文件，347 个用例）
│   ├── tui/
│   └── unit/
│       ├── ai/
│       ├── agent/
│       ├── cli/
│       ├── config/
│       ├── extension/
│       └── tools/
│
├── docs/                  # 学习文档
├── examples/extensions/   # 扩展示例（自定义工具教学案例，如 web_fetch.ts）
├── scripts/               # 工具脚本
├── Dockerfile             # 沙箱镜像
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── vitest.config.ts       # 测试配置
└── README.md              # 项目总览
```

### 3.2 6 层架构概览

my-easy-pi 采用**分层架构**设计，共 6 个核心层 + 2 个辅助层：

```
┌──────────────────────────────────────────────────────┐
│  CLI 入口 (src/cli.ts)                                │
│  参数解析 · 模块组装 · 环境变量读取                    │
├──────────────────────────────────────────────────────┤
│  ⑥ 接口层 (src/interface/ + src/tui/)                │
│  Print · JSON · RPC 输出 · 全屏 TUI 渲染器           │
├──────────────────────────────────────────────────────┤
│  ⑤ Agent 层 (src/agent/)                             │
│  核心循环 · 状态管理 · 消息队列 · 权限控制             │
├──────────────────────────────────────────────────────┤
│  ④ 扩展层 (src/extension/)                           │
│  ExtensionAPI · Loader · 插件发现                     │
├──────────────────────────────────────────────────────┤
│  ③ 工具层 (src/tools/)                               │
│  ToolRegistry · 7 个内置工具                          │
├──────────────────────────────────────────────────────┤
│  ② 会话层 (src/session/)                             │
│  JSONL 持久化 · 会话管理 · 上下文压缩                  │
├──────────────────────────────────────────────────────┤
│  ① AI 层 (src/ai/)                                   │
│  ModelRegistry · 3 个 Provider · 重试 · 错误码        │
├──────────────────────────────────────────────────────┤
│  🐳 沙箱层 (src/sandbox/)                            │
│  Docker 容器化执行 · 自动降级回退                      │
│                                                      │
│  ⚙️ 配置层 (src/config/)                             │
│  分层配置管理 · 日志 · 初始化                          │
└──────────────────────────────────────────────────────┘
```

**核心设计原则：依赖漏斗**

```
上层依赖下层，下层绝不依赖上层
         ↓
  接口层 ──→ 依赖 Agent 层
  Agent 层 ──→ 依赖 AI 层 + 工具层
  工具层 ──→ 不依赖任何上层
  AI 层   ──→ 不依赖任何上层
         ↓
保证每一层可独立测试和替换
```

### 3.3 各层职责详解

#### ① AI 层（src/ai/）—— 大脑

> 屏蔽不同 LLM 提供商的 API 差异，提供统一的流式调用接口。

| 文件 | 职责 | 关键内容 |
|------|------|---------|
| `types.ts` | 核心类型定义 | `Model`、`LLMMessage`、`LLMEvent`、`ToolCall`、`AgentMessage` |
| `registry.ts` | 模型注册中心 | `ModelRegistry` — 管理 Provider 和 Model |
| `errors.ts` | 统一错误码 | `AppError` — 6 种错误类型，带友好提示 |
| `retry.ts` | 重试机制 | 指数退避重试（1s→2s→4s，最多 3 次） |
| `providers/anthropic.ts` | Anthropic Claude | Claude API 连接器 |
| `providers/deepseek.ts` | DeepSeek | DeepSeek API 连接器 |
| `providers/openai.ts` | OpenAI | OpenAI API 连接器 |

#### ② 会话层（src/session/）—— 记忆

> 管理会话的存储、恢复和分支，让 Agent 有"长期记忆"。

| 文件 | 职责 | 关键内容 |
|------|------|---------|
| `storage.ts` | JSONL 存储 | 追加写、树形结构（parentId） |
| `manager.ts` | 会话管理 | 创建/加载/删除/列会话 |
| `compaction.ts` | 上下文压缩 | 超过阈值自动压缩历史 |

#### ③ 工具层（src/tools/）—— 手脚

> 定义工具的注册、发现和执行机制，让 LLM 能"动手操作"。

| 文件 | 职责 | 关键内容 |
|------|------|---------|
| `registry.ts` | 工具注册表 | `ToolRegistry` — 注册/注销/查询/列出 |
| `builtin/bash.ts` | Shell 命令 | 执行任意 shell 命令 |
| `builtin/read.ts` | 文件读取 | 读取文件内容，支持行范围 |
| `builtin/write.ts` | 文件写入 | 写入文件，自动创建父目录 |
| `builtin/edit.ts` | 文本替换 | 精确字符串替换 |
| `builtin/grep.ts` | 关键词搜索 | 搜索文件内容 |
| `builtin/find.ts` | 文件查找 | 按名称查找文件 |
| `builtin/ls.ts` | 目录列表 | 列出目录内容 |

#### ④ 扩展层（src/extension/）—— 插件

> 提供插件化扩展能力，用户可以不修改内核就添加功能。

| 文件 | 职责 | 关键内容 |
|------|------|---------|
| `api.ts` | ExtensionAPI 接口 | `registerTool`、`registerCommand`、`on` |
| `loader.ts` | 扩展加载器 | 动态加载 .ts 扩展文件 |

#### ⑤ Agent 层（src/agent/）—— 中枢神经

> 管理 Agent 的生命周期，驱动 LLM 调用和工具执行。这是整个系统的核心。

| 文件 | 职责 | 关键内容 |
|------|------|---------|
| `loop.ts` | ⭐ Agent Loop | `Agent` 类 — 核心循环、工具执行、事件发射 |
| `state.ts` | 状态管理 | `AgentState` — 消息、模型、工具、流式状态 |
| `queue.ts` | 消息队列 | `MessageQueue` — Steering（高优先级）/ Follow-up（低优先级） |
| `permission.ts` | 权限控制 | 三级风险等级（SAFE / NORMAL / DANGEROUS） |
| `types.ts` | 类型定义 | `AgentTool extends Tool` — 在基础工具上加 execute |

#### ⑥ 接口层（src/interface/）—— 界面

> 提供多种交互方式，适配不同使用场景。

| 文件 | 职责 | 关键内容 |
|------|------|---------|
| `print.ts` | Print 模式 | 终端流式输出，适合管道使用 |
| `tui/index.ts` | TUI 模式 | 全屏交互界面，Alt Screen 模式 |
| `json.ts` | JSON 模式 | JSONL 事件流，适合程序消费 |
| `rpc.ts` | RPC 模式 | stdin/stdout 协议，供其他语言嵌入 |

#### 辅助层

| 层 | 目录 | 职责 |
|----|------|------|
| 配置层 | `src/config/` | 分层配置管理（`settings.ts`）、日志（`logger.ts`）、初始化（`init.ts`） |
| 沙箱层 | `src/sandbox/` | Docker 容器化执行（`docker.ts`），资源受限，自动降级回退 |

### 3.4 关键文件速览

| 文件 | 重要性 | 一句话说明 |
|------|--------|-----------|
| `src/cli.ts` | ⭐⭐⭐ | 项目入口，解析参数、组装模块、启动界面 |
| `src/ai/types.ts` | ⭐⭐⭐ | 核心类型定义，所有模块都依赖此文件 |
| `src/agent/loop.ts` | ⭐⭐⭐ | Agent 核心循环，整个系统的"大脑" |
| `src/ai/registry.ts` | ⭐⭐ | 模型注册中心，管理多个 LLM 提供商 |
| `src/tools/registry.ts` | ⭐⭐ | 工具注册表，管理所有可用工具 |
| `src/session/manager.ts` | ⭐⭐ | 会话管理，负责持久化 |
| `src/extension/api.ts` | ⭐⭐ | 扩展系统接口，插件化入口 |
| `src/config/settings.ts` | ⭐⭐ | 分层配置管理，CLI > 环境变量 > 配置文件 |

### 3.5 与代码的对应关系

每一层内部的代码组织遵循相同的模式：

```
src/ai/                  # 其他层结构类似
├── index.ts             # 统一导出（所有外部模块只通过 index.ts 导入）
├── types.ts             # 本层核心类型定义
├── registry.ts          # 本层注册中心（如果有）
├── errors.ts            # 本层错误处理（如果有）
└── providers/           # 本层子模块（如果有）
    ├── anthropic.ts     # 每个子模块文件
    ├── deepseek.ts
    └── openai.ts
```

**关键约定**：
- 每层都有一个 `index.ts` 统一导出，外部模块只能通过 `index.ts` 导入
- 类型定义遵循"渐进扩展"模式：基础类型在 `ai/types.ts` 中定义，上层扩展
- 所有模块通过 `index.ts` 的**统一导出**暴露接口，不直接引用内部文件

---

## 4. 代码实现

本节不涉及代码修改，但可以快速验证你对结构的理解：

```bash
# 查看 src 目录结构
ls -la src/

# 查看 AI 层文件
ls -la src/ai/

# 查看工具层内置工具
ls -la src/tools/builtin/

# 查看测试文件
ls -la tests/unit/
```

---

## 5. 运行与验证

可以运行以下命令，验证你对项目结构的理解：

```bash
# 确认所有 src/ 子目录存在
echo "src/ 目录数: $(ls -d src/*/ | wc -l)"

# 确认测试目录存在
echo "测试文件数: $(find tests/ -name '*.test.ts' | wc -l)"

# 确认核心文件存在
for f in src/cli.ts src/ai/types.ts src/agent/loop.ts src/tools/registry.ts; do
  echo "$f: $(test -f $f && echo '✅' || echo '❌')"
done
```

---

## 6. 小结

### 本节要点

- my-easy-pi 采用 **6 层分层架构**：AI 层 → 会话层 → 工具层 → 扩展层 → Agent 层 → 接口层
- **依赖漏斗**原则：上层依赖下层，下层绝不依赖上层
- 每层都有 `index.ts` 统一导出，外部模块只能通过 `index.ts` 导入
- 核心文件包括：`cli.ts`（入口）、`types.ts`（类型）、`loop.ts`（核心循环）
- 辅助层：配置层（分层配置）、沙箱层（Docker 容器化）
- 测试覆盖 8 个文件、34 个测试用例

### 思考题

1. 为什么每层都要有一个 `index.ts` 文件做统一导出？直接 `import` 内部文件有什么问题？

2. 如果要把"工具层"做得更独立，可以把它拆成一个独立的 npm 包，你觉得需要修改哪些代码？

3. 观察 `src/agent/` 目录下的文件，它包含了 `loop.ts`（核心循环）、`queue.ts`（消息队列）、`permission.ts`（权限控制）。这些功能如果分散到不同的层，你觉得合理吗？为什么？

4. 想象一下数据流：用户在 TUI 中输入"读文件"，数据经过哪些层？最终如何回到用户屏幕上？画出你的理解。

---

> ← [上一节](./02-environment-setup.md) · [下一节](../02-ai-layer/README.md) →
>
> [📚 返回章节首页](../01-before-start/README.md)