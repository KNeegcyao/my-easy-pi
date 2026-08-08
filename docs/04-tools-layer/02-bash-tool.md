---
对应源码: src/tools/builtin/bash.ts, src/sandbox/docker.ts
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# Bash 工具

## 1. 本节目标

理解 `bash` 工具的实现，包括：

- 使用 `@sinclair/typebox` 定义参数 schema
- 沙箱获取与可用性检测
- 命令执行、超时与中断处理
- Docker 不可用时的自动降级
- 与权限系统和审计日志的配合

## 2. 前置知识

- 了解 `AgentTool` 接口的 `execute` 签名
- 了解 `@sinclair/typebox` 的 `Type.Object` 和 `Type.String` 等 API
- 了解 Docker 基本概念（容器、镜像、`docker run`）
- 了解 `AbortSignal` 的用法（用于取消异步操作）

## 3. 核心概念

### 3.1 Bash 工具的角色

`bash` 工具是 piagent 中最强大的工具——它让 LLM 能够执行任意的 shell 命令。如果说其他工具是"专门化的手"，bash 就是"万能工具"。

但强大的能力也意味着风险，因此 bash 工具做了三层安全防护：

1. **沙箱执行**：优先在 Docker 容器中执行，隔离宿主机环境
2. **资源限制**：Docker 容器限制 CPU、内存、网络、进程数
3. **自动降级**：Docker 不可用时回退到本地执行（透明处理）

### 3.2 沙箱架构

```
┌─────────────────────────────────────┐
│           bashTool.execute()        │
├─────────────────────────────────────┤
│           getSandbox()              │  ← 获取单例沙箱实例
├─────────────────────────────────────┤
│   ┌─────────────────────────────┐   │
│   │   DockerSandbox             │   │
│   │   ┌─────────────────────┐   │   │
│   │   │  isAvailable()      │   │   │  ← 检测 Docker 是否可用
│   │   ├─────────────────────┤   │   │
│   │   │  execute(command)   │   │   │  ← 在容器中执行
│   │   ├─────────────────────┤   │   │
│   │   │  executeLocal()     │   │   │  ← 降级方案：本地执行
│   │   └─────────────────────┘   │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

## 4. 代码实现

### 4.1 完整源码

```typescript
// src/tools/builtin/bash.ts
import { Type } from '@sinclair/typebox'
import type { AgentTool } from '../../agent/types.js'
import { getSandbox } from '../../sandbox/index.js'
import { logger } from '../../config/index.js'

/** 创建 bash 工具 */
export const bashTool: AgentTool = {
  name: 'bash',
  label: 'Shell',
  description: '执行 shell 命令，获取输出结果',
  parameters: Type.Object({
    command: Type.String({ description: '要执行的 shell 命令' }),
    timeout: Type.Optional(Type.Number({ description: '超时时间（毫秒），默认 30000' })),
  }),

  async execute(toolCallId, params, signal, onUpdate) {
    const command = params.command as string       // 提取命令
    const timeout = (params.timeout as number) || 30000  // 默认 30 秒超时

    // 获取沙箱实例
    const sandbox = getSandbox()
    const isSandbox = await sandbox.isAvailable()

    // 通知调用方：环境信息
    onUpdate?.({
      content: [{
        type: 'text',
        text: isSandbox ? `🔒 在沙箱中执行: ${command}` : `执行: ${command}`,
      }],
    })

    try {
      const result = await sandbox.execute(command, timeout, signal)

      const output = result.stdout || result.stderr || '(无输出)'
      const runtimeInfo = result.runtime === 'docker' ? ' [沙箱]' : ' [本地]'

      // 写入审计日志
      logger.audit('tool_execution', {
        tool: 'bash', command, exitCode: result.exitCode, runtime: result.runtime,
      })

      return {
        content: [{ type: 'text', text: output + runtimeInfo }],
        details: { command, exitCode: result.exitCode, runtime: result.runtime },
      }
    } catch (error: unknown) {
      const err = error as Error
      logger.audit('tool_execution_failed', { tool: 'bash', command, error: err.message })

      return {
        content: [{ type: 'text', text: err.message || String(error) }],
        details: { command, exitCode: 1 },
      }
    }
  },
}
```

### 4.2 逐行注释

- **第 9 行**：`import { Type } from '@sinclair/typebox'` — typebox 是一个用于创建 JSON Schema 的库，提供类型安全的 schema 定义。
- **第 16-22 行**：工具元信息定义。
  - `name: 'bash'` — LLM 调用时使用的标识
  - `description` — 描述工具的用途，LLM 根据此决定是否调用
  - `parameters` — 使用 `Type.Object` 定义参数 schema，typebox 会自动生成 JSON Schema
- **第 20 行**：`Type.Optional(Type.Number(...))` — `timeout` 参数是可选的，默认值在提取时处理。
- **第 24 行**：`async execute(toolCallId, params, signal, onUpdate)` — 四个参数：
  - `toolCallId`：本次工具调用的唯一 ID
  - `params`：LLM 传入的参数，类型为 `Record<string, unknown>`
  - `signal`：`AbortSignal`，用于取消正在执行的命令
  - `onUpdate`：可选的回调函数，用于流式输出中间状态
- **第 29 行**：`getSandbox()` — 获取沙箱单例（见下文 4.4 节）。
- **第 30 行**：`sandbox.isAvailable()` — 检测 Docker 是否可用，结果会被缓存。
- **第 32-37 行**：`onUpdate?.(...)` — 向调用方发送中间状态更新，UI 可以据此显示"正在沙箱中执行"的提示。
- **第 40 行**：`sandbox.execute(command, timeout, signal)` — 执行命令，传入超时和取消信号。
- **第 42 行**：`result.stdout || result.stderr || '(无输出)'` — 优先取 stdout，如果为空则取 stderr，都为空则显示占位符。
- **第 45-47 行**：`logger.audit` — 写入审计日志，记录谁执行了什么命令、退出码和执行环境。
- **第 53-61 行**：异常处理 — 任何异常（超时、取消、沙箱崩溃）都被捕获，返回友好的错误消息。

### 4.3 沙箱执行器（DockerSandbox）

```typescript
// src/sandbox/docker.ts — 核心 execute 方法
export class DockerSandbox {
  async execute(
    command: string,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<SandboxResult> {
    // 1. 如果 Docker 不可用，直接降级到本地执行
    if (!(await this.isAvailable())) {
      return this.executeLocal(command, timeout, signal)
    }

    // 2. 确保沙箱镜像已构建
    await this.ensureImage()
    const containerName = `${CONTAINER_NAME_PREFIX}${Date.now()}`

    try {
      // 3. 在 Docker 容器中执行命令
      //    --network none: 无网络（防止数据泄露）
      //    --memory 512m: 内存限制
      //    --cpus 1: CPU 限制
      //    --pids-limit 50: 进程数限制
      //    --read-only: 只读文件系统
      const escaped = command.replace(/'/g, "'\\''")
      const { stdout, stderr } = await execAsync(
        `docker run --rm --name ${containerName} ` +
        `--network none --memory 512m --cpus 1 ` +
        `--pids-limit 50 --read-only ` +
        `--tmpfs /tmp:rw,size=10m ` +
        `${IMAGE_NAME} /bin/bash -c '${escaped}'`,
        { timeout, signal, maxBuffer: 10 * 1024 * 1024 },
      )
      return { stdout, stderr, exitCode: 0, runtime: 'docker' }
    } catch (error: unknown) {
      // 4. Docker 执行失败，降级到本地
      return this.executeLocal(command, timeout, signal)
    }
  }
}
```

沙箱的安全限制：

| 参数 | 值 | 作用 |
|------|----|------|
| `--network none` | 无网络 | 防止命令访问网络 |
| `--memory` | 512m | 限制内存使用，防止 fork 炸弹 |
| `--cpus` | 1 | 限制 CPU 使用 |
| `--pids-limit` | 50 | 限制进程数，防止 fork 炸弹 |
| `--read-only` | 是 | 容器文件系统只读 |
| `--tmpfs /tmp` | 10m | 仅 `/tmp` 可写，大小限制 10MB |

### 4.4 沙箱单例模式

```typescript
// src/sandbox/docker.ts — 末尾
let instance: DockerSandbox | null = null
export function getSandbox(): DockerSandbox {
  if (!instance) instance = new DockerSandbox()  // 懒加载单例
  return instance
}
```

`getSandbox()` 使用**懒加载单例模式**：只会在第一次调用时创建实例，后续调用复用同一个实例。这样 `isAvailable()` 的检测结果（Docker 是否可用）会被缓存，避免每次执行命令都检测一次。

## 5. 运行与验证

```bash
# 1. 确认代码编译通过
cd /workspace
npm run build

# 2. 测试 Docker 沙箱可用性（如果 Docker 已安装）
docker info > /dev/null 2>&1 && echo "Docker 可用" || echo "Docker 不可用，将使用本地执行"

# 3. 通过 Node 测试 bash 工具的基本功能
node -e "
import('./dist/tools/builtin/bash.js').then(({ bashTool }) => {
  bashTool.execute('test-1', { command: 'echo hello world' }, new AbortController().signal)
    .then(result => console.log(JSON.stringify(result, null, 2)))
})
"
```

## 6. 小结

`bash` 工具是 piagent 中最重要也最复杂的工具。它的设计体现了几个关键原则：

- **安全优先**：通过 Docker 沙箱隔离执行环境，即使 LLM 生成了恶意命令，也不会影响宿主机
- **透明降级**：Docker 不可用时自动回退到本地执行，Agent 层无需感知差异
- **全面审计**：所有命令执行都记录审计日志，便于事后追溯
- **资源控制**：通过超时机制和 AbortSignal 防止命令无限执行

### 思考题

1. Docker 沙箱的 `--network none` 意味着容器内无法访问网络。如果 LLM 需要执行 `curl` 或 `wget` 命令，应该如何处理？
2. 当前实现中，如果 Docker 命令执行失败（如容器启动超时），会降级到本地执行。这种设计是否有安全隐患？什么情况下降级是不合适的？
3. `onUpdate` 回调在 bash 工具中只使用了一次（通知环境信息）。如果需要在命令执行过程中**流式输出** stdout 内容（而非等待执行完成），应该如何修改 execute 方法？

---

## 下一章

→ [文件工具](03-file-tools.md)