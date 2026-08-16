---
对应源码: 项目整体
最后更新: 2026-08-08
适用版本: v0.1.0+
---

# 前置准备

> 在开始学习 my-easy-pi 之前，你需要先了解：什么是 AI Coding Agent？如何搭建开发环境？项目结构长什么样？
> 本章为你铺平道路，让后续每一章的学习都建立在扎实的基础上。

---

## 1. 本章目标

- 理解 AI Coding Agent 的核心概念和典型应用场景
- 搭建完整的开发环境（Node.js、TypeScript、依赖安装、API 密钥配置）
- 熟悉 my-easy-pi 的项目结构，知道每个目录和关键文件的职责
- 能够成功运行第一个对话，验证环境正确性

---

## 2. 前置知识

| 知识领域 | 要求 | 说明 |
|---------|------|------|
| JavaScript / TypeScript | 基础 | 能看懂函数、类、异步编程（async/await） |
| 命令行操作 | 基础 | 能使用终端执行命令、管理环境变量 |
| Node.js 生态 | 了解 | 知道 npm、package.json 的基本概念 |
| 大语言模型（LLM） | 了解 | 知道 ChatGPT、Claude 是什么，了解 API 调用的基本概念 |
| Git | 基础 | 能 clone 仓库、切换分支 |

如果你对 TypeScript 的泛型（Generics）和异步迭代器（AsyncIterable）还不熟悉，不用担心——我们会在后续章节中逐步讲解。

---

## 3. 核心概念

本章涉及的几个关键概念：

| 概念 | 说明 | 类比 |
|------|------|------|
| **AI Coding Agent** | 能自主使用工具的 AI 编程助手 | 会编程的实习生，能自己想、自己做 |
| **LLM Provider** | 大语言模型服务提供商（DeepSeek、Anthropic、OpenAI） | 不同的"大脑供应商" |
| **Agent Loop** | Agent 的核心循环：思考→行动→观察→再思考 | 人类的"想→做→看→想"循环 |
| **工具（Tool）** | Agent 可以调用的函数（读文件、执行命令等） | Agent 的"手脚" |
| **分层架构** | 将系统分为 6 个独立层，每层各司其职 | 公司的部门分工 |

---

## 4. 学习路径

建议按以下顺序阅读本章各节：

```
01-what-is-coding-agent.md  ──→  02-environment-setup.md  ──→  03-project-structure.md
     ↓                               ↓                               ↓
 理解什么是 Coding Agent        搭建并验证开发环境               了解项目整体结构
```

### 各节简介

| 文档 | 阅读时间 | 内容概要 |
|------|---------|---------|
| **01-what-is-coding-agent.md** | 15 分钟 | AI Coding Agent 的概念、与聊天机器人的区别、应用场景、主流项目介绍 |
| **02-environment-setup.md** | 20 分钟 | 从零搭建开发环境：安装依赖、配置 API 密钥、验证安装、启动第一个对话 |
| **03-project-structure.md** | 20 分钟 | 项目目录结构、6 层架构概览、每层职责、关键文件速览 |

---

## 5. 代码实现

本章不涉及具体的代码实现。从第 2 章开始，我们将逐层深入代码。

---

## 6. 运行与验证

完成本章学习后，你应该能够：

```bash
# 1. 克隆并安装依赖
git clone <项目地址>
cd piagent
npm install

# 2. 类型检查通过
npx tsc --noEmit      # 无报错

# 3. 测试通过
npm test              # 34 个测试用例全部通过

# 4. 能启动对话
export DEEPSEEK_API_KEY=sk-xxx
npx tsx src/cli.ts -m "你好"  # 看到 AI 回复
```

---

## 7. 小结

### 本节要点

- AI Coding Agent 是一个能自主使用工具完成编程任务的 AI 系统
- my-easy-pi 使用 6 层分层架构，每层职责清晰、可独立测试
- 开发环境要求：Node.js >= 22、npm >= 10
- 项目已包含完整的测试套件（34 个用例）

### 思考题

1. AI Coding Agent 和普通的 ChatGPT 聊天有什么本质区别？如果 ChatGPT 也能调用工具，它们还有区别吗？
2. 为什么需要分层架构？把所有代码写在一个文件里会有什么问题？
3. 如果让你给 my-easy-pi 加一个新功能（比如"自动提交代码"），你会放在哪一层？

---

> ← [📚 返回学习指南](../README.md) · [下一章](../02-ai-layer/README.md) →
>
> → 下一篇: [01-what-is-coding-agent.md](./01-what-is-coding-agent.md)