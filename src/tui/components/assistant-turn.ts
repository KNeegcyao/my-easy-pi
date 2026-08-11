import type { Component } from '../component.js'
import { Container } from '../layout/container.js'
import { Markdown } from './markdown.js'
import { Spacer } from './spacer.js'
import { Text } from './text.js'
import { dim, gray, red } from '../ansi.js'

/**
 * AssistantTurn — pi `assistant-message.ts:89-195` 的对应。
 *
 * 一轮 assistant 回合的渲染容器。**本身常驻在 chatContainer**，
 * 不随 message_end 移除；message_end 只调 updateContent(msg, false)。
 *
 * 内部 contentContainer 每次 updateContent 都 clear() + 重建 Markdown 子树
 * （对齐 pi 的 "children 只增不减除 rebuild" 模型：rebuild 发生在子容器里，
 * 不影响 contentContainer 在 chatContainer 中的位置）。
 *
 * 持有的内容：
 *   - 一段 Markdown（assistant 文本）
 *   - 可选：stopReason 带 width/error 文案（追加为 Text）
 *   - 可选：多个 ToolExecution（ addChild 到内部 turnContainer）
 */
export interface AssistantMessageLike {
  content: string
  toolCalls?: unknown[]
  /** stop reason: 'end_turn' | 'tool_use' | 'aborted' | 'error' | 'length' */
  stopReason?: string
  errorMessage?: string
}

export class AssistantTurn implements Component {
  private contentContainer: Container
  private toolsContainer: Container
  private outer: Container
  private isStreaming = true
  private lastMessage: AssistantMessageLike | null = null
  private cachedLines: string[] | null = null
  private cachedForWidth: number | null = null

  constructor() {
    this.contentContainer = new Container()
    this.toolsContainer = new Container()
    this.outer = new Container([this.contentContainer, this.toolsContainer])
  }

  /**
   * 用当前 message 内容重建 contentContainer 子树（对齐 pi updateContent）。
   * isStreaming=true：用流式渲染；false：最终形态（pi 只通过 markdown transform 区分，
   * 我们这里简化：streaming 时 markdown 不 trim 收尾，final 时 trim）。
   */
  updateContent(message: AssistantMessageLike, isStreaming = this.isStreaming): void {
    this.lastMessage = message
    this.isStreaming = isStreaming
    this.contentContainer.clear()

    const text = (message.content || '').trim()
    const hasVisibleContent = text.length > 0 || this.toolsContainer.childCount > 0

    if (hasVisibleContent) {
      this.contentContainer.addChild(new Spacer(1))
    }
    if (text) {
      this.contentContainer.addChild(new Markdown(text))
    }

    // stopReason 错误文案追加到 contentContainer 末尾（同 pi assistant-message.ts:177-194）
    if (!isStreaming && (message.stopReason === 'aborted' || message.stopReason === 'error' || message.stopReason === 'length')) {
      const msg = message.errorMessage || this.stopReasonMessage(message.stopReason)
      this.contentContainer.addChild(new Spacer(1))
      this.contentContainer.addChild(new Text(`  ${red('✗')} ${msg}`))
    }

    this.invalidate()
  }

  private stopReasonMessage(reason?: string): string {
    switch (reason) {
      case 'aborted': return '已中止'
      case 'error': return '生成失败'
      case 'length': return '因长度限制截断'
      default: return '未完成'
    }
  }

  /**
   * 添加一个工具调用组件到本回合末尾。返回该组件引用以便后续 updateResult。
   * （不 addChild 到 contentContainer，而是 turnContainer，避免 updateContent clear 时丢）
   */
  addToolExecution(tool: Component): void {
    this.toolsContainer.addChild(tool)
    this.invalidate()
  }

  /** 获取 toolsContainer 引用（host 用于按工具 id 查找/更新） */
  getToolsContainer(): Container {
    return this.toolsContainer
  }

  /** 当前是否在流式 */
  get streaming(): boolean {
    return this.isStreaming
  }

  /** 最近一次 message（测试/调试用） */
  get message(): AssistantMessageLike | null {
    return this.lastMessage
  }

  invalidate(): void {
    this.cachedLines = null
    this.cachedForWidth = null
    this.outer.invalidate()
  }

  render(width: number): string[] {
    // 不缓存自身聚合（同 Container）：子组件（如嵌在 toolsContainer 里的 ToolExecution）
    // 内容变化时无法向上通知 parent 失效缓存，缓存会挡住变化。
    // 子组件 Markdown/Text/ToolExecution 各自缓存（昂贵部分仍缓存），这里只是
    // 拼接子 render 结果，开销小。每个 16ms 帧重算一次，可接受。
    const lines = this.outer.render(width)
    // 空回合（无 content、无 tool）也保留 1 行占位，防止 doRender 把它当 "行数=0"
    return lines.length === 0 ? [''] : lines
  }
}

/** helper：渲染 user prompt 的 "> text" 行（pi 把 user 消息也 addChild 到 chatContainer） */
export function userPromptLine(text: string): string {
  // 单行；后续可换成 UserMessage 组件
  return `> ${text}`
}

/** helper：muted 提示行（如"已加入队列"） */
export function mutedLine(text: string): string {
  return `  ${dim(gray('→ ' + text))}`
}
