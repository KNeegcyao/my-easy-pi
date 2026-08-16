#!/usr/bin/env node
import * as readline from 'node:readline'
import { ModelRegistry, AnthropicProvider, DeepSeekProvider, OpenAIProvider } from './ai/index.js'
import { ToolRegistry, LocalOperations, createBashTool, createReadTool, createWriteTool, createEditTool, createGrepTool, createFindTool, createLsTool } from './tools/index.js'
import { Agent, PermissionManager, type ConfirmFn, RiskLevel } from './agent/index.js'
import { isAppError, AUTH_API_KEY_MISSING, PROVIDER_NOT_FOUND, MODEL_NOT_FOUND, type AppError } from './ai/errors.js'
import { createPrintInterface, createJSONInterface, startRPC } from './interface/index.js'
import { startTUI } from './tui/index.js'
import { ConfigManager, runInit } from './config/index.js'
import { SessionManager, Compactor } from './session/index.js'
import { ExtensionLoader, ExtensionAPI } from './extension/index.js'
import { recordTokenUsage } from './interface/tui/commands.js'
import type { Model } from './ai/types.js'
import type { AgentTool } from './agent/types.js'
import type { AgentMessage } from './ai/types.js'

type OutputMode = 'print' | 'json' | 'rpc'

export interface ParsedArgs {
  prompt?: string
  message?: string
  model?: string
  provider?: string
  tui?: boolean
  output?: OutputMode
  continue?: boolean
  list?: boolean
  deleteSession?: string
  init?: boolean
  mainScreen?: boolean
}

// ============================================================
// parseArgs — CLI 参数解析（纯函数）
// ============================================================
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const result: ParsedArgs = { output: 'print' }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '-p': case '--prompt': result.prompt = argv[++i]; break
      case '-m': case '--message': result.message = argv[++i]; break
      case '--model': result.model = argv[++i]; break
      case '--provider': result.provider = argv[++i]; break
      case '-o': case '--output': result.output = argv[++i] as OutputMode; break
      case '-i': case '--tui': result.tui = true; break
      case '-c': case '--continue': result.continue = true; break
      case '-l': case '--list': result.list = true; break
      case '--delete': result.deleteSession = argv[++i]; break
      case '--init': result.init = true; break
      case '--main-screen': result.mainScreen = true; break
      case '-h': case '--help': printHelp(); process.exit(0)
    }
  }
  return result
}

function printHelp(): void {
  console.log(`
my-easy-pi — 简易 AI Coding Agent

用法:
  my-easy-pi              启动交互式对话
  my-easy-pi -m "你好"    单次消息
  my-easy-pi -c           继续上次对话
  my-easy-pi -l           列出所有会话
  my-easy-pi --delete <id>  删除指定会话
  cat file | my-easy-pi -p "指令"  管道模式

选项:
  -p, --prompt    系统提示或指令
  -m, --message   直接输入消息
  -i, --tui       交互式对话模式（默认 alt-screen 全屏；加 --main-screen 降级）
  --main-screen   用主屏渲染器（行 diff + 原生 scrollback，非全屏）降级路径
  -o, --output    输出模式: print | json | rpc (默认: print)
  -c, --continue  继续上次会话
  -l, --list      列出所有会话
  --delete <id>   删除指定会话
  --init          初始化配置和沙箱环境
  --model <id>    指定模型
  --provider <name> 指定提供商 (deepseek|anthropic|openai)
  -h, --help      显示帮助

环境变量 (优先级高于配置文件):
  DEEPSEEK_API_KEY    DeepSeek API 密钥
  ANTHROPIC_API_KEY   Anthropic API 密钥
  OPENAI_API_KEY      OpenAI API 密钥

配置文件:
  ~/.my-easy-pi/config.json  用户全局配置（可用 apiKeys 字段存密钥）
  `)
}

// ============================================================
// 几个职责单一的纯/半纯函数，供 main 编排 + 独立单测
// ============================================================

/** 装配内置 ToolRegistry（7 个工具，注入 LocalOperations） */
export function buildTools(ops?: import('./tools/operations.js').Operations): ToolRegistry {
  const registry = new ToolRegistry()
  const opsImpl = ops ?? new LocalOperations()
  const tools = [
    createBashTool(opsImpl),
    createReadTool(opsImpl),
    createWriteTool(opsImpl),
    createEditTool(opsImpl),
    createGrepTool(opsImpl),
    createFindTool(opsImpl),
    createLsTool(opsImpl),
  ]
  for (const t of tools) registry.registerTool(t)
  return registry
}

/** 返回默认工具列表（使用 defaultOperations 兜底，仅用于无 cli 集成的场景） */
export function defaultTools(): import('./tools/operations.js').Operations {
  return new LocalOperations()
}

/**
 * 解析 provider + model + apiKey，返回 Model 或错误。
 * 在 main 中**先于**其余装配调用：让 provider/model/key 三类错误都在此一处可达，
 * 避免先前 getApiKey 抢先挡住 PROVIDER_NOT_FOUND（死路径）。
 * 成功返回 { model, provider }；任一无效返回 { error }。
 */
export function buildModel(
  provider: string,
  modelId: string,
  apiKey?: string,
): { model: Model; provider: string } | { error: AppError } {
  // 1) provider 校验（先于 key，让 PROVIDER_NOT_FOUND 在 main 真实可达）
  const knownProviders = ['anthropic', 'deepseek', 'openai']
  if (!knownProviders.includes(provider)) {
    return { error: PROVIDER_NOT_FOUND(provider) }
  }
  // 2) apiKey 校验
  if (!apiKey) {
    return { error: AUTH_API_KEY_MISSING(provider) }
  }
  // 3) model 校验
  const registry = new ModelRegistry()
  registry.setProvider('anthropic', AnthropicProvider)
  registry.setProvider('deepseek', DeepSeekProvider)
  registry.setProvider('openai', OpenAIProvider)
  const model = registry.getModel(provider, modelId, { apiKey })
  if (!model) {
    return { error: MODEL_NOT_FOUND(modelId, provider) }
  }
  return { model, provider }
}

/** 构建 confirm 回调：交互式 TTY 才提供，否则 undefined（PermissionManager 走 fail-closed） */
export function buildConfirmFn(isTTY: boolean = process.stdin.isTTY ?? false): ConfirmFn | undefined {
  if (!isTTY) return undefined
  return async ({ command, risk }) => {
    const riskLabel = risk === RiskLevel.DANGEROUS ? '🔴 高风险' : '🟡 普通风险'
    return new Promise<boolean>((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
      process.stderr.write(`\n${'='.repeat(50)}\n`)
      process.stderr.write(`${riskLabel} 操作需要确认\n`)
      process.stderr.write(`命令: ${command}\n`)
      process.stderr.write(`${'='.repeat(50)}\n`)
      process.stderr.write('是否允许执行？(y/N) ')
      const timeout = setTimeout(() => { rl.close(); resolve(false) }, 30_000)
      rl.on('line', (line) => {
        clearTimeout(timeout); rl.close()
        resolve(['y', 'yes'].includes(line.trim().toLowerCase()))
      })
      rl.on('SIGINT', () => { clearTimeout(timeout); rl.close(); resolve(false) })
    })
  }
}

/** 装配 Agent：注入 system prompt + 权限钩子 + 上下文压缩 */
export function buildAgent(opts: {
  model: Model
  tools: AgentTool[]
  registry?: ToolRegistry
  permission: PermissionManager
  compactor: Compactor
}): Agent {
  const { model, tools, registry, permission, compactor } = opts
  return new Agent({
    systemPrompt: '你是 my-easy-pi — 一个 AI 编程助手。\n\n你有以下内置工具可用：\n- bash：执行 shell 命令\n- read：读取文件内容\n- write：写入文件内容\n- edit：替换文件中的文本\n- grep：在文件中搜索关键词\n- find：查找文件名\n- ls：列出目录内容\n\n此外，通过扩展机制（.pi/extensions/）加载的自定义工具同样可以直接调用。\n\n请用中文回答用户的问题。保持回答简洁、准确，不要回复冗余的模型元信息。',
    model,
    tools,
    registry,
    beforeToolCall: (ctx) => permission.check(ctx),
    transformContext: async (messages) => compactor.compact(messages),
  })
}

/** 挂载会话自动持久化：每条非 notification 消息落盘 + 首条用户消息命名会话 + token 记账 */
export function setupSessionPersistence(agent: Agent, sessionManager: SessionManager, sessionId: string): void {
  let sessionNamed = false
  agent.subscribe(async (event) => {
    if (event.type === 'message_end' && event.message.role !== 'notification') {
      await sessionManager.saveMessage(sessionId, event.message)

      // 第一条用户消息自动命名会话
      if (!sessionNamed && event.message.role === 'user' && event.message.content) {
        const name = event.message.content.slice(0, 40) + (event.message.content.length > 40 ? '...' : '')
        await sessionManager.renameSession(sessionId, name)
        sessionNamed = true
      }
    }
    if (event.type === 'turn_end') {
      const usage = event.usage
      if (usage && (usage.promptTokens != null || usage.completionTokens != null)) {
        recordTokenUsage(usage.promptTokens ?? 0, usage.completionTokens ?? 0)
      } else {
        // Provider 未返回 usage：不造假。counter 仍加 1 表示一次完整调用，tokens 显示 N/A。
        recordTokenUsage(0, 0)
      }
    }
  })
}

/** 从 args + stdin 解析要发送的用户消息（undefined 表示无消息） */
export async function resolveUserMessage(args: ParsedArgs): Promise<string | undefined> {
  if (args.message) return args.message
  if (!process.stdin.isTTY && args.output !== 'rpc') {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    const stdin = Buffer.concat(chunks).toString('utf-8').trim()
    return args.prompt ? `${args.prompt}\n\n${stdin}` : stdin
  }
  return args.prompt
}

/** true = 启动 TUI 模式（无参且仍是 print 模式 fallback） */
export function shouldUseTUI(args: ParsedArgs): boolean {
  const noInstructionalArgs = !args.message && !args.prompt && !args.tui && !args.continue
  const noOutputCommand = args.output === 'print' && !args.list && !args.deleteSession
  return !!args.tui || (noInstructionalArgs && noOutputCommand && process.stdin.isTTY)
}

/** 分发四种运行模式；返回主控是否需 await 的信号（TUI 自驱动） */
export async function runMode(opts: {
  agent: Agent
  args: ParsedArgs
  userMessage?: string
  permission: PermissionManager
  sessionManager?: SessionManager
}): Promise<void> {
  const { agent, args, userMessage, permission, sessionManager } = opts
  if (args.tui) { startTUI(agent, { permission, useMainScreen: args.mainScreen, sessionManager }); return }
  if (args.output === 'json') {
    createJSONInterface(agent)
    try { await agent.prompt(userMessage!) } catch (e) {
      if (isAppError(e)) {
        console.error(`\n[${e.code}] ${e.message}`)
        if (e.suggestion) console.error(`  💡 ${e.suggestion}`)
      } else { console.error(e) }
      process.exit(1)
    }
    return
  }
  if (args.output === 'rpc') { startRPC(agent); return }
  // 默认 print
  createPrintInterface(agent)
  try { await agent.prompt(userMessage!); console.log('\n--- 完成 ---') }
  catch (e) {
    if (isAppError(e)) {
      console.error(`\n[${e.code}] ${e.message}`)
      if (e.suggestion) console.error(`  💡 ${e.suggestion}`)
    } else { console.error('\n错误:', e instanceof Error ? e.message : String(e)) }
    process.exit(1)
  }
}

// ============================================================
// main — 仅做编排
// ============================================================
async function main(): Promise<void> {
  const args = parseArgs()
  const config = new ConfigManager()
  await config.load()
  const sessionManager = new SessionManager()

  // 会话管理命令
  if (args.list) {
    const sessions = await sessionManager.listSessions()
    if (sessions.length === 0) { console.log('暂无会话记录'); process.exit(0) }
    console.log('\n会话列表:')
    for (const s of sessions) {
      console.log(`  ${s.id}  |  ${s.name}  |  ${s.messageCount} 条  |  ${s.createdAt}`)
    }
    process.exit(0)
  }

  if (args.deleteSession) {
    await sessionManager.deleteSession(args.deleteSession)
    console.log(`已删除会话: ${args.deleteSession}`)
    process.exit(0)
  }

  if (args.init) {
    await runInit()
    process.exit(0)
  }

  // 提供商 / 模型 / API Key 三重校验（buildModel 一处完成，各类错误均可达）
  const provider = args.provider || config.getDefaultProvider()
  const apiKey = config.getApiKey(provider)
  const modelId = args.model || config.getDefaultModel(provider)

  const modelResult = buildModel(provider, modelId, apiKey)
  if ('error' in modelResult) {
    const err = modelResult.error
    console.error(`[${err.code}] ${err.message}`)
    if (err.suggestion) console.error(`  💡 ${err.suggestion}`)
    process.exit(1)
  }

  const toolRegistry = buildTools()

  // 恢复历史
  let initialMessages: AgentMessage[] | undefined
  let sessionId: string | null = null
  if (args.continue) {
    const lastId = await sessionManager.getLastSession()
    if (lastId) {
      const msgs = await sessionManager.loadSession(lastId)
      if (msgs.length > 0) { initialMessages = msgs; sessionId = lastId }
    }
    if (!initialMessages) { console.error('没有可恢复的会话'); process.exit(1) }
  }

  const permission = new PermissionManager({ confirm: buildConfirmFn() })
  const compactor = new Compactor()

  const agent = buildAgent({
    model: modelResult.model,
    tools: toolRegistry.listTools(),
    registry: toolRegistry,
    permission,
    compactor,
  })

  // 加载扩展：自动发现 .pi/extensions/ 与 ~/.my-easy-pi/extensions/ 下的扩展文件。
  // 扩展通过 ExtensionAPI.registerTool 注册自定义工具（与内置工具共用一个 ToolRegistry）。
  const extensionApi = new ExtensionAPI(toolRegistry, agent)
  const loader = new ExtensionLoader(extensionApi)
  await loader.loadAll()

  if (initialMessages) { agent.state.messages = initialMessages }

  // 自动保存会话 + 自动命名
  if (!sessionId) sessionId = await sessionManager.createSession()
  await sessionManager.saveLastSession(sessionId)
  setupSessionPersistence(agent, sessionManager, sessionId)

  // 决定 TUI 模式（无参 TTY fallback）
  if (shouldUseTUI(args)) { args.tui = true }

  const userMessage = await resolveUserMessage(args)

  await runMode({ agent, args, userMessage, permission, sessionManager })
}

import { pathToFileURL } from 'node:url'

// 仅在直接运行时执行 main，防止被测试导入时触发
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
