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
import { KeyBinds } from './components/keybinds.js'
import { Selector, type SelectOption } from './components/selector.js'
import type { Component } from './component.js'
import { Box } from './components/box.js'
import { Statusbar } from './components/statusbar.js'
import { green, dim, gray, yellow, red, bold, cyan } from './ansi.js'
import { executeCommand, tryExtensionCommand } from '../interface/tui/commands.js'
import { Compactor } from '../session/compaction.js'
import * as storage from '../session/storage.js'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

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
  /** 会话管理器（用于 /sessions /delete 命令） */
  sessionManager?: import('../session/index.js').SessionManager
  /** 当前会话 ID；传入后才支持撤回持久化 */
  sessionId?: string
}

/** 启动 TUI；返回 stop 函数 */
export function startTUI(agent: Agent, options?: StartTUIOptions): () => void {
  const terminal = options?.terminal ?? new Terminal()
  const permission = options?.permission
  const useMainScreen = options?.useMainScreen ?? false
  const sessionManager = options?.sessionManager
  const currentSessionId = options?.sessionId   // 用于撤回持久化

  // 渲染器：默认 alt-screen（全屏布局，editor 钉底）；--main-screen 降级
  const screen = useMainScreen
    ? new TuiMainScreen(terminal)
    : new TuiAltScreen(terminal)

  // ── 常驻容器（pi 三件套 1: chatContainer） ──
  const chatContainer = new Container()
  // ── 常驻容器（pi 三件套 3: statusContainer, loader 的唯一 slot） ──
  const statusContainer = new Container()

  // ── 业务组件 ──
  const loader = new Loader({ text: 'my-easy-pi is thinking...', color: (s: string) => dim(gray(s)) })
  let editor!: Editor
  const ensureEditor = () => {
    if (!editor) {
      editor = new Editor({
        prompt: `${green(bold('>'))}${dim(gray(' ▸ '))}`,
        history: [],
        multiline: true,
        onSubmit: (text) => onSubmit(text),
        onCancel: () => { cleanup(); process.exit(0) },
        onEsc: () => handleEsc(),
        onChange: (text) => handleEditorChange(text),
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
  let confirming = false   // permission confirm 期间：跳过 editor onInput
  let keybinds = new KeyBinds('default')   // 键绑定状态机（/keymap 切换）
  let activeSelector: Selector | null = null  // 活跃选择器（/sessions /delete 等），防 readline+editor 双重消费 stdin
  let autocompleteSelector: Selector | null = null // @ 文件引用补全选择器
  let suppressAutocomplete = false       // 防止选中补全项后 onChange 循环触发
  /** 当前正在构建的回合的组件引用（用于 undo/retry） */
  let turnComponents: Component[] = []
  /** 已完成回合的组件列表 */
  const turnHistory: Component[][] = []
  /** ESC 流式中止标志：agent.abort() 后还会异步发射 message_end/turn_end，需要跳过 */
  let abortingTurn = false

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
        // 上一个回合完成：将 turnComponents 归档到 turnHistory
        if (turnComponents.length > 0) {
          turnHistory.push(turnComponents)
        }
        // 新回合：创建新 AssistantTurn 永久挂到 chatContainer 末尾
        streamTurn = new AssistantTurn()
        const spacer = new Spacer(1)
        chatContainer.addChild(spacer)
        chatContainer.addChild(streamTurn)
        turnComponents = [spacer, streamTurn]
        loader.setText('my-easy-pi is thinking...')
        showLoader()
        break
      }

      case 'message_update': {
        // ESC 流式中止后 agent 还会异步发来一次更新，跳过
        if (abortingTurn) break
        const content = (event.message as { content?: string }).content
        if (!content) break
        hideLoader()
        // 流式中更新（isStreaming=true）
        currentTurn().updateContent({ content }, true)
        screen.requestRender()
        break
      }

      case 'message_end': {
        // ESC 流式中止后，移除 agent 异步推入的 partial assistant message
        if (abortingTurn) {
          abortingTurn = false
          if (agent.state.messages.length > 0 &&
              agent.state.messages[agent.state.messages.length - 1].role === 'assistant') {
            agent.state.messages.pop()
          }
          streamTurn = null
          hideLoader()
          screen.requestRender()
          break
        }
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
        // 回合结束：一定清掉底部状态行。仅 stopTimer 会把 spinner 冻住，
        // 但 loader 仍挂在 statusContainer 里，导致"thinking/running"永不消失。
        hideLoader()
        break
      }
    }
  }

  // ── slash 命令 ──
  function handleSlashCommand(input: string): void {
    const trimmed = input.trim()
    const parts = trimmed.split(/\s+/)
    const cmd = parts[0].toLowerCase()

    // 会话管理命令（异步，需 sessionManager）
    if (sessionManager && (cmd === '/sessions')) {
      sessCmdList()
      return
    }
    if (sessionManager && cmd === '/delete') {
      sessCmdDelete(parts[1])
      return
    }

    // /theme 命令（直接处理，需 Terminal）
    if (cmd === '/theme') {
      terminal.detectBackground().then((mode) => {
        const display = mode === 'dark' ? '🌙 深色' : '☀️ 浅色'
        const tip = mode === 'dark'
          ? `${dim(gray('检测到深色终端背景'))}`
          : `${dim(gray('检测到浅色终端背景 — 正在适配颜色'))}`
        chatContainer.addChild(new Text(`  ${green('✓')} 主题: ${bold(gray(display))}`))
        chatContainer.addChild(new Text(`  ${tip}`))
        chatContainer.addChild(new Spacer(1))
        screen.requestRender()
      })
      return
    }

    // /keymap 命令
    if (cmd === '/keymap') {
      const mode = keybinds.currentMode
      const vimState = keybinds.isVimInsert ? 'INSERT' : 'NORMAL'
      if (mode === 'default') {
        keybinds.setMode('vim')
        chatContainer.addChild(new Text(`  ${green('✓')} 键位切换: ${bold(cyan('Vim 模式'))} (${dim(gray('i=输入, Esc=命令, h/j/k/l=移动, x=删除, u=撤销, D=删到行尾, A=行尾插入'))})`))
      } else {
        keybinds.setMode('default')
        chatContainer.addChild(new Text(`  ${green('✓')} 键位切换: ${bold(gray('默认模式'))}`))
      }
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
      return
    }

    // /compact: 压缩上下文
    if (cmd === '/compact') {
      compactContext()
      return
    }
    // /undo: 撤销上一回合
    if (cmd === '/undo') {
      const last = undoLastTurn()
      if (last !== null) {
        chatContainer.addChild(new Text(`  ${green('✓')} 已撤销上一回合`))
        chatContainer.addChild(new Spacer(1))
      } else {
        chatContainer.addChild(new Text(`  ${dim(gray('没有可撤销的回合'))}`))
        chatContainer.addChild(new Spacer(1))
      }
      screen.requestRender()
      return
    }
    // /retry: 重试上一回合
    if (cmd === '/retry') {
      const last = undoLastTurn()
      if (last !== null) {
        const retryText = new Text(userPromptLine(last))
        const retrySpacer = new Spacer(1)
        chatContainer.addChild(retryText)
        chatContainer.addChild(retrySpacer)
        turnComponents = [retryText, retrySpacer]
        screen.requestRender()
        agent.prompt(last).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          chatContainer.addChild(new Text(`  ${red('✗')} 重试错误: ${msg}`))
          chatContainer.addChild(new Spacer(1))
          screen.requestRender()
        })
      } else {
        chatContainer.addChild(new Text(`  ${dim(gray('没有可重试的内容'))}`))
        chatContainer.addChild(new Spacer(1))
        screen.requestRender()
      }
      return
    }

    // 同步命令
    const result = executeCommand(input, agent)
    if (!result) {
      chatContainer.addChild(new Text(`  ${red('✗')} 未知命令: ${input}`))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
      return
    }
    if (result.clear) {
      chatContainer.clear()
      pendingTools.clear()
      streamTurn = null
      agent.reset?.()
      screen.requestRender()
    }
    if (result.output) {
      for (const line of result.output.split('\n')) {
        chatContainer.addChild(new Text(line))
      }
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
    }
    if (cmd === '/exit' || cmd === '/quit') {
      cleanup()
      process.exit(0)
    }
  }

  async function sessCmdList(): Promise<void> {
    chatContainer.addChild(new Spacer(1))
    try {
      const sessions = await sessionManager!.listSessions()
      if (sessions.length === 0) {
        chatContainer.addChild(new Text(`  ${dim(gray('(无会话)'))}`))
        chatContainer.addChild(new Spacer(1))
        screen.requestRender()
        return
      }
      const opts: SelectOption[] = sessions.map(s => ({
        label: s.name,
        value: s.id,
        description: `${s.messageCount} msgs · ${s.createdAt}`,
      }))
      // 加一个退出选项
      opts.push({ label: '取消', value: '' })
      const sel = new Selector(opts, '会话列表 (选择后按 Enter 进入)')
      sel.onSelect = (opt) => {
        activeSelector = null
        chatContainer.removeChild(sel)
        if (!opt.value) {
          chatContainer.addChild(new Text(`  ${dim(gray('已取消'))}`))
          chatContainer.addChild(new Spacer(1))
          screen.requestRender()
          return
        }
        // 加载选中会话（切换到该会话）
        chatContainer.addChild(new Text(`  ${green('✓')} 选中: ${bold(gray(opt.label))} ${dim(gray('(当前版本仅显示，续接请用 -c flag)'))}`))
        chatContainer.addChild(new Spacer(1))
        screen.requestRender()
      }
      sel.onCancel = () => {
        activeSelector = null
        chatContainer.removeChild(sel)
        chatContainer.addChild(new Text(`  ${dim(gray('已取消'))}`))
        chatContainer.addChild(new Spacer(1))
        screen.requestRender()
      }
      activeSelector = sel
      // 把选择器作为组件直接挂载到 chat，支持实时高亮刷新
      chatContainer.addChild(sel)
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
    } catch (e) {
      chatContainer.addChild(new Text(`  ${red('✗')} 获取会话列表失败: ${e instanceof Error ? e.message : String(e)}`))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
    }
  }

  async function sessCmdDelete(idOrName: string | undefined): Promise<void> {
    if (!idOrName) {
      chatContainer.addChild(new Spacer(1))
      chatContainer.addChild(new Text(`  ${yellow('用法')}: /delete <会话ID最后8位>`))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
      return
    }
    // 找匹配的会话（支持时最后 8 位匹配）
    const sessions = await sessionManager!.listSessions()
    const target = sessions.find(s => s.id.endsWith(idOrName))
    if (!target) {
      chatContainer.addChild(new Text(`  ${red('✗')} 未找到匹配会话: ${idOrName}`))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
      return
    }
    // 确认删除
    chatContainer.addChild(new Spacer(1))
    chatContainer.addChild(new Text(`  ${yellow('⚠ 确认删除会话:')}`))
    chatContainer.addChild(new Text(`  ${gray(target.name)}  ${dim(gray(target.messageCount + ' 条消息'))}`))
    chatContainer.addChild(new Text(`  ${yellow('输入 y 确认, 其他取消')}`))
    chatContainer.addChild(new Spacer(1))
    screen.requestRender()
    // 读一个键
    confirming = true
    const handler = (buf: Buffer) => {
      const ch = buf.toString('utf-8').toLowerCase()
      if (ch === 'y') {
        sessionManager!.deleteSession(target.id).then(() => {
          chatContainer.addChild(new Text(`  ${green('✓')} 已删除会话: ${target.name}`))
        }).catch((err: unknown) => {
          chatContainer.addChild(new Text(`  ${red('✗')} 删除失败: ${err instanceof Error ? err.message : String(err)}`))
        }).finally(() => {
          chatContainer.addChild(new Spacer(1))
          screen.requestRender()
        })
      }
      confirming = false
      process.stdin.off('data', handler)
    }
    process.stdin.on('data', handler)
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
    // 首词精确命中已注册扩展命令：作为命令执行，而非普通对话消息。
    // （扩展命令是即时操作，不进入流式队列。）
    if (tryExtensionCommand(trimmed)) {
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
    const userText = new Text(userPromptLine(text))
    const userSpacer = new Spacer(1)
    chatContainer.addChild(userText)
    chatContainer.addChild(userSpacer)
    turnComponents = [userText, userSpacer]  // 新回合跟踪开始
    screen.requestRender()
    // 触发 agent.prompt；后续事件会驱动 loader/markdown
    agent.prompt(trimmed).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      chatContainer.addChild(new Text(`  ${red('✗')} 错误: ${msg}`))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
    })
  }

  // ── Editor 变化（自动补全触发） ──
  function handleEditorChange(_text: string): void {
    // 选中补全项后，replaceAutocomplete 会触发 onChange → 跳过本次防循环
    if (suppressAutocomplete) { suppressAutocomplete = false; return }
    const prefix = editor.getAutocompletePrefix('@')
    if (!prefix) {
      closeAutocomplete()
      return
    }
    // 异步扫描文件（debounce：如果已有选择器，先关闭）
    closeAutocomplete()
    const candidates = scanFiles(prefix)
    if (candidates.length === 0) return

    const opts: SelectOption[] = candidates.map(c => ({ label: c, value: c }))
    opts.push({ label: '取消', value: '' })

    const sel = new Selector(opts, `文件补全 @${prefix}`)
    sel.onSelect = (opt) => {
      autocompleteSelector = null
      if (!opt.value) return
      const full = `@${opt.value}`
      const currentPrefix = editor.getAutocompletePrefix('@')
      if (currentPrefix !== null) {
        const triggerIdx = editor.getText().lastIndexOf('@', editor.getCursorPos() - 1)
        if (triggerIdx !== -1) {
          suppressAutocomplete = true  // 防 onChange 循环再次触发补全
          editor.replaceAutocomplete(editor.getCursorPos() - triggerIdx, full)
        }
      }
      screen.requestRender()
    }
    sel.onCancel = () => { autocompleteSelector = null; screen.requestRender() }
    autocompleteSelector = sel
    // 渲染到 statusContainer（不污染 chat 历史），Selector 作为组件直接挂载
    statusContainer.clear()
    statusContainer.addChild(new Text(dim(gray('按 ↑/↓ 选择，Enter 确认，Esc 取消'))))
    statusContainer.addChild(sel)
    screen.requestRender()
  }

  function closeAutocomplete(): void {
    if (autocompleteSelector) {
      autocompleteSelector = null
      // 如果 statusContainer 只有补全内容，清空它（恢复 loader 或空状态）
      if (!agent.state.isStreaming) {
        statusContainer.clear()
      }
      screen.requestRender()
    }
  }

  /** 扫描当前目录下匹配前缀的文件/目录 */
  function scanFiles(prefix: string): string[] {
    try {
      const cwd = process.cwd()
      // 支持子目录路径，如 "src/" 或 "src/cl"
      const lastSlash = prefix.lastIndexOf('/')
      const dirPart = lastSlash >= 0 ? prefix.slice(0, lastSlash) : ''
      const filePart = lastSlash >= 0 ? prefix.slice(lastSlash + 1) : prefix
      const targetDir = resolve(cwd, dirPart || '.')
      if (!existsSync(targetDir)) return []
      const entries = readdirSync(targetDir)
      const matches: string[] = []
      for (const entry of entries) {
        if (entry.startsWith('.')) continue // 忽略隐藏文件
        const rel = dirPart ? `${dirPart}/${entry}` : entry
        if (filePart && !entry.toLowerCase().startsWith(filePart.toLowerCase())) continue
        const fullPath = join(targetDir, entry)
        const isDir = statSync(fullPath).isDirectory()
        matches.push(isDir ? `${rel}/` : rel)
      }
      return matches.slice(0, 10) // 最多 10 个候选
    } catch {
      return []
    }
  }

  // ── 输入路径 ──
  // 转义序列缓冲：Windows 终端可能把 \x1b[A 拆成 \x1b 和 [A 两次 data 事件
  let escBuf = ''
  const stopInput = terminal.onInput((data) => {
    // @ 文件补全选择器开启时：方向键/Enter/Esc/Ctrl+C 交给选择器；
    // 其他字符继续交给编辑器输入，这样用户可以在候选列表打开时继续打字过滤。
    if (autocompleteSelector) {
      if (data.startsWith('\x1b')) {
        escBuf += data
        if (escBuf.length >= 3) {
          autocompleteSelector.handleKey(escBuf)
          escBuf = ''
          screen.requestRender()
          return
        }
        const sel = autocompleteSelector
        setTimeout(() => {
          if (escBuf && sel) {
            sel.handleKey(escBuf)
            escBuf = ''
            screen.requestRender()
          }
        }, 50)
        return
      }
      escBuf = ''
      // Enter / Ctrl+C 由选择器处理（确认或取消）
      if (data === '\r' || data === '\n' || data === '\x03') {
        autocompleteSelector.handleKey(data)
        screen.requestRender()
        return
      }
      // 普通字符交给 keybinds → editor，onChange 会自动刷新补全列表
      if (!confirming) {
        const result = keybinds.process(data)
        if (result.intents.length > 0) editor.handleIntents(result.intents)
        screen.requestRender()
      }
      return
    }
    // 活跃选择器时：路由到 selector，跳过 editor
    if (activeSelector) {
      // 如果有缓冲的 ESC 或本次以 ESC 开头，尝试拼接完整转义序列
      if (escBuf || data.startsWith('\x1b')) {
        escBuf += data
        // 转义序列通常 ≤4 字节（\x1b[A / \x1bOA / \x1b[5~）
        if (escBuf.length >= 3 || (escBuf === '\x1b' && !data.startsWith('\x1b'))) {
          activeSelector.handleKey(escBuf)
          escBuf = ''
          screen.requestRender()
          return
        }
        // 等 50ms 看后续 data 是否到达
        const sel = activeSelector
        setTimeout(() => {
          if (escBuf && sel) {
            sel.handleKey(escBuf)
            escBuf = ''
            screen.requestRender()
          }
        }, 50)
        return
      }
      activeSelector.handleKey(data)
      screen.requestRender()
      return
    }
    escBuf = ''  // 清空缓冲
    // permission confirm 期间（兼容旧路径）
    if (confirming) return
    // 通过 keybinds 层处理输入（支持 vim 模式）
    const result = keybinds.process(data)
    if (result.intents.length > 0) {
      editor.handleIntents(result.intents)
    }
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
    const sel = new Selector([
      { label: 'Yes', value: 'y', description: '允许执行' },
      { label: 'No', value: 'n', description: '拒绝执行（默认）' },
    ], `${req.risk === RiskLevel.DANGEROUS ? '🔴' : '🟡'} 操作需要确认`)

    // 写入确认框到 chat（Selector 作为组件直接挂载，支持实时高亮刷新）
    chatContainer.addChild(new Spacer(1))
    chatContainer.addChild(new Text(`  ${dim(gray('命令: '))}${req.command}`))
    chatContainer.addChild(sel)
    chatContainer.addChild(new Spacer(1))
    screen.requestRender()
    stopLoaderTimer()

    activeSelector = sel
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        activeSelector = null
        chatContainer.removeChild(sel)
        resolve(false)
      }, 30_000)
      sel.onSelect = (opt) => {
        clearTimeout(timeout)
        activeSelector = null
        chatContainer.removeChild(sel)
        const allowed = opt.value === 'y'
        if (allowed && agent.state.isStreaming) startLoaderTimer()
        if (opt.value === 'y') {
          chatContainer.addChild(new Text(`  ${green('✓')} 已允许`))
        } else {
          chatContainer.addChild(new Text(`  ${dim(gray('已拒绝'))}`))
        }
        chatContainer.addChild(new Spacer(1))
        screen.requestRender()
        resolve(allowed)
      }
      sel.onCancel = () => {
        clearTimeout(timeout)
        activeSelector = null
        chatContainer.removeChild(sel)
        chatContainer.addChild(new Text(`  ${dim(gray('已取消'))}`))
        chatContainer.addChild(new Spacer(1))
        screen.requestRender()
        resolve(false)
      }
    })
  }
  // ── undo/retry/compact/esc 辅助 ──

  /** ESC 键：撤回上一轮用户+AI 回合 */
  function handleEsc(): void {
    if (agent.state.isStreaming) {
      // 流式进行中：先中止生成，再撤回
      agent.abort()
      abortingTurn = true
      hideLoader()
    }
    const last = undoLastTurn()
    if (last !== null) {
      chatContainer.addChild(new Text(`  ${dim(gray('已撤回上一轮 (ESC)'))}`))
      chatContainer.addChild(new Spacer(1))
    } else {
      chatContainer.addChild(new Text(`  ${dim(gray('没有可撤回的内容'))}`))
      chatContainer.addChild(new Spacer(1))
    }
    screen.requestRender()
  }

  /** 撤销最后一个 user+assistant 回合；返回最后一条 user 文本（供 /retry 用） */
  function undoLastTurn(): string | null {
    // 收集所有需要移除的组件（从 turnHistory 和 turnComponents 中，缺一不可）
    const toRemove: Component[] = []

    // 1. 从 turnHistory 取
    const historyComponents = turnHistory.length > 0 ? turnHistory.pop()! : null
    if (historyComponents) toRemove.push(...historyComponents)

    // 2. 再从 turnComponents 取（正在构建中的回合组件，不取就漏了 streamTurn）
    if (turnComponents.length > 0) {
      toRemove.push(...turnComponents)
      turnComponents = []
    }

    if (toRemove.length === 0) return null

    // 移除所有组件
    for (const c of toRemove) {
      chatContainer.removeChild(c)
    }

    // === pi 风格：标记 revoked，不删除消息 ===
    // 找到最后一个 assistant，标为撤回；再取 user 的文本供 /retry
    let lastUserText: string | null = null
    let revokedOne = false
    for (let i = agent.state.messages.length - 1; i >= 0; i--) {
      const msg = agent.state.messages[i]
      if (revokedOne && msg.role === 'user') {
        lastUserText = msg.content
        break
      }
      if (!revokedOne && msg.role === 'assistant') {
        msg.revoked = true
        revokedOne = true
      }
    }

    // 流式撤回：assistant 尚未创建，直接移除最后一条 user 消息
    if (!revokedOne) {
      for (let i = agent.state.messages.length - 1; i >= 0; i--) {
        if (agent.state.messages[i].role === 'user') {
          lastUserText = agent.state.messages[i].content
          agent.state.messages.splice(i, 1)
          break
        }
      }
    }

    // 持久化：将变更写入 JSONL 文件
    if (currentSessionId) {
      storage.writeMessages(currentSessionId, agent.state.messages).catch(() => {})
    }

    streamTurn = null
    return lastUserText
  }

  /** 压缩上下文：将早期消息压缩为摘要 */
  function compactContext(): void {
    if (agent.state.isStreaming) {
      chatContainer.addChild(new Text(`  ${yellow('⚠')} 当前正在生成，请等待完成后再压缩`))
      chatContainer.addChild(new Spacer(1))
      screen.requestRender()
      return
    }
    const compactor = new Compactor({ threshold: 15, keepRecent: 8 })
    const originalCount = agent.state.messages.length
    const compressed = compactor.compact(agent.state.messages)
    if (compressed.length >= originalCount) {
      chatContainer.addChild(new Text(`  ${dim(gray('消息数 ' + String(originalCount) + ' 未达压缩阈值，无需压缩'))}`))
    } else {
      agent.state.messages = compressed
      const saved = originalCount - compressed.length
      chatContainer.addChild(new Text(`  ${green('✓')} 上下文已压缩: ${dim(gray(String(saved) + ' 条消息 → 摘要'))}`))
    }
    chatContainer.addChild(new Spacer(1))
    screen.requestRender()
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
