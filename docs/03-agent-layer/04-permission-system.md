---
source: src/agent/permission.ts
last_updated: 2026-08-08
version: 1.0.0
---

# 权限系统

> 权限系统是 Agent 的"安全门卫"，防止 Agent 执行危险操作。

## 1. 本节目标

- 理解三级风险等级（SAFE / NORMAL / DANGEROUS）的设计
- 掌握默认风险规则
- 理解交互式确认流程
- 了解非 TTY 环境的自动拒绝策略
- 掌握已批准命令缓存机制

## 2. 前置知识

- 理解 Agent Loop 的钩子系统（见 [01-agent-loop.md](01-agent-loop.md)）
- 了解 `beforeToolCall` 钩子的作用
- 了解 `process.stdin.isTTY` 的概念

## 3. 核心概念

### 3.1 类比：机场安检

权限系统就像机场安检：

| 权限概念 | 机场安检类比 | 说明 |
|---------|-------------|------|
| SAFE 等级 | 带瓶装水过安检 | 直接放行，无需检查 |
| NORMAL 等级 | 带笔记本电脑 | 需要单独过检，但通常放行 |
| DANGEROUS 等级 | 带打火机 | 严格检查，需要确认 |
| 已批准缓存 | 常旅客白名单 | 同一乘客下次不再检查 |
| 非 TTY 拒绝 | 自动安检通道 | 无人值守时一律拒绝 |

### 3.2 三级风险等级

```
SAFE          ──→ 直接放行
  │
  ▼
NORMAL        ──→ 需要用户确认
  │
  ▼
DANGEROUS     ──→ 需要用户确认（显示红色警告）
```

## 4. 代码实现

### 4.1 风险等级与规则定义

```typescript
// src/agent/permission.ts 第 21-46 行
/** 工具风险等级 */
export enum RiskLevel {
  SAFE = 'safe',       // 安全操作，直接放行
  NORMAL = 'normal',   // 一般风险，需要用户确认
  DANGEROUS = 'danger', // 高风险操作，需要用户确认
}

/** 权限规则 */
export interface PermissionRule {
  pattern: RegExp | string  // 命令匹配模式
  risk: RiskLevel           // 风险等级
  reason?: string           // 风险原因说明
}

/** 默认的危险命令规则 */
const DEFAULT_RULES: PermissionRule[] = [
  { pattern: /^rm\s+-[rf]/, risk: RiskLevel.DANGEROUS, reason: '强制删除文件' },
  { pattern: /^rm\s+/, risk: RiskLevel.NORMAL, reason: '删除文件' },
  { pattern: /^(sudo|su)\s+/, risk: RiskLevel.DANGEROUS, reason: '提权操作' },
  { pattern: /^(chmod|chown|chattr)\s+/, risk: RiskLevel.NORMAL, reason: '修改文件权限' },
  { pattern: /^(mkfs|fdisk|dd|format)\s+/, risk: RiskLevel.DANGEROUS, reason: '磁盘操作' },
  { pattern: /^kill\s+/, risk: RiskLevel.NORMAL, reason: '终止进程' },
  { pattern: /^rm\s+-[rf]/, risk: RiskLevel.DANGEROUS, reason: '强制删除' },        // 重复规则
  { pattern: /^(wget|curl)\s+.*\||.*(?:curl|wget).*\|/, risk: RiskLevel.DANGEROUS, reason: '远程执行脚本' },
  { pattern: /^>\s+/, risk: RiskLevel.NORMAL, reason: '覆盖文件' },
  { pattern: /^>>\s+/, risk: RiskLevel.NORMAL, reason: '追加文件' },
]
```

> **注意**：`rm -rf` 的规则出现了两次，这在当前实现中虽然不会导致错误（因为第一个匹配后就会返回），但说明代码有一个小瑕疵——后续的模式匹配不会因为重复规则而中断。

### 4.2 PermissionManager 类

```typescript
// src/agent/permission.ts 第 48-129 行
export class PermissionManager {
  private rules: PermissionRule[]    // 风险规则列表
  private approved = new Set<string>()  // 已批准的命令缓存

  constructor(rules?: PermissionRule[]) {
    this.rules = rules || DEFAULT_RULES  // 未提供规则则使用默认规则
  }

  /** 检查工具调用是否允许执行
   *  返回 undefined 表示允许，返回 BlockResult 表示阻止 */
  async check(ctx: ToolCallContext): Promise<BlockResult | undefined> {
    // 只检查 bash 工具
    if (ctx.toolCall.name !== 'bash') return undefined

    const command = (ctx.args.command as string) || ''
    const risk = this.evaluateRisk(command)

    // SAFE 等级直接放行
    if (risk === RiskLevel.SAFE) return undefined

    // 已批准的命令直接放行
    const key = command.trim()
    if (this.approved.has(key)) return undefined

    // 非交互环境（测试/CI/管道）直接拒绝
    if (!process.stdin.isTTY) {
      return { block: true, reason: `非交互环境，已自动拒绝: ${command.slice(0, 100)}` }
    }

    // 交互式确认
    const confirmed = await this.promptUser(command, risk)
    if (confirmed) {
      this.approved.add(key)  // 加入缓存，下次不再询问
      return undefined
    }

    // 用户拒绝
    return {
      block: true,
      reason: `用户拒绝了命令执行: ${command.slice(0, 100)}`,
    }
  }

  // ... 后续方法
}
```

**检查流程：**

```
check(ctx) 被调用
    │
    ├── 工具不是 bash？→ 放行（return undefined）
    │
    ├── 命令是 SAFE 等级？→ 放行
    │
    ├── 命令已在缓存中？→ 放行
    │
    ├── 非 TTY 环境？→ 拒绝（block: true）
    │
    └── TTY 环境 → 提示用户确认
            │
            ├── 用户确认 → 加入缓存 → 放行
            │
            └── 用户拒绝 → 拒绝
```

### 4.3 风险等级评估

```typescript
// src/agent/permission.ts 第 86-100 行
private evaluateRisk(command: string): RiskLevel {
  const trimmed = command.trim()

  // 安全命令白名单
  const safeCommands = [
    'ls', 'cat', 'head', 'tail', 'echo', 'pwd', 'whoami',
    'date', 'which', 'type', 'wc', 'sort', 'uniq', 'grep',
    'find', 'diff', 'git status',
  ]
  if (safeCommands.some(c => trimmed.startsWith(c))) {
    return RiskLevel.SAFE
  }

  // 匹配风险规则
  for (const rule of this.rules) {
    if (rule.pattern instanceof RegExp) {
      if (rule.pattern.test(trimmed)) return rule.risk
    }
  }

  // 未匹配任何规则 → 默认 NORMAL
  return RiskLevel.NORMAL
}
```

**评估逻辑：**
1. 先检查安全命令白名单（`startsWith` 匹配）
2. 再匹配风险规则（正则表达式匹配）
3. 未匹配任何规则则默认 `NORMAL`

> **注意**：`find` 被列在安全命令中，但 `find` 配合 `-exec` 可以执行任意命令，这是一个潜在的安全漏洞。

### 4.4 交互式确认

```typescript
// src/agent/permission.ts 第 103-126 行
private promptUser(command: string, risk: RiskLevel): Promise<boolean> {
  const riskLabel = risk === RiskLevel.DANGEROUS ? '🔴 高风险' : '🟡 普通风险'
  return new Promise((resolve) => {
    // 创建 readline 接口
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,  // 使用 stderr 避免干扰 stdout
    })

    // 显示确认信息
    process.stderr.write(`\n${'='.repeat(50)}\n`)
    process.stderr.write(`${riskLabel} 操作需要确认\n`)
    process.stderr.write(`命令: ${command}\n`)
    process.stderr.write(`${'='.repeat(50)}\n`)
    process.stderr.write('是否允许执行？(y/N) ')

    // 30 秒超时自动拒绝
    const timeout = setTimeout(() => {
      rl.close()
      resolve(false)
    }, 30_000)

    rl.on('line', (line) => {
      clearTimeout(timeout)
      rl.close()
      resolve(['y', 'yes'].includes(line.trim().toLowerCase()))
    })

    rl.on('SIGINT', () => {
      clearTimeout(timeout)
      rl.close()
      resolve(false)
    })
  })
}
```

**设计要点：**
- 使用 `process.stderr` 输出提示信息，避免干扰 stdout 的正常输出
- 30 秒超时自动拒绝，防止 Agent 因等待用户输入而"卡死"
- 接受 `y` 或 `yes`（大小写不敏感）为确认
- 处理 `SIGINT`（Ctrl+C）信号

### 4.5 与 Agent 的集成

```typescript
// 使用方式
const pm = new PermissionManager()
const agent = new Agent({
  systemPrompt: '...',
  model,
  tools: [bashTool],
  // 将权限检查作为 beforeToolCall 钩子
  beforeToolCall: (ctx) => pm.check(ctx),
})
```

通过 `beforeToolCall` 钩子集成，权限系统不需要修改 Agent 核心代码——这是钩子设计模式的优势。

## 5. 运行与验证

### 5.1 模拟测试

```typescript
import { PermissionManager, RiskLevel } from './src/agent/permission.js'

const pm = new PermissionManager()

// 模拟工具调用上下文
const mockCtx = (command: string) => ({
  toolCall: { id: '1', name: 'bash', args: { command } },
  args: { command },
  messages: [],
})

// 安全命令 — 直接放行
console.log(await pm.check(mockCtx('ls -la')))   // undefined

// 危险命令 — 需要确认（非 TTY 环境会拒绝）
console.log(await pm.check(mockCtx('rm -rf /')))  // { block: true, reason: '非交互环境...' }

// 正常命令 — 需要确认
console.log(await pm.check(mockCtx('kill 1234')))  // { block: true, reason: '非交互环境...' }
```

### 5.2 非 TTY 环境行为

在 CI/CD 或管道中运行：

```bash
# 非 TTY 环境
echo "test" | node -e "
  const { PermissionManager } = require('./src/agent/permission.js')
  const pm = new PermissionManager()
  pm.check({
    toolCall: { name: 'bash', id: '1', args: { command: 'sudo rm -rf /' } },
    args: { command: 'sudo rm -rf /' },
    messages: [],
  }).then(console.log)
"
# 输出: { block: true, reason: '非交互环境，已自动拒绝: sudo rm -rf /' }
```

## 6. 小结

### 学到的核心概念

1. **三级风险等级**：SAFE（直接放行）、NORMAL（需确认）、DANGEROUS（需确认+红色警告）
2. **默认规则**覆盖了常见的危险操作（rm -rf、sudo、磁盘操作等）
3. **交互式确认**通过 readline 实现，30 秒超时自动拒绝
4. **非 TTY 环境自动拒绝**，防止无人值守时的危险操作
5. **已批准命令缓存**，同一会话中不再重复询问
6. **通过 `beforeToolCall` 钩子集成**，无需修改核心代码

### 思考题

1. `evaluateRisk()` 方法中使用了 `startsWith` 匹配安全命令。如果用户输入 `ls -la; rm -rf /`，`ls` 会匹配成功，但实际执行的是危险操作。这可能是一个安全漏洞，应该如何修复？
2. 已批准命令缓存使用 `Set<string>` 存储，只精确匹配。如果用户先批准了 `rm file1.txt`，然后 Agent 想执行 `rm file2.txt`，会再次询问。如何优化？
3. 当前只检查 `bash` 工具。如果后续新增了 `file_write` 工具，也需要权限检查，应该如何扩展？
4. 30 秒超时是写死的。如果要成为可配置的选项，应该怎么设计？

> ← [上一节](./03-message-queue.md) · [下一节](./05-event-system.md) →
>
> [📚 返回章节首页](../03-agent-layer/README.md)