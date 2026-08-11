// ============================================================
// Phase 2 Spike — 验证 CSI 2026 + 行 diff 渲染
//
// 这个 spike 回答三个问题：
//   1. 当前终端是否支持 CSI 2026？（不支持时我们是否有干净的降级路径？）
//   2. 行 diff + 光标覆写是否能在不重绘整屏的情况下更新一行？
//   3. 长时间高频更新时是否有屏幕撕裂/光标错乱？
//
// 运行：
//   npx tsx scratch/spike-csi2026.ts            # 完整演示
//   npx tsx scratch/spike-csi2026.ts probe      # 只探测终端能力
// ============================================================

const CSI = '\x1b['
const BSU = `${CSI}?2026h`
const ESU = `${CSI}?2026l`
const RESET = `${CSI}0m`

// ============================================================
// Step 1: 终端能力探测
// ============================================================

/** 启发式判断：当前终端是否可能支持 CSI 2026（依据 TERM_PROGRAM / TERM） */
function detectSyncOutput(): { supported: boolean; reason: string } {
  const term = process.env.TERM_PROGRAM || ''
  const termName = process.env.TERM || ''

  // 已知支持
  if (term === 'iTerm.app') return { supported: true, reason: 'iTerm2 ≥ 3.5' }
  if (term === 'kitty') return { supported: true, reason: 'Kitty 支持 CSI 2026' }
  if (term === 'WezTerm') return { supported: true, reason: 'WezTerm 支持' }
  if (term === 'foot') return { supported: true, reason: 'foot 支持' }
  if (term === 'Alacritty') return { supported: true, reason: 'Alacritty ≥ 0.13' }

  // 已知不支持 / 不稳定
  if (term === 'Apple_Terminal') return { supported: false, reason: 'Apple Terminal 对 CSI 2026 支持不一致' }
  if (term === 'vscode') return { supported: true, reason: 'VSCode 终端支持（0.74+）' }
  if (process.env.TMUX) return { supported: false, reason: 'tmux 需 set -g allow-passthrough 且新版' }

  if (termName === 'xterm-256color') return { supported: false, reason: '未知，保守按 false' }

  return { supported: false, reason: `未知终端 (${term || termName})，保守按 false` }
}

function probe(): void {
  const detection = detectSyncOutput()
  console.log('┌─ 终端能力探测 ──────────────────────────────')
  console.log(`│ TERM_PROGRAM:  ${process.env.TERM_PROGRAM || '(unset)'}`)
  console.log(`│ TERM:          ${process.env.TERM || '(unset)'}`)
  console.log(`│ TMUX:          ${process.env.TMUX ? 'active' : '(not in tmux)'}`)
  console.log(`│ columns:       ${process.stdout.columns}`)
  console.log(`│ rows:          ${process.stdout.rows}`)
  console.log(`│ isTTY:         ${process.stdout.isTTY}`)
  console.log(`├─────────────────────────────────────────────`)
  console.log(`│ CSI 2026 支持: ${detection.supported ? '✅' : '❌'} (${detection.reason})`)
  console.log(`└─────────────────────────────────────────────`)
}

// ============================================================
// Step 2: 屏幕缓冲 + 行 diff
// ============================================================

interface RowUpdate {
  row: number
  content: string
}

class ScreenBuffer {
  private lines: string[] = []

  diff(next: string[]): RowUpdate[] {
    const updates: RowUpdate[] = []
    const max = Math.max(this.lines.length, next.length)
    for (let i = 0; i < max; i++) {
      const prev = this.lines[i]
      const curr = next[i]
      if (prev !== curr) updates.push({ row: i, content: curr ?? '' })
    }
    this.lines = [...next]
    return updates
  }
}

// ============================================================
// Step 3: 渲染器（把 diff 写入终端）
// ============================================================

class Renderer {
  private buf = new ScreenBuffer()
  private lastLineCount = 0

  constructor(private useSync: boolean) {}

  /**
   * 将 nextLines 渲染到终端。
   * 约定：调用前光标位于上一次渲染区域的"末尾新行"。
   * 渲染完成后光标留在新一轮的"末尾新行"，等待用户键入或下一次渲染。
   */
  render(nextLines: string[]): void {
    const updates = this.buf.diff(nextLines)
    if (updates.length === 0 && this.lastLineCount === nextLines.length) return

    const out: string[] = []

    // 1. 光标上移到上次渲染区域的"起始行"
    if (this.lastLineCount > 0) {
      out.push(`${CSI}${this.lastLineCount}A`)
      out.push(`${CSI}1G`)  // 移到列首
    }

    // 2. 进入同步帧（可选）
    if (this.useSync) out.push(BSU)

    // 3. 逐行覆写
    for (let i = 0; i < nextLines.length; i++) {
      out.push(`${CSI}2K`)           // 清行
      out.push(nextLines[i])         // 新内容（可视长度要 ≤ columns，Phase 2 正式实现必须保证）
      if (i < nextLines.length - 1) {
        out.push('\n')               // 换行；最后一行不换
      }
    }

    // 4. 清除旧内容下方可能残留的脏行（如果新行数 < 旧行数）
    if (nextLines.length < this.lastLineCount) {
      out.push('\n')                 // 先把光标移到下一行
      out.push(`${CSI}J`)            // 清屏到光标下
    } else {
      out.push('\n')                 // 保持光标在新行
    }

    // 5. 关闭帧
    if (this.useSync) out.push(ESU)

    process.stdout.write(out.join(''))
    this.lastLineCount = nextLines.length
  }

  /** 退出时复位 */
  reset(): void {
    this.buf = new ScreenBuffer()
    this.lastLineCount = 0
  }
}

// ============================================================
// Step 4: 演示 — 高频更新一个计数器和"消息列表"
// ============================================================

function makeLines(tick: number, spinner: boolean): string[] {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  const spinnerChar = spinner ? frames[tick % frames.length] : '·'
  const bar = '█'.repeat(Math.min(tick % 30, 30)).padEnd(30, '░')

  return [
    `${spinnerChar}  tick=${tick.toString().padStart(3, ' ')}  ${bar}`,
    `  ${dim(`更新中: ${'*'.repeat(tick % 5)}`)}`,
    `  ${green(`已完成: ${tick} 项`)}`,
    ``,
    `  ${bold('历史消息:')}`,
    ...Array.from({ length: 3 }, (_, i) => `    [${(tick - 2 + i).toString().padStart(3, '0')}] 消息体 #${i}`),
  ]
}

// 简化的 ANSI 包装（spike 不依赖 theme.ts）
const dim = (s: string) => `${CSI}2m${s}${RESET}`
const green = (s: string) => `${CSI}32m${s}${RESET}`
const bold = (s: string) => `${CSI}1m${s}${RESET}`

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function demo(): Promise<void> {
  const detection = detectSyncOutput()
  const useSync = detection.supported

  process.stdout.write(`${CSI}?25l`)  // 隐藏光标
  console.log('─'.repeat(60))
  console.log(`Spike: CSI 2026 ${useSync ? '启用' : '降级为顺序写入'} (${detection.reason})`)
  console.log(`开始 100 帧演示 (~6.4 秒). 看你的屏幕是否有撕裂。`)
  console.log('─'.repeat(60))

  const renderer = new Renderer(useSync)
  process.stdout.write('\n')  // 预留起始位置

  try {
    for (let tick = 0; tick < 100; tick++) {
      renderer.render(makeLines(tick, true))
      await sleep(64)
    }
  } finally {
    renderer.reset()
    process.stdout.write(`${CSI}?25h`)  // 恢复光标
    console.log('演示结束。检查上面内容：')
    console.log('  ✅ 只能看到最后一帧（所有旧帧被覆写）= 成功')
    console.log('  ❌ 看到 100 个残影堆叠 = 渲染器失败')
    console.log('  ❌ 中间出现部分行错乱/堆叠 = CSI 2026 或 diff 失败')
  }
}

// ============================================================
// 入口
// ============================================================

const arg = process.argv[2]
if (arg === 'probe') {
  probe()
} else if (arg === 'interactive') {
  // 交互演示：每秒一帧，Ctrl+C 退出
  ;(async () => {
    const detection = detectSyncOutput()
    process.stdout.write(`${CSI}?25l`)
    console.log('交互模式（Ctrl+C 退出）：')
    const renderer = new Renderer(detection.supported)
    process.stdout.write('\n')
    let tick = 0
    const interval = setInterval(() => {
      renderer.render(makeLines(tick++, true))
    }, 16) // 60 fps
    process.on('SIGINT', () => {
      clearInterval(interval)
      renderer.reset()
      process.stdout.write(`${CSI}?25h`)
      process.exit(0)
    })
  })()
} else {
  demo().catch(console.error)
}
