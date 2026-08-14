// ============================================================
// KeyBinds — 键绑定系统（Vim 模式 + 自定义 keymap）
//
// 用法：
//   const kb = new KeyBinds('vim')
//   const mapping = kb.process(data)  // 返回 (mode, intent 或 null)
//
// KeyBinds 是一个状态机，处理 raw STDIN 数据后输出 KeyIntent，
// 同时维护自身状态（normal/insert 模式）。Editor 不直接处理 stdin，
// 而是通过 KeyBinds 层。
// ============================================================

import { parseKeys, type KeyIntent } from './editor.js'

export type KeyMode = 'default' | 'vim'

/**
 * KeyBinds 状态机。
 * default 模式：直接透传 parseKeys，无特殊处理。
 * vim 模式：维护 NORMAL / INSERT 状态，处理 h/j/k/l 等。
 */
export class KeyBinds {
  private mode: KeyMode
  /** vim 当前子状态（仅 vim 模式有效） */
  private vimInsert = true   // 默认从 insert 开始，方便初次使用的用户

  constructor(mode: KeyMode = 'default') {
    this.mode = mode
  }

  get currentMode(): KeyMode { return this.mode }
  get isVimInsert(): boolean { return this.vimInsert }

  /** 切换键绑定模式 */
  setMode(mode: KeyMode): void {
    this.mode = mode
    this.vimInsert = mode === 'vim' ? false : true  // vim 默认 NORMAL
  }

  /** 切换 vim 子状态 */
  toggleVimInsert(): void {
    this.vimInsert = !this.vimInsert
  }

  /**
   * 处理 raw 输入，返回附加了模式信息的处理结果。
   * vim 模式下：
   *   - INSERT 状态：透传 parseKeys（正常编辑）
   *   - NORMAL 状态：h/j/k/l → 光标，i → INSERT，其他忽略
   */
  process(data: string): { mode: KeyMode; intents: KeyIntent[] } {
    if (this.mode === 'default') {
      return { mode: 'default', intents: parseKeys(data) }
    }

    // Vim 模式
    return this.processVim(data)
  }

  private processVim(data: string): { mode: KeyMode; intents: KeyIntent[] } {
    if (this.vimInsert) {
      // INSERT：透视传，但 Esc 退出到 NORMAL
      const intents = parseKeys(data)
      // 检测 Esc \x1b（裸 ESC）
      if (data === '\x1b' || data === '\x1b\x1b') {
        this.vimInsert = false
        return { mode: 'vim', intents: [] }   // 不触发 cancel（与默认模式区别）
      }
      return { mode: 'vim', intents }
    }

    // NORMAL 模式
    const intents: KeyIntent[] = []
    for (const ch of data) {
      switch (ch) {
        case 'i': case 'a':
          this.vimInsert = true
          break
        case 'h':
          intents.push({ type: 'cursorLeft' })
          break
        case 'l':
          intents.push({ type: 'cursorRight' })
          break
        case 'j':
          intents.push({ type: 'historyPrev' })
          break
        case 'k':
          intents.push({ type: 'historyNext' })
          break
        case '0':
          intents.push({ type: 'cursorHome' })
          break
        case '$':
        case 'A':
          intents.push({ type: 'cursorEnd' })
          this.vimInsert = true
          break
        case 'x':
          intents.push({ type: 'delete' })
          break
        case 'D':
          intents.push({ type: 'killToEnd' })
          break
        case 'u':
          intents.push({ type: 'backspace' })
          break
        case 'w':
          // 简化：移到右一词前（不实现精细 word 跳转）
          intents.push({ type: 'cursorRight' })
          break
        case 'b':
          intents.push({ type: 'cursorLeft' })
          break
      }
    }
    return { mode: 'vim', intents }
  }
}