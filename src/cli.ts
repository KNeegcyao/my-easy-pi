#!/usr/bin/env node
import { ModelRegistry, AnthropicProvider, DeepSeekProvider, OpenAIProvider } from './ai/index.js'
import { ToolRegistry, bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool } from './tools/index.js'
import { Agent, PermissionManager } from './agent/index.js'
import { createPrintInterface, createJSONInterface, startTUI, startRPC } from './interface/index.js'
import { ConfigManager, runInit } from './config/index.js'
import { SessionManager, Compactor } from './session/index.js'
import { recordTokenUsage } from './interface/tui/commands.js'

type OutputMode = 'print' | 'json' | 'rpc'

function parseArgs(): {
  prompt?: string; message?: string; model?: string
  provider?: string; tui?: boolean; output?: OutputMode
  continue?: boolean; list?: boolean; deleteSession?: string; init?: boolean
} {
  const args = process.argv.slice(2)
  const result: any = { output: 'print' }
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-p': case '--prompt': result.prompt = args[++i]; break
      case '-m': case '--message': result.message = args[++i]; break
      case '--model': result.model = args[++i]; break
      case '--provider': result.provider = args[++i]; break
      case '-o': case '--output': result.output = args[++i]; break
      case '-i': case '--tui': result.tui = true; break
      case '-c': case '--continue': result.continue = true; break
      case '-l': case '--list': result.list = true; break
      case '--delete': result.deleteSession = args[++i]; break
      case '--init': result.init = true; break
      case '-h': case '--help': printHelp(); process.exit(0)
    }
  }
  return result
}

function printHelp(): void {
  console.log(`
piagent — 简易 AI Coding Agent

用法:
  pi                       启动交互式对话
  pi -m "你好"             单次消息
  pi -c                    继续上次对话
  pi -l                    列出所有会话
  pi --delete <id>         删除指定会话
  cat file | pi -p "指令"   管道模式

选项:
  -p, --prompt    系统提示或指令
  -m, --message   直接输入消息
  -i, --tui       交互式对话模式
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
  ~/.piagent/config.json  用户全局配置（可用 apiKeys 字段存密钥）
  `)
}

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

  // 提供商和模型
  const provider = args.provider || config.getDefaultProvider()
  const apiKey = config.getApiKey(provider)
  if (!apiKey) { console.error('错误: 未找到 API 密钥'); process.exit(1) }
  const modelId = args.model || config.getDefaultModel(provider)

  // 执行模式
  let userMessage = args.message
  const noArgs = !args.message && !args.prompt && !args.tui && !args.continue && args.output === 'print' && !args.list && !args.deleteSession
  if (noArgs && process.stdin.isTTY) args.tui = true

  if (!args.tui && args.output !== 'rpc') {
    if (args.message) { userMessage = args.message }
    else if (!process.stdin.isTTY) {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
      const stdin = Buffer.concat(chunks).toString('utf-8').trim()
      userMessage = args.prompt ? `${args.prompt}\n\n${stdin}` : stdin
    } else if (args.prompt) { userMessage = args.prompt }
  }

  // 设置
  const registry = new ModelRegistry()
  registry.setProvider('anthropic', AnthropicProvider)
  registry.setProvider('deepseek', DeepSeekProvider)
  registry.setProvider('openai', OpenAIProvider)
  const model = registry.getModel(provider, modelId, { apiKey })
  if (!model) { console.error(`错误: 模型 "${modelId}" 不可用`); process.exit(1) }

  const toolRegistry = new ToolRegistry()
  for (const t of [bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool]) { toolRegistry.registerTool(t) }

  // 恢复历史
  let initialMessages = undefined
  let sessionId: string | null = null
  if (args.continue) {
    const lastId = await sessionManager.getLastSession()
    if (lastId) {
      const msgs = await sessionManager.loadSession(lastId)
      if (msgs.length > 0) { initialMessages = msgs; sessionId = lastId }
    }
    if (!initialMessages) { console.error('没有可恢复的会话'); process.exit(1) }
  }

  const permission = new PermissionManager()
  const compactor = new Compactor()

  const agent = new Agent({
    systemPrompt: `你是 piagent — 一个 AI 编程助手。\n当前使用的模型: ${modelId}（提供商: ${provider}）\n\n你有以下工具可用：\n- bash：执行 shell 命令\n- read：读取文件内容\n- write：写入文件内容\n- edit：替换文件中的文本\n- grep：在文件中搜索关键词\n- find：查找文件名\n- ls：列出目录内容\n\n请用中文回答用户的问题。保持回答简洁、准确。`,
    model: model!,
    tools: toolRegistry.listTools(),
    beforeToolCall: (ctx) => permission.check(ctx),
    transformContext: async (messages) => compactor.compact(messages),
  })

  if (initialMessages) { agent.state.messages = initialMessages as any }

  // 自动保存会话 + 自动命名
  let sessionNamed = false
  if (!sessionId) sessionId = await sessionManager.createSession()
  await sessionManager.saveLastSession(sessionId)

  let turnCount = 0
  agent.subscribe(async (event) => {
    if (event.type === 'message_end' && event.message.role !== 'notification') {
      await sessionManager.saveMessage(sessionId!, event.message)

      // 第一条用户消息自动命名会话
      if (!sessionNamed && event.message.role === 'user' && event.message.content) {
        const name = event.message.content.slice(0, 40) + (event.message.content.length > 40 ? '...' : '')
        await sessionManager.renameSession(sessionId!, name)
        sessionNamed = true
      }
    }
    if (event.type === 'turn_end') {
      turnCount++
      const toolCalls = event.toolResults.length
      recordTokenUsage(toolCalls * 100, toolCalls * 200)
    }
  })

  // 启动界面
  if (args.tui) { startTUI(agent) }
  else if (args.output === 'json') {
    createJSONInterface(agent)
    try { await agent.prompt(userMessage!) } catch (e) { console.error(e); process.exit(1) }
  } else if (args.output === 'rpc') { startRPC(agent) }
  else {
    createPrintInterface(agent)
    try { await agent.prompt(userMessage!); console.log('\n--- 完成 ---') }
    catch (e) { console.error('\n错误:', e instanceof Error ? e.message : String(e)); process.exit(1) }
  }
}

main()