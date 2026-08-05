// ============================================================
// theme — 终端主题（零依赖，纯 ANSI）
// ============================================================

const RESET = '\x1b[0m'

export function bold(text: string): string { return `\x1b[1m${text}${RESET}` }
export function dim(text: string): string { return `\x1b[2m${text}${RESET}` }
export function cyan(text: string): string { return `\x1b[36m${text}${RESET}` }
export function green(text: string): string { return `\x1b[32m${text}${RESET}` }
export function yellow(text: string): string { return `\x1b[33m${text}${RESET}` }
export function red(text: string): string { return `\x1b[31m${text}${RESET}` }
export function blue(text: string): string { return `\x1b[34m${text}${RESET}` }
export function gray(text: string): string { return `\x1b[90m${text}${RESET}` }
export function italic(text: string): string { return `\x1b[3m${text}${RESET}` }

export const INPUT_PROMPT = `  ${cyan('>')} `
export const THINKING = dim(italic('piagent is thinking...'))