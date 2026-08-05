// ============================================================
// theme — 终端主题工具
//
// 使用 ANSI 转义码实现颜色和样式，零依赖。
// ============================================================

const RESET = '\x1b[0m'

export function bold(text: string): string {
  return `\x1b[1m${text}${RESET}`
}

export function dim(text: string): string {
  return `\x1b[2m${text}${RESET}`
}

export function cyan(text: string): string {
  return `\x1b[36m${text}${RESET}`
}

export function green(text: string): string {
  return `\x1b[32m${text}${RESET}`
}

export function yellow(text: string): string {
  return `\x1b[33m${text}${RESET}`
}

export function red(text: string): string {
  return `\x1b[31m${text}${RESET}`
}

export function blue(text: string): string {
  return `\x1b[34m${text}${RESET}`
}

export const USER_LABEL = bold(blue('┃ You ┃'))
export const AI_LABEL = bold(green('┃ piagent ┃'))
export const TOOL_LABEL = dim(yellow('┃ tool ┃'))
export const ERROR_LABEL = bold(red('┃ error ┃'))
export const PROMPT_SYMBOL = bold(cyan('❯'))