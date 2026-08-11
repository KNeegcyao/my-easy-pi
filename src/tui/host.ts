// ============================================================
// startTUI — 新 TUI 主入口（Phase 4）
//
// 把 src/tui/ 组件框架接到真实 Agent 事件流，替换旧 interface/tui/。
//
// 设计要点（详见 plans/synthetic-jingling-pinwheel.md）：
//   - 主屏派：不进 alt screen，保留原生 scrollback
//   - 二元划分：transcript 区（一次性写、不可变、进 scrollback）
//              vs 渲染区（每帧 diff、可变、含 Editor/Loader/流式 Markdown）
//   - raw mode + parseKeys：丢 readline，Editor 接管输入
//   - permission confirm：临时退 raw + readline + 重进
// ============================================================

import * as readline from 'readline'
import type { Agent, AgentEvent } from '../agent/index.js'
import type { PermissionManager } from '../agent/index.js'
import { RiskLevel } from '../agent/index.js'
import { Terminal } from './terminal.js'
import { TuiMainScreen } from './renderer-main.js'
import { Markdown } from './components/markdown.js'
import { Loader } from './components/loader.js'
import { Editor } from './components/editor.js'
import { green, dim, gray, yellow, red } from './ansi.js'
import { executeCommand } from '../interface/tui/commands.js'

export interface StartTUIOptions {
  /** 权限管理器；传入后 host 会重挂 raw-mode confirm */
  permission?: PermissionManager
  /** 依赖注入（测试用）；不传则 new Terminal() */
  terminal?: Terminal
}

/** 启动 TUI；返回 stop 函数（测试/外部控制用） */
export function startTUI(agent: Agent, options?: StartTUIOptions): () => void {
  const terminal = options?.terminal ?? new Terminal()
  const permission = options?.permission

  const screen = new TuiMainScreen(terminal)
  const width = () => terminal.columns

  // ── 组件 ──
  const markdown = new Markdown('')
  const loader = new Loader({ text: 'piagent is thinking...', color: (s: string) => dim(gray(s)) })

  // Editor 的 onSubmit/onCancel 在下面定义（需要引用 editor 自身做 pushHistory）
  let editor!: Editor
  const ensureEditor = () => {
    if (!editor) {
      editor = new Editor({
        prompt: green('> '),
        history: [],
        onSubmit: (text) => onSubmit(text),
        onCancel: () => { cleanup(); process.exit(0) },
      })
    }
  }
  ensureEditor()

  // ── 状态 ──
  let loaderInterval: NodeJS.Timeout | null = null
  let markdownRegistered = false
  let loaderRegistered = false
  let stopped = false
  let exitRaw: (() => void) | null = null

  // ── hero（一次性写进 transcript，屏幕顶部） ──
  function printHero(): void {
    const m = agent.state.model
    const n = agent.state.tools.length
    const lines = [
      `  ${green('piagent')} ${dim(gray('v0.1.0 ·'))} ${dim(gray(`${m.provider}/${m.id}`))}`,
      `  ${dim(gray(`${n} 个工具可用 · 输入 /help 查看帮助`))}`,
      '',
    ]
    terminal.write(lines.join('\n') + '\n')
  }

  // ── loader 定时器 ──
  function startLoaderTimer(): void {
    stopLoaderTimer()
    loaderInterval = setInterval(() => {
      loader.tick()
      screen.requestRender()
    }, 80)
  }
  function stopLoaderTimer(): void {
    if (loaderInterval) {
      clearInterval(loaderInterval)
      loaderInterval = null
    }
  }
  function showLoader(): void {
    if (!loaderRegistered) {
      screen.registerComponent(loader)
      loaderRegistered = true
    }
    startLoaderTimer()
    screen.requestRender()
  }
  function hideLoader(): void {
    stopLoaderTimer()
    if (loaderRegistered) {
      screen.unregisterComponent(loader)
      loaderRegistered = false
    }
  }
  function hideMarkdown(): void {
    if (markdownRegistered) {
      screen.unregisterComponent(markdown)
      markdownRegistered = false
    }
    markdown.setSource('')
  }

  // ── Agent 事件 → 组件 ──
  function handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'turn_start':
        hideMarkdown()
        loader.setText('piagent is thinking...')
        showLoader()
        break

      case 'message_update': {
        const content = event.message.content
        if (!content) break
        hideLoader()
        markdown.setSource(content)
        if (!markdownRegistered) {
          screen.registerComponent(markdown)
          markdownRegistered = true
        }
        screen.requestRender()
        break
      }

      case 'message_end': {
        // 把最终 markdown 内容提交进 transcript（不可变）
        if (markdown.getSource()) {
          screen.commitTranscript(markdown.render(width()))
        }
        hideMarkdown()
        hideLoader()
        screen.requestRender()
        break
      }

      case 'tool_execution_start': {
        const args = event.args as Record<string, unknown>
        const argText = Object.entries(args)
          .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
          .join(', ')
        screen.commitTranscript([
          `  ${dim('→')} ${yellow(event.toolName)}${argText ? ` ${dim(gray(argText))}` : ''}`,
        ])
        break
      }

      case 'tool_execution_end':
        // Phase 4 简化：不显示结果（下一轮 message_update 继续）
        break

      case 'error':
        hideLoader()
        screen.commitTranscript([`  ${red('✗')} ${event.message}`])
        break

      case 'turn_end':
        stopLoaderTimer()
        screen.requestRender()
        break
    }
  }

  // ── slash 命令 ──
  function handleSlashCommand(input: string): void {
    const result = executeCommand(input, agent)
    if (!result) {
      screen.commitTranscript([`  ${red('✗')} 未知命令: ${input}`])
      return
    }
    if (result.clear) {
      // /clear：重启渲染区（主屏派，不清 scrollback）
      screen.stop()
      screen.start()
    }
    if (result.output) {
      screen.commitTranscript(result.output.split('\n'))
    }
    if (input === '/exit' || input === '/quit') {
      cleanup()
      process.exit(0)
    }
  }

  // ── Editor 提交 ──
  function onSubmit(text: string): void {
    editor.pushHistory(text)
    const trimmed = text.trim()
    if (!trimmed) {
      screen.requestRender()
      return
    }
    if (trimmed.startsWith('/')) {
      handleSlashCommand(trimmed)
      return
    }
    if (agent.state.isStreaming) {
      agent.followUp(trimmed)
      screen.commitTranscript([`  ${dim(gray('→ 已加入队列'))}`, ''])
      return
    }
    // 用户消息进 transcript
    screen.commitTranscript([`${green('> ')}${text}`, ''])
    // agent.prompt；event handler 会驱动 loader/markdown
    agent.prompt(trimmed).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      screen.commitTranscript([`  ${red('✗')} 错误: ${msg}`])
    })
  }

  // ── 输入路径 ──
  const stopInput = terminal.onInput((data) => {
    editor.handleInput(data)
    // Editor 状态变化后必须 requestRender 才能反映到屏幕
    // （Editor 是被动组件，不自触发渲染；raw mode 下 stdin 也不回显）
    screen.requestRender()
  })

  // ── resize ──
  const stopResize = terminal.onResize(() => {
    screen.onResize()
    screen.requestRender()
  })

  // ── permission raw-mode confirm ──
  if (permission) {
    permission.setConfirm((req) => rawModeConfirm(req))
  }

  function rawModeConfirm(req: { command: string; risk: RiskLevel }): Promise<boolean> {
    const riskLabel = req.risk === RiskLevel.DANGEROUS ? '🔴 高风险' : '🟡 普通风险'
    screen.commitTranscript([
      '',
      `${'='.repeat(50)}`,
      `${riskLabel} 操作需要确认`,
      `命令: ${req.command}`,
      `${'='.repeat(50)}`,
      '是否允许执行？(y/N)',
    ])
    // 临时退出 raw mode 让 readline 工作
    if (exitRaw) exitRaw()
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
      })
      const timeout = setTimeout(() => {
        rl.close()
        reenterRaw()
        resolve(false)
      }, 30_000)
      rl.on('line', (line) => {
        clearTimeout(timeout)
        rl.close()
        reenterRaw()
        resolve(['y', 'yes'].includes(line.trim().toLowerCase()))
      })
      rl.on('SIGINT', () => {
        clearTimeout(timeout)
        rl.close()
        reenterRaw()
        resolve(false)
      })
    })
  }
  function reenterRaw(): void {
    exitRaw = terminal.enterRawMode()
  }

  // ── 启动 ──
  function start(): void {
    if (stopped) return
    // 全局错误兜底
    process.on('uncaughtException', (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      terminal.writeErr(`\n  ⚠ ${msg}\n`)
    })
    process.on('unhandledRejection', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      terminal.writeErr(`\n  ⚠ ${msg}\n`)
    })

    printHero()
    screen.dock('bottom', editor)  // Editor 始终在渲染区底部
    screen.start()                  // 预留空行 + 首帧（渲染 Editor）
    exitRaw = terminal.enterRawMode()
    terminal.hideCursor()
    unsubscribeAgent = agent.subscribe(handleEvent)
  }

  // ── 清理 ──
  let unsubscribeAgent: (() => void) | null = null
  function cleanup(): void {
    if (stopped) return
    stopped = true
    stopLoaderTimer()
    unsubscribeAgent?.()
    unsubscribeAgent = null
    stopInput()
    stopResize()
    if (exitRaw) { exitRaw(); exitRaw = null }
    screen.stop()
    terminal.showCursor()
  }

  start()
  return cleanup
}