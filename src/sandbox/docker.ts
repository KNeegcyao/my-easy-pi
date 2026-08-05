// ============================================================
// DockerSandbox — Docker 沙箱执行器
//
// 将 bash 命令放到 Docker 容器中执行，隔离宿主机环境。
//
// 功能：
//   - 自动检测 Docker 可用性
//   - 自动构建/复用沙箱镜像
//   - 容器中执行命令
//   - 自动清理容器
//   - Docker 不可用时回退到本地执行
//
// 使用方式：
//   const sandbox = new DockerSandbox()
//   const result = await sandbox.execute("ls -la", 10000, signal)
// ============================================================

import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

const IMAGE_NAME = 'piagent-sandbox:latest'
const CONTAINER_NAME_PREFIX = 'piagent-sandbox-'

export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number
  /** 实际执行环境 */
  runtime: 'docker' | 'local'
}

export class DockerSandbox {
  private available: boolean | null = null
  private containerId: string | null = null

  /** 检查 Docker 是否可用 */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available
    try {
      await execAsync('docker info', { timeout: 5000 })
      this.available = true
    } catch {
      this.available = false
    }
    return this.available
  }

  /** 构建沙箱镜像（如果尚未构建） */
  async ensureImage(): Promise<boolean> {
    if (!(await this.isAvailable())) return false
    try {
      await execAsync(`docker image inspect ${IMAGE_NAME}`, { timeout: 5000 })
      return true
    } catch {
      try {
        await execAsync(`docker build -t ${IMAGE_NAME} -f Dockerfile .`, {
          timeout: 120_000,
        })
        return true
      } catch {
        this.available = false
        return false
      }
    }
  }

  /** 在沙箱中执行命令 */
  async execute(
    command: string,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<SandboxResult> {
    if (!(await this.isAvailable())) {
      return this.executeLocal(command, timeout, signal)
    }

    await this.ensureImage()
    const containerName = `${CONTAINER_NAME_PREFIX}${Date.now()}`

    try {
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
      const err = error as Error & { code?: string | number; stdout?: string; stderr?: string }
      if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: 1, runtime: 'docker' }
      }
      return this.executeLocal(command, timeout, signal)
    }
  }

  /** 本地执行（回退方案） */
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

  /** 资源清理 */
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
}

/** 单例模式 */
let instance: DockerSandbox | null = null
export function getSandbox(): DockerSandbox {
  if (!instance) instance = new DockerSandbox()
  return instance
}