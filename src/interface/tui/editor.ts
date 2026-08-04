// ============================================================
// TUI Editor — 文本输入编辑器
//
// 使用 readline 实现的多行输入，支持：
//   - 基础行编辑
//   - Ctrl+C 退出
//   - 在对话模式下循环输入
// ============================================================

import * as readline from 'readline'

export interface EditorOptions {
  prompt?: string
  onInput: (input: string) => Promise<void>
  onExit: () => void
}

export function startEditor(options: EditorOptions): void {
  const prompt = options.prompt || '> '

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt,
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      rl.prompt()
      return
    }

    // 退出指令
    if (trimmed === '/exit' || trimmed === '/quit') {
      rl.close()
      return
    }

    // 暂停 readline，让 Agent 输出时不会干扰输入行
    rl.pause()

    try {
      await options.onInput(trimmed)
    } catch (error) {
      console.error('\n错误:', error instanceof Error ? error.message : String(error))
    }

    // 恢复 readline
    rl.resume()
    rl.prompt()
  })

  rl.on('close', () => {
    console.log('\n再见！')
    options.onExit()
  })

  // Ctrl+C 处理
  rl.on('SIGINT', () => {
    rl.close()
  })
}