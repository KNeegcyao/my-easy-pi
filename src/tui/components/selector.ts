// ============================================================
// Selector — 交互式列表选择组件
//
// 显示一个可选项目列表，支持键盘导航：
//   ↑/↓ 或 j/k：移动高亮
//   Enter：确认选择
//   Esc / Ctrl+C：取消
//
// 用于 /sessions 选择会话、permission confirm y/N 等场景。
// ============================================================

import type { Component } from '../component.js'
import { bold, dim, gray, green, cyan, red } from '../ansi.js'

export interface SelectOption {
  label: string
  value: string
  description?: string
}

/**
 * Selector — 垂直列表选择器。实现 Component 接口，渲染到 chatContainer。
 * host 通过 handleKey(data) 导航，onSelect / onCancel 回调通知结果。
 */
export class Selector implements Component {
  private options: SelectOption[]
  private selected = 0
  private cachedLines: string[] | null = null
  private cachedForWidth: number | null = null
  private title: string

  onSelect: ((opt: SelectOption) => void) | null = null
  onCancel: (() => void) | null = null

  constructor(options: SelectOption[], title = '请选择:') {
    this.options = options
    this.title = title
  }

  get selectedIndex(): number { return this.selected }

  /** 处理键盘原始输入 */
  handleKey(data: string): void {
    switch (data) {
      case '\x1b[A': case 'k':           // ↑
        this.selected = Math.max(0, this.selected - 1)
        this.invalidate()
        break
      case '\x1b[B': case 'j':           // ↓
        this.selected = Math.min(this.options.length - 1, this.selected + 1)
        this.invalidate()
        break
      case '\r': case '\n':              // Enter
        this.onSelect?.(this.options[this.selected])
        break
      case '\x1b': case '\x03':          // Esc / Ctrl+C
        this.onCancel?.()
        break
      case 'y': case 'Y':                 // 快速确认（y）
        if (this.options.some(o => o.value === 'y' || o.label === 'yes')) {
          const yes = this.options.find(o => o.value === 'y' || o.label.toLowerCase() === 'yes')
          if (yes) { this.onSelect?.(yes); break }
        }
        this.selected = Math.min(this.selected, this.options.length - 1)
        this.invalidate()
        break
      case 'n': case 'N':                 // 快速拒绝（n）
        if (this.options.some(o => o.value === 'n' || o.label === 'no')) {
          const no = this.options.find(o => o.value === 'n' || o.label.toLowerCase() === 'no')
          if (no) { this.onSelect?.(no); break }
        }
        // 下移一个
        this.selected = Math.min(this.options.length - 1, this.selected + 1)
        this.invalidate()
        break
    }
  }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) return this.cachedLines

    const out: string[] = []
    out.push(`  ${bold(green(this.title))}`)
    out.push('')

    for (let i = 0; i < this.options.length; i++) {
      const opt = this.options[i]
      const isActive = i === this.selected
      const prefix = isActive ? `${cyan(bold('▸'))}` : ' '
      const label = isActive ? bold(cyan(opt.label)) : gray(opt.label)
      const desc = opt.description ? `  ${dim(gray(opt.description))}` : ''
      out.push(`  ${prefix} ${label}${desc}`)
    }

    out.push('')
    out.push(`  ${dim(gray('↑↓ 选择  ·  Enter 确认  ·  Esc 取消'))}`)
    this.cachedLines = out
    this.cachedForWidth = width
    return out
  }
}