// ============================================================
// Markdown Renderer — 将 Markdown 文本转为 ANSI 终端输出
//
// 零依赖，纯正则表达式实现。覆盖常用 Markdown 语法：
//   - 标题 (# ## ###)
//   - 加粗 (**) 和斜体 (*)
//   - 行内代码 (`)
//   - 代码块 (```)
//   - 列表 (- *)
//   - 引用 (>)
//   - 分割线 (---)
//   - 链接 [text](url)
//
// 用法:
//   renderMarkdown(text)   → 输出格式化终端文本
//   stripMarkdown(text)    → 去除标记，返回纯文本
//   stripMarkdownInline(text) → 仅剥离行内标记，保留结构
// ============================================================

import { bold, dim, gray, cyan, yellow, italic } from './tui/theme.js'

// ── 纯文本剥离（适合流式增量输出） ──

/**
 * 剥离 Markdown 标记，返回纯文本（适合流式输出）
 * 只去除标记符号，不添加 ANSI 转义码
 */
export function stripMarkdown(markdown: string): string {
  if (!markdown) return ''

  let result = markdown

  // 代码块替换为空行
  result = result.replace(/```[\s\S]*?```/g, '')

  // 标题标记
  result = result.replace(/^###\s+/gm, '')
  result = result.replace(/^##\s+/gm, '')
  result = result.replace(/^#\s+/gm, '')

  // 引用标记
  result = result.replace(/^>\s*/gm, '')

  // 列表标记
  result = result.replace(/^[\s]*[-*]\s+/gm, '  • ')

  // 分割线
  result = result.replace(/^-{3,}$/gm, '───')

  // 加粗 / 斜体
  result = result.replace(/\*\*(.+?)\*\*/g, '$1')
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')

  // 行内代码
  result = result.replace(/`([^`]+)`/g, '$1')

  // 链接 [text](url) → text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  return result
}

// ── 格式化输出（适合完整消息渲染） ──

/**
 * 将 Markdown 文本渲染为 ANSI 格式并输出到 stdout
 * 每行追加换行，适合分段渲染
 */
export function renderMarkdown(markdown: string): void {
  if (!markdown) return

  const lines = markdown.split('\n')
  let inCodeBlock = false

  for (const rawLine of lines) {
    // 代码块切换
    if (rawLine.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      process.stdout.write(dim(gray('│')) + '\n')
      continue
    }

    // 代码块内的文本 — 灰色缩进
    if (inCodeBlock) {
      process.stdout.write(`  ${gray(rawLine)}\n`)
      continue
    }

    const trimmed = rawLine.trim()

    // 空行
    if (!trimmed) {
      process.stdout.write('\n')
      continue
    }

    // 标题
    if (trimmed.startsWith('### ')) {
      process.stdout.write(`  ${cyan(rawLine.replace(/^###\s*/, ''))}\n`)
      continue
    }
    if (trimmed.startsWith('## ')) {
      process.stdout.write(` ${yellow(rawLine.replace(/^##\s*/, ''))}\n`)
      continue
    }
    if (trimmed.startsWith('# ')) {
      process.stdout.write(`${bold(rawLine.replace(/^#\s*/, ''))}\n`)
      continue
    }

    // 分割线
    if (/^-{3,}$/.test(trimmed)) {
      process.stdout.write(dim(gray('─'.repeat(Math.min(process.stdout.columns || 60, 60)))) + '\n')
      continue
    }

    // 引用 — 暗淡斜体
    if (trimmed.startsWith('>')) {
      const text = rawLine.replace(/^>\s*/, '').trim()
      process.stdout.write(`${dim('│')} ${dim(italic(text))}\n`)
      continue
    }

    // 列表 — 带圆点
    if (/^[\s]*[-*]\s+/.test(trimmed)) {
      const text = renderInline(rawLine.replace(/^[\s]*[-*]\s+/, ''))
      process.stdout.write(`  • ${text}\n`)
      continue
    }

    // 普通文本 — 渲染行内格式
    process.stdout.write(renderInline(rawLine) + '\n')
  }
}

// ── 行内格式化 ──

/** 渲染行内格式（加粗、斜体、行内代码、链接） */
function renderInline(text: string): string {
  let result = text

  // 行内代码 — 优先处理
  result = result.replace(/`([^`]+)`/g, (_, code: string) => gray(code))

  // 加粗
  result = result.replace(/\*\*(.+?)\*\*/g, (_, t: string) => bold(t))

  // 斜体
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, t: string) => italic(t))

  // 链接
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, url: string) => {
    return `${cyan(text)}${dim(gray(` (${url})`))}`
  })

  return result
}