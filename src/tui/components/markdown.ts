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
 * 判断一行是否为 markdown 表格行（含 │ 分隔符）。
 * 表格行不 wrapText：wrapText 会在 80 列处按字符切，破坏 │ 对齐。
 * 超宽的表格行原样输出，由 alt-screen 终端可视截断（不破坏结构）。
 */
export function isTableLine(line: string): boolean {
  // 去掉 ANSI 再判；表格行特征：│ 出现 ≥2 次，或 |---| 分隔行
  const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
  const pipeCount = (plain.match(/│/g) || []).length
  if (pipeCount >= 2) return true
  // 分隔行 |---|---|
  if (/^\s*\|[\s\-:|]+\|\s*$/.test(plain)) return true
  return false
}

/**
 * 流式 markdown 源文 sanitize（Phase 5）：
 *   1. 未闭合代码围栏（``` 出现次数为奇数）→ 末尾补一个 ```
 *      防止 marked 把后续文档当代码块渲染
 *   2. 末行是半截表格行（以 | 开头但不以 | 结尾）→ 删该行
 *      防止流式 partial 表格渲染成残片
 * 这是 pi 的 markdown-transform 流式 trim 的最小子集。
 */
export function sanitizeStreamingMarkdown(source: string): string {
  if (!source) return source
  let s = source
  // 1. 未闭合代码围栏
  const fenceMatches = s.match(/```/g)
  const fenceCount = fenceMatches ? fenceMatches.length : 0
  if (fenceCount % 2 === 1) {
    s = s + '\n```'
  }
  // 2. 半截表格行：末行以 | 开头但无收尾 |
  const lines = s.split('\n')
  const last = lines[lines.length - 1]
  if (last && last.trimStart().startsWith('|') && !/\|\s*$/.test(last.trimEnd())) {
    // 仅当该行像表格数据行（含 | 但没收尾）才删；避免误删普通列表项
    if ((last.match(/\|/g) || []).length >= 1 && !last.trimStart().startsWith('|-')) {
      lines.pop()
      s = lines.join('\n')
    }
  }
  return s
}