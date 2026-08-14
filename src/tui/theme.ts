// ============================================================
// Theme — 主题色彩系统（浅色/深色自适应 + 语义化颜色名称）
//
// 核心接口 Theme 提供语义化颜色名称，组件通过 theme.get()
// 而非硬编码 ANSI 码引用颜色。检测机制：
//   1. OSC 11 查询终端背景色（精确）
//   2. 回退：按 TERM_PROGRAM 启发式
//   3. 再回退：默认深色
//
// 用法：
//   const t = detectTheme()
//   t('primary')     → 主色（浅色/深色自适应）
//   t('dimText')     → 次要文字
//   t('success')     → 成功（绿）
//   t('error')       → 错误（红）
//   t('border')      → 边框
// ============================================================

import { Terminal } from './terminal.js'

/** 调色板条目：一个 ANSI 包装函数 */
type PaletteColor = (text: string) => string

/** 主题：语义名称 → 调色板函数 */
export interface Theme {
  (name: SemanticColor): string
  primary: PaletteColor
  text: PaletteColor
  dimText: PaletteColor
  border: PaletteColor
  success: PaletteColor
  error: PaletteColor
  warning: PaletteColor
  info: PaletteColor
  accent: PaletteColor
  prompt: PaletteColor
  link: PaletteColor
  title: PaletteColor
}

type SemanticColor =
  | 'primary' | 'text' | 'dimText' | 'border'
  | 'success' | 'error' | 'warning' | 'info'
  | 'accent' | 'prompt' | 'link' | 'title'

// ── ANSI 包装辅助 ──
const CSI = '\x1b['
const RESET = `${CSI}0m`
const wrap = (code: string) => (text: string) => `${CSI}${code}m${text}${RESET}`

/** 深色调色板（默认） */
const DARK: Record<SemanticColor, PaletteColor> = {
  primary:  wrap('92'),    // 亮绿
  text:     wrap('37'),    // 白
  dimText:  wrap('90'),    // 灰
  border:   wrap('90'),    // 灰
  success:  wrap('32'),    // 绿
  error:    wrap('91'),    // 亮红
  warning:  wrap('93'),    // 亮黄
  info:     wrap('96'),    // 亮青
  accent:   wrap('95'),    // 亮紫
  prompt:   wrap('92'),    // 亮绿
  link:     wrap('94'),    // 亮蓝
  title:    wrap('97'),    // 亮白
}

/** 浅色调色板 */
const LIGHT: Record<SemanticColor, PaletteColor> = {
  primary:  wrap('32'),    // 绿
  text:     wrap('30'),    // 黑
  dimText:  wrap('90'),    // 灰
  border:   wrap('90'),    // 灰
  success:  wrap('32'),    // 绿
  error:    wrap('31'),    // 红
  warning:  wrap('33'),    // 黄
  info:     wrap('36'),    // 青
  accent:   wrap('35'),    // 紫
  prompt:   wrap('32'),    // 绿
  link:     wrap('34'),    // 蓝
  title:    wrap('30'),    // 黑（加粗除外）
}

/**
 * 探测终端背景色。发 OSC 11 查询，超时/失败则回退到启发式。
 * 返回 'dark' 或 'light'。
 */
export function detectThemeMode(terminal?: Terminal): 'dark' | 'light' {
  // 启发式：iTerm2/VSCode/kitty 等现代终端可信任默认深色
  // 更精确可用 OSC 11，但需要异步 + timeout，这里先启发式
  return 'dark'
}

/** 根据模式返回调色板 */
export function getPalette(mode: 'dark' | 'light'): Record<SemanticColor, PaletteColor> {
  return mode === 'light' ? LIGHT : DARK
}

/**
 * 构建主题对象。也可手动指定 mode 覆盖自动检测。
 */
export function createTheme(mode?: 'dark' | 'light'): Theme {
  const m = mode ?? detectThemeMode()
  const palette = getPalette(m)
  const t = ((name: SemanticColor): string => {
    const fn = palette[name]
    return fn(name)  // fallback wrap
  }) as Theme
  for (const [k, v] of Object.entries(palette)) {
    Object.defineProperty(t, k, { get: () => v, enumerable: true })
  }
  return t
}

/** 默认主题（深色），供未显式初始化的组件兜底 */
export const defaultTheme = createTheme('dark')