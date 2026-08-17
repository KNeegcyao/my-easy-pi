import { describe, it, expect } from 'vitest'
import { highlightCode } from '../../../src/interface/code-highlighter.js'

describe('code-highlighter', () => {
  it('typescript 关键字、字符串、数字使用 Dark+ 风格 256 色', () => {
    const code = "const x = 'hello' + 42"
    const result = highlightCode(code, 'typescript')
    const line = result[0]
    // 关键字 SkyBlue3 (74): \x1b[38;5;74m
    expect(line).toContain('\x1b[38;5;74mconst\x1b[0m')
    // 字符串 LightSalmon (215): \x1b[38;5;215m
    expect(line).toContain("\x1b[38;5;215m'hello'\x1b[0m")
    // 数字 DarkSeaGreen (151): \x1b[38;5;151m
    expect(line).toContain('\x1b[38;5;151m42\x1b[0m')
  })

  it('python 注释使用 Dark+ 风格斜体绿色', () => {
    const code = '# comment'
    const result = highlightCode(code, 'python')
    // 斜体 + 256 色 Green4 (28): \x1b[3;38;5;28m
    expect(result[0]).toContain('\x1b[3;38;5;28m# comment\x1b[0m')
  })

  it('cpp 代码正确高亮关键字和预处理器', () => {
    const code = '#include <iostream>\nvoid heapify(vector<int>& arr, int n, int i) {'
    const result = highlightCode(code, 'cpp')
    const lines = result
    // 预处理器 HotPink (213)
    expect(lines[0]).toContain('\x1b[38;5;213m#include\x1b[0m')
    // 关键字 SkyBlue3 (74): void, int
    expect(lines[1]).toContain('\x1b[38;5;74mvoid\x1b[0m')
    expect(lines[1]).toContain('\x1b[38;5;74mint\x1b[0m')
  })

  it('java 代码正确高亮关键字和注解', () => {
    const code = '@Override\npublic static void main(String[] args) { int x = 42; }'
    const result = highlightCode(code, 'java')
    const lines = result
    // 注解 HotPink (213)
    expect(lines[0]).toContain('\x1b[38;5;186m@Override\x1b[0m')
    // 关键字 SkyBlue3 (74): public, static, void, int
    expect(lines[1]).toContain('\x1b[38;5;74mpublic\x1b[0m')
    expect(lines[1]).toContain('\x1b[38;5;74mstatic\x1b[0m')
    expect(lines[1]).toContain('\x1b[38;5;74mvoid\x1b[0m')
    expect(lines[1]).toContain('\x1b[38;5;74mint\x1b[0m')
    // 数字 DarkSeaGreen (151)
    expect(lines[1]).toContain('\x1b[38;5;151m42\x1b[0m')
  })

  it('未知语言原样返回', () => {
    const code = 'plain text'
    const result = highlightCode(code, 'unknown')
    expect(result).toEqual([code])
  })
})
