<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/KNeegcyao/picdemo/img/image-20260815124313236.png" alt="MY EASY PI" width="800">
</p>

<p align="center">
  <h1 align="center">piagent</h1>
  <p align="center">
    <strong>🧑‍💻 从零学习 AI Coding Agent 的渐进式教程</strong>
  </p>
  <p align="center">
    <em>Learn by building — 通过动手搭建，真正理解 AI Coding Agent 如何工作</em>
  </p>
  <p align="center">
    <a href="docs/README.md"><strong>📖 开始学习 →</strong></a>
    ·
    <a href="#-快速开始">快速开始</a>
    ·
    <a href="#-关于-pi">关于 pi</a>
    ·
    <a href="#-架构">架构</a>
    ·
    <a href="#-开发">开发</a>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Coverage-49%20tests%20passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/CI-Passing-brightgreen?logo=githubactions" alt="CI">
  <a href="docs/README.md"><img src="https://img.shields.io/badge/📖-10%E7%AB%A0%E5%85%A8%E9%9D%A2%E5%AD%A6%E4%B9%A0%E6%8C%87%E5%8D%97-blue" alt="学习指南"></a>
</p>

---

> **"What I cannot create, I do not understand."** — Richard Feynman
>
> piagent 的核心理念：**读代码不如写代码，用工具不如造工具。** 只有亲手从零搭建一个 AI Coding Agent，你才能真正理解它背后的每一行逻辑。

---

## 🎯 学习使命

piagent 不是一个"开箱即用"的产品，而是一份**从零学习 AI Coding Agent 的渐进式教程**。

| 维度 | piagent | Claude Code |
|------|---------|-------------|
| 🎓 **定位** | 学习项目，代码可读 | 生产工具，代码量大 |
| 📏 **规模** | ~3000 行 TypeScript | 数十万行 |
| 🧩 **架构** | 6 层分层，每层清晰 | 复杂模块化 |
| 📖 **文档** | 10 章循序渐进的教程 | 产品文档 |

**适合你，如果：**
- 你想深入理解 AI Coding Agent 的**工作原理**
- 你想知道 LLM 是如何"调用工具"的
- 你想学习 **TypeScript 分层架构设计**
- 你想为将来贡献开源项目或开发自己的 Agent 打基础

**不适合你，如果：**
- 你只需要一个开箱即用的 AI 编程助手 → 请用 [Claude Code](https://claude.ai)
- 你不想了解底层原理

---

## 🎓 学习路线图

> 从零开始，10 章带你逐层深入 piagent 的每一行代码。

<p align="center">
  <a href="docs/README.md">
    <img src="https://img.shields.io/badge/🚀-开始学习-brightgreen?style=for-the-badge" alt="开始学习">
  </a>
</p>

| # | 章节 | 内容 | 时长 |
|---|------|------|------|
| 01 | [前置准备](docs/01-before-start/README.md) | 什么是 AI Coding Agent？环境搭建与项目结构 | ~55 min |
| 02 | [AI 层](docs/02-ai-layer/README.md) | 核心类型 · Model 接口 · Provider 策略 · 注册中心 · 错误码与重试 | ~90 min |
| 03 | [Agent 层 ⭐](docs/03-agent-layer/README.md) | **核心循环** · 状态管理 · 消息队列 · 权限系统 · 事件驱动 | ~120 min |
| 04 | [工具层](docs/04-tools-layer/README.md) | 工具注册表 · 7 个内置工具 | ~75 min |
| 05 | [会话层](docs/05-session-layer/README.md) | JSONL 持久化 · 会话管理 · 上下文压缩 | ~60 min |
| 06 | [扩展层](docs/06-extension-layer/README.md) | ExtensionAPI · 扩展加载器 · 插件化开发 | ~60 min |
| 07 | [接口层](docs/07-interface-layer/README.md) | Print · TUI · JSON · RPC 四种交互模式 | ~90 min |
| 08 | [配置与沙箱](docs/08-config-and-sandbox/README.md) | 分层配置 · 日志 · Docker 沙箱隔离 | ~75 min |
| 09 | [串联一切](docs/09-putting-it-together/README.md) | CLI 入口源码分析 · 完整端到端数据流 | ~90 min |
| 10 | [进阶主题](docs/10-advanced-topics/README.md) | 新增工具 · Provider · 扩展 · 测试策略 | ~90 min |

```
推荐路径: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10
```

---

## 🧬 关于 pi

piagent 的设计深受 [earendil-works/pi](https://github.com/earendil-works/pi) 的启发。

### pi 的思想

[Pi](https://pi.dev) 是一个**自扩展编码 Agent**（self-extensible coding agent），它的核心哲学是：

> **Agent 应该能够理解并扩展自身。** Pi 不仅是一个工具，更是一个框架——它提供了统一的 LLM 调用抽象、Agent 运行时、工具系统和 TUI，让你可以在此基础上构建自己的 AI 助手。

### piagent 与 pi 的关系

```
Pi (earendil-works/pi)
├── @earendil-works/pi-coding-agent    ← 交互式 CLI
├── @earendil-works/pi-agent-core      ← Agent 运行时
├── @earendil-works/pi-ai             ← 多 Provider LLM 层
├── @earendil-works/pi-tui            ← 终端 UI 库
└── ...

piagent (本仓库)
├── src/cli.ts                        ← 精简版 CLI
├── src/ai/                           ← 统一 LLM 接口
├── src/agent/                        ← Agent 核心循环
├── src/tools/                        ← 内置工具
├── src/session/                      ← 会话管理
├── src/extension/                    ← 扩展系统
├── src/interface/                    ← 输出模式
└── docs/                             ← 10 章学习教程
```

**关键区别：**

| 维度 | Pi | piagent |
|------|----|---------|
| 🎯 **目标** | 生产级自扩展 Agent | 学习用精简实现 |
| 📚 **学习成本** | 需要理解完整生态 | 单人可读完 |
| 📝 **代码注释** | 少量 | **逐行注释** |
| 📖 **配套教程** | 外部文档 | **10 章渐进式教程** |
| 🔌 **扩展方式** | npm 包 + 扩展 | 文件级扩展系统 |

### 从 pi 开始的理由

选择 pi 的生态作为学习起点，而不是从零凭空造轮子，是因为：

1. **经过验证的架构** — pi 的分层设计已经被生产环境验证
2. **真实项目映射** — 学习 piagent 后，你能更快理解 pi、Claude Code 等工作原理
3. **可扩展的基础** — 掌握了 piagent，你可以轻松过渡到 pi 的完整生态
4. **社区支持** — pi 有活跃的社区和丰富的扩展

---

## ✨ 特性速览

| 特性 | 说明 |
|------|------|
| 🤖 **多 LLM 提供商** | 支持 DeepSeek（默认）、Anthropic Claude、OpenAI |
| 🔧 **7 个内置工具** | bash、read、write、edit、grep、find、ls |
| 🖥️ **全屏 TUI** | 仿 Claude Code 的 Alt Screen 模式（重构中，见 [docs/tui-strategy.md](docs/tui-strategy.md)） |
| 📁 **会话持久化** | JSONL 格式自动保存，支持 `-c` 恢复 |
| 🔒 **三级权限系统** | SAFE / NORMAL / DANGEROUS + TTY 检测 |
| 📦 **Docker 沙箱** | 可选容器化执行，自动降级回退 |
| 🔌 **扩展系统** | ExtensionAPI 支持自定义工具，无需修改内核 |
| 📊 **四种输出模式** | Print · TUI · JSON · RPC |
| 🛡️ **专业错误处理** | 统一错误码 + 指数退避重试 |

---

## 📦 安装

```bash
# 克隆仓库
git clone https://github.com/KNeegcyao/my-easy-pi.git
cd my-easy-pi

# 安装依赖
npm install

# 类型检查
npx tsc --noEmit

# 配置 API 密钥
export DEEPSEEK_API_KEY=sk-xxxx

# 启动 TUI
npx tsx src/cli.ts
```

> 完整的安装指南请见 [环境搭建](docs/01-before-start/02-environment-setup.md)

---

## 🏗 架构总览

### 6 层分层设计

```
┌──────────────────────────────────────────────────┐
│  🚪 CLI 入口 (src/cli.ts)                        │
├──────────────────────────────────────────────────┤
│  🖥️ 接口层 (src/interface/) — 4 种输出模式        │
├──────────────────────────────────────────────────┤
│  🧠 Agent 层 (src/agent/) — 核心循环              │
├──────────────────────────────────────────────────┤
│  🔌 扩展层 (src/extension/) — 插件系统            │
├──────────────────────────────────────────────────┤
│  🔧 工具层 (src/tools/) — 7 个内置工具             │
├──────────────────────────────────────────────────┤
│  📁 会话层 (src/session/) — 持久化与上下文管理      │
├──────────────────────────────────────────────────┤
│  🤖 AI 层 (src/ai/) — 统一 LLM 调用接口           │
├──────────────────────────────────────────────────┤
│  🐳 沙箱层 (src/sandbox/) — 安全执行环境           │
│  ⚙️ 配置层 (src/config/) — 分层配置管理            │
└──────────────────────────────────────────────────┘
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

---

## 📂 项目结构

```
piagent/
├── src/                    # 源代码（~3000 行）
│   ├── cli.ts             # 📍 入口：参数解析 + 模块组装
│   ├── ai/                # 🤖 统一 LLM 接口
│   ├── agent/             # 🧠 Agent 核心循环 ⭐
│   ├── tools/             # 🔧 7 个内置工具
│   ├── session/           # 📁 会话持久化
│   ├── extension/         # 🔌 扩展系统
│   ├── interface/         # 🖥️ 输出模式
│   ├── config/            # ⚙️ 配置管理
│   └── sandbox/           # 🐳 Docker 沙箱
├── docs/                  # 📖 10 章学习教程
├── tests/                 # ✅ 49 个测试用例
└── Dockerfile             # 🐳 沙箱镜像
```

---

## 🛠 开发

```bash
npm run build        # 编译
npm run dev          # 监听模式
npx tsc --noEmit     # 类型检查
npm test             # 测试
npm run test:watch   # 测试监听
npm run audit        # 安全审计
```

---

## 📄 许可

MIT License

---

## 🙏 致谢

- [earendil-works/pi](https://github.com/earendil-works/pi) — 设计哲学与架构的重要参考
- [Claude Code](https://claude.ai) — AI 编程助手的行业标杆

---

<p align="center">
  <strong>Learn by building.</strong> 从 pi 开始，理解 AI Coding Agent。<br>
  Built with ❤️ by <a href="https://github.com/KNeegcyao/my-easy-pi">my-easy-pi</a>
</p>