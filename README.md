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
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

**piagent** 是一个从零搭建的 AI 编程助手（Coding Agent），类似简化版的 [Claude Code](https://claude.ai) / [Cursor](https://cursor.sh)。它展示了如何通过 **6 层分层架构**将大语言模型（LLM）与工具调用系统有机结合，实现一个可交互的 AI 助手。

> 🎯 适合作为求职作品：[项目全解文档（语雀）](https://yuque.antfin.com/go/doc/564901513)

---

## 📦 安装

### 前置要求

- **Node.js** >= 22
- **npm** >= 10

### 本地安装

```bash
# 克隆仓库
git clone git@github.com:KNeegcyao/my-easy-pi.git
cd my-easy-pi

# 安装依赖
npm install

# 编译检查
npx tsc --noEmit
```

### 配置全局命令

```bash
# 添加到 ~/bin（已在 PATH 中）
cp src/cli.ts ~/bin/pi 2>/dev/null || echo 'alias pi="npx tsx $(pwd)/src/cli.ts"' >> ~/.zshrc
source ~/.zshrc
```

### 设置 API 密钥

```bash
# DeepSeek（默认）
export DEEPSEEK_API_KEY=sk-xxxx

# 可选：Anthropic
export ANTHROPIC_API_KEY=sk-ant-xxxx

# 可选：OpenAI
export OPENAI_API_KEY=sk-xxxx
```

---

## 🚀 快速开始

```bash
# 直接问答
pi -m "解释一下 JavaScript 的闭包"

# 管道模式——让 AI 处理文件内容
cat package.json | pi -p "解释这个文件的依赖关系"

# 交互式多轮对话
pi -i

# 指定模型
pi -m "你好" --provider deepseek --model deepseek-chat
```

---

## 📖 使用指南

### 命令行参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `-m, --message` | 直接输入消息 | `pi -m "你好"` |
| `-p, --prompt` | 管道模式指令 | `cat file \| pi -p "翻译"` |
| `-i, --tui` | 交互式对话 | `pi -i` |
| `-o, --output` | 输出模式：`print` / `json` / `rpc` | `pi -m "hi" -o json` |
| `--model` | 指定模型 ID | `pi -m "hi" --model gpt-4o` |
| `--provider` | 指定提供商 | `pi -m "hi" --provider openai` |
| `-h, --help` | 查看帮助 | `pi -h` |

### 输出模式

| 模式 | 用途 | 示例 |
|------|------|------|
| `print`（默认） | 人类可读的流式输出 | `pi -m "你好"` |
| `json` | JSONL 事件流，适合程序消费 | `pi -m "hello" -o json \| jq '.type'` |
| `rpc` | stdin/stdout 协议，供其他语言嵌入 | `echo '{"type":"message","content":"hi"}' \| pi -o rpc` |

### 支持的 LLM 提供商

| 提供商 | 模型 | 环境变量 | 示例 |
|--------|------|---------|------|
| **DeepSeek** | `deepseek-chat`, `deepseek-reasoner` | `DEEPSEEK_API_KEY` | 默认 |
| **Anthropic** | `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307` | `ANTHROPIC_API_KEY` | `--provider anthropic` |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` | `OPENAI_API_KEY` | `--provider openai` |

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
│   核心循环 · 状态管理 · 消息队列 (Steer/Follow-up) │
├──────────────────────────────────────────────────┤
│ ④ 扩展层 (src/extension/)                        │
│   ExtensionAPI · Loader · 插件发现机制             │
├──────────────────────────────────────────────────┤
│ ③ 工具层 (src/tools/)                            │
│   ToolRegistry · 7 个内置工具 · 统一接口           │
├──────────────────────────────────────────────────┤
│ ② 会话层 (src/session/)                          │
│   JSONL 持久化 · 分支对话 · 会话管理               │
├──────────────────────────────────────────────────┤
│ ① AI 层 (src/ai/)                                │
│   ModelRegistry · Provider 模式 · 3 个 LLM 提供商  │
└──────────────────────────────────────────────────┘
```

### 核心流程：Agent Loop

```
用户输入
    │
    ▼
┌─────────────────────────┐
│ 1. 消息转换 & 上下文压缩  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 2. 调用 LLM 获取响应     │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │ 有工具   │
    │ 调用？   │
    └────┬────┘
  是 ↓    ↓ 否 → 检查消息队列 → 有→继续 / 无→结束
        │
┌───────┴────────┐
│ 3. 执行工具     │
│    (并行/串行)  │
└───────┬────────┘
        │
┌───────┴────────┐
│ 4. 结果送回 LLM │
└───────┬────────┘
        │
        └→ 回到步骤 1
```

### 事件驱动架构

Agent 在处理过程中发射各类事件，接口层通过订阅模式消费：

```
Agent 实例 ────→ Print 接口（终端输出）
           ├──→ TUI 渲染器（交互界面）
           ├──→ JSON 输出（JSONL 流）
           └──→ RPC 协议（进程间通信）
```

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| `agent_start` / `agent_end` | 会话生命周期 | 会话管理 |
| `turn_start` / `turn_end` | 单轮交互 | 进度显示 |
| `message_start` / `message_update` / `message_end` | 消息流 | 流式输出 |
| `tool_execution_start` / `tool_execution_end` | 工具调用 | 工具状态 |

---

## 🔧 内置工具

| 工具 | 功能 | 实现方式 |
|------|------|---------|
| `bash` | 执行 shell 命令 | `child_process.exec` |
| `read` | 读取文件内容 | `fs.promises.readFile` |
| `write` | 写入文件内容 | `fs.promises.writeFile` |
| `edit` | 替换文件中的文本 | read → replace → write |
| `grep` | 搜索关键词 | shell `grep -rn` |
| `find` | 按名称查找文件 | shell `find -name` |
| `ls` | 列出目录内容 | `fs.promises.readdir` |

### 扩展：注册自定义工具

```typescript
// .pi/extensions/my-tool.ts
import type { ExtensionAPI } from 'piagent'
import { Type } from '@sinclair/typebox'

export default function (api: ExtensionAPI) {
  api.registerTool({
    name: 'deploy',
    description: '部署到服务器',
    parameters: Type.Object({
      env: Type.String({ enum: ['staging', 'prod'] }),
    }),
    async execute(id, params, signal) {
      // 业务逻辑
      return { content: [{ type: 'text', text: '部署成功' }] }
    },
  })
}
```

---

## 📂 项目结构

```
piagent/
├── src/
│   ├── cli.ts                      # 🚪 CLI 入口
│   │
│   ├── ai/                         # 🤖 AI 层
│   │   ├── types.ts                #   核心类型定义
│   │   ├── registry.ts             #   模型注册表
│   │   ├── providers/
│   │   │   ├── anthropic.ts        #   Claude 连接器
│   │   │   ├── deepseek.ts         #   DeepSeek 连接器
│   │   │   └── openai.ts           #   OpenAI 连接器
│   │   └── index.ts
│   │
│   ├── agent/                      # 🧠 Agent 层
│   │   ├── state.ts                #   状态管理
│   │   ├── loop.ts                 #   ⭐ 核心循环
│   │   ├── queue.ts                #   消息队列
│   │   └── index.ts
│   │
│   ├── tools/                      # 🔧 工具层
│   │   ├── registry.ts             #   工具注册表
│   │   ├── builtin/                #   7 个内置工具
│   │   │   ├── bash.ts
│   │   │   ├── read.ts
│   │   │   ├── write.ts
│   │   │   ├── edit.ts
│   │   │   ├── grep.ts
│   │   │   ├── find.ts
│   │   │   └── ls.ts
│   │   └── index.ts
│   │
│   ├── session/                    # 📁 会话层
│   │   ├── storage.ts              #   JSONL 存储
│   │   ├── manager.ts              #   会话管理
│   │   └── index.ts
│   │
│   ├── extension/                  # 🔌 扩展层
│   │   ├── api.ts                  #   ExtensionAPI
│   │   ├── loader.ts               #   扩展加载器
│   │   └── index.ts
│   │
│   ├── config/                     # ⚙️ 配置
│   │   ├── settings.ts             #   ConfigManager
│   │   └── index.ts
│   │
│   └── interface/                  # 🖥️ 接口层
│       ├── print.ts                #   Print 模式
│       ├── json.ts                 #   JSON 模式
│       ├── rpc.ts                  #   RPC 模式
│       ├── tui/
│       │   ├── index.ts
│       │   ├── editor.ts
│       │   └── renderer.ts
│       └── index.ts
│
├── pi-agent-architecture.md        # 架构设计文档
├── tsconfig.json
├── package.json
├── .gitignore
└── README.md
```

---

## 🛠 开发

### 技术栈

| 模块 | 技术选型 | 选型理由 |
|------|---------|---------|
| 语言 | TypeScript 7.x | 类型安全，适合大型项目 |
| 运行时 | Node.js 22+ | 内置 fetch，无需第三方 HTTP 库 |
| Schema 验证 | TypeBox | 类型安全的 JSON Schema 生成 |
| LLM API | 直接调用 REST API | 零第三方 SDK 依赖 |

### 开发命令

```bash
# 编译 TypeScript
npm run build

# 监听模式
npm run dev

# 类型检查（不输出文件）
npx tsc --noEmit
```

### 开发路线

- **Phase 1** — MVP：AI 层、Agent Loop、bash 工具、Print 输出
- **Phase 2** — 功能完善：6 个工具、会话持久化、消息队列、TUI
- **Phase 3** — 扩展生态：OpenAI Provider、扩展系统、配置管理、JSON/RPC
- **Phase 4**（计划）— 生产加固：权限系统、上下文压缩、Docker 沙箱

### 架构设计原则

| 原则 | 说明 |
|------|------|
| **内核极简** | 只做最少的事，扩展优先 |
| **事件驱动** | 所有交互通过事件流，UI 和逻辑解耦 |
| **消息标准化** | 统一消息格式，Provider 差异在内部消化 |
| **工具即函数** | 工具是有 Schema 描述的异步函数 |
| **扩展优先** | 扩展是一等公民，不修改内核 |
| **错误即 throw** | 用异常表达失败，不伪装成正常返回值 |

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
  由 <a href="https://yuque.antfin.com/go/doc/564901513">语雀文档</a> · <a href="https://github.com/KNeegcyao/my-easy-pi">GitHub</a>
</p>