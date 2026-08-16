# 日志系统

> 对应源码：`src/config/logger.ts`
> 最后更新：2026-08-08
> 适用版本：my-easy-pi v0.1.0

---

## 1. 本节目标

- 理解 my-easy-pi 日志系统的分层设计
- 掌握三种日志文件（access、error、audit）的用途
- 学习 JSONL 格式和按天轮转的实现
- 了解审计日志如何记录工具执行

---

## 2. 前置知识

- Node.js `fs/promises` 文件操作（`appendFile`、`mkdir`）
- JSON 序列化
- 日志级别概念（debug、info、warn、error）

---

## 3. 核心概念

### 3.1 日志分层

my-easy-pi 的日志系统将日志分为三个独立的文件流，分别记录不同类型的信息：

| 日志类型 | 文件命名 | 记录内容 |
|---------|---------|---------|
| **访问日志** (access) | `access-YYYY-MM-DD.jsonl` | 普通信息、警告信息 |
| **错误日志** (error) | `error-YYYY-MM-DD.jsonl` | 错误信息 |
| **审计日志** (audit) | `audit-YYYY-MM-DD.jsonl` | 操作审计（工具执行等） |

### 3.2 JSONL 格式

JSONL（JSON Lines）是一种每行一个 JSON 对象的文本格式，优势：
- 每行独立，无需解析整个文件即可追加
- 兼容标准 JSON 解析器（逐行解析）
- 适合日志追加写入场景

### 3.3 按天轮转

日志文件名包含日期（如 `access-2026-08-08.jsonl`），每天自动生成新文件，无需手动轮转配置。

### 3.4 日志存储路径

所有日志文件存储在 `~/.my-easy-pi/logs/` 目录下。

---

## 4. 代码实现

### 4.1 日志目录与类型定义

```typescript
// src/config/logger.ts

const LOG_DIR = join(homedir(), '.my-easy-pi', 'logs')  // ~/.my-easy-pi/logs/

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string    // ISO 8601 时间戳
  level: LogLevel      // 日志级别
  message: string      // 日志消息
  [key: string]: unknown  // 允许附加任意字段
}
```

### 4.2 日志级别控制

```typescript
// src/config/logger.ts

// 当前日志级别，通过环境变量 PIAGENT_LOG_LEVEL 控制
const CURRENT_LEVEL: LogLevel = (process.env.PIAGENT_LOG_LEVEL as LogLevel) || 'info'

// 级别优先级映射
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,   // 最低
  info: 1,
  warn: 2,
  error: 3,   // 最高
}

// 判断是否应该输出该级别的日志
function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[CURRENT_LEVEL]
}
```

**级别过滤规则**：只有级别大于等于当前设定级别的日志才会输出到终端。例如默认级别为 `info` 时，`debug` 日志被过滤。

### 4.3 按天轮转的文件名生成

```typescript
// src/config/logger.ts

function today(): string {
  const d = new Date()
  // 格式：YYYY-MM-DD，例如 2026-08-08
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

### 4.4 核心写入函数

```typescript
// src/config/logger.ts

async function ensureDir(): Promise<void> {
  // 确保日志目录存在，不存在则创建
  if (!existsSync(LOG_DIR)) await mkdir(LOG_DIR, { recursive: true })
}

async function writeLog(filename: string, entry: LogEntry): Promise<void> {
  try {
    await ensureDir()
    // 以追加模式写入 JSONL 格式（每行一个 JSON 对象）
    await appendFile(
      join(LOG_DIR, filename),
      JSON.stringify(entry) + '\n',   // 序列化 + 换行
      'utf-8',
    )
  } catch {
    /* 静默失败 —— 日志写入失败不影响主流程 */
  }
}
```

**设计要点**：
- 使用 `appendFile` 追加写入，无需加载整个文件
- 每次写入一行 JSON，构成 JSONL 格式
- 写入失败时静默处理，不抛出异常——日志系统崩溃不应影响主程序

### 4.5 logger 对象

```typescript
// src/config/logger.ts

export const logger = {
  // ── 信息日志：输出到终端（info 及以上） + 写入 access 文件 ──
  info(message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      ...data,          // 附加数据，如 { duration: 123 }
    }
    if (shouldLog('info')) console.error(`[info] ${message}`)
    writeLog(`access-${today()}.jsonl`, entry)
  },

  // ── 警告日志：同 info 的写入方式，但级别不同 ──
  warn(message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      ...data,
    }
    if (shouldLog('warn')) console.error(`[warn] ${message}`)
    writeLog(`access-${today()}.jsonl`, entry)
  },

  // ── 错误日志：输出到终端 + 写入 error 文件（独立文件） ──
  error(message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      ...data,
    }
    if (shouldLog('error')) console.error(`[error] ${message}`)
    writeLog(`error-${today()}.jsonl`, entry)  // 写入 error 文件
  },

  // ── 调试日志：仅输出到终端，不写文件 ──
  debug(message: string, data?: Record<string, unknown>): void {
    if (!shouldLog('debug')) return  // debug 级别默认被过滤
    console.error(`[debug] ${message}`)
  },

  // ── 审计日志：仅写文件，不输出到终端 ──
  audit(action: string, detail: Record<string, unknown>): void {
    writeLog(`audit-${today()}.jsonl`, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: action,     // 动作名称，如 'tool_execution'
      ...detail,           // 详细数据，如 { tool: 'bash', command: 'ls' }
    })
  },
}
```

**五种日志方法对比**：

| 方法 | 终端输出 | 写入文件 | 文件类型 |
|------|---------|---------|---------|
| `logger.info()` | 是（info 及以上级别） | 是 | access |
| `logger.warn()` | 是（warn 及以上级别） | 是 | access |
| `logger.error()` | 是（error 及以上级别） | 是 | error |
| `logger.debug()` | 是（仅 debug 级别） | 否 | — |
| `logger.audit()` | 否 | 是 | audit |

### 4.6 审计日志的实际应用

在 `src/tools/builtin/bash.ts` 中，审计日志记录每次工具执行：

```typescript
// src/tools/builtin/bash.ts

logger.audit('tool_execution', {
  tool: 'bash',
  command,              // 执行的命令，如 'ls -la'
  exitCode: result.exitCode,  // 退出码
  runtime: result.runtime,    // 执行环境：'docker' | 'local'
})
```

### 4.7 在初始化中的使用

在 `src/config/init.ts` 中，日志系统记录 Docker 构建失败：

```typescript
// src/config/init.ts

logger.error('docker_build_failed', { error: String(error) })
```

---

## 5. 运行与验证

### 5.1 查看日志文件

```bash
# 查看今日的访问日志
cat ~/.my-easy-pi/logs/access-$(date +%Y-%m-%d).jsonl

# 查看今日的错误日志
cat ~/.my-easy-pi/logs/error-$(date +%Y-%m-%d).jsonl

# 查看今日的审计日志
cat ~/.my-easy-pi/logs/audit-$(date +%Y-%m-%d).jsonl
```

### 5.2 日志输出示例

访问日志条目示例：
```json
{"timestamp":"2026-08-08T10:30:00.000Z","level":"info","message":"my-easy-pi started"}
```

审计日志条目示例：
```json
{"timestamp":"2026-08-08T10:30:05.000Z","level":"info","message":"tool_execution","tool":"bash","command":"ls -la","exitCode":0,"runtime":"docker"}
```

### 5.3 调整日志级别

```bash
# 启用 debug 级别日志
export PIAGENT_LOG_LEVEL=debug
pi -m "hello"

# 只显示错误
export PIAGENT_LOG_LEVEL=error
pi -m "hello"
```

---

## 6. 小结

本节介绍了 my-easy-pi 的日志系统，核心要点：

- **三流分离**：access、error、audit 三个独立文件流，职责清晰
- **JSONL 格式**：每行一个 JSON 对象，便于机器解析和日志分析
- **按天轮转**：文件名自动包含日期，无需手动轮转配置
- **级别控制**：通过 `PIAGENT_LOG_LEVEL` 环境变量控制终端输出详略
- **审计日志**：专门记录工具执行等关键操作，不输出到终端，避免干扰
- **静默失败**：日志写入失败不影响主流程，保证系统健壮性

### 思考题

1. 为什么审计日志（audit）只写文件不输出到终端？什么场景下需要这样做？
2. 如果要将日志文件存储到自定义目录（如 `/var/log/my-easy-pi/`），需要修改哪些代码？
3. 如何实现日志文件自动清理（如只保留最近 7 天的日志）？

> ← [上一节](./01-config-manager.md) · [下一节](./03-docker-sandbox.md) →
>
> [📚 返回章节首页](../08-config-and-sandbox/README.md)