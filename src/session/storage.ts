// ============================================================
// JSONL 存储 — 将会话保存为 JSONL 文件
//
// JSONL = JSON Lines，每行一个 JSON 对象。
// 每个会话存为一个文件，文件名 = sessionId.jsonl
// 支持通过 parentId 实现分支结构。
// ============================================================

import { appendFile, readFile, writeFile, unlink, readdir, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { AgentMessage } from '../ai/types.js'

const SESSION_DIR = join(process.cwd(), '.piagent', 'sessions')

/** 确保会话目录存在 */
async function ensureDir(): Promise<void> {
  if (!existsSync(SESSION_DIR)) {
    await mkdir(SESSION_DIR, { recursive: true })
  }
}

/** 追加一条消息到 JSONL 文件 */
export async function appendMessage(sessionId: string, message: AgentMessage): Promise<void> {
  await ensureDir()
  const line = JSON.stringify(message) + '\n'
  await appendFile(join(SESSION_DIR, `${sessionId}.jsonl`), line, 'utf-8')
}

/** 读取整个会话的所有消息 */
export async function readMessages(sessionId: string): Promise<AgentMessage[]> {
  await ensureDir()
  const filePath = join(SESSION_DIR, `${sessionId}.jsonl`)
  if (!existsSync(filePath)) return []

  const content = await readFile(filePath, 'utf-8')
  return content
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as AgentMessage)
}

/** 覆盖写入整个会话 */
export async function writeMessages(sessionId: string, messages: AgentMessage[]): Promise<void> {
  await ensureDir()
  const lines = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
  await writeFile(join(SESSION_DIR, `${sessionId}.jsonl`), lines, 'utf-8')
}

/** 删除会话文件 */
export async function deleteSession(sessionId: string): Promise<void> {
  const filePath = join(SESSION_DIR, `${sessionId}.jsonl`)
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}

/** 列出所有会话 */
export async function listSessions(): Promise<string[]> {
  await ensureDir()
  const files = await readdir(SESSION_DIR)
  return files
    .filter(f => f.endsWith('.jsonl'))
    .map(f => f.replace('.jsonl', ''))
}