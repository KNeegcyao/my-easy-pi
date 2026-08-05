// ============================================================
// Logger — 分层日志系统
//
// 日志文件：
//   ~/.piagent/logs/access-YYYY-MM-DD.jsonl   ← 访问日志
//   ~/.piagent/logs/error-YYYY-MM-DD.jsonl    ← 错误日志
//   ~/.piagent/logs/audit-YYYY-MM-DD.jsonl    ← 操作审计
//
// 日志级别（终端输出用）：
//   error > warn > info > debug
// ============================================================

import { appendFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const LOG_DIR = join(homedir(), '.piagent', 'logs')

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  [key: string]: unknown
}

const CURRENT_LEVEL: LogLevel = (process.env.PIAGENT_LOG_LEVEL as LogLevel) || 'info'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[CURRENT_LEVEL]
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function ensureDir(): Promise<void> {
  if (!existsSync(LOG_DIR)) await mkdir(LOG_DIR, { recursive: true })
}

async function writeLog(filename: string, entry: LogEntry): Promise<void> {
  try {
    await ensureDir()
    await appendFile(join(LOG_DIR, filename), JSON.stringify(entry) + '\n', 'utf-8')
  } catch { /* 不影响主流程 */ }
}

export const logger = {
  info(message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'info', message, ...data }
    if (shouldLog('info')) console.error(`[info] ${message}`)
    writeLog(`access-${today()}.jsonl`, entry)
  },

  warn(message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'warn', message, ...data }
    if (shouldLog('warn')) console.error(`[warn] ${message}`)
    writeLog(`access-${today()}.jsonl`, entry)
  },

  error(message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'error', message, ...data }
    if (shouldLog('error')) console.error(`[error] ${message}`)
    writeLog(`error-${today()}.jsonl`, entry)
  },

  debug(message: string, data?: Record<string, unknown>): void {
    if (!shouldLog('debug')) return
    console.error(`[debug] ${message}`)
  },

  audit(action: string, detail: Record<string, unknown>): void {
    writeLog(`audit-${today()}.jsonl`, {
      timestamp: new Date().toISOString(), level: 'info', message: action, ...detail,
    })
  },
}