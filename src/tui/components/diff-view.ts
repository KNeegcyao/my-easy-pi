// ============================================================
// DiffView — 行级别代码差异对比组件
//
// 直观展示 AI 修改前后的代码变化：
//   - 删除行：前缀 "- " + 红色
//   - 新增行：前缀 "+ " + 绿色
//   - 不变行：前缀 "  " + 灰色（dim）
//
// 算法：简化 Myers 差分，逐行找最长公共子序列（LCS）
// ============================================================

import type { Component } from '../component.js'
import { green, red, dim, gray } from '../ansi.js'

export interface DiffHunk {
  /** 起始行号（1-based，用于显示） */
  oldStart: number
  newStart: number
  /** 差异行 */
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove'
  text: string
}

/** 计算两个文本的行级别差异 */
export function computeDiff(oldText: string, newText: string): DiffHunk[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // 动态规划求 LCS（最长公共子序列）
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯得到 diff
  const lines: DiffLine[] = []
  let i = m, j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      lines.unshift({ type: 'context', text: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      lines.unshift({ type: 'add', text: newLines[j - 1] })
      j--
    } else {
      lines.unshift({ type: 'remove', text: oldLines[i - 1] })
      i--
    }
  }

  // 按连续上下文/变更分块（hunk）
  const hunks: DiffHunk[] = []
  let current: DiffLine[] = []
  let oldLine = 1
  let newLine = 1
  let hunkOldStart = 1
  let hunkNewStart = 1

  const flush = () => {
    if (current.length > 0) {
      hunks.push({
        oldStart: hunkOldStart,
        newStart: hunkNewStart,
        lines: [...current],
      })
      current = []
    }
  }

  for (const line of lines) {
    const isChange = line.type !== 'context'
    const prevIsChange = current.length > 0 && current[current.length - 1].type !== 'context'

    // 当从变更切换到上下文且上下文积累够多时，切分 hunk
    if (!isChange && current.length > 0 && prevIsChange && current.filter(l => l.type !== 'context').length > 6) {
      flush()
      hunkOldStart = oldLine
      hunkNewStart = newLine
    }

    if (current.length === 0) {
      hunkOldStart = oldLine
      hunkNewStart = newLine
    }

    current.push(line)

    if (line.type === 'context' || line.type === 'remove') oldLine++
    if (line.type === 'context' || line.type === 'add') newLine++
  }

  flush()
  return hunks
}

/**
 * DiffView — TUI 组件
 *
 * 渲染统一的 diff 视图，类似 git diff：
 *   @@ -oldStart,oldCount +newStart,newCount @@
 *   - 删除行
 *   + 新增行
 *     上下文行
 */
export class DiffView implements Component {
  private hunks: DiffHunk[]
  private cachedForWidth: number | null = null
  private cachedLines: string[] | null = null

  constructor(oldText: string, newText: string) {
    this.hunks = computeDiff(oldText, newText)
  }

  setDiff(oldText: string, newText: string): void {
    this.hunks = computeDiff(oldText, newText)
    this.invalidate()
  }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) {
      return this.cachedLines
    }

    const out: string[] = []

    for (const hunk of this.hunks) {
      const oldCount = hunk.lines.filter(l => l.type === 'context' || l.type === 'remove').length
      const newCount = hunk.lines.filter(l => l.type === 'context' || l.type === 'add').length

      out.push(dim(gray(`@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`)))

      for (const line of hunk.lines) {
        switch (line.type) {
          case 'remove':
            out.push(red(`- ${line.text}`))
            break
          case 'add':
            out.push(green(`+ ${line.text}`))
            break
          case 'context':
            out.push(dim(gray(`  ${line.text}`)))
            break
        }
      }

      out.push('')
    }

    this.cachedLines = out
    this.cachedForWidth = width
    return out
  }
}
