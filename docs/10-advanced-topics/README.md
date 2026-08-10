---
对应源码: 全项目
最后更新: 2026-08-08
适用版本: 0.1.0
---

# 进阶主题

## 1. 本节目标

本章面向**想要扩展和修改 piagent 项目的读者**。阅读完本章后，你将能够：

- 添加一个自定义工具，扩展 LLM 的能力边界
- 接入一个新的 LLM 提供商，让 Agent 使用不同的模型
- 创建并加载扩展，为项目增加插件化能力
- 编写并运行测试，确保代码质量
- 理解项目的测试体系和 CI 流程

## 2. 前置知识

在开始本章之前，请确保你已掌握以下内容：

- **TypeScript 基础**：了解类型注解、接口、类、async/await 语法
- **Node.js 基础**：了解模块系统、文件操作、HTTP 请求
- **piagent 项目结构**：建议先阅读项目主 README 和架构文档
- **LLM 基础概念**：了解什么是 API Key、流式响应（SSE）、工具调用（Function Calling）

## 3. 核心概念

### 扩展点总览

piagent 提供了三个主要的扩展点，从简单到复杂依次是：

| 扩展点 | 难度 | 适用场景 | 核心接口 |
|--------|------|----------|----------|
| **自定义工具** | ⭐ | 让 LLM 能执行更多操作（如发送 HTTP 请求、查询数据库） | `AgentTool` |
| **自定义 Provider** | ⭐⭐⭐ | 接入新的 LLM 提供商（如 Google Gemini、Moonshot） | `ProviderFactory`, `Model` |
| **扩展系统** | ⭐⭐ | 插件化地注册工具和命令，监听 Agent 事件 | `ExtensionAPI` |

### 架构分层

```
┌─────────────────────────────────────┐
│  CLI (cli.ts)                        │
│  ── 入口、参数解析、界面启动          │
├─────────────────────────────────────┤
│  Agent (agent/)                      │
│  ── AgentLoop、状态管理、消息队列     │
├─────────────────────────────────────┤
│  Tools (tools/)                      │
│  ── ToolRegistry、内置工具            │
├─────────────────────────────────────┤
│  AI (ai/)                            │
│  ── ModelRegistry、Provider 实现      │
├─────────────────────────────────────┤
│  Extension (extension/)              │
│  ── ExtensionAPI、ExtensionLoader    │
└─────────────────────────────────────┘
```

当你添加自定义工具时，只需要在 **Tools 层** 新增一个文件。当你接入新 Provider 时，需要在 **AI 层** 新增一个 Provider 文件并在 `cli.ts` 中注册。当你创建扩展时，使用 **Extension API** 与 Agent 交互。

## 4. 章节导航

| 文档 | 内容 | 预计阅读时间 |
|------|------|-------------|
| [01-adding-new-tool.md](./01-adding-new-tool.md) | 手把手添加一个自定义工具 | 15 分钟 |
| [02-adding-new-provider.md](./02-adding-new-provider.md) | 接入新的 LLM 提供商 | 20 分钟 |
| [03-creating-extension.md](./03-creating-extension.md) | 创建并发布扩展 | 15 分钟 |
| [04-testing.md](./04-testing.md) | 测试体系详解 | 10 分钟 |
| [practice.md](./practice.md) | 本章练习 | 30 分钟 |

## 5. 运行与验证

所有文档中的代码示例都基于实际源码。你可以边读边在项目中实践：

```bash
# 编译项目
npm run build

# 运行测试
npm test

# 运行 CLI
npm start -- --help
```

## 6. 小结

本章从工具的扩展、Provider 的接入、扩展系统、测试体系四个维度，全面介绍了 piagent 的进阶用法。完成本章后，你将具备独立扩展和定制 piagent 的能力。

### 思考题

1. 三个扩展点（工具、Provider、扩展）分别在什么场景下使用？
2. 如果要让 piagent 支持执行 SQL 查询，应该使用哪个扩展点？
3. 如果要让 piagent 使用本地运行的 LLM（如 Ollama），应该使用哪个扩展点？