import type { Component } from '../component.js'
import { Container } from '../layout/container.js'
import { Text } from './text.js'
import { dim, gray, yellow, red, green, bold, cyan } from '../ansi.js'

/**
 * ToolExecution — pi `tool-execution.ts:13-377` 的对应。
 *
 * 一次工具调用的渲染组件。**本身常驻在 AssistantTurn.toolsContainer**，
 * 不随事件移除；4 个事件钩子（updateArgs / markExecutionStarted /
 * setArgsComplete / updateResult）全部走内部 updateDisplay() clear+重建。
 *
 * 显示形态（Phase 6 优化）：
 *   `  ⚡ bash  command=ls -la    `         (call: 绿色闪电 + 黄色 toolName + gray args)
 *   `    running...                        ` (started, 无 result)
 *   `  ╎ file1                             ` (result, dim cyan pipe)
 *   `  ✗ ERROR message                    ` (isError, red)
 */
export interface ToolResultLike {
  content: string
  isError?: boolean
}

export class ToolExecution implements Component {
  private toolName: string
  private args: Record<string, unknown> = {}
  private argsComplete = false
  private executionStarted = false
  private result: ToolResultLike | null = null
  private isPartial = false
  private outer: Container
  private cachedLines: string[] | null = null
  private cachedForWidth: number | null = null

  constructor(toolName: string, args: Record<string, unknown> = {}) {
    this.toolName = toolName
    this.args = args
    this.outer = new Container()
    this.updateDisplay()
  }

  /** tool_call_delta 累积 args 后调（pi updateArgs） */
  updateArgs(args: Record<string, unknown>): void {
    this.args = args
    this.updateDisplay()
  }

  /** tool_execution_start 调（pi markExecutionStarted） */
  markExecutionStarted(): void {
    this.executionStarted = true
    this.updateDisplay()
  }

  /** args 解析完成（标记 args 字段不再 *） */
  setArgsComplete(): void {
    this.argsComplete = true
    this.updateDisplay()
  }

  /** tool_execution_end 调，isPartial=false；tool_execution_update 调 isPartial=true */
  updateResult(result: ToolResultLike, isPartial = false): void {
    this.result = result
    this.isPartial = isPartial
    this.updateDisplay()
  }

  /** 只读 getter */
  get name(): string { return this.toolName }
  get hasResult(): boolean { return this.result !== null }
  get started(): boolean { return this.executionStarted }

  /**
   * 统一重建渲染子树（对齐 pi updateDisplay）。
   * 清 outer 后按当前状态 addChild 调用行 + 结果行。
   */
  private updateDisplay(): void {
    this.outer.clear()

    // 调用行：→ toolName args...
    const callLine = this.renderCallLine()
    this.outer.addChild(new Text(callLine))

    // 结果行
    if (this.result) {
      const resultLines = this.renderResultLines(this.result)
      for (const line of resultLines) {
        this.outer.addChild(new Text(line))
      }
    } else if (this.executionStarted) {
      // 已开始但无结果：显示 running 行（caller 可通过自身 loader 也可在此显示）
      this.outer.addChild(new Text(`  ${dim(gray('running...'))}`))
    }

    this.invalidate()
  }

  private renderCallLine(): string {
    const argsText = Object.entries(this.args)
      .map(([k, v]) => {
        const val = typeof v === 'string' ? v : JSON.stringify(v)
        return `${k}=${val.slice(0, 60)}`
      })
      .join(' ')
    const argSuffix = argsText ? ` ${dim(gray(argsText))}` : ''
    const incomplete = this.argsComplete ? '' : dim(gray('*'))
    // ⚡ 闪电 + 黄色 toolName
    return `  ${green(bold('⚡'))} ${yellow(this.toolName)}${argSuffix}${incomplete}`
  }

  /** 结果最多渲染的行数；超出截断防止读大文件/grep 大输出撑爆屏幕 */
  private static readonly MAX_RESULT_LINES = 20

  private renderResultLines(result: ToolResultLike): string[] {
    const allLines = result.content.split('\n')
    if (result.isError) {
      // 错误：红色 ✗ + 消息
      const shown = allLines.slice(0, ToolExecution.MAX_RESULT_LINES).map(l => `  ${red('✗')} ${l}`)
      if (allLines.length > ToolExecution.MAX_RESULT_LINES) {
        shown.push(`  ${dim(gray(`⋯ (${allLines.length - ToolExecution.MAX_RESULT_LINES} 行省略)`))}`)
      }
      return shown
    }
    // 正常结果：青色细竖线 + 内容（更柔和）
    const pipe = dim(cyan('╎'))
    const shown = allLines.slice(0, ToolExecution.MAX_RESULT_LINES).map(l => `  ${pipe} ${l}`)
    if (allLines.length > ToolExecution.MAX_RESULT_LINES) {
      const omitted = allLines.length - ToolExecution.MAX_RESULT_LINES
      shown.push(`  ${dim(gray(`⋯ (${omitted} 行省略)`))}`)
    }
    return shown
  }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
    this.outer.invalidate()
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedForWidth === width) {
      return this.cachedLines
    }
    const lines = this.outer.render(width)
    this.cachedLines = lines
    this.cachedForWidth = width
    return lines
  }
}
