import { describe, it, expect } from 'vitest'
import { KeyBinds } from '../../src/tui/components/keybinds.js'

describe('KeyBinds (default mode)', () => {
  it('default 模式透传字符', () => {
    const kb = new KeyBinds('default')
    const r = kb.process('hello')
    expect(r.mode).toBe('default')
    expect(r.intents).toHaveLength(5)
    expect(r.intents[0]).toEqual({ type: 'insert', ch: 'h' })
  })

  it('default 模式识别 Enter', () => {
    const kb = new KeyBinds('default')
    const r = kb.process('\r')
    expect(r.intents[0]).toEqual({ type: 'submit' })
  })
})

describe('KeyBinds (vim mode)', () => {
  it('初始为 INSERT 状态，透传输入', () => {
    const kb = new KeyBinds('vim')
    expect(kb.isVimInsert).toBe(true)
    const r = kb.process('abc')
    expect(r.intents).toHaveLength(3)
  })

  it('Esc 退出到 NORMAL（不触发 cancel）', () => {
    const kb = new KeyBinds('vim')
    kb.process('\x1b')  // 切换到 NORMAL
    expect(kb.isVimInsert).toBe(false)
    // NORMAL 下 j = historyPrev
    const r = kb.process('j')
    expect(r.intents[0]).toEqual({ type: 'historyPrev' })
  })

  it('NORMAL 模式 h/l 移动光标', () => {
    const kb = new KeyBinds('vim')
    kb.toggleVimInsert() // → NORMAL
    expect(kb.isVimInsert).toBe(false)
    const r = kb.process('h')
    expect(r.intents[0]).toEqual({ type: 'cursorLeft' })
  })

  it('NORMAL 模式 j/k 历史导航', () => {
    const kb = new KeyBinds('vim')
    kb.toggleVimInsert()
    const r1 = kb.process('j')
    expect(r1.intents[0]).toEqual({ type: 'historyPrev' })
    const r2 = kb.process('k')
    expect(r2.intents[0]).toEqual({ type: 'historyNext' })
  })

  it('NORMAL 模式 i 回到 INSERT', () => {
    const kb = new KeyBinds('vim')
    kb.toggleVimInsert()
    expect(kb.isVimInsert).toBe(false)
    kb.process('i')
    expect(kb.isVimInsert).toBe(true)
  })

  it('NORMAL 模式 0/$ 行首行尾', () => {
    const kb = new KeyBinds('vim')
    kb.toggleVimInsert()
    expect(kb.process('0').intents[0]).toEqual({ type: 'cursorHome' })
    expect(kb.process('$').intents[0]).toEqual({ type: 'cursorEnd' })
  })

  it('NORMAL 模式 x 删除, D 删到行尾, u 退格', () => {
    const kb = new KeyBinds('vim')
    kb.toggleVimInsert()
    expect(kb.process('x').intents[0]).toEqual({ type: 'delete' })
    expect(kb.process('D').intents[0]).toEqual({ type: 'killToEnd' })
    expect(kb.process('u').intents[0]).toEqual({ type: 'backspace' })
  })

  it('A 光标到行尾 + 进入 INSERT（不插入字符）', () => {
    const kb = new KeyBinds('vim')
    kb.toggleVimInsert()
    const r = kb.process('A')
    expect(r.intents).toHaveLength(1)
    expect(r.intents[0]).toEqual({ type: 'cursorEnd' })
    expect(kb.isVimInsert).toBe(true)
  })

  it('setMode 切换', () => {
    const kb = new KeyBinds('default')
    kb.setMode('vim')
    expect(kb.currentMode).toBe('vim')
    expect(kb.isVimInsert).toBe(false) // vim 默认 NORMAL
    kb.setMode('default')
    expect(kb.currentMode).toBe('default')
  })
})