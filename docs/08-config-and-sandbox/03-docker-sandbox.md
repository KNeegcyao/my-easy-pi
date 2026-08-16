# Docker 沙箱

> 对应源码：`src/sandbox/docker.ts`、`src/sandbox/index.ts`、`src/tools/builtin/bash.ts`、`Dockerfile`
> 最后更新：2026-08-08
> 适用版本：my-easy-pi v0.1.0

---

## 1. 本节目标

- 理解为什么 AI Coding Agent 需要沙箱机制
- 掌握 Docker 沙箱的接口抽象和实现
- 学习 Docker 容器的安全配置（network none、memory 限制、read-only 等）
- 理解自动降级机制的设计与实现
- 了解沙箱在 bash 工具中的集成方式

---

## 2. 前置知识

- Docker 基本概念（镜像、容器、`docker run`）
- Docker 安全配置（network、memory、cpus、read-only 等）
- TypeScript 类与单例模式
- Node.js `child_process.exec` 异步执行

---

## 3. 核心概念

### 3.1 为什么需要沙箱

AI Coding Agent 可以执行任意 bash 命令，如果命令直接在宿主机上运行，存在以下风险：

| 风险类型 | 示例 | 危害 |
|---------|------|------|
| **文件系统破坏** | `rm -rf /` | 删除宿主机关键文件 |
| **数据泄露** | `cat /etc/ssh/ssh_host_rsa_key` | 泄露敏感信息 |
| **资源耗尽** | `:(){ :|:& };:` (fork 炸弹) | 耗尽宿主机 CPU 和内存 |
| **网络攻击** | `curl http://internal-service/` | 访问内网服务 |
| **持久化后门** | `crontab -e` 添加定时任务 | 长期驻留 |

**沙箱的作用**：在一个隔离的环境中执行命令，限制其对宿主机的影响。

### 3.2 沙箱接口抽象

`DockerSandbox` 类对外暴露统一的接口：

```typescript
interface SandboxResult {
  stdout: string        // 标准输出
  stderr: string        // 标准错误
  exitCode: number      // 进程退出码
  runtime: 'docker' | 'local'  // 实际执行环境
}
```

无论底层使用 Docker 还是本地执行，调用方都使用相同的接口，无需关心执行环境。

### 3.3 自动降级机制

当 Docker 不可用时，沙箱自动降级到本地执行，整个过程对调用方透明。

---

## 4. 代码实现

### 4.1 Dockerfile — 沙箱镜像

```dockerfile
# my-easy-pi 沙箱镜像
# 基于 Alpine Linux，只安装最小工具集

FROM alpine:latest

# 安装最小工具集
RUN apk add --no-cache \
    bash \              # Bash shell
    coreutils \         # 基础工具（ls, cat, cp, mv 等）
    grep \              # 文本搜索
    findutils \         # 文件查找
    curl \              # HTTP 请求
    wget \              # 文件下载
    git \               # 版本控制
    ca-certificates \   # SSL 证书
    && rm -rf /var/cache/apk/*

# 创建非 root 用户
RUN adduser -D -h /workspace sandbox

WORKDIR /workspace
USER sandbox          # 以非 root 用户运行

CMD ["/bin/bash"]
```

**安全设计要点**：
- 基于 Alpine Linux，镜像体积小，攻击面小
- 安装最少的工具包，避免不必要的软件
- 使用非 root 用户运行，降低提权风险
- 设置 `/workspace` 为工作目录

### 4.2 DockerSandbox 类

```typescript
// src/sandbox/docker.ts

export class DockerSandbox {
  private available: boolean | null = null   // Docker 可用性缓存
  private containerId: string | null = null   // 当前容器 ID

  /** 检查 Docker 是否可用（带缓存） */
  async isAvailable(): Promise<boolean> {
    // 缓存结果，避免每次调用都执行 docker info
    if (this.available !== null) return this.available
    try {
      await execAsync('docker info', { timeout: 5000 })
      this.available = true
    } catch {
      this.available = false
    }
    return this.available
  }
}
```

**缓存机制**：`isAvailable()` 使用 `available` 字段缓存 Docker 可用性检测结果，避免每次执行命令都调用 `docker info`。

### 4.3 镜像构建

```typescript
// src/sandbox/docker.ts

/** 确保沙箱镜像已构建 */
async ensureImage(): Promise<boolean> {
  // 如果 Docker 不可用，直接返回 false
  if (!(await this.isAvailable())) return false

  try {
    // 检查镜像是否已存在
    await execAsync(`docker image inspect ${IMAGE_NAME}`, { timeout: 5000 })
    return true   // 镜像已存在，无需构建
  } catch {
    // 镜像不存在，自动构建
    try {
      await execAsync(
        `docker build -t ${IMAGE_NAME} -f Dockerfile .`,
        { timeout: 120_000 },   // 构建超时 2 分钟
      )
      return true
    } catch {
      // 构建失败，标记 Docker 不可用
      this.available = false
      return false
    }
  }
}
```

### 4.4 核心执行方法

```typescript
// src/sandbox/docker.ts

/** 在沙箱中执行命令 */
async execute(
  command: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<SandboxResult> {
  // Docker 不可用 → 降级到本地执行
  if (!(await this.isAvailable())) {
    return this.executeLocal(command, timeout, signal)
  }

  // 确保镜像存在
  await this.ensureImage()

  // 生成唯一的容器名
  const containerName = `${CONTAINER_NAME_PREFIX}${Date.now()}`

  try {
    // 转义单引号，防止 shell 注入
    const escaped = command.replace(/'/g, "'\\''")

    // 执行 Docker 容器
    const { stdout, stderr } = await execAsync(
      `docker run --rm --name ${containerName} ` +   // 自动删除容器
      `--network none ` +                             // 禁用网络
      `--memory 512m ` +                              // 内存限制 512MB
      `--cpus 1 ` +                                   // CPU 限制 1 核
      `--pids-limit 50 ` +                            // 进程数限制 50
      `--read-only ` +                                // 根文件系统只读
      `--tmpfs /tmp:rw,size=10m ` +                   // 可写临时目录
      `${IMAGE_NAME} /bin/bash -c '${escaped}'`,      // 执行命令
      { timeout, signal, maxBuffer: 10 * 1024 * 1024 },
    )
    return { stdout, stderr, exitCode: 0, runtime: 'docker' }
  } catch (error: unknown) {
    const err = error as Error & { code?: string | number; stdout?: string; stderr?: string }
    // 输出过大时，返回已有的输出
    if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || '',
        exitCode: 1,
        runtime: 'docker',
      }
    }
    // 其他错误 → 降级到本地执行
    return this.executeLocal(command, timeout, signal)
  }
}
```

### 4.5 Docker 容器安全配置详解

| 参数 | 值 | 作用 |
|------|-----|------|
| `--rm` | — | 容器退出后自动删除，不留残留 |
| `--network none` | — | 禁用网络，防止命令访问外部网络或内网服务 |
| `--memory 512m` | 512 MB | 限制内存使用，防止 fork 炸弹耗尽内存 |
| `--cpus 1` | 1 核 | 限制 CPU 使用 |
| `--pids-limit 50` | 50 | 限制进程数，防止 fork 炸弹 |
| `--read-only` | — | 根文件系统只读，防止修改系统文件 |
| `--tmpfs /tmp:rw,size=10m` | 10 MB | 提供可写的临时目录（仅 `/tmp` 可写） |

### 4.6 本地执行（降级方案）

```typescript
// src/sandbox/docker.ts

/** 本地执行 —— 当 Docker 不可用时的降级方案 */
private async executeLocal(
  command: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<SandboxResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout, signal, maxBuffer: 10 * 1024 * 1024,
    })
    return { stdout, stderr, exitCode: 0, runtime: 'local' }
  } catch (error: unknown) {
    const err = error as Error & { code?: string | number; stdout?: string; stderr?: string; exitCode?: number }
    const exitCode = typeof err.code === 'number' ? err.code : err.exitCode ?? 1
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode, runtime: 'local' }
  }
}
```

### 4.7 资源清理

```typescript
// src/sandbox/docker.ts

/** 清理所有残留的沙箱容器 */
async cleanup(): Promise<void> {
  try {
    await execAsync(
      `docker ps -a --filter "name=${CONTAINER_NAME_PREFIX}" -q | xargs -r docker rm -f 2>/dev/null || true`,
      { timeout: 10_000 },
    )
  } catch {
    // 清理失败不影响主流程
  }
}
```

### 4.8 单例导出

```typescript
// src/sandbox/docker.ts

let instance: DockerSandbox | null = null
export function getSandbox(): DockerSandbox {
  if (!instance) instance = new DockerSandbox()
  return instance
}
```

使用单例模式确保整个应用程序共享同一个沙箱实例，避免重复检测 Docker 可用性。

### 4.9 在 bash 工具中的集成

在 `src/tools/builtin/bash.ts` 中，沙箱被集成到工具执行流程中：

```typescript
// src/tools/builtin/bash.ts

async execute(toolCallId, params, signal, onUpdate) {
  const command = params.command as string
  const timeout = (params.timeout as number) || 30000

  // 获取沙箱实例（单例）
  const sandbox = getSandbox()
  // 检测 Docker 是否可用，用于 UI 提示
  const isSandbox = await sandbox.isAvailable()

  // 通知用户执行环境
  onUpdate?.({
    content: [{
      type: 'text',
      text: isSandbox
        ? `🔒 在沙箱中执行: ${command}`
        : `执行: ${command}`,
    }],
  })

  try {
    // 执行命令（自动选择 docker 或 local）
    const result = await sandbox.execute(command, timeout, signal)

    // 记录审计日志
    logger.audit('tool_execution', {
      tool: 'bash',
      command,
      exitCode: result.exitCode,
      runtime: result.runtime,
    })

    return {
      content: [{
        type: 'text',
        text: result.stdout || result.stderr || '(无输出)',
      }],
      details: { command, exitCode: result.exitCode, runtime: result.runtime },
    }
  } catch (error: unknown) {
    const err = error as Error
    logger.audit('tool_execution_failed', {
      tool: 'bash',
      command,
      error: err.message,
    })
    // ...
  }
}
```

### 4.10 初始化流程中的沙箱构建

在 `src/config/init.ts` 中，`pi --init` 命令负责构建沙箱镜像：

```typescript
// src/config/init.ts

async function buildDockerImage(): Promise<boolean> {
  // 1. 检查 Docker 是否可用
  try {
    await execAsync('docker info', { timeout: 5000 })
  } catch {
    console.log('  ⏭️  Docker 不可用，跳过沙箱镜像构建')
    return false
  }

  // 2. 检查镜像是否已存在
  try {
    await execAsync('docker image inspect my-easy-pi-sandbox:latest', { timeout: 5000 })
    console.log('  ⏭️  Docker 沙箱镜像已存在: my-easy-pi-sandbox:latest')
    return true
  } catch {
    // 3. 构建镜像
    console.log('  🔨 正在构建 Docker 沙箱镜像...')
    // ...
  }
}
```

---

## 5. 运行与验证

### 5.1 构建沙箱镜像

```bash
# 通过初始化命令构建
pi --init

# 或手动构建
docker build -t my-easy-pi-sandbox:latest -f Dockerfile .
```

### 5.2 验证沙箱隔离效果

```bash
# 在沙箱中尝试访问网络（应失败）
# 容器配置了 --network none，网络请求会被阻止

# 在沙箱中尝试写入系统目录（应失败）
# 容器配置了 --read-only，根文件系统只读

# 在沙箱中尝试 fork 炸弹（应被限制）
# 容器配置了 --pids-limit 50，进程数受限
```

### 5.3 查看执行环境

```bash
# 运行 my-easy-pi，观察 bash 工具执行时的提示
# 如果有 Docker，会显示 "🔒 在沙箱中执行: xxx"
# 如果没有 Docker，会显示 "执行: xxx"
pi -m "运行 ls -la"
```

---

## 6. 小结

本节介绍了 my-easy-pi 的 Docker 沙箱机制，核心要点：

- **安全隔离**：通过 Docker 容器的 `--network none`、`--memory 512m`、`--cpus 1`、`--read-only` 等配置，限制命令对宿主机的影响
- **接口抽象**：`SandboxResult` 统一了 Docker 和本地两种执行模式的结果格式
- **自动降级**：Docker 不可用时自动回退到本地执行，不影响用户体验
- **单例模式**：全局共享一个沙箱实例，避免重复检测
- **自动清理**：`--rm` 确保容器退出后自动删除，`cleanup()` 方法清理残留

### 思考题

1. 为什么沙箱要禁用网络（`--network none`）？在什么场景下可能需要启用网络？
2. 自动降级机制虽然方便，但存在什么安全隐患？如何改进？
3. 如果要在沙箱中挂载宿主机的某个目录（如当前项目目录），需要修改哪些配置？

> ← [上一节](./02-logger.md) · [下一节](./practice.md) →
>
> [📚 返回章节首页](../08-config-and-sandbox/README.md)