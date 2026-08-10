// ============================================================
// DockerSandbox — Docker 沙箱执行器
//
// 将 bash 命令放到 Docker 容器中执行，隔离宿主机环境。
//
// 安全性：
//   - 使用 spawn + 参数数组，避免 shell 注入 Docker 命令本身
//   - 命令内容通过 base64 编码传递给容器，避免 shell 转义问题
//   - 容器资源受限：--network none --read-only --memory 512m 等
//   - Docker 不可用时自动回退到本地执行
//
// 使用方式：
//   const sandbox = new DockerSandbox()
//   const result = await sandbox.execute("ls -la", 10000, signal)
// ============================================================

import { spawn, exec } from 'child_process'
import { promisify } from 'util'

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

/**
 * 通过 spawn + 参数数组安全执行命令，收集 stdout/stderr
 */
function spawnAndCollect(
  command: string,
  args: string[],
  options: { timeout?: number; signal?: AbortSignal } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      timeout: options.timeout,
      signal: options.signal,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
      // 限制输出大小，防止内存溢出
      if (stdout.length > 10 * 1024 * 1024) {
        child.kill()
        resolve({ stdout, stderr, exitCode: 1 })
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (err: Error) => {
      reject(err)
    })

    child.on('close', (exitCode: number | null) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      })
    })
  })
}

export class DockerSandbox {
  private available: boolean | null = null

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
      // 使用 base64 编码命令，彻底避免 shell 转义问题
      const base64Cmd = Buffer.from(command).toString('base64')

      const result = await spawnAndCollect('docker', [
        'run', '--rm', '--name', containerName,
        '--network', 'none',
        '--memory', '512m',
        '--cpus', '1',
        '--pids-limit', '50',
        '--read-only',
        '--tmpfs', '/tmp:rw,size=10m',
        IMAGE_NAME,
        '/bin/sh', '-c',
        `echo ${base64Cmd} | base64 -d | /bin/sh`,
      ], { timeout, signal })

      return { ...result, runtime: 'docker' }
    } catch (error: unknown) {
      const err = error as Error & { stdout?: string; stderr?: string }
      if (err.stdout) {
        return { stdout: err.stdout, stderr: err.stderr || '', exitCode: 1, runtime: 'docker' }
      }
      // Docker 执行失败，回退到本地
      return this.executeLocal(command, timeout, signal)
    }
  }

  /** 本地执行（回退方案）—— 使用 spawn + 参数数组 */
  private async executeLocal(
    command: string,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<SandboxResult> {
    try {
      const result = await spawnAndCollect('/bin/sh', ['-c', command], { timeout, signal })
      return { ...result, runtime: 'local' }
    } catch (error: unknown) {
      const err = error as Error & { stdout?: string; stderr?: string; exitCode?: number }
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || '',
        exitCode: err.exitCode ?? 1,
        runtime: 'local',
      }
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