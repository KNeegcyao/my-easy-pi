# 分层配置管理

> 对应源码：`src/config/settings.ts`、`src/config/index.ts`
> 最后更新：2026-08-08
> 适用版本：piagent v0.1.0

---

## 1. 本节目标

- 理解 piagent 配置加载的优先级机制
- 掌握 `ConfigManager` 类的实现与使用
- 学会通过环境变量和配置文件两种方式管理 API 密钥
- 了解配置与 CLI 的集成方式

---

## 2. 前置知识

- TypeScript 类与异步编程（`async/await`）
- Node.js `process.env` 环境变量
- JSON 文件格式
- Node.js `fs/promises` 文件操作

---

## 3. 核心概念

### 3.1 配置加载优先级

piagent 采用五层配置模型，优先级从高到低为：

```
CLI 参数  >  环境变量  >  用户配置  >  项目配置  >  默认值
```

| 层级 | 来源 | 示例 |
|------|------|------|
| CLI 参数 | `process.argv` | `pi --provider anthropic --model claude-sonnet-4-20250514` |
| 环境变量 | `process.env` | `DEEPSEEK_API_KEY=sk-xxx` |
| 用户配置 | `~/.piagent/config.json` | 全局用户级配置 |
| 项目配置 | `.piagent/settings.json` | 项目级配置（可提交到仓库） |
| 默认值 | 硬编码 | `deepseek` / `deepseek-chat` |

### 3.2 配置文件路径

- **用户配置目录**：`~/.piagent/`
- **用户配置文件**：`~/.piagent/config.json`（全局，含 API 密钥）
- **项目配置目录**：`.piagent/`（相对于 `process.cwd()`）
- **项目配置文件**：`.piagent/settings.json`（项目级，不含密钥）

### 3.3 配置文件格式

用户配置 `~/.piagent/config.json`：

```json
{
  "defaultProvider": "deepseek",
  "defaultModel": "deepseek-chat",
  "apiKeys": {
    "deepseek": "sk-xxx",
    "openai": "sk-xxx",
    "anthropic": "sk-xxx"
  }
}
```

---

## 4. 代码实现

### 4.1 类型定义

```typescript
// src/config/settings.ts

export interface ApiKeys {
  deepseek?: string
  anthropic?: string
  openai?: string
  [key: string]: string | undefined   // 支持扩展更多提供商
}

export interface Settings {
  defaultProvider?: string             // 默认 AI 提供商
  defaultModel?: string                // 默认模型 ID
  apiKeys?: ApiKeys                    // 各提供商 API 密钥
  output?: 'print' | 'json' | 'rpc'   // 输出模式
  [key: string]: unknown               // 允许扩展字段
}
```

### 4.2 ConfigManager 类

```typescript
// src/config/settings.ts

export class ConfigManager {
  private userConfig: Settings = {}      // 用户级配置缓存
  private projectConfig: Settings = {}   // 项目级配置缓存
  private loaded = false                 // 是否已加载

  /** 加载所有层级的配置，合并后返回 */
  async load(): Promise<Settings> {
    const merged: Settings = {}

    // 1. 项目配置（最低优先级）—— 从 .piagent/settings.json 加载
    this.projectConfig = await this.loadFile(PROJECT_CONFIG_PATH)

    // 2. 用户配置（中等优先级）—— 从 ~/.piagent/config.json 加载
    this.userConfig = await this.loadFile(USER_CONFIG_PATH)

    // 用户配置覆盖项目配置（同名 key 以用户配置为准）
    Object.assign(merged, this.projectConfig)
    Object.assign(merged, this.userConfig)

    this.loaded = true
    return merged
  }

  /** 读取某个配置项，未加载时返回默认值 */
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.loaded) return defaultValue
    const value = this.getFromConfig(key)
    return (value as T) ?? defaultValue
  }
}
```

**设计要点**：
- `load()` 方法先加载项目配置，再加载用户配置，通过 `Object.assign` 让用户配置覆盖项目配置——实现"用户配置优先级高于项目配置"。
- `get()` 方法使用泛型，支持类型安全的取值。
- 配置只在 `load()` 时一次性读取，后续通过缓存返回，避免重复 I/O。

### 4.3 API 密钥管理：`getApiKey` 方法

```typescript
// src/config/settings.ts

/** 获取 API Key（环境变量 > 用户配置） */
getApiKey(provider: string): string | undefined {
  // 环境变量名映射表
  const envMap: Record<string, string> = {
    deepseek: 'DEEPSEEK_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
  }

  const envVar = envMap[provider]
  // 1. 环境变量优先 —— 适用于 CI/CD 或不想写配置文件
  if (envVar && process.env[envVar]) {
    return process.env[envVar]
  }

  // 2. 用户配置兜底 —— 从 ~/.piagent/config.json 的 apiKeys 中读取
  return this.userConfig.apiKeys?.[provider]
}
```

**优先级规则**：`环境变量 > 用户配置`

- 首先检查对应的环境变量（如 `DEEPSEEK_API_KEY`），如果存在则直接返回。
- 环境变量不存在时，回退到用户配置文件中的 `apiKeys` 字段。
- 这种设计让用户可以在配置文件中持久化存储密钥，同时允许通过环境变量临时覆盖（例如 CI 场景）。

### 4.4 默认值推导

```typescript
// src/config/settings.ts

/** 根据环境变量推断默认提供商 */
getDefaultProvider(): string {
  // 哪个提供商配置了 API 密钥环境变量，就用哪个
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek'
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  // 兜底：从配置读取，默认 deepseek
  return this.get('defaultProvider', 'deepseek')!
}

/** 获取默认模型，按提供商返回对应模型 */
getDefaultModel(provider: string): string {
  return this.get('defaultModel') || this.fallbackModel(provider)
}

private fallbackModel(provider: string): string {
  const models: Record<string, string> = {
    deepseek: 'deepseek-chat',
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
  }
  return models[provider] || 'deepseek-chat'
}
```

`getDefaultProvider()` 的智能推断逻辑：如果用户只设置了 `OPENAI_API_KEY`，则自动将 OpenAI 设为默认提供商，无需手动配置。

### 4.5 配置持久化

```typescript
// src/config/settings.ts

/** 设置配置项并保存到文件 */
async set(key: string, value: unknown): Promise<void> {
  this.userConfig[key] = value
  await this.save()
}

/** 保存用户配置到 ~/.piagent/config.json */
async save(): Promise<void> {
  if (!existsSync(USER_CONFIG_DIR)) {
    await mkdir(USER_CONFIG_DIR, { recursive: true })
  }
  await writeFile(
    USER_CONFIG_PATH,
    JSON.stringify(this.userConfig, null, 2),
    'utf-8',
  )
}
```

### 4.6 文件加载辅助方法

```typescript
// src/config/settings.ts

private async loadFile(path: string): Promise<Settings> {
  try {
    if (!existsSync(path)) return {}   // 文件不存在时返回空对象
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as Settings
  } catch {
    return {}                           // 解析失败时静默处理
  }
}
```

### 4.7 与 CLI 的集成

在 `src/cli.ts` 中，`ConfigManager` 的使用方式：

```typescript
// src/cli.ts

const config = new ConfigManager()
await config.load()                          // 启动时加载配置

// 从 CLI 参数或配置中决定提供商
const provider = args.provider || config.getDefaultProvider()
// 获取 API 密钥（环境变量优先）
const apiKey = config.getApiKey(provider)
// 从 CLI 参数或配置中决定模型
const modelId = args.model || config.getDefaultModel(provider)
```

完整的配置加载流程：
1. 在 `main()` 入口创建 `ConfigManager` 实例并调用 `load()`
2. 从 CLI 参数 `args.provider` 读取（最高优先级）
3. 未指定时，通过 `getDefaultProvider()` 智能推断
4. 通过 `getApiKey(provider)` 获取密钥（环境变量优先）
5. 通过 `getDefaultModel(provider)` 获取模型

---

## 5. 运行与验证

### 5.1 查看配置加载流程

```bash
# 创建用户配置
mkdir -p ~/.piagent
cat > ~/.piagent/config.json << 'EOF'
{
  "defaultProvider": "deepseek",
  "defaultModel": "deepseek-chat",
  "apiKeys": {}
}
EOF

# 通过环境变量设置 API 密钥
export DEEPSEEK_API_KEY="sk-xxx"

# 运行 piagent，它会自动读取配置
pi --help
```

### 5.2 验证优先级

```bash
# 环境变量优先级高于配置文件
export DEEPSEEK_API_KEY="env-key"
# 即使配置文件中写了不同的 key，也会使用环境变量中的值
pi -m "hello"
```

---

## 6. 小结

本节介绍了 piagent 的分层配置管理系统，核心要点：

- **五层优先级**：CLI > 环境变量 > 用户配置 > 项目配置 > 默认值，确保灵活性和安全性
- **API 密钥管理**：环境变量优先，用户配置兜底，避免密钥硬编码
- **智能默认值**：根据环境变量自动推断默认提供商
- **配置持久化**：`set()` 和 `save()` 方法支持运行时修改配置并保存

### 思考题

1. 为什么 `getApiKey` 方法中环境变量优先于用户配置？这样设计有什么安全考虑？
2. 如果用户配置和项目配置中都定义了 `defaultModel`，最终会使用哪个值？为什么？
3. 如何为 piagent 添加一个自定义配置项（如 `maxTokens`）？需要修改哪些文件？