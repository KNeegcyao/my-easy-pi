// ============================================================
// JSON 输出模式
//
// 将 Agent 的事件以 JSONL（每行一个 JSON）格式输出到 stdout。
// 适合与其他工具配合使用：
//   my-easy-pi -m "xxx" --output json | jq '.type'
// ============================================================

import { EOL } from 'os'
import type { Agent, AgentEvent } from '../agent/index.js'

/** 创建 JSON 输出接口 */
export function createJSONInterface(agent: Agent): void {
  agent.subscribe((event: AgentEvent) => {
    const json = JSON.stringify(event) + EOL
    process.stdout.write(json)
  })
}