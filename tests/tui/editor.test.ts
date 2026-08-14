import { describe, it, expect, vi } from 'vitest'
import { Editor, parseKeys } from '../../src/tui/components/editor.js'

describe('parseKeys', () => {
  it('可打印字符 → insert', () => {
    expect(parseKeys('a')).toEqual([{ type: 'insert', ch: 'a' }])
  })

  it('多字节 utf-8 → 单次 insert', () => {
    expect(parseKeys('中')).toEqual([{ type: 'insert', ch: '中' }])
    expect(parseKeys('emoji 😀 here')).toEqual([
      { type: 'insert', ch: 'e' },
      { type: 'insert', ch: 'm' },
      { type: 'insert', ch: 'o' },
      { type: 'insert', ch: 'j' },
      { type: 'insert', ch: 'i' },
      { type: 'insert', ch: ' ' },
      { type: 'insert', ch: '😀' },
      { type: 'insert', ch: ' ' },
      { type: 'insert', ch: 'h' },
      { type: 'insert', ch: 'e' },
      { type: 'insert', ch: 'r' },
      { type: 'insert', ch: 'e' },
    ])
  })

  it('Enter → submit（CR 和 LF 都识别）', () => {
    expect(parseKeys('\r')).toEqual([{ type: 'submit' }])
    expect(parseKeys('\n')).toEqual([{ type: 'submit' }])
  })

  it('Backspace DEL → backspace', () => {
    expect(parseKeys('\x7f')).toEqual([{ type: 'backspace' }])
  })

  it('Ctrl+A/E/U/K/W', () => {
    expect(parseKeys('\x01')).toEqual([{ type: 'cursorHome' }])
    expect(parseKeys('\x05')).toEqual([{ type: 'cursorEnd' }])
    expect(parseKeys('\x15')).toEqual([{ type: 'killToStart' }])
    expect(parseKeys('\x0b')).toEqual([{ type: 'killToEnd' }])
    expect(parseKeys('\x17')).toEqual([{ type: 'killWord' }])
  })

  it('Ctrl+B/F → 左/右移', () => {
    expect(parseKeys('\x02')).toEqual([{ type: 'cursorLeft' }])
    expect(parseKeys('\x06')).toEqual([{ type: 'cursorRight' }])
  })

  it('Ctrl+C → cancel', () => {
    expect(parseKeys('\x03')).toEqual([{ type: 'cancel' }])
  })

  it('Ctrl+D → cancelIfEmpty', () => {
    expect(parseKeys('\x04')).toEqual([{ type: 'cancelIfEmpty' }])
  })

  it('方向键 ESC[A/B/C/D → 历史/光标', () => {
    expect(parseKeys('\x1b[A')).toEqual([{ type: 'historyPrev' }])
    expect(parseKeys('\x1b[B')).toEqual([{ type: 'historyNext' }])
    expect(parseKeys('\x1b[C')).toEqual([{ type: 'cursorRight' }])
    expect(parseKeys('\x1b[D')).toEqual([{ type: 'cursorLeft' }])
  })

  it('Home/End ESC[H/F 和 ESC OH/OF', () => {
    expect(parseKeys('\x1b[H')).toEqual([{ type: 'cursorHome' }])
    expect(parseKeys('\x1b[F')).toEqual([{ type: 'cursorEnd' }])
    expect(parseKeys('\x1bOH')).toEqual([{ type: 'cursorHome' }])
    expect(parseKeys('\x1bOF')).toEqual([{ type: 'cursorEnd' }])
  })

  it('Delete ESC[3~', () => {
    expect(parseKeys('\x1b[3~')).toEqual([{ type: 'delete' }])
  })

  it('裸 ESC → cancel', () => {
    expect(parseKeys('\x1b')).toEqual([{ type: 'cancel' }])
  })

  it('一次 data 含多个按键', () => {
    expect(parseKeys('ab\r')).toEqual([
      { type: 'insert', ch: 'a' },
      { type: 'insert', ch: 'b' },
      { type: 'submit' },
    ])
  })

  it('未识别 ESC 序列 → unknown', () => {
    expect(parseKeys('\x1b[99;1Z')).toEqual([{ type: 'unknown' }])
  })

  it('Alt+Enter (\\x1b\\r) → newline', () => {
    expect(parseKeys('\x1b\r')).toEqual([{ type: 'newline' }])
  })

  it('CSI u Shift+Enter (\\x1b[13;2u) → newline', () => {
    expect(parseKeys('\x1b[13;2u')).toEqual([{ type: 'newline' }])
  })

  it('CSI u bare Enter (\\x1b[13u) → unknown（默认提交走 \\r）', () => {
    // bare Enter via CSI u 不常见，非预期语义，降级 unknown
    expect(parseKeys('\x1b[13u')).toEqual([{ type: 'unknown' }])
  })
})

describe('Editor — 基础行为', () => {
  it('初始渲染含 prompt + 空内容', () => {
    const e = new Editor({ prompt: '> ' })
    const lines = e.render(80)
    expect(lines[0]).toContain('> ')
  })

  it('插入字符：更新 text + cursorPos', () => {
    const e = new Editor()
    e.handleInput('hi')
    expect(e.getText()).toBe('hi')
    expect(e.getCursorPos()).toBe(2)
  })

  it('Enter 触发 onSubmit 且清空', () => {
    const onSubmit = vi.fn()
    const e = new Editor({ onSubmit })
    e.handleInput('hello')
    e.handleInput('\r')
    expect(onSubmit).toHaveBeenCalledWith('hello')
    expect(e.getText()).toBe('')
  })

  it('onChange 每次编辑触发', () => {
    const onChange = vi.fn()
    const e = new Editor({ onChange })
    e.handleInput('a')
    expect(onChange).toHaveBeenCalledWith('a')
    e.handleInput('b')
    expect(onChange).toHaveBeenCalledWith('ab')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('onCancel 在 Ctrl+C 时触发', () => {
    const onCancel = vi.fn()
    const e = new Editor({ onCancel })
    e.handleInput('\x03')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Esc 也触发 onCancel', () => {
    const onCancel = vi.fn()
    const e = new Editor({ onCancel })
    e.handleInput('\x1b')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('Editor — 光标移动', () => {
  it('Ctrl+A 移到行首', () => {
    const e = new Editor()
    e.handleInput('hello')
    e.handleInput('\x01')
    expect(e.getCursorPos()).toBe(0)
  })

  it('Ctrl+E 移到行尾', () => {
    const e = new Editor()
    e.handleInput('hello')
    e.handleInput('\x01')   // 到行首
    e.handleInput('\x05')   // 到行尾
    expect(e.getCursorPos()).toBe(5)
  })

  it('← (Ctrl+B / ESC[D) 左移', () => {
    const e = new Editor()
    e.handleInput('abc')
    expect(e.getCursorPos()).toBe(3)
    e.handleInput('\x02')
    expect(e.getCursorPos()).toBe(2)
    e.handleInput('\x1b[D')
    expect(e.getCursorPos()).toBe(1)
  })

  it('→ (Ctrl+F / ESC[C) 右移，不超长度', () => {
    const e = new Editor()
    e.handleInput('ab')
    e.handleInput('\x02')   // 左移到 1
    expect(e.getCursorPos()).toBe(1)
    e.handleInput('\x06')
    expect(e.getCursorPos()).toBe(2)
    e.handleInput('\x06')   // 已经在末尾，不动
    expect(e.getCursorPos()).toBe(2)
  })

  it('光标不左移到负值', () => {
    const e = new Editor()
    e.handleInput('a')
    e.handleInput('\x02')  // 0
    e.handleInput('\x02')  // 仍 0
    expect(e.getCursorPos()).toBe(0)
  })
})

describe('Editor — 删除', () => {
  it('Backspace 删前一字', () => {
    const e = new Editor()
    e.handleInput('abc')
    e.handleInput('\x02')    // 左移到 2（光标在 c 前）
    e.handleInput('\x7f')    // 删 b
    expect(e.getText()).toBe('ac')
    expect(e.getCursorPos()).toBe(1)
  })

  it('Backspace 在行首不动', () => {
    const e = new Editor()
    e.handleInput('abc')
    e.handleInput('\x01')    // 0
    e.handleInput('\x7f')
    expect(e.getText()).toBe('abc')
  })

  it('Delete (ESC[3~) 删光标处字', () => {
    const e = new Editor()
    e.handleInput('abc')
    e.handleInput('\x01')        // 0
    e.handleInput('\x1b[3~')     // 删 a
    expect(e.getText()).toBe('bc')
    expect(e.getCursorPos()).toBe(0)
  })

  it('Ctrl+K 删到行尾', () => {
    const e = new Editor()
    e.handleInput('hello')
    e.handleInput('\x01')        // 0
    e.handleInput('\x02')        // 已经在 0，左移无效；直接 Ctrl+K 从光标(0)删到尾
    e.handleInput('\x0b')
    expect(e.getText()).toBe('')
  })

  it('Ctrl+U 删到行首', () => {
    const e = new Editor()
    e.handleInput('hello')
    e.handleInput('\x01')        // 0
    e.handleInput('\x06')        // 右移到 1
    e.handleInput('\x15')        // Ctrl+U 删 [0,1) → ''
    expect(e.getText()).toBe('ello')
    expect(e.getCursorPos()).toBe(0)
  })

  it('Ctrl+W 向左删一词（含跳空白）', () => {
    const e = new Editor()
    e.handleInput('hello world')
    // cursor 在末尾 (11)
    e.handleInput('\x17')
    expect(e.getText()).toBe('hello ')
    e.handleInput('\x17')
    expect(e.getText()).toBe('hello')
  })
})

describe('Editor — 历史', () => {
  it('pushHistory 追加（不重复 / 不空）', () => {
    const e = new Editor({ history: ['a'] })
    e.pushHistory('b')
    expect(e.getHistory()).toEqual(['a', 'b'])
    e.pushHistory('b')   // 重复，跳过
    expect(e.getHistory()).toEqual(['a', 'b'])
    e.pushHistory('')    // 空，跳过
    expect(e.getHistory()).toEqual(['a', 'b'])
  })

  it('↑ 进入历史浏览，载入最后一条', () => {
    const e = new Editor({ history: ['one', 'two'] })
    e.handleInput('cur')   // 草稿
    e.handleInput('\x1b[A') // ↑
    expect(e.getText()).toBe('two')
  })

  it('↑↑ 翻到更旧', () => {
    const e = new Editor({ history: ['one', 'two'] })
    e.handleInput('\x1b[A')  // two
    e.handleInput('\x1b[A')  // one
    expect(e.getText()).toBe('one')
  })

  it('↑ 然后 ↓ 回到草稿', () => {
    const e = new Editor({ history: ['one'] })
    e.handleInput('draft')
    e.handleInput('\x1b[A')  // one
    expect(e.getText()).toBe('one')
    e.handleInput('\x1b[B')  // 回草稿
    expect(e.getText()).toBe('draft')
  })

  it('在历史浏览中编辑 → 退出浏览（改动保留在 text 但不写回历史）', () => {
    const e = new Editor({ history: ['one'] })
    e.handleInput('\x1b[A')  // one
    e.handleInput('!')        // 编辑
    expect(e.getText()).toBe('one!')
    // 历史本身不变
    expect(e.getHistory()).toEqual(['one'])
  })

  it('无历史时 ↑ 无效果', () => {
    const e = new Editor()
    e.handleInput('hello')
    e.handleInput('\x1b[A')
    expect(e.getText()).toBe('hello')
  })
})

describe('Editor — Ctrl+D 语义', () => {
  it('行空时 Ctrl+D → onCancel', () => {
    const onCancel = vi.fn()
    const e = new Editor({ onCancel })
    e.handleInput('\x04')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('行非空时 Ctrl+D → 等价 Delete', () => {
    const onCancel = vi.fn()
    const e = new Editor({ onCancel })
    e.handleInput('abc')
    e.handleInput('\x01')   // 0
    e.handleInput('\x04')   // 删 a
    expect(e.getText()).toBe('bc')
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('Editor — 多字节字符', () => {
  it('Backspace 删一个中文字（按 code point）', () => {
    const e = new Editor()
    e.handleInput('你好')
    expect(e.getText()).toBe('你好')
    e.handleInput('\x7f')
    expect(e.getText()).toBe('你')
  })

  it('光标按 code point 左移', () => {
    const e = new Editor()
    e.handleInput('你好')
    e.handleInput('\x02')  // 左移一个 cp
    expect(e.getCursorPos()).toBe(1)   // ← 这里 "你" 在 JS 中是 1 个 code unit
    e.handleInput('\x1b[D')
    expect(e.getCursorPos()).toBe(0)
  })

  it('Emoji（代理对）插入与删除', () => {
    const e = new Editor()
    e.handleInput('😀')
    expect(e.getText()).toBe('😀')
    e.handleInput('\x7f')
    expect(e.getText()).toBe('')
  })
})

describe('Editor — Focusable', () => {
  it('focus/blur 切换 hasFocus', () => {
    const e = new Editor()
    expect(e.hasFocus).toBe(false)
    e.focus()
    expect(e.hasFocus).toBe(true)
    e.blur()
    expect(e.hasFocus).toBe(false)
  })
})

describe('Editor — 渲染', () => {
  it('渲染含 prompt + text', () => {
    const e = new Editor({ prompt: '> ' })
    e.handleInput('hello')
    const lines = e.render(80)
    expect(lines[0]).toContain('> ')
    expect(lines[0]).toContain('hello')
  })

  it('光标处反白（含 ANSI inverse）', () => {
    const e = new Editor()
    e.handleInput('ab')
    e.handleInput('\x02')   // 光标在 b 前
    const line = e.render(80)[0]
    expect(line).toContain('\x1b[7m')
    expect(line).toContain('\x1b[0m')
  })

  it('光标在末尾时反白空格', () => {
    const e = new Editor()
    e.handleInput('ab')
    // cursor 在 2 = 末尾
    const line = e.render(80)[0]
    expect(line).toContain('\x1b[7m \x1b[0m')
  })

  it('单行横向滚动：恒返回 1 行（Phase 5）', () => {
    const e = new Editor({ prompt: '>' })
    e.handleInput('a'.repeat(200))   // 远超 20 列
    const lines = e.render(20)
    expect(lines.length).toBe(1)
  })

  it('超宽时光标始终可见（右侧滚动）', () => {
    const e = new Editor({ prompt: '' })
    // 输入 abcdefghij（10 字符）；width=5，avail=5
    e.handleInput('abcdefghij')
    // cursor 在末尾(10)。窗口应让光标可见
    const line = e.render(5)[0]
    // 光标反白空格出现 → 末尾可见
    expect(line).toContain('\x1b[7m \x1b[0m')
    // 应只含 5 个可见字符（窗口）+ prompt；不含全 10 个
    expect(line).not.toContain('abcdefghij')
  })

  it('超宽但光标在开头：窗口从开头', () => {
    const e = new Editor({ prompt: '' })
    e.handleInput('abcdefghij')
    e.handleInput('\x01')   // Ctrl+A 光标回行首
    const line = e.render(5)[0]
    // 光标在 'a'，反白 a
    expect(line).toContain('\x1b[7ma\x1b[0m')
    expect(line).toContain('bcde')   // 窗口前 5 字符
    expect(line).not.toContain('fghij')
  })

  it('超宽时不换行（dock 高度恒 1 的前提）', () => {
    const e = new Editor({ prompt: '' })
    e.handleInput('x'.repeat(500))
    expect(e.render(10).length).toBe(1)
    expect(e.render(80).length).toBe(1)
  })

  it('缓存：相同 width 返回相同引用', () => {
    const e = new Editor()
    e.handleInput('hi')
    const a = e.render(80)
    const b = e.render(80)
    expect(a).toBe(b)
  })

  it('编辑后 invalidate，下次 render 重算', () => {
    const e = new Editor()
    e.handleInput('hi')
    const a = e.render(80)
    e.handleInput('!')
    const b = e.render(80)
    expect(a).not.toBe(b)
    expect(b[0]).toContain('hi!')
  })
})