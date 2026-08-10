// ============================================================
// theme — 终端主题（零依赖，纯 ANSI）
// ============================================================

const RESET = '\x1b[0m'

export function bold(text: string): string { return `\x1b[1m${text}${RESET}` }
export function dim(text: string): string { return `\x1b[2m${text}${RESET}` }
export function green(text: string): string { return `\x1b[32m${text}${RESET}` }
export function yellow(text: string): string { return `\x1b[33m${text}${RESET}` }
export function red(text: string): string { return `\x1b[31m${text}${RESET}` }
export function cyan(text: string): string { return `\x1b[36m${text}${RESET}` }
export function gray(text: string): string { return `\x1b[90m${text}${RESET}` }
export function italic(text: string): string { return `\x1b[3m${text}${RESET}` }

export function clearLine(): string { return '\x1b[2K' }
export function clearBelow(): string { return '\x1b[J' }
export function enterAltScreen(): string { return '\x1b[?1049h' }
export function exitAltScreen(): string { return '\x1b[?1049l' }
export function hideCursor(): string { return '\x1b[?25l' }
export function showCursor(): string { return '\x1b[?25h' }

export const INPUT_PROMPT = '> '
export const THINKING_TEXT = 'piagent is thinking...'