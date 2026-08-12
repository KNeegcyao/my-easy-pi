import type { Component } from '../component.js'
import { renderToLines } from '../../interface/markdown-renderer.js'
import { wrapText, visibleWidth } from './text.js'

/**
 * Markdown 组件：包装 markdown-renderer.renderToLines()，
 * 再用 wrapText 做可视宽度二次换行（CJK 双宽 + ANSI 安全）。
 *
 * Phase 5 加流式稳定：
 *   - sanitizeStreamingMarkdown：补全未闭合代码围栏、删半截表格行
 *   - 表格行（含 │）跳过 wrapText，保留 │ 对齐（超宽由终端可视截断）
 */
export class Markdown implements Component {
  private source: string
  private cachedForWidth: number | null = null
  private cachedLines: string[] | null = null

  constructor(source: string = '') {
    this.source = source
  }

  setSource(source: string): void {
    if (source !== this.source) {
      this.source = source
      this.invalidate()
    }
  }

  getSource(): string { return this.source }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) {
      return this.cachedLines
    }
    const sanitized = sanitizeStreamingMarkdown(this.source)
    const raw = renderToLines(sanitized)
    const wrapped = raw.length === 0
      ? ['']
      : raw.flatMap(line => isTableLine(line) ? [line] : wrapText(line, width))
    this.cachedLines = wrapped
    this.cachedForWidth = width
    return wrapped
  }
}

/**
 * 判断一行是否为 markdown 表格行。
 * marked renderToLines 输出**半角 `|` 分隔**（interface/markdown-renderer.ts
 * 的 table 分支用 `' | '` join），所以这里必须认半角 `|`，不只是全角 `│`。
 *
 * 表格行不 wrapText：wrapText 会在 80 列处按字符切，破坏 | 对齐。
 * 超宽的表格行原样输出，由 alt-screen 终端可视截断（不破坏结构）。
 */
export function isTableLine(line: string): boolean {
  // 去掉 ANSI 再判
  const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
  // 全角 │ ≥2 次（备用：若 markdown-renderer 改全角则也覆盖）
  if (((plain.match(/│/g) || []).length) >= 2) return true
  // 半角 | ≥2 次（marked table 输出的实际形态：'| cell | cell |'）
  if (((plain.match(/\|/g) || []).length) >= 2) return true
  // 分隔行 |---|---|（前缀 |- 或 |:）——归入半角 ≥2 分支已覆盖，单独留作清晰
  if (/^\s*\|[\s\-:|]+\|\s*$/.test(plain)) return true
  return false
}

/**
 * 流式 markdown 源文 sanitize（Phase 5）：
 *   未闭合代码围栏（``` 出现次数为奇数）→ 末尾补一个 ```
 *   防止 marked 把后续文档当代码块渲染。
 *
 * 注意：**不删半截表格行**。流式 partial 表格让 marked 自己渲染就好——
 * 删半截行会让表格在流式期间消失/重现闪烁，比不删更糟。pi 的 markdown-transform
 * 也只 trim 未闭合围栏，从不删表格行。
 */
export function sanitizeStreamingMarkdown(source: string): string {
  if (!source) return source
  let s = source
  const fenceMatches = s.match(/```/g)
  const fenceCount = fenceMatches ? fenceMatches.length : 0
  if (fenceCount % 2 === 1) {
    s = s + '\n```'
  }
  return s
}