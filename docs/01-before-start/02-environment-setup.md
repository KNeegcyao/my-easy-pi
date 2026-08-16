---
对应源码: src/config/init.ts, src/cli.ts
最后更新: 2026-08-08
适用版本: v0.1.0+
---

# 环境搭建

> 在开始学习 my-easy-pi 的代码之前，先把开发环境搭好。这一节我们从零开始，直到你成功启动第一个对话。

---

## 1. 本节目标

- 安装 Node.js 和 npm
- 克隆仓库并安装依赖
- 配置 API 密钥
- 通过类型检查和测试验证环境
- 启动第一个对话

---

## 2. 前置知识

- 能打开终端，执行基本命令
- 知道什么是环境变量
- 有任意一个 LLM 的 API 密钥（DeepSeek / Anthropic / OpenAI）

---

## 3. 核心概念

### 3.1 技术栈概览

| 工具 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | >= 22 | JavaScript 运行时 |
| npm | >= 10 | 包管理器 |
| TypeScript | 7.x | 类型检查与编译 |
| Vitest | 4.x | 测试框架 |

### 3.2 为什么选择这些技术？

- **Node.js 22+**：内置 `fetch` API，无需安装 `axios` 等 HTTP 库；内置 `fs/promises`，支持现代文件操作
- **TypeScript**：类型安全，适合分层架构中定义清晰的接口边界
- **Vitest**：与 TypeScript 7.x 兼容，速度快，配置简单
- **零第三方 SDK**：LLM API 调用使用原生 `fetch` + SSE 解析，完全可控，方便学习

---

## 4. 代码实现

### 4.1 克隆仓库

```bash
# 克隆项目
git clone <项目地址>
cd my-easy-pi

# 查看项目结构（确认克隆成功）
ls -la
```

### 4.2 安装依赖

```bash
# 安装所有依赖
npm install

# 安装完成后，package.json 中声明的依赖会被下载到 node_modules/
# 关键依赖：
#   - @sinclair/typebox: 类型安全的 JSON Schema 生成（用于工具参数校验）
#   - typescript: 编译器和类型检查
#   - vitest: 测试框架
#   - @types/node: Node.js 类型定义
```

### 4.3 配置 API 密钥

my-easy-pi 支持三种 LLM 提供商，你需要至少配置一个。

**方式一：环境变量（推荐）**

```bash
# DeepSeek（默认提供商，便宜且足够用）
export DEEPSEEK_API_KEY=sk-你的密钥

# 或者 Anthropic Claude
export ANTHROPIC_API_KEY=sk-ant-你的密钥

# 或者 OpenAI
export OPENAI_API_KEY=sk-你的密钥
```

为了让配置持久化，可以把上面的一行加到 `~/.zshrc` 或 `~/.bashrc` 中：

```bash
echo 'export DEEPSEEK_API_KEY=sk-你的密钥' >> ~/.zshrc
source ~/.zshrc
```

**方式二：配置文件**

```bash
# 运行初始化命令，会自动创建配置文件
npx tsx src/cli.ts --init
```

这会在 `~/.my-easy-pi/config.json` 创建配置文件，你可以手动编辑：

```json
{
  "defaultProvider": "deepseek",
  "defaultModel": "deepseek-chat",
  "apiKeys": {
    "deepseek": "sk-你的密钥",
    "anthropic": "sk-ant-你的密钥",
    "openai": "sk-你的密钥"
  }
}
```

**配置加载优先级**（高 → 低）：

```
CLI 参数（--provider openai）     ← 最高优先级
环境变量（DEEPSEEK_API_KEY）
用户配置（~/.my-easy-pi/config.json）
项目配置（.my-easy-pi/settings.json）
硬编码默认值                       ← 最低优先级
```

### 4.4 验证安装

执行以下三个验证步骤，确保环境搭建正确：

```bash
# 1. 类型检查（验证 TypeScript 代码没有类型错误）
npx tsc --noEmit
# 预期输出：无任何输出（没有错误就是好消息）
# 如果看到错误，说明环境有问题，检查 Node.js 版本

# 2. 运行测试（验证所有功能模块正常工作）
npm test
# 预期输出：34 tests passed（或类似信息）
# 如果测试失败，检查依赖是否安装完整

# 3. 编译项目（生成 dist/ 目录）
npm run build
# 预期输出：无报错，dist/ 目录出现
```

### 4.5 启动第一个对话

```bash
# 确保已经设置了 API 密钥
# 方式一：直接提问
npx tsx src/cli.ts -m "你好，请用中文介绍你自己"

# 方式二：管道模式
echo "my-easy-pi 是什么？" | npx tsx src/cli.ts -p "请用一句话回答"

# 方式三：启动交互式 TUI（最常用的方式）
npx tsx src/cli.ts
```

**第一个对话的预期输出：**

```
[思考中...]
你好！我是 my-easy-pi，一个 AI 编程助手。我可以帮你完成以下任务：

- 阅读和编辑代码文件
- 执行 Shell 命令
- 搜索文件内容
- 管理项目结构

请问有什么我可以帮你的吗？

--- 完成 ---
```

> **注意**：如果看到 `[AUTH_API_KEY_MISSING]` 错误，说明 API 密钥没有配置正确，请检查环境变量或配置文件。

### 4.6 设置别名（可选）

为了方便使用，可以设置命令行别名：

```bash
# 将 pi 命令指向项目入口
echo 'alias pi="npx tsx $(pwd)/src/cli.ts"' >> ~/.zshrc
source ~/.zshrc

# 之后就可以直接使用
pi -m "你好"
pi    # 启动 TUI
```

### 4.7 如果遇到问题

| 问题 | 可能原因 | 解决方法 |
|------|---------|---------|
| `tsc --noEmit` 报错 | Node.js 版本过低 | 运行 `node -v` 确认版本 >= 22 |
| `npm test` 失败 | 依赖未安装完整 | 运行 `npm install` 重新安装 |
| `AUTH_API_KEY_MISSING` | 未配置 API 密钥 | 设置环境变量或配置文件 |
| `PROVIDER_NOT_FOUND` | 提供商名称错误 | 使用 `deepseek` / `anthropic` / `openai` |
| 网络超时 | 无法访问 LLM API | 检查网络连接，确认 API 端点可访问 |

---

## 5. 运行与验证

完成本节后，请确认以下检查项全部通过：

```bash
# 检查清单
echo "✅ Node.js 版本: $(node -v)"
echo "✅ npm 版本: $(npm -v)"
echo "✅ 类型检查: $(npx tsc --noEmit && echo '通过' || echo '失败')"
echo "✅ 测试: $(npm test 2>&1 | tail -5)"
echo "✅ API 密钥: $(echo ${DEEPSEEK_API_KEY:+已配置} ${ANTHROPIC_API_KEY:+已配置} ${OPENAI_API_KEY:+已配置})"
echo "✅ 首次对话: 手动运行 pi -m '你好' 确认"
```

---

## 6. 小结

### 本节要点

- my-easy-pi 需要 Node.js >= 22 和 npm >= 10
- 安装三步走：`git clone` → `npm install` → 配置 API 密钥
- 验证两步走：`npx tsc --noEmit`（类型检查）→ `npm test`（测试）
- API 密钥可通过环境变量或配置文件设置，环境变量优先级更高
- 使用 `npx tsx src/cli.ts` 可绕过编译，直接运行 TypeScript 源码

### 思考题

1. 为什么 my-easy-pi 选择用原生 `fetch` 而不是 `axios` 来调用 LLM API？这样做有什么好处和坏处？

2. 配置优先级中"环境变量 > 配置文件"的设计，在什么场景下会特别有用？（提示：想想 CI/CD 环境）

3. 如果要在 my-easy-pi 中加入一个新的 LLM 提供商（比如 Google Gemini），除了在 `src/ai/providers/` 下新建文件，还需要修改哪些地方？

4. `npx tsx src/cli.ts` 直接运行 TypeScript 源码很方便，但生产环境为什么不推荐这样做？

---

## 7. 故障排除

> 以下汇集了使用 my-easy-pi 时最常见的错误信息。所有错误码定义在 `src/ai/errors.ts` 中，你可以直接查看源码了解每个错误的详细上下文。

### 常见问题及解决方法

| 错误信息 | 可能原因 | 解决方法 |
|---------|---------|---------|
| `AUTH_API_KEY_MISSING` | 未设置 API 密钥的环境变量 | 执行 `export DEEPSEEK_API_KEY=sk-xxx`，或将密钥写入 `~/.my-easy-pi/config.json` |
| `AUTH_API_KEY_INVALID` | API 密钥格式错误或已过期 | 检查密钥前后是否有空格；登录对应 LLM 官网确认密钥仍然有效 |
| `CONFIG_INVALID` | `~/.my-easy-pi/config.json` 格式不正确（如缺少逗号、多余引号） | 用 `cat ~/.my-easy-pi/config.json` 查看内容，确保是合法 JSON；可使用在线 JSON 校验工具检查 |
| `PROVIDER_NOT_FOUND` | `--provider` 参数使用了不支持的 LLM 提供商名称 | 使用 `deepseek` / `anthropic` / `openai` 之一；检查拼写是否完全匹配 |
| `MODEL_NOT_FOUND` | 指定的模型在当前提供商中不存在 | 确认模型名拼写正确（如 `deepseek-chat` 而非 `deepseek-chat-v2`）；查阅对应 API 文档获取可用模型列表 |
| `PROVIDER_RATE_LIMITED` | API 请求频率过高，触发限流 | `fetchWithRetry` 会自动处理 429 响应并等待 `Retry-After` 头指定的时间后重试；如持续出现，降低请求频率 |
| `TOOL_NOT_FOUND` | Agent 调用了未注册的工具名称 | 检查 `ToolRegistry` 中是否注册了对应工具；确认工具名与注册时完全一致 |
| `TOOL_EXECUTION_FAILED` | 工具执行过程中抛出异常（如文件不存在、命令失败） | 查看错误信息中的 `reason` 字段，修复对应问题后重试 |
| `TOOL_PERMISSION_DENIED` | 用户在 TUI 中拒绝了工具的执行请求 | 在交互界面确认操作；或在配置中预先批准可信命令 |
| `AGENT_ALREADY_STREAMING` | Agent 正在响应时发起了新的 `prompt()` | 使用 `await agent.waitForIdle()` 等待当前处理完成后再发送新消息 |
| `INTERNAL_UNEXPECTED` | 代码中出现了未预料的异常 | 查看控制台的堆栈跟踪，确认是哪一步操作触发的；可到项目的 GitHub Issues 中反馈 |
| 网络错误 `fetch failed` | 无法连接到 LLM API（无网络、DNS 解析失败、代理不通） | 执行 `curl https://api.deepseek.com` 测试连通性；检查是否需要配置 HTTP 代理 |
| `Error: connect ECONNREFUSED` | API 端点被防火墙或 VPN 规则阻止 | 检查网络环境是否限制了对 API 端点的访问；确认 API 地址拼写正确 |
| `npm test` 全部失败 | 依赖安装不完整或 Node.js 版本不匹配 | 运行 `node -v` 确认版本 >= 22；再次执行 `npm install` 重装依赖 |

> **提示**：如果你遇到了上面没有列出的错误，可以先查看 `src/ai/errors.ts` 中的错误码定义，很多场景下错误信息本身就包含了修复建议（`suggestion` 字段）。

---

> ← [上一节](./01-what-is-coding-agent.md) · [下一节](./03-project-structure.md) →
>
> [📚 返回章节首页](../01-before-start/README.md)