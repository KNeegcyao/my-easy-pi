// ============================================================
// Markdown Renderer — 使用 marked 将 Markdown 转为 ANSI 终端输出
//
// 采用缓冲区+完整重渲染策略：
//   每次收到流式更新时，将完整内容通过 marked 解析为 tokens，
//   再逐个渲染为 ANSI 终端格式。这解决了流式分块导致的
//   不完整 Markdown 标记问题。
// ============================================================

import { marked, type Token, type Tokens } from 'marked'
import { bold, dim, gray, yellow, cyan, italic } from './tui/theme.js'

/** 渲染内联 token 为 ANSI 字符串 */
function renderInlineTokens(tokens: Token[]): string {
  let result = ''
  for (const tok of tokens) {
    switch (tok.type) {
      case 'text':
        result += tok.text
        break
      case 'strong':
        result += bold(renderInlineTokens(tok.tokens!))
        break
      case 'em':
        result += italic(renderInlineTokens(tok.tokens!))
        break
      case 'codespan':
        result += gray(tok.text)
        break
      case 'link':
        result += `${cyan(renderInlineTokens(tok.tokens!))}${dim(gray(` (${tok.href})`))}`
        break
      case 'del':
        result += renderInlineTokens(tok.tokens!)
        break
      case 'br':
        result += '\n'
        break
      case 'escape':
        result += tok.text
        break
      case 'image':
        result += dim(gray(`[image: ${tok.text}]`))
        break
      default:
        if ('raw' in tok) result += tok.raw
        break
    }
  }
  return result
}

// ── 块级渲染 → 行数组 ──

function renderBlock(token: Token): string[] {
  const lines: string[] = []

  switch (token.type) {
    case 'heading': {
      const tokens = (token as Token & { tokens: Token[]; depth: number }).tokens
      const depth = (token as Token & { depth: number }).depth
      const text = renderInlineTokens(tokens)
      const prefix = ' '.repeat(2)
      if (depth === 1) lines.push(`${prefix}${bold(text)}`)
      else if (depth === 2) lines.push(`${prefix}${yellow(text)}`)
      else lines.push(`  ${cyan(text)}`)
      lines.push('')
      break
    }

    case 'paragraph': {
      const tokens = (token as Token & { tokens: Token[] }).tokens
      const text = renderInlineTokens(tokens)
      if (text.trim()) lines.push(text)
      break
    }

    case 'code': {
      const indent = '  '
      lines.push(`${indent}${gray('```' + (token.lang || ''))}`)
      for (const codeLine of token.text.split('\n')) {
        lines.push(`${indent}${gray(codeLine)}`)
      }
      lines.push(`${indent}${gray('```')}`)
      lines.push('')
      break
    }

    case 'list': {
      const items = (token as Token & { items: { tokens: Token[] }[] }).items
      for (const item of items) {
        const text = renderInlineTokens(item.tokens)
        lines.push(`  • ${text}`)
      }
      lines.push('')
      break
    }

    case 'blockquote': {
      const tokens = (token as Token & { tokens: Token[] }).tokens
      const text = tokens
        .map(t => 'text' in t ? t.text : '')
        .filter(Boolean)
        .join(' ')
      if (text.trim()) {
        for (const line of text.split('\n')) {
          if (line.trim()) lines.push(`${dim('│')} ${dim(italic(line.trim()))}`)
        }
        lines.push('')
      }
      break
    }

    case 'hr':
      lines.push(dim(gray('─'.repeat(60))))
      lines.push('')
      break

    case 'table': {
      const t = token as Token & { header: { tokens: Token[] }[]; rows: { tokens: Token[] }[][] }
      if (t.header.length > 0) {
        lines.push('| ' + t.header.map(h => renderInlineTokens(h.tokens)).join(' | ') + ' |')
        lines.push('| ' + t.header.map(() => '---').join(' | ') + ' |')
      }
      for (const row of t.rows) {
        lines.push('| ' + row.map(c => renderInlineTokens(c.tokens)).join(' | ') + ' |')
      }
      lines.push('')
      break
    }

    case 'space':
      lines.push('')
      break

    case 'html':
      // raw HTML - just strip tags for safety
      if (token.text) lines.push(token.text.replace(/<[^>]+>/g, ''))
      break

    case 'def': // definition link - ignore
    case 'escape':
      break

    default:
      // fallback for unknown tokens
      if ('raw' in token && token.raw) lines.push(token.raw)
      break
  }

  return lines
}

/**
 * 将 Markdown 文本渲染为 ANSI 格式的终端行数组
 */
export function renderToLines(markdown: string): string[] {
  if (!markdown) return []
  const tokens = marked.lexer(markdown)
  const lines: string[] = []
  for (const tok of tokens) {
    lines.push(...renderBlock(tok))
  }
  // 去掉尾部多余的空行
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

/**
 * 将 Markdown 渲染为纯文本（用于 Print 模式）
 */
export function stripMarkdown(markdown: string): string {
  if (!markdown) return ''
  const tokens = marked.lexer(markdown)
  let result = ''
  for (const tok of tokens) {
    result += stripToken(tok) + '\n'
  }
  return result.trim()
}

function stripToken(token: Token): string {
  if ('tokens' in token && token.tokens) {
    const tok = token as Tokens.Paragraph | Tokens.Heading | Tokens.ListItem
    if (Array.isArray(tok.tokens)) {
      return tok.tokens.map(stripToken).join('')
    }
  }
  if ('text' in token && typeof token.text === 'string') {
    return token.text
  }
  if ('raw' in token && typeof token.raw === 'string') {
    return token.raw
  }
  return ''
}