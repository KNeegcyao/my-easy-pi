// ============================================================
// Operations — 系统操作抽象层
//
// 最小化的 Operations 接口，把工具需要的所有系统调用抽象出来：
//   - 本地环境：LocalOperations（走真实文件系统/进程）
//   - 测试环境：MockOperations（不碰系统）
//   - 远程环境：SSHOperations（走远程主机）
//
// 工具不再直接 import fs/child_process/sandbox，
// 而是通过构造注入的 Operations 间接调用。
// ============================================================

import { readFile, writeFile, readdir } from 'fs/promises'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { getSandbox } from '../sandbox/index.js'

const execFileAsync = promisify(execFile)

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  runtime?: 'local' | 'sandbox'
}

export interface DirEntry {
  name: string
  isDirectory: boolean
}

/**
 * Operations 接口 — 工具执行所需的全部系统操作。
 *
 * 每个方法都设计为返回原始数据而非封装格式，让调用方自由处理。
 * 所有方法不应抛出异常 —— 错误应通过返回值中的空/错误标记表达。
 */
/** Partial output callback — 用于沙箱流式输出可视反馈 */
export type ExecUpdateCallback = (chunk: string) => void

export interface Operations {
  exec(command: string, timeout?: number, signal?: AbortSignal, onUpdate?: ExecUpdateCallback): Promise<ExecResult>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  replaceInFile(path: string, oldText: string, newText: string): Promise<boolean>
  grep(pattern: string, path: string): Promise<string>
  findFiles(pattern: string, path: string): Promise<string>
  listDir(path: string): Promise<DirEntry[]>
  fetchUrl(url: string, signal?: AbortSignal): Promise<string>
}

/**
 * 本地 Operations 实现。
 *   - exec 走沙箱（Docker → 本地回退）
 *   - 文件操作走 fs/promises
 *   - grep/find 走 child_process.execFile
 *   - fetchUrl 走全局 fetch
 */
export class LocalOperations implements Operations {
  async exec(command: string, timeout = 30000, signal?: AbortSignal, onUpdate?: ExecUpdateCallback): Promise<ExecResult> {
    try {
      const sandbox = getSandbox()
      if (await sandbox.isAvailable()) {
        // Docker 沙箱：走原有逻辑（不支持流式）
        const result = await sandbox.execute(command, timeout, signal)
        return {
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode ?? 0,
          runtime: 'sandbox',
        }
      }
      // 本地执行：流式输出 via onUpdate
      return await spawnWithStreaming(command, timeout, signal, onUpdate)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { stdout: '', stderr: msg, exitCode: 1 }
    }
  }

  async readFile(path: string): Promise<string> {
    return await readFile(path, 'utf-8')
  }

  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, 'utf-8')
  }

  async replaceInFile(path: string, oldText: string, newText: string): Promise<boolean> {
    const content = await readFile(path, 'utf-8')
    if (!content.includes(oldText)) return false
    const result = content.replace(oldText, newText)
    await writeFile(path, result, 'utf-8')
    return true
  }

  async grep(pattern: string, path: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('grep', ['-rn', pattern, path], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      })
      return stdout || ''
    } catch {
      return ''
    }
  }

  async findFiles(pattern: string, path: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('find', [path, '-name', pattern], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      })
      return stdout || ''
    } catch {
      return ''
    }
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }))
  }

  async fetchUrl(url: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${response.statusText}\n${body}`)
    }
    return await response.text()
  }
}

/**
 * 流式 spawn：逐 chunk 调用 onUpdate，最终返回完整结果。
 * 用于 LocalOperations 的本地执行路径，让沙箱输出实时流向 TUI。
 */
async function spawnWithStreaming(
  command: string,
  timeout: number,
  signal?: AbortSignal,
  onUpdate?: ExecUpdateCallback,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', command], { timeout, signal })
    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk
      onUpdate?.(chunk)
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', () => {
      resolve({ stdout, stderr, exitCode: 1, runtime: 'local' })
    })

    child.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
        runtime: 'local',
      })
    })
  })
}

/**
 * 默认 Operations 实例（单例），供未注入的工具兜底使用。
 * 在 cli.ts 的生产路径中会显式构造并传入。
 */
export const defaultOperations = new LocalOperations()