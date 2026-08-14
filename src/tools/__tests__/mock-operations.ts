// ============================================================
// MockOperations — 测试用 Mock 实现
//
// 不触碰真实文件系统或网络，所有操作返回预设数据。
// 用于工具测试，或开发环境模拟。
// ============================================================

import type { Operations, ExecResult, DirEntry } from '../operations.js'

export class MockOperations implements Operations {
  private mockFiles = new Map<string, string>()
  private mockDir = new Map<string, DirEntry[]>()
  private mockExec: ExecResult = { stdout: '', stderr: '', exitCode: 0 }
  private mockFetch = ''

  setFile(path: string, content: string): void { this.mockFiles.set(path, content) }
  setDir(path: string, entries: DirEntry[]): void { this.mockDir.set(path, entries) }
  setExecResult(result: Partial<ExecResult>): void { this.mockExec = { stdout: '', stderr: '', exitCode: 0, ...result } }
  setFetchResult(content: string): void { this.mockFetch = content }

  async exec(_cmd: string, _timeout?: number, _signal?: AbortSignal, onUpdate?: ExecUpdateCallback): Promise<ExecResult> {
    // 模拟流式：如果设置了流式回调，chunk 调它
    if (onUpdate && this.mockExec.stdout) onUpdate(this.mockExec.stdout)
    return this.mockExec
  }
  async readFile(path: string): Promise<string> {
    const c = this.mockFiles.get(path)
    if (c === undefined) throw new Error(`ENOENT: ${path}`)
    return c
  }
  async writeFile(path: string, content: string): Promise<void> { this.mockFiles.set(path, content) }
  async replaceInFile(path: string, oldText: string, newText: string): Promise<boolean> {
    const c = this.mockFiles.get(path)
    if (c === undefined) throw new Error(`ENOENT: ${path}`)
    if (!c.includes(oldText)) return false
    this.mockFiles.set(path, c.replace(oldText, newText))
    return true
  }
  async grep(_pattern: string, _path: string): Promise<string> { return '' }
  async findFiles(_pattern: string, _path: string): Promise<string> { return '' }
  async listDir(path: string): Promise<DirEntry[]> {
    const e = this.mockDir.get(path)
    if (e === undefined) throw new Error(`ENOENT: ${path}`)
    return e
  }
  async fetchUrl(_url: string): Promise<string> { return this.mockFetch }
}