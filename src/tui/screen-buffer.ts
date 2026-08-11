// ============================================================
// ScreenBuffer — 行缓冲 + 差异渲染
//
// 渲染器把组件 render(width) 的行数组喂给 ScreenBuffer.present()；
// 内部做行 diff，只把变化的行写到终端。
// ============================================================

export interface RowUpdate {
  row: number
  content: string
}

export class ScreenBuffer {
  private lines: string[] = []

  /** 返回当前行数 */
  get size(): number { return this.lines.length }

  /** 返回当前行数组的快照（只读） */
  snapshot(): readonly string[] { return this.lines.slice() }

  /** 计算 prev → next 的差异（纯函数，易测试） */
  static diffLines(prev: readonly string[], next: readonly string[]): RowUpdate[] {
    const updates: RowUpdate[] = []
    const maxLen = Math.max(prev.length, next.length)
    for (let i = 0; i < maxLen; i++) {
      const prevLine = i < prev.length ? prev[i] : undefined
      const nextLine = i < next.length ? next[i] : undefined
      if (prevLine !== nextLine) {
        updates.push({ row: i, content: nextLine ?? '' })
      }
    }
    return updates
  }

  /** 当前缓冲与 next 对比；不动任何终端状态，只是更新缓冲 */
  replace(next: string[]): RowUpdate[] {
    const updates = ScreenBuffer.diffLines(this.lines, next)
    this.lines = [...next]
    return updates
  }

  /** 完全清空（resize 后常用） */
  clear(): void {
    this.lines = []
  }
}
