<p align="center">
  <img src="./assets/banner.png" alt="MY EASY PI" width="800">
</p>

<p align="center">
  <h1 align="center">piagent</h1>
  <p align="center">轻量级 AI 编程助手 · AI Coding Agent</p>
  <p align="center">
    <a href="#-快速开始">快速开始</a>
    ·
    <a href="#-使用指南">使用指南</a>
    ·
    <a href="#-架构">架构</a>
    ·
    <a href="#-开发">开发</a>
    ·
    <a href="#-生产加固">生产加固</a>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Coverage-34%20tests%20passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/CI-Passing-brightgreen?logo=githubactions" alt="CI">
</p>

---

**piagent** 是一个从零搭建的 AI 编程助手（Coding Agent），类似简化版的 [Claude Code](https://claude.ai) / [Cursor](https://cursor.sh)。它展示了如何通过 **6 层分层架构**将大语言模型（LLM）与工具调用系统有机结合，实现一个可投入团队内部使用的 AI 助手。

---

## ✨ 特性

| 特性 | 说明 |
|------|------|
| 🤖 **多 LLM 提供商** | 支持 DeepSeek（默认）、Anthropic Claude、OpenAI，策略模式可扩展 |
| 🔧 **7 个内置工具** | bash、read、write、edit、grep、find、ls，覆盖日常开发操作 |
| 🖥️ **全屏 TUI** | 仿 Claude Code 的交替屏幕（Alt Screen）模式，输入/输出区域分离 |
| 📁 **会话持久化** | JSONL 格式自动保存，支持 `pi -c` 恢复上次会话 |
| 🔒 **三级权限系统** | SAFE / NORMAL / DANGEROUS 风险控制 + TTY 检测 |
| 📦 **Docker 沙箱** | 可选容器化执行，资源受限隔离主机，不可用时自动回退本地 |
| 🔌 **扩展系统** | ExtensionAPI 支持自定义工具注册，无需修改内核 |
| 📊 **三种输出模式** | Print（人类可读）、JSON（JSONL 事件流）、RPC（进程间通信） |
| ⚙️ **分层配置** | CLI > 环境变量 > 用户配置 > 项目配置 > 默认值 |
| 🛡️ **专业错误处理** | 统一错误码 + 指数退避重试 + JSONL 日志审计 |

---

## 📦 安装

### 前置要求

- **Node.js** >= 22
- **npm** >= 10

### 本地安装

```bash
# 克隆仓库
git clone https://github.com/KNeegcyao/my-easy-pi.git
cd my-easy-pi

# 安装依赖
npm install

# 类型检查
npx tsc --noEmit
```

### 配置全局命令

```bash
# 推荐：一键初始化（创建配置文件 + 构建沙箱 + 环境检查）
npx tsx src/cli.ts --init

# 或手动设置别名
echo 'alias pi="npx tsx $(pwd)/src/cli.ts"' >> ~/.zshrc
source ~/.zshrc
```

### 设置 API 密钥

```bash
# 方式一：环境变量（推荐，优先级高）
export DEEPSEEK_API_KEY=sk-xxxx        # DeepSeek（默认提供商）
export ANTHROPIC_API_KEY=sk-ant-xxxx   # Anthropic Claude
export OPENAI_API_KEY=sk-xxxx          # OpenAI

# 方式二：配置文件（pi --init 自动创建，编辑 ~/.piagent/config.json）
```

---

## 🚀 快速开始

```bash
# 一键启动全屏 TUI（最常用的方式）
pi

# 直接问答
pi -m "解释一下 JavaScript 的闭包"

# 管道模式——让 AI 处理文件内容
cat package.json | pi -p "分析依赖关系"

# 继续上次会话
pi -c

# 列出所有会话
pi -l

# 删除指定会话
pi --delete session-1746000000000

# 指定模型和提供商
pi -m "你好" --provider anthropic --model claude-sonnet-4-20250514
```

---

## 📖 使用指南

### 命令行参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `-m, --message` | 直接输入消息 | `pi -m "你好"` |
| `-p, --prompt` | 管道模式指令 | `cat file \| pi -p "翻译"` |
| `-c, --continue` | 继续上次会话 | `pi -c` |
| `-l, --list` | 列出所有会话 | `pi -l` |
| `--delete <id>` | 删除指定会话 | `pi --delete session-xxx` |
| `--init` | 初始化配置和沙箱 | `pi --init` |
| `-o, --output` | 输出模式 | `pi -m "hi" -o json` |
| `--model <id>` | 指定模型 ID | `pi -m "hi" --model gpt-4o` |
| `--provider <name>` | 指定提供商 | `pi -m "hi" --provider openai` |
| `-h, --help` | 查看帮助 | `pi -h` |

### TUI Slash 命令

在全屏 TUI 模式下，输入 `/` 开头执行以下命令：

| 命令 | 功能 |
|------|------|
| `/help` | 显示帮助信息 |
| `/model` | 查看当前模型信息 |
| `/cost` | 查看 Token 使用统计 |
| `/clear` | 清屏 |
| `/exit` | 退出程序 |

### 输出模式

| 模式 | 用途 | 示例 |
|------|------|------|
| `print`（默认） | 人类可读的流式终端输出 | `pi -m "你好"` |
| `tui` | 全屏交替屏幕交互模式 | `pi` 或 `pi -i` |
| `json` | JSONL 事件流，适合程序消费 | `pi -m "hello" -o json \| jq '.type'` |
| `rpc` | stdin/stdout 协议，供其他语言嵌入 | 参见 RPC 协议文档 |

### 支持的 LLM 提供商

| 提供商 | 默认模型 | 环境变量 | 配置方式 |
|--------|---------|---------|---------|
| **DeepSeek** | `deepseek-chat` | `DEEPSEEK_API_KEY` | 默认 |
| **Anthropic** | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` | `--provider anthropic` |
| **OpenAI** | `gpt-4o` | `OPENAI_API_KEY` | `--provider openai` |

### 环境变量（优先级高于配置文件）

```
DEEPSEEK_API_KEY     DeepSeek API 密钥
ANTHROPIC_API_KEY    Anthropic API 密钥
OPENAI_API_KEY       OpenAI API 密钥
```

配置文件路径：`~/.piagent/config.json`（可用 `apiKeys` 字段存储密钥）

---

## 🏗 架构

### 6 层分层设计

```
┌──────────────────────────────────────────────────┐
│ ⑧ CLI 入口 (src/cli.ts)                          │
│   参数解析 · 模块组装 · 环境变量读取                 │
├──────────────────────────────────────────────────┤
│ ⑥ 接口层 (src/interface/)                        │
│   Print 模式 · TUI 交互 · JSON 输出 · RPC 协议     │
├──────────────────────────────────────────────────┤
│ ⑤ Agent 层 (src/agent/)                          │
│   核心循环 · 状态管理 · 消息队列 · 权限控制         │
├──────────────────────────────────────────────────┤
│ ④ 扩展层 (src/extension/)                        │
│   ExtensionAPI · Loader · 插件发现机制             │
├──────────────────────────────────────────────────┤
│ ③ 工具层 (src/tools/)                            │
│   ToolRegistry · 7 个内置工具 · 统一接口           │
├──────────────────────────────────────────────────┤
│ ② 会话层 (src/session/)                          │
│   JSONL 持久化 · 分支对话 · 会话管理 · 上下文压缩   │
├──────────────────────────────────────────────────┤
│ ① AI 层 (src/ai/)                                │
│   ModelRegistry · Provider 模式 · 3 个 LLM 提供商  │
│   统一错误码 · 指数退避重试机制                     │
├──────────────────────────────────────────────────┤
│ 🐳 沙箱层 (src/sandbox/)                         │
│   Docker 容器化执行 · 资源限制 · 自动降级回退       │
└──────────────────────────────────────────────────┘
```

### 核心设计模式

| 模式 | 说明 |
|------|------|
| **🔻 依赖漏斗** | 上层依赖下层，下层绝不依赖上层——保证每一层可独立测试和替换 |
| **📈 类型渐进扩展** | `Tool`（AI 层，基础定义）→ `AgentTool extends Tool`（Agent 层，加 execute），类型能力随层次递增 |
| **🔌 扩展优先** | 扩展系统是一等公民，不修改内核即可注册自定义工具和命令 |
| **📡 事件驱动** | Agent 通过 `subscribe`/`emit` 与 UI 解耦，同一 Agent 实例可同时对接 Print、TUI、JSON、RPC |
| **🛡️ 防御性编程** | 统一 `AppError` 错误码 + `isAppError()` 类型守卫，前端友好提示 |

### 核心流程：Agent Loop

```
用户输入
    │
    ▼
┌─────────────────────────┐
│ 1. 消息转换 & 上下文压缩  │  ← Compactor 阈值控制，保留最近 N 条完整
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 2. 调用 LLM 获取响应     │  ← SSE 流式解析，支持 text/tool_call/thinking
└────────┬────────────────┘
         │
    ┌────┴────┐
    │ 有工具   │
    │ 调用？   │
    └────┬────┘
  是 ↓    ↓ 否 → 检查消息队列 → 有→继续 / 无→结束
        │
┌───────┴────────┐
│ 3. 预检权限     │  ← PermissionManager：三级风险 + TTY 检测
└───────┬────────┘
        │
┌───────┴────────┐
│ 4. 执行工具     │  ← Docker 沙箱（沙箱层）或本地进程
│    (并行/串行)  │
└───────┬────────┘
        │
┌───────┴────────┐
│ 5. 结果送回 LLM │  ← 作为 toolResult 消息继续下一轮
└───────┬────────┘
        │
        └→ 回到步骤 1
```

### 事件驱动架构

Agent 在处理过程中发射各类事件，接口层通过订阅模式消费：

```
Agent 实例 ────→ Print 接口（终端输出）
           ├──→ TUI 渲染器（全屏交互 + Slash 命令）
           ├──→ JSON 输出（JSONL 事件流）
           └──→ RPC 协议（进程间通信）
```

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| `agent_start` / `agent_end` | 会话生命周期 | 会话管理、日志记录 |
| `turn_start` / `turn_end` | 单轮交互 | 进度显示、Token 统计 |
| `message_start` / `message_update` / `message_end` | 消息流 | 流式增量输出 |
| `tool_execution_start` / `tool_execution_end` | 工具调用 | 工具执行状态显示 |

---

## 🔧 内置工具

| 工具 | 功能 | 实现方式 | 沙箱支持 |
|------|------|---------|---------|
| `bash` | 执行 shell 命令 | `child_process.exec` / Docker 容器 | ✅ |
| `read` | 读取文件内容 | `fs.promises.readFile` | ❌ |
| `write` | 写入文件内容 | `fs.promises.writeFile` | ❌ |
| `edit` | 替换文件中的文本 | read → replace → write | ❌ |
| `grep` | 搜索关键词 | shell `grep -rn` | ❌ |
| `find` | 按名称查找文件 | shell `find -name` | ❌ |
| `ls` | 列出目录内容 | `fs.promises.readdir` | ❌ |

### bash 工具安全流程

```text
LLM 发起 bash 调用
        │
        ▼
┌──────────────────┐
│ PermissionManager │
│ 三级风险判定       │
└────────┬─────────┘
         │
   ┌─────┴─────┐
   ▼           ▼
 SAFE        NORMAL / DANGEROUS
  │               │
  ▼               ▼
 直接放行     TTY 环境?
  │           │        │
  │         是        否
  │           │        │
  │           ▼        ▼
  │       用户确认   自动拒绝
  │           │
  └─────┬─────┘
        ▼
┌──────────────────┐
│ Docker 可用?      │
├────────┬─────────┤
│ 是     │ 否      │
│  ▼     │ ▼       │
│ 容器中  │ 本地    │
│ 执行    │ 执行    │
└────────┴─────────┘
```

---

## 🛡️ 生产加固

### 权限系统 (`src/agent/permission.ts`)

| 风险等级 | 示例命令 | 处理方式 |
|---------|---------|---------|
| 🟢 **SAFE** | `ls`, `cat`, `whoami`, `date` | 直接放行 |
| 🟡 **NORMAL** | `npm install`, `git status`, `mkdir` | 交互式确认 |
| 🔴 **DANGEROUS** | `rm -rf`, `sudo`, `drop table`, `shutdown` | 直接拒绝 |

非 TTY 环境（管道、CI）自动拒绝所有 NORMAL/DANGEROUS 命令。

### Docker 沙箱 (`src/sandbox/docker.ts`)

```text
┌──────────────────────────────────────┐
│          Docker 容器                  │
│  ┌────────────────────────────────┐  │
│  │  Alpine Linux                  │  │
│  │  bash, coreutils, curl, git    │  │
│  │  工作目录: /workspace          │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  资源限制                       │  │
│  │  --network none  (无网络)      │  │
│  │  --memory 512m  (内存上限)     │  │
│  │  --cpus 1       (CPU 上限)     │  │
│  │  --pids-limit 50 (进程上限)    │  │
│  │  --read-only    (系统只读)     │  │
│  │  --tmpfs /tmp   (临时目录)     │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

Docker 不可用时自动回退到本地执行，功能不受影响。

### 错误码 (`src/ai/errors.ts`)

统一的 `AppError` 接口，提供人类可读的错误提示：

```text
[PROVIDER_NOT_FOUND]    不支持的提供商 "xxx"
  💡 可用: deepseek, anthropic, openai

[AUTH_API_KEY_MISSING]  提供商 "xxx" 的 API 密钥未配置
  💡 请设置环境变量 XXX_API_KEY

[MODEL_NOT_FOUND]       找不到模型 "xxx"
  💡 请检查模型名称是否正确

[TOOL_NOT_FOUND]        找不到工具 "xxx"
[TOOL_EXECUTION_FAILED] 工具执行失败
[AGENT_ALREADY_STREAMING] 正在处理中，请等待
```

### 其他加固

| 措施 | 文件 | 说明 |
|------|------|------|
| 上下文压缩 | `src/session/compaction.ts` | 超过阈值（默认 50 条）时自动压缩历史，保留最近 N 条完整 |
| 指数退避重试 | `src/ai/retry.ts` | 1s → 2s → 4s，最多 3 次，处理 429/502/503/504 |
| JSONL 日志 | `src/config/logger.ts` | access / error / audit 按天轮转，JSONL 格式 |
| 分层配置 | `src/config/settings.ts` | CLI > 环境变量 > 用户配置 > 项目配置 > 默认值 |
| 一键初始化 | `src/config/init.ts` | `pi --init` 创建配置、构建沙箱、检查环境 |

---

## 📂 项目结构

```
piagent/
├── src/
│   ├── cli.ts                         # 🚪 CLI 入口（参数解析 + 模块组装）
│   │
│   ├── ai/                            # 🤖 AI 层
│   │   ├── types.ts                   #   核心类型：Tool、AgentMessage、Model
│   │   ├── errors.ts                  #   AppError 统一错误码体系
│   │   ├── retry.ts                   #   指数退避重试（fetchWithRetry）
│   │   ├── registry.ts                #   模型注册表（ModelRegistry）
│   │   ├── providers/
│   │   │   ├── anthropic.ts           #   Claude API 连接器
│   │   │   ├── deepseek.ts            #   DeepSeek API 连接器
│   │   │   └── openai.ts              #   OpenAI API 连接器
│   │   └── index.ts
│   │
│   ├── agent/                         # 🧠 Agent 层
│   │   ├── types.ts                   #   AgentTool（Tool + execute）
│   │   ├── state.ts                   #   状态管理 + ID 生成
│   │   ├── loop.ts                    #   ⭐ 核心 Agent Loop
│   │   ├── queue.ts                   #   消息队列（Steer / FollowUp）
│   │   ├── permission.ts              #   三级权限控制
│   │   └── index.ts
│   │
│   ├── tools/                         # 🔧 工具层
│   │   ├── registry.ts                #   工具注册表
│   │   ├── builtin/
│   │   │   ├── bash.ts                #   shell 命令执行
│   │   │   ├── read.ts                #   文件读取
│   │   │   ├── write.ts               #   文件写入
│   │   │   ├── edit.ts                #   文本替换
│   │   │   ├── grep.ts                #   关键词搜索
│   │   │   ├── find.ts                #   文件名查找
│   │   │   └── ls.ts                  #   目录列表
│   │   └── index.ts
│   │
│   ├── session/                       # 📁 会话层
│   │   ├── storage.ts                 #   JSONL 文件存储
│   │   ├── manager.ts                 #   会话 CRUD
│   │   └── compaction.ts              #   上下文压缩
│   │
│   ├── extension/                     # 🔌 扩展层
│   │   ├── api.ts                     #   ExtensionAPI
│   │   ├── loader.ts                  #   扩展加载器
│   │   └── index.ts
│   │
│   ├── config/                        # ⚙️ 配置层
│   │   ├── settings.ts                #   ConfigManager
│   │   ├── init.ts                    #   pi --init 初始化
│   │   ├── logger.ts                  #   JSONL 日志
│   │   └── index.ts
│   │
│   ├── sandbox/                       # 🐳 沙箱层
│   │   ├── docker.ts                  #   DockerSandbox
│   │   └── index.ts
│   │
│   └── interface/                     # 🖥️ 接口层
│       ├── print.ts                   #   Print 模式
│       ├── json.ts                    #   JSON 模式
│       ├── rpc.ts                     #   RPC 模式
│       ├── tui/
│       │   ├── index.ts               #   TUI 入口（Alt Screen）
│       │   ├── editor.ts              #   输入编辑
│       │   ├── renderer.ts            #   响应渲染
│       │   ├── commands.ts            #   Slash 命令
│       │   └── theme.ts               #   ANSI 主题
│       └── index.ts
│
├── tests/                             # ✅ 测试（8 文件 / 34 用例）
│   └── unit/
│       ├── ai/     (registry, retry)
│       ├── agent/  (compactor, permission, queue)
│       ├── config/ (settings)
│       ├── extension/ (loader)
│       └── tools/  (registry)
│
├── Dockerfile                         # 🐳 沙箱镜像
├── .github/workflows/ci.yml           # 🔄 CI（类型检查 + 测试 + 审计）
├── scripts/audit.sh                   # 🔒 安全审计脚本
├── pi-agent-architecture.md           # 架构设计文档
├── vitest.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 🛠 开发

### 技术栈

| 模块 | 技术选型 | 选型理由 |
|------|---------|---------|
| 语言 | TypeScript 7.x | 类型安全，渐进扩展模式友好 |
| 运行时 | Node.js 22+ | 内置 fetch、fs、child_process，零 SDK 依赖 |
| Schema 验证 | @sinclair/typebox | 类型安全的 JSON Schema 生成 |
| LLM API | 原生 fetch + SSE 解析 | 零第三方 SDK，完全可控 |
| 测试 | Vitest 4.x | 高速、TypeScript 7.x 兼容 |

### 开发命令

```bash
# 编译
npm run build

# 监听模式
npm run dev

# 类型检查
npx tsc --noEmit

# 运行测试
npm test

# 测试监听
npm run test:watch

# 安全审计
npm run audit
```

### 开发阶段

| Phase | 内容 | 状态 |
|-------|------|------|
| **Phase 1** | MVP：AI 层、Agent Loop、bash 工具、Print 输出 | ✅ 完成 |
| **Phase 2** | 功能完善：7 个工具、会话持久化、消息队列、TUI | ✅ 完成 |
| **Phase 3** | 扩展生态：OpenAI Provider、扩展系统、配置管理、JSON/RPC | ✅ 完成 |
| **Phase 4** | 生产加固：权限系统、上下文压缩、Docker 沙箱、错误码、日志、CI/CD | ✅ 完成 |

### 架构设计原则

| 原则 | 说明 |
|------|------|
| **内核极简** | 只做最少的事，其余通过扩展机制实现 |
| **依赖漏斗** | 下层绝不依赖上层，每层独立可测 |
| **事件驱动** | 所有交互通过事件流，UI 与逻辑完全解耦 |
| **消息标准化** | 统一 `AgentMessage` 格式，Provider 差异在内部消化 |
| **类型渐进扩展** | 基础类型在低层定义，能力随层次递增（Tool → AgentTool） |
| **扩展优先** | 扩展系统是一等公民，无需修改内核即可添加功能 |
| **错误即 throw** | 用异常表达失败，配合 `AppError` 提供友好提示 |

---

## 🤝 贡献

欢迎通过以下方式参与：

1. **加新工具**：在 `src/tools/builtin/` 下新建文件，遵循 `AgentTool` 接口
2. **加新模型**：在 `src/ai/providers/` 下新建文件，实现 `ProviderFactory` 接口
3. **修 Bug**：提交 Issue 或 PR

---

## 📄 许可

MIT License

---

## 🙏 参考

- [earendil-works/pi](https://github.com/earendil-works/pi) — 本项目参考其设计哲学与代码结构
- [Claude Code](https://claude.ai) — Anthropic 的 AI 编程助手
- [Cursor](https://cursor.sh) — AI-first 代码编辑器

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/KNeegcyao/my-easy-pi">my-easy-pi</a>
</p>