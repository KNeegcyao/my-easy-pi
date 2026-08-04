# piagent — AI 编程助手

> 一个轻量级的 AI Coding Agent，类似简化版的 Claude Code / Cursor。

## 快速开始

```bash
# 1. 设置 API 密钥
export DEEPSEEK_API_KEY=sk-xxxx

# 2. 直接对话
pi -m "你好"

# 3. 管道模式
cat package.json | pi -p "解释这个文件"

# 4. 交互式对话
pi -i
```

## 安装

```bash
# 克隆后安装依赖
npm install

# 配置全局命令
cp ~/bin/pi /usr/local/bin/ 2>/dev/null || alias pi="npx tsx /path/to/piagent/src/cli.ts"
```

## 功能特性

| 功能 | 命令 |
|------|------|
| 直接问答 | `pi -m "问题"` |
| 管道处理 | `cat file \| pi -p "指令"` |
| 交互模式 | `pi -i` |
| JSON 输出 | `pi -m "xxx" -o json` |
| RPC 模式 | `pi -o rpc`（供其他语言嵌入） |
| 选择模型 | `pi -m "hi" --model gpt-4o --provider openai` |

## 支持的 LLM 提供商

| 提供商 | 模型 | 环境变量 |
|--------|------|---------|
| DeepSeek | deepseek-chat, deepseek-reasoner | `DEEPSEEK_API_KEY` |
| Anthropic | claude-sonnet-4, claude-3-haiku | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo | `OPENAI_API_KEY` |

## 内置工具

| 工具 | 功能 |
|------|------|
| bash | 执行 shell 命令 |
| read | 读取文件内容 |
| write | 写入文件内容 |
| edit | 替换文件中的文本 |
| grep | 搜索关键词 |
| find | 查找文件名 |
| ls | 列出目录内容 |

## 项目结构

```
src/
├── cli.ts              # 命令行入口
├── ai/                 # AI 层 — LLM 提供者抽象
│   ├── types.ts
│   ├── registry.ts
│   └── providers/      # Anthropic, DeepSeek, OpenAI
├── agent/              # Agent 层 — 核心循环 + 消息队列
│   ├── state.ts
│   ├── loop.ts
│   └── queue.ts
├── tools/              # 工具层 — 内置 7 个工具
│   ├── registry.ts
│   └── builtin/
├── session/            # 会话层 — JSONL 持久化
├── extension/          # 扩展层 — 插件系统
├── config/             # 配置管理
└── interface/          # 接口层 — Print/TUI/JSON/RPC
```

## 技术栈

- **语言**: TypeScript 7.x
- **运行时**: Node.js 22+
- **Schema 验证**: TypeBox
- **LLM API**: 直接调用 REST API（无第三方 SDK 依赖）

## 开发路线

- Phase 1 — MVP 基础链路
- Phase 2 — 工具扩展 + 会话持久化 + 消息队列 + TUI
- Phase 3 — OpenAI Provider + 扩展系统 + 配置管理 + JSON/RPC 模式

## 参考

本项目参考 [earendil-works/pi](https://github.com/earendil-works/pi) 的设计哲学与代码结构。