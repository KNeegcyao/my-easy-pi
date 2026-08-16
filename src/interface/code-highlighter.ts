// ============================================================
// Code Highlighter — 轻量级终端语法高亮
//
// 不引入外部依赖，用正则词法分析实现。
// 支持语言：typescript/javascript、python、bash、json、yaml、css
// ============================================================

import { cyan, green, yellow, gray, magenta, dim } from './tui/theme.js'

/** 语言识别：把常见别名统一成内部标识 */
const LANG_MAP: Record<string, string> = {
  ts: 'typescript', typescript: 'typescript', js: 'typescript', javascript: 'typescript',
  jsx: 'typescript', tsx: 'typescript',
  py: 'python', python: 'python',
  sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash',
  json: 'json',
  yml: 'yaml', yaml: 'yaml',
  css: 'css', scss: 'css', less: 'css',
  md: 'markdown', markdown: 'markdown',
  html: 'html', xml: 'html',
  go: 'go', rust: 'rust', rs: 'rust',
}

/** 统一语言标识 */
function normalizeLang(lang?: string): string {
  if (!lang) return ''
  return LANG_MAP[lang.toLowerCase()] || ''
}

// ── 各语言词法规则 ──

interface TokenRule {
  type: string
  regex: RegExp
}

const RULES: Record<string, TokenRule[]> = {
  typescript: [
    { type: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\// },
    { type: 'string', regex: /`(?:[^`\\]|\\.)*`/ },           // template literal
    { type: 'string', regex: /'(?:[^'\\]|\\.)*'/ },
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'keyword', regex: /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|this|typeof|instanceof|import|export|from|default|async|await|class|extends|interface|type|enum|namespace|declare|abstract|public|private|protected|readonly|static|get|set|of|in|as|is)\b/ },
    { type: 'number', regex: /\b(?:0[xX][0-9a-fA-F]+|0[oO]?[0-7]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?n?)\b/ },
    { type: 'boolean', regex: /\b(?:true|false|null|undefined)\b/ },
    { type: 'type', regex: /\b(?:string|number|boolean|any|unknown|never|void|object|symbol|bigint|Record|Array|Map|Set|Promise|Error|Date|RegExp)\b/ },
  ],
  python: [
    { type: 'comment', regex: /#.*$/ },
    { type: 'string', regex: /'''[\s\S]*?'''|"""[\s\S]*?"""/ },
    { type: 'string', regex: /'(?:[^'\\]|\\.)*'/ },
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'keyword', regex: /\b(?:def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|raise|break|continue|pass|lambda|and|or|not|in|is|None|True|False|global|nonlocal|assert|del|async|await)\b/ },
    { type: 'number', regex: /\b(?:0[xX][0-9a-fA-F]+|0[oO]?[0-7]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/ },
    { type: 'decorator', regex: /@\w+/ },
  ],
  bash: [
    { type: 'comment', regex: /#.*$/ },
    { type: 'string', regex: /'(?:[^'\\]|\\.)*'/ },
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'keyword', regex: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|echo|printf|read|source|export|unset|local|declare|shift|break|continue|eval|exec)\b/ },
    { type: 'variable', regex: /\$\w+|\$\{[^}]+\}/ },
    { type: 'number', regex: /\b\d+(?:\.\d+)?\b/ },
  ],
  json: [
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'keyword', regex: /\b(?:true|false|null)\b/ },
    { type: 'number', regex: /-?\b(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
  ],
  yaml: [
    { type: 'comment', regex: /#.*$/ },
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'string', regex: /'(?:[^'\\]|\\.)*'/ },
    { type: 'keyword', regex: /\b(?:true|false|null|yes|no|on|off)\b/ },
    { type: 'number', regex: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { type: 'key', regex: /^\s*[\w-]+(?=\s*:)/m },
  ],
  css: [
    { type: 'comment', regex: /\/\*[\s\S]*?\*\// },
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'string', regex: /'(?:[^'\\]|\\.)*'/ },
    { type: 'selector', regex: /[.#@][\w-]+/ },
    { type: 'property', regex: /\b(?:color|background|margin|padding|border|display|position|width|height|font|text|align|justify|flex|grid|top|left|right|bottom|overflow|z-index|opacity|transform|transition|animation|content)\b/ },
    { type: 'number', regex: /\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|rad|turn)?\b/ },
    { type: 'keyword', regex: /\b(?:important)\b/ },
  ],
  html: [
    { type: 'comment', regex: /<!--[\s\S]*?-->/ },
    { type: 'tag', regex: /<\/?[\w-]+/ },
    { type: 'attr', regex: /\s[\w-]+(?=\s*=)/ },
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'string', regex: /'(?:[^'\\]|\\.)*'/ },
  ],
  go: [
    { type: 'comment', regex: /\/\/.*$/ },
    { type: 'string', regex: /`(?:[^`\\]|\\.)*`/ },
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'keyword', regex: /\b(?:package|import|func|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|map|struct|interface|type|var|const|nil|true|false|iota)\b/ },
    { type: 'number', regex: /\b(?:0[xX][0-9a-fA-F]+|0[oO]?[0-7]+|\d+(?:\.\d+)?)\b/ },
  ],
  rust: [
    { type: 'comment', regex: /\/\/.*$/ },
    { type: 'string', regex: /"(?:[^"\\]|\\.)*"/ },
    { type: 'string', regex: /'(?:[^'\\]|\\.)*'/ },
    { type: 'keyword', regex: /\b(?:fn|let|mut|const|static|if|else|match|for|while|loop|return|break|continue|use|mod|pub|struct|enum|impl|trait|type|where|async|await|move|unsafe|ref|self|Self|true|false|None|Some|Ok|Err)\b/ },
    { type: 'number', regex: /\b(?:0[xX][0-9a-fA-F]+|0[oO]?[0-7]+|0[bB][01]+|\d+(?:\.\d+)?)\b/ },
    { type: 'macro', regex: /\w+!/ },
  ],
}

/** 给 token 类型上色 */
function colorize(tokenType: string, text: string): string {
  switch (tokenType) {
    case 'keyword': return cyan(text)
    case 'string': return green(text)
    case 'number': return yellow(text)
    case 'comment': return dim(gray(text))
    case 'boolean': return yellow(text)
    case 'type': return magenta(text)
    case 'decorator': return yellow(text)
    case 'variable': return cyan(text)
    case 'selector': return yellow(text)
    case 'property': return cyan(text)
    case 'tag': return magenta(text)
    case 'attr': return cyan(text)
    case 'key': return cyan(text)
    case 'macro': return yellow(text)
    default: return text
  }
}

/**
 * 对单行代码进行高亮
 *
 * 算法：从左到右扫描，按优先级匹配各规则，取最早命中的 token，
 * 上色后继续扫描剩余部分。不处理跨行 token（如多行注释/字符串）。
 */
function highlightLine(line: string, rules: TokenRule[]): string {
  let result = ''
  let pos = 0

  while (pos < line.length) {
    let earliest: { type: string; match: string; end: number } | null = null

    for (const rule of rules) {
      rule.regex.lastIndex = 0
      const m = rule.regex.exec(line.slice(pos))
      if (m && m.index === 0) {
        if (!earliest || m[0].length > earliest.match.length) {
          earliest = { type: rule.type, match: m[0], end: pos + m[0].length }
        }
      }
    }

    if (earliest) {
      result += colorize(earliest.type, earliest.match)
      pos = earliest.end
    } else {
      result += line[pos]
      pos++
    }
  }

  return result
}

/**
 * 高亮整个代码块
 *
 * @param code 原始代码文本
 * @param lang 语言标识（如 'typescript', 'python'）
 * @returns 带 ANSI 颜色的行数组
 */
export function highlightCode(code: string, lang?: string): string[] {
  const normalized = normalizeLang(lang)
  const rules = normalized ? (RULES[normalized] || []) : []

  if (rules.length === 0) {
    // 不支持的语言：原样返回
    return code.split('\n')
  }

  return code.split('\n').map(line => highlightLine(line, rules))
}
