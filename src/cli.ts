#!/usr/bin/env node
// ============================================================
// CLI 入口 — piagent 命令行工具
// ============================================================

import { ModelRegistry, AnthropicProvider, DeepSeekProvider, OpenAIProvider } from './ai/index.js'
import { ToolRegistry, bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool } from './tools/index.js'
import { Agent } from './agent/index.js'
import { createPrintInterface, createJSONInterface, startTUI, startRPC } from './interface/index.js'
import { ConfigManager } from './config/index.js'
import { SessionManager } from './session/index.js'

type OutputMode = 'print' | 'json' | 'rpc'

function parseArgs(): {
  prompt?: string; message?: string; model?: string
  provider?: string; tui?: boolean; output?: OutputMode
  continue?: boolean; list?: boolean
} {
  const args = process.argv.slice(2)
  const result: {
    prompt?: string; message?: string; model?: string
    provider?: string; tui?: boolean; output?: OutputMode
    continue?: boolean; list?: boolean
  } = { output: 'print' }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-p': case '--prompt': result.prompt = args[++i]; break
      case '-m': case '--message': result.message = args[++i]; break
      case '--model': result.model = args[++i]; break
      case '--provider': result.provider = args[++i]; break
      case '-o': case '--output': result.output = args[++i] as OutputMode; break
      case '-i': case '--tui': result.tui = true; break
      case '-c': case '--continue': result.continue = true; break
      case '-l': case '--list': result.list = true; break
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
  cat file | pi -p "指令"   管道模式

选项:
  -p, --prompt    系统提示或指令
  -m, --message   直接输入消息
  -i, --tui       交互式对话模式
  -o, --output    输出模式: print | json | rpc (默认: print)
  -c, --continue  继续上次会话
  -l, --list      列出所有会话
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

  // 会话管理
  const sessionManager = new SessionManager()

  if (args.list) {
    const sessions = await sessionManager.listSessions()
    if (sessions.length === 0) {
      console.log('暂无会话记录')
    } else {
      for (const s of sessions) {
        console.log(`${s.id}  |  ${s.name}  |  ${s.messageCount} 条消息  |  ${s.createdAt}`)
      }
    }
    process.exit(0)
  }

  // 提供商和模型
  const provider = args.provider || config.getDefaultProvider()
  const apiKey = config.getApiKey(provider)
  if (!apiKey) {
    console.error(`错误: 未找到 ${provider} 的 API 密钥`)
    console.error(`  请设置环境变量或 ~/.piagent/config.json`)
    process.exit(1)
  }
  const modelId = args.model || config.getDefaultModel(provider)

  // 确定执行模式
  let userMessage = args.message
  const noArgs = !args.message && !args.prompt && !args.tui && !args.continue &&
    args.output === 'print' && !args.list
  if (noArgs && process.stdin.isTTY) args.tui = true

  // 非 TUI 模式的输入读取
  if (!args.tui && args.output !== 'rpc') {
    if (args.message) {
      userMessage = args.message
    } else if (!process.stdin.isTTY) {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
      const stdinContent = Buffer.concat(chunks).toString('utf-8').trim()
      userMessage = args.prompt ? `${args.prompt}\n\n${stdinContent}` : stdinContent
    } else if (args.prompt) {
      userMessage = args.prompt
    }
  }

  // 设置模型
  const registry = new ModelRegistry()
  registry.setProvider('anthropic', AnthropicProvider)
  registry.setProvider('deepseek', DeepSeekProvider)
  registry.setProvider('openai', OpenAIProvider)
  const model = registry.getModel(provider, modelId, { apiKey })
  if (!model) {
    console.error(`错误: 模型 "${modelId}" 不可用`)
    process.exit(1)
  }

  // 创建工具
  const toolRegistry = new ToolRegistry()
  for (const t of [bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool]) {
    toolRegistry.registerTool(t)
  }

  // 加载历史会话（-c 模式）
  let initialMessages = undefined
  let sessionId: string | null = null

  if (args.continue) {
    const lastId = await sessionManager.getLastSession()
    if (lastId) {
      const msgs = await sessionManager.loadSession(lastId)
      if (msgs.length > 0) {
        initialMessages = msgs
        sessionId = lastId
      }
    }
    if (!initialMessages) {
      console.error('没有找到可恢复的会话')
      process.exit(1)
    }
  }

  // 创建 Agent
  const agent = new Agent({
    systemPrompt: `你是 piagent — 一个 AI 编程助手。\n当前使用的模型: ${modelId}（提供商: ${provider}）\n\n你有以下工具可用：\n- bash：执行 shell 命令\n- read：读取文件内容\n- write：写入文件内容\n- edit：替换文件中的文本\n- grep：在文件中搜索关键词\n- find：查找文件名\n- ls：列出目录内容\n\n请用中文回答用户的问题。保持回答简洁、准确。`,
    model: model!,
    tools: toolRegistry.listTools(),
  })

  // 加载历史消息
  if (initialMessages) {
    agent.state.messages = initialMessages as any
  }

  // 自动保存会话
  if (!sessionId) sessionId = await sessionManager.createSession()
  await sessionManager.saveLastSession(sessionId)

  agent.subscribe(async (event) => {
    if (event.type === 'message_end' && event.message.role !== 'notification') {
      await sessionManager.saveMessage(sessionId!, event.message)
    }
  })

  // 启动界面
  if (args.tui) {
    startTUI(agent)
  } else if (args.output === 'json') {
    createJSONInterface(agent)
    try { await agent.prompt(userMessage!) }
    catch (error) { console.error('\n错误:', error); process.exit(1) }
  } else if (args.output === 'rpc') {
    startRPC(agent)
  } else {
    createPrintInterface(agent)
    try {
      await agent.prompt(userMessage!)
      console.log('\n--- 完成 ---')
    } catch (error) {
      console.error('\n错误:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }
}

main()