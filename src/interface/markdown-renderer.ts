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
//   renderMarkdown(text)   → 直接输出到终端
//   stripMarkdown(text)    → 去除标记，纯文本
// ============================================================

import { bold, dim, gray, cyan, yellow, italic } from './tui/theme.js'

// ── ANSI 工具 ──

/** 在终端输出文本（带缓存消除） */
let lastOutput = ''
export function writeChunk(text: string): void {
  if (text === lastOutput) return  // 避免重复输出相同内容
  lastOutput = text
  process.stdout.write(text)
}

// ── 行级渲染 ──

/** 渲染标题行 */
function renderHeading(line: string, level: number): string {
  const prefix = ' '.repeat(2)
  const icon = level === 1 ? '📌' : level === 2 ? '📎' : '  •'
  const color = level === 1 ? bold : level === 2 ? yellow : cyan
  return `\n${prefix}${icon} ${color(line.replace(/^#+\s*/, ''))}\n`
}

/** 渲染代码块分隔行 */
function renderCodeFence(): string {
  return dim(gray('│'))
}

/** 渲染引用行 */
function renderQuote(line: string): string {
  const text = line.replace(/^>\s*/, '').trim()
  return `${dim('│')} ${dim(italic(text))}`
}

/** 渲染列表项 */
function renderListItem(line: string): string {
  const text = line.replace(/^[\s]*[-*]\s+/, '')
  return `  • ${text}`
}

/** 渲染分割线 */
function renderHr(): string {
  return dim(gray('─'.repeat(process.stdout.columns || 60)))
}

// ── 行内渲染 ──

/** 渲染行内格式（加粗、斜体、行内代码、链接） */
function renderInline(text: string): string {
  let result = text

  // 代码块标记（行内 `code`）— 优先处理
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    return gray(code)
  })

  // 加粗 **text**
  result = result.replace(/\*\*(.+?)\*\*/g, (_, t) => bold(t))

  // 斜体 *text*
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, t) => italic(t))

  // 链接 [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    return `${cyan(text)}${dim(gray(` (${url})`))}`
  })

  return result
}

// ── 主入口 ──

/**
 * 将 Markdown 文本渲染为 ANSI 格式并输出到 stdout
 * @param markdown - 原始 Markdown 文本
 */
export function renderMarkdown(markdown: string): void {
  if (!markdown) return
  lastOutput = ''

  const lines = markdown.split('\n')
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]

    // 代码块切换
    if (rawLine.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      writeChunk(renderCodeFence() + '\n')
      continue
    }

    // 代码块内的文本 — 原样输出但不换行，不渲染
    if (inCodeBlock) {
      writeChunk(`  ${gray(rawLine)}\n`)
      continue
    }

    const trimmed = rawLine.trim()

    // 空行
    if (!trimmed) {
      writeChunk('\n')
      continue
    }

    // 标题
    if (trimmed.startsWith('### ')) {
      writeChunk(renderHeading(rawLine, 3))
      continue
    }
    if (trimmed.startsWith('## ')) {
      writeChunk(renderHeading(rawLine, 2))
      continue
    }
    if (trimmed.startsWith('# ')) {
      writeChunk(renderHeading(rawLine, 1))
      continue
    }

    // 分割线
    if (/^-{3,}$/.test(trimmed)) {
      writeChunk(renderHr() + '\n')
      continue
    }

    // 引用
    if (trimmed.startsWith('>')) {
      writeChunk(renderQuote(rawLine) + '\n')
      continue
    }

    // 列表
    if (/^[\s]*[-*]\s+/.test(trimmed)) {
      writeChunk(renderInline(renderListItem(rawLine)) + '\n')
      continue
    }

    // 普通文本 — 渲染行内格式
    writeChunk(renderInline(rawLine) + '\n')
  }
}

/**
 * 去除 Markdown 标记，返回纯文本（用于搜索、日志等场景）
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')    // 移除代码块
    .replace(/`([^`]+)`/g, '$1')       // 移除行内代码
    .replace(/\*\*(.+?)\*\*/g, '$1')   // 移除加粗
    .replace(/\*([^*]+)\*/g, '$1')     // 移除斜体
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // 链接只保留文字
    .replace(/^#+\s*/gm, '')           // 移除标题标记
    .replace(/^>\s*/gm, '')            // 移除引用标记
    .replace(/^[\s]*[-*]\s+/gm, '')    // 移除列表标记
    .trim()
}