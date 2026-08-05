#!/usr/bin/env node
// ============================================================
// CLI 入口 — piagent 命令行工具
//
// 使用方法：
//   # 管道模式（标准输入）
//   echo "Hello, world!" | npx tsx src/cli.ts -p "翻译成中文"
//
//   # 直接模式
//   npx tsx src/cli.ts -m "请告诉我当前目录有哪些文件"
//
// # 交互模式
//   pi -i
//
// # JSON 输出
//   pi -m "你好" -o json
//
// 环境变量（优先级高于配置文件）：
//   DEEPSEEK_API_KEY   - DeepSeek API 密钥
//   ANTHROPIC_API_KEY  - Anthropic API 密钥
//   OPENAI_API_KEY     - OpenAI API 密钥
//
// 配置文件：
//   ~/.piagent/config.json  用户全局配置（可用 apiKeys 字段存密钥）
// ============================================================

import { ModelRegistry, AnthropicProvider, DeepSeekProvider, OpenAIProvider } from './ai/index.js'
import { ToolRegistry, bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool } from './tools/index.js'
import { Agent } from './agent/index.js'
import { createPrintInterface, createJSONInterface, startTUI, startRPC } from './interface/index.js'
import { ConfigManager } from './config/index.js'

type OutputMode = 'print' | 'json' | 'rpc'

function parseArgs(): {
  prompt?: string; message?: string; model?: string
  provider?: string; tui?: boolean; output?: OutputMode
} {
  const args = process.argv.slice(2)
  const result: {
    prompt?: string; message?: string; model?: string
    provider?: string; tui?: boolean; output?: OutputMode
  } = { output: 'print' }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-p':
      case '--prompt':
        result.prompt = args[++i]
        break
      case '-m':
      case '--message':
        result.message = args[++i]
        break
      case '--model':
        result.model = args[++i]
        break
      case '--provider':
        result.provider = args[++i]
        break
      case '-o':
      case '--output':
        result.output = args[++i] as OutputMode
        break
      case '-i':
      case '--tui':
        result.tui = true
        break
      case '-h':
      case '--help':
        printHelp()
        process.exit(0)
    }
  }

  return result
}

function printHelp(): void {
  console.log(`
piagent — 简易 AI Coding Agent

用法:
  cat file.txt | piagent -p "指令"    从标准输入读取 + 指令
  piagent -m "你好"                   直接输入消息
  piagent -p "翻译" < input.txt       从文件重定向输入

选项:
  -p, --prompt <text>   系统提示或指令
  -m, --message <text>  直接输入消息
  -i, --tui             交互式对话模式
  -o, --output <type>   输出模式: print | json | rpc (默认: print)
  --model <id>          指定模型 (默认: deepseek-chat)
  --provider <name>     指定提供商: deepseek | anthropic | openai (默认: deepseek)
  -h, --help            显示帮助

环境变量 (优先级高于配置文件):
  DEEPSEEK_API_KEY      DeepSeek API 密钥
  ANTHROPIC_API_KEY     Anthropic API 密钥
  OPENAI_API_KEY        OpenAI API 密钥

配置文件:
  ~/.piagent/config.json  用户全局配置（可用 apiKeys 字段存密钥）
  `)
}

async function main(): Promise<void> {
  const args = parseArgs()

  // 1. 加载配置
  const config = new ConfigManager()
  await config.load()

  // 2. 确定提供商
  const provider = args.provider || config.getDefaultProvider()

  // 3. 确定 API Key（环境变量 > 用户配置文件）
  const apiKey = config.getApiKey(provider)
  if (!apiKey) {
    const envVar = `API_KEY_FOR_${provider.toUpperCase()}`
    console.error(`错误: 未找到 ${provider} 的 API 密钥`)
    console.error(`  请设置环境变量 ${envVar} 或配置文件 ~/.piagent/config.json`)
    process.exit(1)
  }

  // 4. 确定模型
  const modelId = args.model || config.getDefaultModel(provider)

  // 5. 确定执行模式
  let userMessage = args.message
  const noArgs = !args.message && !args.prompt && !args.tui && args.output === 'print'

  if (noArgs && process.stdin.isTTY) {
    args.tui = true
  }

  // 6. 非交互模式的输入读取
  if (!args.tui && args.output !== 'rpc') {
    if (args.message) {
      userMessage = args.message
    } else if (!process.stdin.isTTY) {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer)
      }
      const stdinContent = Buffer.concat(chunks).toString('utf-8').trim()
      userMessage = args.prompt ? `${args.prompt}\n\n${stdinContent}` : stdinContent
    } else if (args.prompt) {
      userMessage = args.prompt
    }
  }

  // 6. 设置 ModelRegistry（注册所有支持的提供商）
  const registry = new ModelRegistry()
  registry.setProvider('anthropic', AnthropicProvider)
  registry.setProvider('deepseek', DeepSeekProvider)
  registry.setProvider('openai', OpenAIProvider)

  const model = registry.getModel(provider, modelId, { apiKey })
  if (!model) {
    console.error(`错误: 模型 "${modelId}" 在提供商 "${provider}" 中不可用`)
    console.error(`  可用模型: ${registry.listModels(provider).map(m => m.id).join(', ')}`)
    process.exit(1)
  }

  // 7. 创建工具
  const toolRegistry = new ToolRegistry()
  toolRegistry.registerTool(bashTool)
  toolRegistry.registerTool(readTool)
  toolRegistry.registerTool(writeTool)
  toolRegistry.registerTool(editTool)
  toolRegistry.registerTool(grepTool)
  toolRegistry.registerTool(findTool)
  toolRegistry.registerTool(lsTool)

  // 8. 创建 Agent
  const agent = new Agent({
    systemPrompt: `你是 piagent — 一个 AI 编程助手。
当前使用的模型: ${modelId}（提供商: ${provider}）

你有以下工具可用：
- bash：执行 shell 命令
- read：读取文件内容
- write：写入文件内容
- edit：替换文件中的文本
- grep：在文件中搜索关键词
- find：查找文件名
- ls：列出目录内容

请用中文回答用户的问题。
保持回答简洁、准确。`,
    model: model!,
    tools: toolRegistry.listTools(),
  })

  // 9. 启动界面
  if (args.tui) {
    startTUI(agent)
  } else if (args.output === 'json') {
    createJSONInterface(agent)
    try {
      await agent.prompt(userMessage!)
    } catch (error) {
      console.error('\n错误:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
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