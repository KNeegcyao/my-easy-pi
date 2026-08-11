import { describe, it, expect } from 'vitest'
import { Csi2026 } from '../../src/tui/csi2026.js'

describe('Csi2026 (不支持时)', () => {
  it('begin/end 返回空串', () => {
    const c = new Csi2026({ supported: false })
    expect(c.begin()).toBe('')
    expect(c.end()).toBe('')
  })

  it('frame 写入只产出内容本身，无 BSU/ESU', () => {
    const c = new Csi2026({ supported: false })
    const out: string[] = []
    c.frame(s => out.push(s), () => { out.push('hello') })
    expect(out).toEqual(['hello'])
  })
})

describe('Csi2026 (支持时)', () => {
  it('begin/end 配对', () => {
    const c = new Csi2026({ supported: true })
    expect(c.begin()).toBe('\x1b[?2026h')
    expect(c.end()).toBe('\x1b[?2026l')
  })

  it('嵌套只在外层产生 BSU/ESU', () => {
    const c = new Csi2026({ supported: true })
    expect(c.begin()).toBe('\x1b[?2026h')   // depth=1
    expect(c.begin()).toBe('')               // depth=2 (no-op)
    expect(c.end()).toBe('')                 // depth=1 (no-op)
    expect(c.end()).toBe('\x1b[?2026l')      // depth=0 真正关闭
  })

  it('frame 把内容包裹在 BSU/ESU 中', () => {
    const c = new Csi2026({ supported: true })
    const out: string[] = []
    c.frame(s => out.push(s), () => {
      out.push('content')
    })
    expect(out).toEqual(['\x1b[?2026h', 'content', '\x1b[?2026l'])
  })

  it('fn 抛异常时仍会关帧', () => {
    const c = new Csi2026({ supported: true })
    const out: string[] = []
    expect(() => {
      c.frame(s => out.push(s), () => {
        out.push('before-throw')
        throw new Error('boom')
      })
    }).toThrow('boom')
    expect(out).toContain('\x1b[?2026h')
    expect(out).toContain('before-throw')
    expect(out).toContain('\x1b[?2026l')
  })

  it('setSupported(false) 后不再产生帧', () => {
    const c = new Csi2026({ supported: true })
    c.setSupported(false)
    const out: string[] = []
    c.frame(s => out.push(s), () => { out.push('x') })
    expect(out).toEqual(['x'])
  })
})
