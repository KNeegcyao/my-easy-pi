// ============================================================
// ANSI 工具 — 从 interface/tui/theme.ts 抽取共用，
// 新增语义化颜色（而非散落的 ansi 字面值）
// ============================================================

export const CSI = '\x1b['
export const RESET = `${CSI}0m`

// 前景色
export const black = wrap('30')
export const red = wrap('31')
export const green = wrap('32')
export const yellow = wrap('33')
export const blue = wrap('34')
export const magenta = wrap('35')
export const cyan = wrap('36')
export const white = wrap('37')
export const gray = wrap('90')

// 样式
export const bold = wrap('1')
export const dim = wrap('2')
export const italic = wrap('3')
export const underline = wrap('4')

function wrap(code: string) {
  return (text: string): string => `${CSI}${code}m${text}${RESET}`
}

// 清屏 / 光标
export const clearScreen = () => `${CSI}2J${CSI}H`
export const cursorTo = (row: number, col: number) => `${CSI}${row};${col}H`
export const cursorUp = (n: number) => `${CSI}${n}A`
export const cursorDown = (n: number) => `${CSI}${n}B`
export const cursorForward = (n: number) => `${CSI}${n}C`
export const cursorBack = (n: number) => `${CSI}${n}D`
export const clearToEnd = () => `${CSI}J`
export const clearLine = () => `${CSI}K`

// 估算 ANSI-stripped 后的可视宽度（不支持的 screen reader 仅作参考）
const ANSI_RE = /\x1b\[[0-9;]*m/g
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

export function visibleWidth(s: string): number {
  return stripAnsi(s).length
}
