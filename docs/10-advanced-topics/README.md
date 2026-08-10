---
source: src/ (全项目)
last_updated: 2026-08-10
version: 1.0.0
---

# 进阶主题

> 本章面向**想要扩展和修改 piagent 项目的读者**。从新增工具、接入新 LLM、创建扩展到理解测试体系，覆盖 piagent 的所有扩展点。

> **检查清单：阅读本章前，请确保你已理解以下概念**
> 
> - **Agent Loop** ([03-agent-layer/01-agent-loop.md](../03-agent-layer/01-agent-loop.md)) -- LLM 调用与工具执行的"思考-行动-观察"循环
> - **Provider 模式** ([02-ai-layer/02-model-provider.md](../02-ai-layer/02-model-provider.md)) -- 统一 LLM 接口的设计思想
> - **Tool Registry** ([04-tool-layer/01-tool-registry.md](../04-tool-layer/01-tool-registry.md)) -- 工具的注册与发现机制
> - **ExtensionAPI** ([06-extension-system/01-extension-api.md](../06-extension-system/01-extension-api.md)) -- 扩展系统的基础接口

## Learning objectives

完成本章后，你将能够：

1. **扩展工具集** -- 编写自定义 `AgentTool`，让 LLM 能执行任意操作（HTTP 请求、数据库查询、文件处理等）
2. **接入新 LLM** -- 实现 `ProviderFactory` 和 `Model` 接口，接入 Google Gemini、Moonshot 等任意 LLM 提供商
3. **创建扩展** -- 使用 `ExtensionAPI` 开发插件化功能，在 Agent 事件中注册工具和命令
4. **加载扩展** -- 理解 `ExtensionLoader` 的加载机制，从本地文件或 npm 包加载扩展
5. **编写测试** -- 掌握 piagent 的单元测试、集成测试和 E2E 测试编写方法
6. **理解测试架构** -- 看懂项目测试目录结构、Mock 策略和 CI 配置
7. **诊断扩展问题** -- 当工具、Provider 或扩展加载失败时，独立定位问题根源
8. **发布扩展** -- 将扩展打包为 npm 包，供他人安装使用

## Prerequisites

在开始本章之前，请确保你已掌握以下内容：

- **TypeScript 进阶**：接口继承、泛型约束、`instanceof` 类型守卫、`async/await` 错误处理
- **Node.js 模块系统**：ESM module resolution、`import()` 动态导入、npm 包管理
- **piagent 核心架构**：建议先阅读 [03-agent-layer/README.md](../03-agent-layer/README.md)、[02-ai-layer/README.md](../02-ai-layer/README.md)、[04-tool-layer/README.md](../04-tool-layer/README.md)
- **LLM 进阶概念**：Function Calling 协议细节、流式 SSE 响应格式、Tool Choice 策略

## Architecture diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                     进阶主题概览                                    │
│                                                                   │
│  前序章节基础                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐        │
│  │ Agent 层      │  │ AI 层        │  │ 工具层            │        │
│  │ Agent Loop    │  │ Provider     │  │ ToolRegistry     │        │
│  │ 事件系统       │  │ Model 接口   │  │ 内置工具         │        │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘        │
│         │                 │                   │                   │
│         ▼                 ▼                   ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    扩展系统 (Extension)                      │ │
│  │  ExtensionAPI │ ExtensionLoader │ ExtensionManifest          │ │
│  └─────────────────────────┬───────────────────────────────────┘ │
│                            │                                      │
│          ┌─────────────────┼─────────────────┐                   │
│          ▼                 ▼                  ▼                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐       │
│  │ 自定义工具    │  │ 自定义       │  │ 扩展系统          │       │
│  │ (最简单)      │  │ Provider     │  │ (中等)            │       │
│  │              │  │ (最复杂)      │  │                  │       │
│  │ 实现 AgentTool│  │ 实现         │  │ ExtensionAPI     │       │
│  │ + 注册        │  │ Provider     │  │ 事件监听          │       │
│  │              │  │ Factory+Model │  │ 工具/命令注册     │       │
│  └──────────────┘  └──────────────┘  └──────────────────┘       │
│                            │                                      │
│                            ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    测试体系                                  │ │
│  │  单元测试 │ 集成测试 │ Mock 策略 │ CI 流程                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

## 文件列表

| 文件 | 说明 | 重要性 |
|------|------|--------|
| `docs/10-advanced-topics/01-adding-new-tool.md` | 手把手添加自定义工具 | ⭐⭐⭐ |
| `docs/10-advanced-topics/02-adding-new-provider.md` | 接入新的 LLM 提供商 | ⭐⭐⭐ |
| `docs/10-advanced-topics/03-creating-extension.md` | 创建并发布扩展 | ⭐⭐ |
| `docs/10-advanced-topics/04-testing.md` | 测试体系详解 | ⭐⭐ |
| `docs/10-advanced-topics/practice.md` | 本章练习 | ⭐ |

### 涉及的关键源码文件

| 文件 | 说明 | 重要性 |
|------|------|--------|
| `src/tools/types.ts` | `AgentTool` 接口定义 | ⭐⭐⭐ |
| `src/tools/registry.ts` | `ToolRegistry` -- 工具注册中心 | ⭐⭐⭐ |
| `src/ai/provider.ts` | `ProviderFactory` / `Model` 接口 | ⭐⭐⭐ |
| `src/ai/registry.ts` | `ModelRegistry` -- 模型注册中心 | ⭐⭐ |
| `src/extension/api.ts` | `ExtensionAPI` 接口定义 | ⭐⭐⭐ |
| `src/extension/loader.ts` | `ExtensionLoader` -- 扩展加载器 | ⭐⭐ |
| `src/extension/types.ts` | 扩展类型定义 | ⭐ |
| `tests/` | 测试目录 | ⭐⭐⭐ |

## Key design principles

### 1. 最小侵入

piagent 的扩展点设计遵循"对核心零侵入"原则。你可以在不修改 Agent 核心代码的前提下，通过注册机制增加功能：

- 工具：实现 `AgentTool` + 注册到 `ToolRegistry`，Agent Loop 自动识别
- Provider：实现 `ProviderFactory` + 注册到 `ModelRegistry`，CLI 通过 `-m` 参数切换
- 扩展：通过 `ExtensionAPI` 与 Agent 交互，核心无感知

### 2. 接口优先

所有扩展点都通过 TypeScript 接口定义契约：

- `AgentTool` -- 定义工具的 name、description、schema 和 execute
- `ProviderFactory` -- 定义 Provider 的创建和模型列表
- `Model` -- 定义 LLM 调用的完整接口
- `ExtensionAPI` -- 定义扩展与 Agent 的通信边界

### 3. 渐进复杂度

扩展点的学习曲线经过精心设计：

```
自定义工具 ──→ 扩展系统 ──→ 自定义 Provider
(简单)           (中等)         (复杂)
```

建议初学者从自定义工具开始，逐步深入。

## Reading order

1. **[01-adding-new-tool.md](./01-adding-new-tool.md)** -- 从最简单的扩展点开始，15 分钟内添加第一个自定义工具
2. **[02-adding-new-provider.md](./02-adding-new-provider.md)** -- 在理解工具扩展后，学习接入新的 LLM 提供商
3. **[03-creating-extension.md](./03-creating-extension.md)** -- 掌握扩展系统的完整能力
4. **[04-testing.md](./04-testing.md)** -- 理解测试架构，确保扩展质量
5. **[practice.md](./practice.md)** -- 动手实践巩固所学

## Running Locally

所有代码示例都基于实际源码。可以边读边在项目中实践：

```bash
# 编译项目
npm run build

# 运行测试
npm test

# 运行 CLI
npm start -- --help
```

## Summary and next steps

本章从四个维度全面介绍了 piagent 的进阶用法：

| 维度 | 核心技能 | 对应文档 |
|------|----------|----------|
| 工具扩展 | 实现 `AgentTool` 接口 | [01-adding-new-tool.md](./01-adding-new-tool.md) |
| Provider 接入 | 实现 `ProviderFactory` + `Model` | [02-adding-new-provider.md](./02-adding-new-provider.md) |
| 扩展系统 | 使用 `ExtensionAPI` 开发插件 | [03-creating-extension.md](./03-creating-extension.md) |
| 测试体系 | 编写单元/集成/E2E 测试 | [04-testing.md](./04-testing.md) |

完成本章后，你已具备独立扩展和定制 piagent 的能力。下一步可以：

- 开始 [practice.md](./practice.md) 动手练习
- 查阅完整的 [API 参考文档](../api/README.md)
- 参与项目贡献，查看 [贡献指南](../11-contribution/README.md)

### 思考题

1. 三个扩展点（工具、Provider、扩展）分别在什么场景下使用？能否举出具体的业务例子？
2. 如果要让 piagent 支持执行 SQL 查询，应该使用哪个扩展点？这个工具应该放在哪个目录？
3. 如果要让 piagent 使用本地运行的 LLM（如 Ollama），应该使用哪个扩展点？需要实现哪些接口？
4. 扩展系统和自定义工具都可以"新增功能"，它们的本质区别是什么？

> ← [📚 返回学习指南](../README.md)
>
> → 下一篇: [01-adding-new-tool.md](./01-adding-new-tool.md)