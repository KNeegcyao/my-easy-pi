// ============================================================
// theme — 终端主题（零依赖，纯 ANSI）
//
// @deprecated Phase 4 起新 TUI 改用 src/tui/ansi.ts（同名函数 + CSI 工具）。
// 本文件仍被 interface/tui/{editor,renderer,commands}.ts 及
// interface/markdown-renderer.ts 使用，保留不删。
// ============================================================

const RESET = '\x1b[0m'

export function bold(text: string): string { return `\x1b[1m${text}${RESET}` }
export function dim(text: string): string { return `\x1b[2m${text}${RESET}` }
export function green(text: string): string { return `\x1b[32m${text}${RESET}` }
export function yellow(text: string): string { return `\x1b[33m${text}${RESET}` }
export function red(text: string): string { return `\x1b[31m${text}${RESET}` }
export function cyan(text: string): string { return `\x1b[36m${text}${RESET}` }
export function magenta(text: string): string { return `\x1b[35m${text}${RESET}` }
export function gray(text: string): string { return `\x1b[90m${text}${RESET}` }
export function italic(text: string): string { return `\x1b[3m${text}${RESET}` }

export function clearLine(): string { return '\x1b[2K' }
export function enterAltScreen(): string { return '\x1b[?1049h' }
export function exitAltScreen(): string { return '\x1b[?1049l' }
export function hideCursor(): string { return '\x1b[?25l' }
export function showCursor(): string { return '\x1b[?25h' }

export const INPUT_PROMPT = '> '
export const THINKING_TEXT = 'my-easy-pi is thinking...'