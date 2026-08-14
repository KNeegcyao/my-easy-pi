// ============================================================
// startTUI — 新 TUI 主入口（Phase 4.7，照搬 pi 三件套）
//
// pi 稳定性的三个根本机制（已验证，详见 plans/synthetic-jingling-pinwheel.md）：
//   1. chatContainer.children **只增不减**（除了 compaction/rebuild 路径）
//      —— 一回合的 AssistantTurn 创建后永久挂载，message_end 不移除它
//   2. AssistantTurn.updateContent 内部 contentContainer.clear()+重建
//      —— 子组件位置稳定，不靠 register/unregister 切换
//   3. statusContainer 是独立 slot（loader 唯一宿主），不与 chat 混在一起
//      —— statusContainer 自身常驻 register 一次
//
// 渲染区 = chatContainer（常驻， addChild 累积历史）
//        + statusContainer（常驻，loader 单 slot）
//        + editor（dock('bottom')，常驻）
// ============================================================

import type { Agent, AgentEvent } from '../agent/index.js'
import type { PermissionManager } from '../agent/index.js'
import { RiskLevel } from '../agent/index.js'
import { Terminal } from './terminal.js'
import { TuiMainScreen } from './renderer-main.js'
import { TuiAltScreen } from './renderer-alt.js'
import { Container } from './layout/container.js'
import { VStack } from './layout/stack.js'
import { ScrollView } from './layout/scroll-view.js'
import { AssistantTurn, userPromptLine, mutedLine } from './components/assistant-turn.js'
import { ToolExecution, type ToolResultLike } from './components/tool-execution.js'
import { Spacer } from './components/spacer.js'
import { Text } from './components/text.js'
import { Loader } from './components/loader.js'
import { Editor } from './components/editor.js'
import { Box } from './components/box.js'
import { Statusbar } from './components/statusbar.js'
import { green, dim, gray, yellow, red, bold, cyan } from './ansi.js'
import { executeCommand } from '../interface/tui/commands.js'

// tool_execution 事件 payload 里的 args 形状
interface ToolExecArgs {
  args?: Record<string, unknown>
  toolCallId: string
  toolName: string
  partialResult?: { content: unknown[] }   // ToolUpdate.content (ContentBlock[])
  result?: { content: unknown[] }          // raw ToolResult.content (ContentBlock[])
  isError?: boolean
}

/** 把 ContentBlock[]（可能含 text/image/tool_use 块）规整成纯文本字符串 */
function blocksToText(blocks: unknown): string {
  if (typeof blocks === 'string') return blocks
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((b): b is { type: 'text'; text: string } =>
      typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text')
    .map(b => b.text)
    .join('\n')
}

export interface StartTUIOptions {
  /** 权限管理器；传入后 host 会重挂 raw-mode confirm */
  permission?: PermissionManager
  /** 依赖注入（测试用）；不传则 new Terminal() */
  terminal?: Terminal
  /** true 用主屏模式（renderer-main，行 diff + 原生 scrollback）；默认 false=alt-screen */
  useMainScreen?: boolean
}

/** 启动 TUI；返回 stop 函数 */
export function startTUI(agent: Agent, options?: StartTUIOptions): () => void {
  const terminal = options?.terminal ?? new Terminal()
  const permission = options?.permission
  const useMainScreen = options?.useMainScreen ?? false

  // 渲染器：默认 alt-screen（全屏布局，editor 钉底）；--main-screen 降级
  const screen = useMainScreen
    ? new TuiMainScreen(terminal)
    : new TuiAltScreen(terminal)

  // ── 常驻容器（pi 三件套 1: chatContainer） ──
  const chatContainer = new Container()
  // ── 常驻容器（pi 三件套 3: statusContainer, loader 的唯一 slot） ──
  const statusContainer = new Container()

  // ── 业务组件 ──
  const loader = new Loader({ text: 'piagent is thinking...', color: (s: string) => dim(gray(s)) })
  let editor!: Editor
  const ensureEditor = () => {
    if (!editor) {
      editor = new Editor({
        prompt: `${green(bold('>'))}${dim(gray(' ▸ '))}`,
        history: [],
        onSubmit: (text) => onSubmit(text),
        onCancel: () => { cleanup(); process.exit(0) },
      })
    }
  }
  ensureEditor()

  // ── 会话状态 ──
  let streamTurn: AssistantTurn | null = null     // 当前流式回合
  const pendingTools = new Map<string, ToolExecution>()  // toolCallId → 组件
  let loaderInterval: NodeJS.Timeout | null = null
  let stopped = false
  let exitRaw: (() => void) | null = null
  let confirming = false   // permission confirm 期间：跳过 editor onInput，防 readline+editor 双重消费 stdin

  // ── hero（像素 ASCII art 欢迎页，加入 chatContainer 顶部） ──
  function addHeroToChat(): void {
    const m = agent.state.model
    const n = agent.state.tools.length
    const art = [
      '  ███╗   ███╗██╗   ██╗        ███████╗ █████╗ ███████╗██╗   ██╗     ██████╗ ██╗',
      '  ████╗ ████║╚██╗ ██╔╝        ██╔════╝██╔══██╗██╔════╝╚██╗ ██╔╝     ██╔══██╗██║',
      '  ██╔████╔██║ ╚████╔╝         █████╗  ███████║███████╗ ╚████╔╝      ██████╔╝██║',
      '  ██║╚██╔╝██║  ╚██╔╝          ██╔══╝  ██╔══██║╚════██║  ╚██╔╝       ██╔═══╝ ██║',
      '  ██║ ╚═╝ ██║   ██║           ███████╗██║  ██║███████║   ██║        ██║     ██║',
      '  ╚═╝     ╚═╝   ╚═╝           ╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝        ╚═╝     ╚═╝',
    ]
    const artW = visibleWidth(art[0])
    chatContainer.addChild(new Spacer(1))
    for (const line of art) chatContainer.addChild(new Text(green(line)))
    chatContainer.addChild(new Spacer(1))
    const sep = bold(green('━'.repeat(artW)))
    chatContainer.addChild(new Text(sep))
    chatContainer.addChild(new Text(`${cyan(bold('  🎓 从零搭建 AI Coding Agent 的渐进式教学项目'))}`))
    chatContainer.addChild(new Text(`  ${bold(cyan('▸'))} ${dim(gray('model'))}: ${bold(gray(m.provider + '/' + m.id))}     ${bold(cyan('▸'))} ${dim(gray('tools'))}: ${bold(gray(n.toString()))}     ${bold(cyan('▸'))} ${dim(gray('/help · ctrl+c quit'))}`))
    chatContainer.addChild(new Text(sep))
    chatContainer.addChild(new Spacer(1))
  }

  // ── loader slot 控制（statusContainer 是单 slot，绝不 unregister）──
  function showLoader(): void {
    statusContainer.clear()
    statusContainer.addChild(loader)
    startLoaderTimer()
    screen.requestRender()
  }
  function hideLoader(): void {
    stopLoaderTimer()
    statusContainer.clear()
    screen.requestRender()
  }
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

  /** 当前/最近一个回合；若无 streamTurn 但事件到达，fallback 创建一个空 turn */
  function currentTurn(): AssistantTurn {
    if (!streamTurn) {
      streamTurn = new AssistantTurn()
      chatContainer.addChild(new Spacer(1))   // 回合之间空行
      chatContainer.addChild(streamTurn)
    }
    return streamTurn
  }

  // ── Agent 事件 → 组件状态（pi 三件套 2: updateContent 而非 register/unregister）──
  function handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'turn_start': {
        // 新回合：创建新 AssistantTurn 永久挂到 chatContainer 末尾
        streamTurn = new AssistantTurn()
        chatContainer.addChild(new Spacer(1))
        chatContainer.addChild(streamTurn)
        loader.setText('piagent is thinking...')
        showLoader()
        break
      }

      case 'message_update': {
        const content = (event.message as { content?: string }).content
        if (!content) break
        hideLoader()
        // 流式中更新（isStreaming=true）
        currentTurn().updateContent({ content }, true)
        screen.requestRender()
        break
      }

      case 'message_end': {
        // pi 模型：只调 updateContent(isStreaming=false)，绝不移除组件
        // （已完成的回合永久留在 chatContainer.scrollback 里）
        const msg = event.message as { content?: string; toolCalls?: unknown[] }
        if (streamTurn) {
          streamTurn.updateContent({ content: msg.content || '' }, false)
        }
        hideLoader()
        // 不 null streamTurn：让后续 tool_execution_start 把工具挂到同一回合
        // （turn_start 会创建新 turn，streamTurn 自然切换）
        screen.requestRender()
        break
      }

      case 'tool_execution_start': {
        const { toolCallId, toolName, args } = event as unknown as ToolExecArgs & { type: string }
        const tool = new ToolExecution(toolName, args || {})
        pendingTools.set(toolCallId, tool)
        // 工具属于当前回合（若无 streamTurn 也会 currentTurn 建一个）
        currentTurn().addToolExecution(tool)
        tool.markExecutionStarted()
        screen.requestRender()
        break
      }

      case 'tool_execution_update': {
        const e = event as unknown as ToolExecArgs & { type: string }
        const tool = pendingTools.get(e.toolCallId)
        if (tool && e.partialResult) {
          // partialResult.content 是 ContentBlock[]，转字符串
          tool.updateResult(
            { content: blocksToText(e.partialResult.content), isError: false },
            true,
          )
          screen.requestRender()
        }
        break
      }

      case 'tool_execution_end': {
        const e = event as unknown as ToolExecArgs & { type: string }
        const tool = pendingTools.get(e.toolCallId)
        if (tool) {
          const text = e.result ? blocksToText(e.result.content) : ''
          tool.updateResult(
            { content: text || (e.isError ? '(工具执行失败)' : ''), isError: e.isError ?? false },
            false,
          )
        }
        pendingTools.delete(e.toolCallId)
        screen.requestRender()
        break
      }

      // 注：'error' event 已移除（Phase 4.9）。loop.ts 从不 emit 它，
      // 真错误走 onSubmit 的 agent.prompt().catch（已处理）。

      case 'turn_end': {
        stopLoaderTimer()
        screen.requestRender()
        break
      }
    }
  }

  // ── slash 命令 ──
  function handleSlashCommand(input: string): void {
    const result = executeCommand(input, agent)
    if (!result) {
      chatContainer.addChild(new Text(`  ${red('✗')} 未知命令: ${input}`))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
      return
    }
    if (result.clear) {
      // /clear：清屏 + 清 LLM 上下文（agent.reset）。sessionId 不变（cli.ts 集成，follow-up）。
      chatContainer.clear()
      pendingTools.clear()
      streamTurn = null
      agent.reset?.()
      screen.requestRender()
    }
    if (result.output) {
      // 命令输出进 chat history（常驻）
      for (const line of result.output.split('\n')) {
        chatContainer.addChild(new Text(line))
      }
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
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
      // 已加入队列提示：append 到 chat history 而非独立 transcript 区
      chatContainer.addChild(new Text(mutedLine('已加入队列')))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
      return
    }
    // 用户消息进 chat history（pi model：addChild 到 chatContainer）
    chatContainer.addChild(new Text(userPromptLine(text)))
    chatContainer.addChild(new Spacer(1))
    screen.requestRender()
    // 触发 agent.prompt；后续事件会驱动 loader/markdown
    agent.prompt(trimmed).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      chatContainer.addChild(new Text(`  ${red('✗')} 错误: ${msg}`))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
    })
  }

  // ── 输入路径 ──
  const stopInput = terminal.onInput((data) => {
    // permission confirm 期间 readline 接管 stdin，跳过 editor（防 y/N 污染 editor 状态）
    if (confirming) return
    editor.handleInput(data)
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
    const lines = [
      '',
      `${'='.repeat(50)}`,
      `${riskLabel} 操作需要确认`,
      `命令: ${req.command}`,
      `${'='.repeat(50)}`,
      '是否允许执行？(y/N)',
    ]
    // 确认弹窗走 chat history（始终保留在 scrollback）
    for (const l of lines) chatContainer.addChild(new Text(l))
    chatContainer.addChild(new Spacer(1))
    screen.requestRender()
    confirming = true
    // 直接在 raw mode 下读一个按键（不 exitRaw，不用 readline）
    stopLoaderTimer()
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        confirming = false
        resolve(false)
      }, 30_000)
      const handler = (buf: Buffer) => {
        const ch = buf.toString('utf-8')
        // 跳过鼠标事件
        if (ch.startsWith('\x1b[')) return
        clearTimeout(timeout)
        confirming = false
        const allowed = ch.toLowerCase() === 'y' || ch === '\r'
        if (allowed && agent.state.isStreaming) startLoaderTimer()
        screen.requestRender()
        resolve(ch.toLowerCase() === 'y')   // Enter = false（默认 N）
        // 卸下临时监听
        process.stdin.off('data', handler)
      }
      process.stdin.on('data', handler)
    })
  }
  function reenterRaw(): void {
    exitRaw = terminal.enterRawMode()
  }

  // ── 启动 ──
  let unsubscribeAgent: (() => void) | null = null
  let chatScrollView: ScrollView | null = null
  let stopMouse: (() => void) | null = null

  /** 回放历史消息到 chatContainer（-c 续接）：把 state.messages 重建为可见组件 */
  function replayHistory(): void {
    const msgs = (agent.state.messages || []) as ReadonlyArray<{
      role: string; content: string; isError?: boolean
    }>
    for (const m of msgs) {
      if (m.role === 'user') {
        chatContainer.addChild(new Text(userPromptLine(m.content)))
        chatContainer.addChild(new Spacer(1))
      } else if (m.role === 'assistant') {
        const turn = new AssistantTurn()
        turn.updateContent({ content: m.content, stopReason: 'end_turn' }, false)
        chatContainer.addChild(new Spacer(1))
        chatContainer.addChild(turn)
      } else if (m.role === 'toolResult') {
        const preview = m.content.length > 80 ? m.content.slice(0, 80) + '…' : m.content
        const prefix = m.isError ? red('✗') : dim(gray('│'))
        chatContainer.addChild(new Text(`  ${prefix} (tool result) ${preview}`))
      }
      // notification/thinking 跳过
    }
    streamTurn = null   // 历史回合不连到当前流式指针
  }

  function start(): void {
    if (stopped) return
    process.on('uncaughtException', (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      terminal.writeErr(`\n  ⚠ ${msg}\n`)
    })
    process.on('unhandledRejection', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      terminal.writeErr(`\n  ⚠ ${msg}\n`)
    })

    addHeroToChat()
    // 渲染器接线：alt-screen 用 VStack 布局树（chat ScrollView + footer editor），
    // main-screen 沿用 registerComponent/dock（行 diff + 原生 scrollback）
    if (useMainScreen) {
      screen.registerComponent(chatContainer)
      screen.registerComponent(statusContainer)
      screen.dock('bottom', editor)
    } else {
      // alt: rootStack = VStack([chatScrollView(grow1), bottomDock[status, editor]])
      chatScrollView = new ScrollView({ stickyBottom: true })
      chatScrollView.setChild(chatContainer)
      const editorBox = new Box({ padding: 0 })
      editorBox.setChild(editor)
      const statusbar = new Statusbar(
        `${agent.state.model.provider}/${agent.state.model.id}`,
        agent.state.tools.length,
      )
      const bottomDock = new VStack([
        { component: statusContainer, grow: 0 },
        { component: new Text(dim(gray('─'.repeat(terminal.columns)))), grow: 0 },
        { component: editorBox, grow: 0, min: 1 },
        { component: statusbar, grow: 0 },
      ])
      const rootStack = new VStack([
        { component: chatScrollView, grow: 1, min: 1 },
        { component: bottomDock, grow: 0 },
      ])
      ;(screen as TuiAltScreen).setLayoutRoot(rootStack)
    }
    screen.start()
    exitRaw = terminal.enterRawMode()
    terminal.hideCursor()

    // alt-screen 启用鼠标滚轮 (SGR 1006)
    if (!useMainScreen && chatScrollView) {
      terminal.enableMouse()
      stopMouse = terminal.onMouse((ev: { button: number }) => {
        if (chatScrollView) {
          if (ev.button === 64) chatScrollView.scrollBy(-3)
          else if (ev.button === 65) chatScrollView.scrollBy(3)
          screen.requestRender()
        }
      })
    }

    unsubscribeAgent = agent.subscribe(handleEvent)
    // 回放历史（-c 续接）；订阅后调，让首次渲染画上历史
    if (agent.state.messages && agent.state.messages.length > 0) {
      replayHistory()
      screen.requestRender()
    }
  }

  // ── 清理 ──
  function cleanup(): void {
    if (stopped) return
    stopped = true
    stopLoaderTimer()
    unsubscribeAgent?.()
    unsubscribeAgent = null
    stopInput()
    stopResize()
    stopMouse?.()
    stopMouse = null
    if (!useMainScreen) terminal.disableMouse()
    if (exitRaw) { exitRaw(); exitRaw = null }
    screen.stop()
    terminal.showCursor()
  }

  start()
  return cleanup
}

/** 计算字符串的终端可视宽度（含 ANSI 剥离，CJK/emoji 双宽，其余单宽） */
function visibleWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) || 0
    const wide = (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0x9FFF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0x1F300 && cp <= 0x1F64F)
    w += wide ? 2 : 1
  }
  return w
}
