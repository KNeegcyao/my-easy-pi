import type { Component } from '../component.js'
import { dim, gray, bold, cyan } from '../ansi.js'

/** 底部状态栏：显示模型名 + 工具数 + 快捷键提示。始终 1 行，在输入框下方。 */
export class Statusbar implements Component {
  private modelLabel: string
  private toolsCount: number
  private cachedLine: string | null = null

  constructor(modelLabel: string = '', toolsCount: number = 0) {
    this.modelLabel = modelLabel
    this.toolsCount = toolsCount
  }

  setModel(label: string): void {
    this.modelLabel = label
    this.invalidate()
  }

  setToolsCount(n: number): void {
    this.toolsCount = n
    this.invalidate()
  }

  invalidate(): void { this.cachedLine = null }

  render(width: number): string[] {
    if (this.cachedLine) return [this.cachedLine]
    // 左侧：模型名加粗 + 工具数
    const left = `${bold(gray(this.modelLabel))} ${dim(gray('·'))} ${gray(`${this.toolsCount} tools`)}`
    // 右侧：快捷键提示用青色加粗更醒目
    const right = `${dim(cyan('ctrl+c quit'))} ${dim(gray('·'))} ${dim(cyan('/help'))}`
    const leftW = visibleLen(left)
    const rightW = visibleLen(right)
    const gap = Math.max(1, width - leftW - rightW)
    this.cachedLine = `${left}${' '.repeat(gap)}${right}`
    return [this.cachedLine]
  }
}

function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length
}