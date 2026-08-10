// ============================================================
// TUI Renderer — 全屏渲染器
//
// 管理消息区域的渲染，覆盖以下 UI 场景：
//   - 用户输入回显（printUserInput）
//   - LLM 流式输出（message_update）
//   - 工具调用展示（renderCall，含参数详情）
//   - 工具结果展示（renderResult，含输出预览）
//   - 系统提示信息（promptSnippet）
// ============================================================

import type { Agent, AgentEvent } from '../../agent/index.js'
import { bold, dim, gray, green, yellow, cyan, red, clearLine, italic } from './theme.js'
import { stripMarkdown } from '../markdown-renderer.js'

// ── Prompt Snippet（系统提示片段 / 工具说明） ──

/**
 * 渲染系统提示片段
 * @param title - 片段标题
 * @param content - 内容
 * @param type - 类型：info | tool | result
 */
export function promptSnippet(title: string, content: string, type: 'info' | 'tool' | 'result' = 'info'): void {
  const icon = type === 'info' ? 'ℹ' : type === 'tool' ? '🔧' : '📋'
  const color = type === 'info' ? cyan : type === 'tool' ? yellow : green
  process.stdout.write(`\n  ${color(`${icon} ${title}`)}\n`)
  for (const line of content.split('\n').filter(Boolean)) {
    process.stdout.write(`    ${dim(gray(line))}\n`)
  }
}

// ── Tool Call 渲染（展示 LLM 调用工具的详情） ──

/**
 * 渲染工具调用信息
 * @param toolName - 工具名称
 * @param args - 工具参数
 */
export function renderCall(toolName: string, args: Record<string, unknown>): void {
  process.stdout.write(`\r${clearLine()}\r`)
  // 工具名 + 参数摘要
  const argPreview = Object.entries(args)
    .map(([k, v]) => {
      const str = String(v)
      return str.length > 80 ? `${k}: ${str.slice(0, 80)}...` : `${k}: ${str}`
    })
    .join(', ')
  process.stdout.write(`  ${dim('→')} ${yellow(toolName)} ${dim(gray(`(${argPreview})`))}`)
}

// ── Tool Result 渲染（展示工具执行结果） ──

/**
 * 渲染工具执行结果预览
 * @param toolName - 工具名称
 * @param result - 执行结果
 * @param isError - 是否出错
 */
export function renderResult(toolName: string, result: ToolResultContent, isError: boolean): void {
  const icon = isError ? '✗' : '✓'
  const iconColor = isError ? red : green
  process.stdout.write(`\r${clearLine()}\r`)

  // 提取文本预览
  const textContent = result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('\n')
  const preview = textContent
    .split('\n')
    .filter(Boolean)
    .slice(0, 3)
    .map(l => stripMarkdown(l))
    .join(' ')
  const truncated = textContent.split('\n').length > 3
    ? `${preview}${dim(gray(' ...'))}`
    : preview

  process.stdout.write(`  ${iconColor(icon)} ${bold(green(toolName))}${truncated ? ` ${dim(gray('→'))} ${gray(truncated)}` : ''}\n`)
}

interface ToolResultContent {
  content: { type: string; text?: string }[]
}

// ── 主渲染器 ──

export function createTUIRenderer(agent: Agent): void {
  let lastContentLength = 0
  let hasReceivedContent = false
  // 跟踪正在执行的工具名（tool_execution_end 没有 toolName 字段）
  const toolNameMap = new Map<string, string>()

  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        lastContentLength = 0
        hasReceivedContent = false
        break

      case 'message_update': {
        const content = event.message.content
        if (content) {
          if (!hasReceivedContent && content.length > 0) {
            process.stdout.write('\r' + clearLine() + '\r')
            hasReceivedContent = true
          }
          const newPart = content.slice(lastContentLength)
          if (newPart) {
            process.stdout.write(stripMarkdown(newPart))
          }
          lastContentLength = content.length
        }
        break
      }

      case 'message_end':
        if (event.message.role === 'assistant' && lastContentLength > 0) {
          process.stdout.write('\n')
        }
        break

      case 'tool_execution_start': {
        toolNameMap.set(event.toolCallId, event.toolName)
        const args = event.args as Record<string, unknown>
        renderCall(event.toolName, args)
        break
      }

      case 'tool_execution_end': {
        const name = toolNameMap.get(event.toolCallId) || 'tool'
        toolNameMap.delete(event.toolCallId)
        renderResult(name, event.result, false)
        break
      }

      case 'error':
        process.stdout.write('\r' + clearLine() + '\r')
        process.stdout.write(`  ${red('✗')} ${event.message}\n`)
        break
    }
  })
}

export function printThinking(): void {
  process.stdout.write(
    `\r${clearLine()}\r${dim(gray('piagent is thinking...'))}`
  )
}

export function printPrompt(): void {
  process.stdout.write(`\n${green('> ')}`)
}

export function printUserInput(input: string): void {
  process.stdout.write(`\r${clearLine()}\r${dim(gray('┌'))} ${italic(gray(input))}\n${dim(gray('└'))}\n`)
}