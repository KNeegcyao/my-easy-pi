// ============================================================
// Agent Loop — Agent 核心循环
//
// 这是整个 Agent 的中枢神经系统，负责：
// 1. 接收用户输入
// 2. 调用 LLM 获取响应
// 3. 如果 LLM 调用了工具，执行工具
// 4. 将工具结果送回 LLM，让 LLM 产生最终回答
// 5. 重复直到 LLM 不再调用工具
//
// 整个流程是事件驱动的，通过 subscribe 可以监听所有事件
// ============================================================

import type {
  Model, AgentMessage, AgentEvent, AgentEventListener,
  LLMMessage, LLMEvent, ToolCall, ModelContext, StreamOptions,
} from '../ai/types.js'
import type { AgentTool } from './types.js'
import { AGENT_ALREADY_STREAMING, TOOL_NOT_FOUND, TOOL_EXECUTION_FAILED } from '../ai/errors.js'
import { ToolRegistry } from '../tools/registry.js'
import { createAgentState, generateId, type AgentState } from './state.js'
import { MessageQueue } from './queue.js'

// ── Agent Loop 配置 ──
export interface AgentLoopConfig {
  systemPrompt: string
  model: Model
  tools: AgentTool[]
  /**
   * 可选：外部注入的 ToolRegistry。
   * 默认 Agent 会自建一个私有注册表；注入后则复用传入的注册表，
   * 让扩展（ExtensionAPI.registerTool）注册的工具在运行时立即可见。
   */
  registry?: ToolRegistry
  toolExecution?: 'parallel' | 'sequential'
  /** 可选：在发送消息给 LLM 之前转换/过滤消息 */
  convertToLlm?: (messages: AgentMessage[]) => LLMMessage[]
  /** 可选：上下文的转换/压缩 */
  transformContext?: (messages: AgentMessage[]) => Promise<AgentMessage[]>
  /** 在工具调用之前调用的钩子 */
  beforeToolCall?: (ctx: ToolCallContext) => Promise<BlockResult | undefined>
  /** 在工具调用之后调用的钩子 */
  afterToolCall?: (ctx: ToolCallResultContext) => Promise<AfterToolCallResult | undefined>
}

// ── 钩子上下文类型 ──
export interface ToolCallContext {
  toolCall: ToolCall
  args: Record<string, unknown>
  messages: AgentMessage[]
}

export interface BlockResult {
  block: boolean
  reason?: string
}

export interface ToolCallResultContext {
  toolCall: ToolCall
  result: AgentToolResult
  messages: AgentMessage[]
}

export interface AfterToolCallResult {
  terminate?: boolean
}

interface AgentToolResult {
  content: string
  isError: boolean
  terminate: boolean
}

// ── Agent 类 ──
export class Agent {
  state: AgentState
  toolExecution: 'parallel' | 'sequential'
  private toolRegistry: ToolRegistry
  private queue: MessageQueue
  private listeners: Set<AgentEventListener> = new Set()
  private abortController: AbortController | null = null
  private idlePromise: Promise<void> | null = null
  private idleResolve: (() => void) | null = null
  private convertToLlmFn: (messages: AgentMessage[]) => LLMMessage[]
  private transformContextFn?: (messages: AgentMessage[]) => Promise<AgentMessage[]>
  private beforeToolCallFn?: (ctx: ToolCallContext) => Promise<BlockResult | undefined>
  private afterToolCallFn?: (ctx: ToolCallResultContext) => Promise<AfterToolCallResult | undefined>

  constructor(config: AgentLoopConfig) {
    // 创建 ToolRegistry 并注册所有工具（支持外部注入，供扩展复用）
    this.toolRegistry = config.registry ?? new ToolRegistry()
    for (const tool of config.tools) {
      this.toolRegistry.registerTool(tool)
    }

    this.state = createAgentState({
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
    })

    this.toolExecution = config.toolExecution || 'parallel'
    this.convertToLlmFn = config.convertToLlm || defaultConvertToLlm
    this.transformContextFn = config.transformContext
    this.beforeToolCallFn = config.beforeToolCall
    this.afterToolCallFn = config.afterToolCall
    this.queue = new MessageQueue()
  }

  /** 订阅 Agent 事件 */
  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 触发事件（通知所有订阅者） */
  private async emit(event: AgentEvent): Promise<void> {
    const signal = new AbortController().signal
    for (const listener of this.listeners) {
      try {
        await listener(event, signal)
      } catch {
        // 单个监听器出错不影响其他监听器
      }
    }
  }

  /** 发送消息给 LLM 并执行完整的 Agent 循环 */
  async prompt(text: string): Promise<void> {
    // 如果已经在流式处理中，等待完成
    if (this.state.isStreaming) {
      throw AGENT_ALREADY_STREAMING()
    }

    this.abortController = new AbortController()

    // 创建用户消息
    const userMessage: AgentMessage = {
      id: generateId(),
      parentId: this.state.messages.length > 0
        ? this.state.messages[this.state.messages.length - 1].id
        : null,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }

    this.state.messages.push(userMessage)
    this.state.isStreaming = true

    // 创建 idle promise（用于 waitForIdle）
    this.idlePromise = new Promise((resolve) => {
      this.idleResolve = resolve
    })

    try {
      await this.emit({ type: 'agent_start' })
      await this.runLoop([userMessage])
      await this.emit({
        type: 'agent_end',
        messages: [...this.state.messages],
      })
    } finally {
      this.state.isStreaming = false
      this.idleResolve?.()
    }
  }

  /** 核心循环 */
  private async runLoop(newMessages: AgentMessage[]): Promise<void> {
    let turnMessages = newMessages

    while (true) {
      await this.emit({ type: 'turn_start' })

      // 1. 可选：对上下文进行转换/压缩
      if (this.transformContextFn) {
        this.state.messages = await this.transformContextFn(this.state.messages)
      }

      // 2. 将 Agent 消息转为 LLM 消息格式
      const llmMessages = this.convertToLlmFn(this.state.messages)

      // 3. 构建 LLM 上下文
      const context: ModelContext = {
        systemPrompt: this.state.systemPrompt,
        messages: llmMessages,
        tools: this.state.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Record<string, unknown>,
        })),
      }

      // 4. 调用 LLM 并处理流式事件
      const { content, toolCalls, usage } = await this.processLLMStream(context)

      // 5. 创建 assistant 消息
      const assistantMessage: AgentMessage = {
        id: generateId(),
        parentId: this.state.messages[this.state.messages.length - 1]?.id || null,
        role: 'assistant',
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        createdAt: Date.now(),
      }

      this.state.messages.push(assistantMessage)
      await this.emit({ type: 'message_end', message: assistantMessage })

      // 6. 如果没有工具调用，检查队列中是否有待处理消息
      if (toolCalls.length === 0) {
        await this.emit({
          type: 'turn_end',
          message: assistantMessage,
          toolResults: [],
          usage,
        })

        // 从队列中取出下一条消息
        const nextMsg = this.queue.next()
        if (nextMsg) {
          this.state.messages.push(nextMsg)
          // 继续下一轮
          continue
        }

        // 队列为空，结束
        break
      }

      // 7. 执行工具调用
      const toolResults = await this.executeToolCalls(toolCalls)

      await this.emit({
        type: 'turn_end',
        message: assistantMessage,
        toolResults: toolResults.map(r => ({
          content: [{ type: 'text' as const, text: r.content }],
          terminate: r.terminate,
        })),
        usage,
      })

      // 8. 将 toolResult 加入消息列表（在 terminate 检查之前，确保历史完整）
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        const result = toolResults[i]
        this.state.messages.push({
          id: generateId(),
          parentId: assistantMessage.id,
          role: 'toolResult',
          content: result.content,
          toolCallId: tc.id,
          isError: result.isError,
          createdAt: Date.now(),
        })
      }

      // 9. 检查是否所有工具都返回 terminate: true
      const allTerminate = toolResults.every(r => r.terminate)
      if (allTerminate) break

      turnMessages = []
    }
  }

  /** 处理 LLM 流式响应，提取文本、工具调用和可选 usage */
  private async processLLMStream(context: ModelContext): Promise<{
    content: string
    toolCalls: ToolCall[]
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  }> {
    let content = ''
    const toolCalls: ToolCall[] = []
    let currentToolCall: Partial<ToolCall> | null = null
    let toolCallArgs = ''
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined

    const streamOptions: StreamOptions = {
      signal: this.abortController?.signal,
    }

    try {
      for await (const event of this.state.model.stream(context, streamOptions)) {
        // usage 是 done 事件的非规范字段（sse.ts 捕获并附加），这里做最佳努力提取
        if (event.type === 'done' && (event as Record<string, unknown>).usage) {
          const raw = (event as Record<string, unknown>).usage as Record<string, number | undefined>
          usage = {
            promptTokens: raw?.promptTokens ?? raw?.prompt_tokens,
            completionTokens: raw?.completionTokens ?? raw?.completion_tokens,
            totalTokens: raw?.totalTokens ?? raw?.total_tokens,
          }
        }
        switch (event.type) {
          case 'text_delta':
            content += event.delta
            // 发送更新事件
            await this.emit({
              type: 'message_update',
              message: { content },
            })
            break

          case 'tool_call_start':
            currentToolCall = { id: event.id, name: event.name }
            toolCallArgs = ''
            // 如果 args 已提供且不为空（非流式工具调用，如 Anthropic 的 tool_use）
            if (event.args && typeof event.args === 'object' && Object.keys(event.args).length > 0) {
              toolCalls.push({
                id: event.id,
                name: event.name,
                args: event.args,
              })
              currentToolCall = null
            }
            // tool_execution_start 事件由 executeToolCalls 方法统一发射
            break

          case 'tool_call_delta':
            toolCallArgs += event.delta
            break

          case 'thinking_delta':
            // 思考过程暂时忽略，或可以发送为特殊事件
            break

          case 'error':
            // 发生错误
            this.state.errorMessage = event.message
            await this.emit({
              type: 'message_update',
              message: { content: `错误: ${event.message}` },
            })
            break

          case 'done':
            // 完成工具调用（如果还有未完成的流式工具调用）
            if (currentToolCall && toolCallArgs) {
              try {
                const parsed = JSON.parse(toolCallArgs)
                toolCalls.push({
                  id: currentToolCall.id!,
                  name: currentToolCall.name!,
                  args: parsed,
                })
              } catch {
                toolCalls.push({
                  id: currentToolCall.id!,
                  name: currentToolCall.name!,
                  args: toolCallArgs,
                })
              }
              // 清空缓冲，防止后续 done（如 [DONE]）重复处理
              currentToolCall = null
              toolCallArgs = ''
            }
            break
        }
      }
    } catch (error) {
      // 流处理异常：记录并返回已收集的内容（如果有的话）
      const errMsg = error instanceof Error ? error.message : String(error)
      this.state.errorMessage = errMsg
      content += `\n[流处理错误: ${errMsg}]`
      await this.emit({
        type: 'message_update',
        message: { content },
      })
    }

    return { content, toolCalls, usage }
  }

  /** 执行工具调用 */
  private async executeToolCalls(toolCalls: ToolCall[]): Promise<AgentToolResult[]> {
    // 1. 预检阶段：调用 beforeToolCall 钩子
    const blockedCallIds = new Set<string>()
    for (const tc of toolCalls) {
      if (this.beforeToolCallFn) {
        const blockResult = await this.beforeToolCallFn({
          toolCall: tc,
          args: tc.args as Record<string, unknown>,
          messages: [...this.state.messages],
        })

        if (blockResult?.block) {
          // 工具被阻止：加入消息历史 + 记录 blocked ID
          this.state.messages.push({
            id: generateId(),
            parentId: this.state.messages[this.state.messages.length - 1]?.id || null,
            role: 'toolResult',
            content: blockResult.reason || '工具调用被阻止',
            toolCallId: tc.id,
            isError: true,
            createdAt: Date.now(),
          })
          blockedCallIds.add(tc.id)
          continue
        }
      }

      // 注册 pending tool call
      this.state.pendingToolCalls.add(tc.id)
    }

    // 2. 执行阶段
    const results: AgentToolResult[] = []

    for (const tc of toolCalls) {
      // 跳过被阻止的工具调用
      if (blockedCallIds.has(tc.id)) {
        results.push({
          content: '工具调用被阻止',
          isError: true,
          terminate: false,
        })
        continue
      }
      const tool = this.toolRegistry.getTool(tc.name)
      if (!tool) {
        const err = TOOL_NOT_FOUND(tc.name)
        results.push({
          content: `${err.message}${err.suggestion ? ` — ${err.suggestion}` : ''}`,
          isError: true,
          terminate: false,
        })
        this.state.pendingToolCalls.delete(tc.id)
        continue
      }

      try {
        await this.emit({
          type: 'tool_execution_start',
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.args,
        })

        const result = await tool.execute(
          tc.id,
          tc.args as Record<string, unknown>,
          this.abortController?.signal || new AbortController().signal,
          (update) => {
            // 中间态更新（如 bash 沙箱执行中输出），不阻塞执行
            void this.emit({
              type: 'tool_execution_update',
              toolCallId: tc.id,
              partialResult: update,
            })
          },
        )

        // 提取文本内容
        const textContent = result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map(c => c.text)
          .join('\n')

        results.push({
          content: textContent,
          isError: result.isError ?? false,
          terminate: result.terminate || false,
        })

        await this.emit({
          type: 'tool_execution_end',
          toolCallId: tc.id,
          result,
          isError: result.isError ?? false,
        })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        results.push({
          content: errorMsg,
          isError: true,
          terminate: false,
        })
        // 补 emit tool_execution_end 让 UI 能看到工具失败 + 避免 TUI pendingTools 泄漏
        await this.emit({
          type: 'tool_execution_end',
          toolCallId: tc.id,
          result: { content: [{ type: 'text' as const, text: errorMsg }] },
          isError: true,
        })
      }

      this.state.pendingToolCalls.delete(tc.id)
    }

    // 3. 后处理：调用 afterToolCall 钩子
    for (let i = 0; i < toolCalls.length; i++) {
      if (this.afterToolCallFn) {
        const afterResult = await this.afterToolCallFn({
          toolCall: toolCalls[i],
          result: results[i],
          messages: [...this.state.messages],
        })

        if (afterResult?.terminate) {
          results[i].terminate = true
        }
      }
    }

    return results
  }

  /** 等待当前操作完成 */
  async waitForIdle(): Promise<void> {
    if (!this.state.isStreaming) return
    await this.idlePromise
  }

  /** 取消当前操作 */
  abort(): void {
    this.abortController?.abort()
    this.state.isStreaming = false
  }

  /** 重置状态 */
  reset(): void {
    this.state.messages = []
    this.state.errorMessage = undefined
    this.state.isStreaming = false
    this.state.pendingToolCalls.clear()
    this.abortController = null
    this.queue.clearAll()
  }

  // ── 队列方法 ──

  /** 运行中插入指令（高优先级） */
  steer(message: string): void {
    this.queue.steer(message)
  }

  /** 追加后续任务（低优先级） */
  followUp(message: string): void {
    this.queue.followUp(message)
  }

  clearSteeringQueue(): void {
    this.queue.clearSteering()
  }

  clearFollowUpQueue(): void {
    this.queue.clearFollowUp()
  }

  clearAllQueues(): void {
    this.queue.clearAll()
  }
}

// ============================================================
// 默认的消息转换函数
// ============================================================

/** 默认的消息转换：过滤掉 notification/thinking 等 UI 消息，
 *  将 Agent 消息格式转为 LLM 消息格式 */
function defaultConvertToLlm(messages: AgentMessage[]): LLMMessage[] {
  return messages
    .filter(m => m.role !== 'notification' && m.role !== 'thinking')
    .map(m => {
      if (m.role === 'user') {
        return { role: 'user', content: m.content }
      }
      if (m.role === 'assistant') {
        return {
          role: 'assistant',
          content: m.content,
          toolCalls: m.toolCalls,
        }
      }
      // toolResult
      return {
        role: 'toolResult',
        toolCallId: m.toolCallId!,
        content: m.content,
        isError: m.isError,
      }
    })
}