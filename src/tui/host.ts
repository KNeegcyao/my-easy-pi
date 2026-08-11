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

import * as readline from 'readline'
import type { Agent, AgentEvent } from '../agent/index.js'
import type { PermissionManager } from '../agent/index.js'
import { RiskLevel } from '../agent/index.js'
import { Terminal } from './terminal.js'
import { TuiMainScreen } from './renderer-main.js'
import { Container } from './layout/container.js'
import { AssistantTurn, userPromptLine, mutedLine } from './components/assistant-turn.js'
import { ToolExecution, type ToolResultLike } from './components/tool-execution.js'
import { Spacer } from './components/spacer.js'
import { Text } from './components/text.js'
import { Loader } from './components/loader.js'
import { Editor } from './components/editor.js'
import { green, dim, gray, yellow, red } from './ansi.js'
import { executeCommand } from '../interface/tui/commands.js'

// tool_execution 事件 payload 里的 args 形状
interface ToolExecArgs {
  args?: Record<string, unknown>
  toolCallId: string
  toolName: string
  partialResult?: ToolResultLike
  result?: ToolResultLike
}

export interface StartTUIOptions {
  /** 权限管理器；传入后 host 会重挂 raw-mode confirm */
  permission?: PermissionManager
  /** 依赖注入（测试用）；不传则 new Terminal() */
  terminal?: Terminal
}

/** 启动 TUI；返回 stop 函数 */
export function startTUI(agent: Agent, options?: StartTUIOptions): () => void {
  const terminal = options?.terminal ?? new Terminal()
  const permission = options?.permission

  const screen = new TuiMainScreen(terminal)

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
        prompt: green('> '),
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

  // ── hero（一次性写 scrollback，屏幕顶部） ──
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
        streamTurn = null
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
        const e = event as unknown as ToolExecArgs & { type: string; partialResult?: ToolResultLike }
        const tool = pendingTools.get(e.toolCallId)
        if (tool && e.partialResult) {
          tool.updateResult(e.partialResult, true)
          screen.requestRender()
        }
        break
      }

      case 'tool_execution_end': {
        const e = event as unknown as ToolExecArgs & { type: string; result?: ToolResultLike }
        const tool = pendingTools.get(e.toolCallId)
        if (tool && e.result) {
          tool.updateResult(e.result, false)
        }
        pendingTools.delete(e.toolCallId)
        screen.requestRender()
        break
      }

      case 'error': {
        // 直接 addChild 到 chatContainer 末尾，永远留在 scrollback（对齐 pi showExtensionError）
        hideLoader()
        chatContainer.addChild(new Text(`  ${red('✗')} ${(event as { message: string }).message}`))
        chatContainer.addChild(new Spacer(1))
        screen.requestRender()
        break
      }

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
      // /clear：清空 chat history（pi rebuildChatFromMessages 的轻量等价）
      chatContainer.clear()
      pendingTools.clear()
      streamTurn = null
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
    // 确认弹窗也走 chat history，避免破坏渲染区 continuum
    for (const l of lines) chatContainer.addChild(new Text(l))
    chatContainer.addChild(new Spacer(1))
    screen.requestRender()
    // 临时退 raw → readline 问 → 重进
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
  let unsubscribeAgent: (() => void) | null = null
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

    printHero()
    // 渲染区 = chatContainer + statusContainer + editor(dock)
    screen.registerComponent(chatContainer)
    screen.registerComponent(statusContainer)
    screen.dock('bottom', editor)
    screen.start()
    exitRaw = terminal.enterRawMode()
    terminal.hideCursor()
    unsubscribeAgent = agent.subscribe(handleEvent)
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
    if (exitRaw) { exitRaw(); exitRaw = null }
    screen.stop()
    terminal.showCursor()
  }

  start()
  return cleanup
}
