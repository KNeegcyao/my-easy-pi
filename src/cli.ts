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
// 环境变量：
//   DEEPSEEK_API_KEY   - DeepSeek API 密钥
//   ANTHROPIC_API_KEY  - Anthropic API 密钥
//   OPENAI_API_KEY     - OpenAI API 密钥
// ============================================================

import { ModelRegistry, AnthropicProvider, DeepSeekProvider, OpenAIProvider } from './ai/index.js'
import { ToolRegistry, bashTool, readTool, writeTool, editTool, grepTool, findTool, lsTool } from './tools/index.js'
import { Agent } from './agent/index.js'
import { createPrintInterface, createJSONInterface, startTUI, startRPC } from './interface/index.js'

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

环境变量:
  DEEPSEEK_API_KEY      使用 DeepSeek 时需要
  ANTHROPIC_API_KEY     使用 Anthropic 时需要
  OPENAI_API_KEY        使用 OpenAI 时需要
  `)
}

async function main(): Promise<void> {
  const args = parseArgs()

  // 1. 确定提供商和 API Key
  const provider = args.provider || 'deepseek'
  const apiKey = provider === 'deepseek'
    ? process.env.DEEPSEEK_API_KEY
    : provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY

  if (!apiKey) {
    const keyName = provider === 'deepseek'
      ? 'DEEPSEEK_API_KEY'
      : provider === 'anthropic'
        ? 'ANTHROPIC_API_KEY'
        : 'OPENAI_API_KEY'
    console.error(`错误: 请设置 ${keyName} 环境变量`)
    console.error(`  export ${keyName}=your-api-key-here`)
    process.exit(1)
  }

  // 2. 确定模型
  const defaultModel = provider === 'deepseek'
    ? 'deepseek-chat'
    : provider === 'anthropic'
      ? 'claude-sonnet-4-20250514'
      : 'gpt-4o'
  const modelId = args.model || defaultModel

  // 3. 读取用户输入
  let userMessage = args.message

  if (args.tui || args.output === 'rpc') {
    // TUI/RPC 模式下跳过输入检查
  } else if (!userMessage) {
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer)
      }
      const stdinContent = Buffer.concat(chunks).toString('utf-8').trim()

      if (args.prompt) {
        userMessage = `${args.prompt}\n\n${stdinContent}`
      } else {
        userMessage = stdinContent
      }
    } else if (args.prompt) {
      userMessage = args.prompt
    } else {
      console.error('错误: 请提供输入内容')
      console.error('  piagent -m "你的消息"')
      console.error('  或 echo "内容" | piagent -p "指令"')
      process.exit(1)
    }
  }

  // 4. 设置 ModelRegistry（注册所有支持的提供商）
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

  // 5. 创建工具
  const toolRegistry = new ToolRegistry()
  toolRegistry.registerTool(bashTool)
  toolRegistry.registerTool(readTool)
  toolRegistry.registerTool(writeTool)
  toolRegistry.registerTool(editTool)
  toolRegistry.registerTool(grepTool)
  toolRegistry.registerTool(findTool)
  toolRegistry.registerTool(lsTool)

  // 6. 创建 Agent
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

  // 7. 启动界面
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