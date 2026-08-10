---
对应源码: src/session/
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# 本章练习 — 会话层

## 练习 1：创建、查看、继续会话

### 目标
熟悉 piagent 的会话管理 CLI 命令。

### 步骤

1. **启动新会话并进行对话**
   ```bash
   # 启动交互模式
   node dist/cli.js -i
   # 输入几条消息，然后按 Ctrl+C 退出
   ```

2. **查看会话列表**
   ```bash
   node dist/cli.js -l
   # 观察会话 ID、名称、消息数量和创建时间
   ```

3. **继续上次会话**
   ```bash
   node dist/cli.js -c
   # 确认之前的对话历史被恢复
   ```

4. **查看原始 JSONL 文件**
   ```bash
   # 找到刚才的会话文件
   ls ~/.piagent/sessions/
   cat ~/.piagent/sessions/session-*.jsonl
   # 观察文件格式：每行一个 JSON 对象
   ```

5. **删除会话**
   ```bash
   node dist/cli.js --delete <session-id>
   # 确认会话已被删除
   node dist/cli.js -l
   ```

### 思考
- 自动命名的截断长度是 40 个字符，如果第一条消息刚好 40 个字符，会有什么问题？
- 删除会话后，对应的 JSONL 文件是否还在？文件系统层面验证一下。

---

## 练习 2：理解 JSONL 文件格式

### 目标
深入理解 JSONL 的存储结构和树形关系。

### 步骤

1. **编写一个简单的脚本读取 JSONL 文件**
   ```typescript
   // read-session.ts
   import { readFile } from 'fs/promises'
   import { join } from 'path'
   import { homedir } from 'os'

   async function inspectSession(sessionId: string) {
     const filePath = join(homedir(), '.piagent', 'sessions', `${sessionId}.jsonl`)
     const content = await readFile(filePath, 'utf-8')
     const lines = content.trim().split('\n')
     
     console.log(`会话 ${sessionId} 共有 ${lines.length} 条消息`)
     console.log('\n消息列表：')
     
     for (const line of lines) {
       const msg = JSON.parse(line)
       console.log(`  [${msg.id}] ${msg.role}: ${msg.content.slice(0, 50)}`)
       if (msg.parentId) {
         console.log(`    └─ parentId: ${msg.parentId}`)
       }
     }
   }

   // 从命令行参数获取 sessionId
   const sessionId = process.argv[2]
   if (!sessionId) {
     console.error('请提供 sessionId')
     process.exit(1)
   }
   inspectSession(sessionId)
   ```

2. **运行脚本**
   ```bash
   # 先获取一个 sessionId
   node dist/cli.js -l
   
   # 运行脚本
   npx tsx read-session.ts <session-id>
   ```

3. **观察输出**
   - 每条消息的 `id` 和 `parentId` 形成了怎样的链？
   - 是否能看到 `meta` 消息？
   - 消息的顺序是否与对话顺序一致？

### 思考
- 如果一条消息的 `parentId` 指向了不存在的 `id`，`getActiveBranch()` 会怎样？
- 如何从 JSONL 中重建出完整的对话树？

---

## 练习 3：修改 Compactor 参数

### 目标
理解 Compactor 的压缩策略，并通过修改参数观察效果。

### 步骤

1. **在 cli.ts 中修改 Compactor 参数**
   
   找到 `cli.ts` 中创建 Compactor 的代码：
   ```typescript
   const compactor = new Compactor()
   ```
   
   修改为更激进的压缩策略：
   ```typescript
   const compactor = new Compactor({ threshold: 6, keepRecent: 3 })
   ```

2. **重新编译并测试**
   ```bash
   npm run build
   
   # 启动交互模式，进行多轮对话
   node dist/cli.js -i
   # 输入 10 条以上消息
   ```

3. **观察压缩效果**
   
   查看 JSONL 文件中是否出现了 `compact-` 开头的消息：
   ```bash
   cat ~/.piagent/sessions/session-*.jsonl | grep "compact-"
   ```

4. **恢复默认参数**
   
   将 Compactor 参数恢复为默认值（或你认为合适的值），重新编译。

### 思考
- 当 `keepRecent` 设置为 3 时，LLM 只能看到最近 3 条消息，这会影响 Agent 的表现吗？
- 如果 `threshold` 设置得太大（如 100），而模型的上下文窗口很小，会有什么问题？
- 尝试将 `threshold` 和 `keepRecent` 设置为相同的值，观察 `truncate()` 方法的行为。

---

## 练习 4：改进建议

### 目标
思考如何改进会话层的当前实现。

### 挑战任务

1. **为 `listSessions()` 添加缓存**
   
   当前 `listSessions()` 每次都要读取所有会话文件，如果有 100 个会话，效率很低。请设计一个方案：
   - 为每个会话维护一个独立的元信息文件（如 `session-xxx.meta.json`）
   - 修改 `listSessions()` 优先读取元信息文件
   - 在 `createSession()`、`renameSession()`、`saveMessage()` 中更新元信息

2. **实现真正的 LLM 摘要**
   
   修改 `Compactor.createSummary()`，使其调用 LLM 生成真正的摘要：
   - 将旧消息列表发给 LLM
   - 让 LLM 用中文总结对话要点
   - 考虑：如何避免在压缩过程中递归调用 LLM？

3. **添加会话导出功能**
   
   在 `SessionManager` 中添加 `exportSession(id, format)` 方法，支持导出为：
   - Markdown 格式（人类可读的对话记录）
   - JSON 格式（完整的消息树结构）

### 提交验证
- 完成以上任意一个挑战任务后，运行 `npm test` 确保现有测试通过
- 编写一个简单的测试脚本验证你的实现

---

## 参考答案要点

### 练习 1 思考

- **自动命名截断**：如果第一条消息刚好 40 个字符，不会追加 `...`，名称看起来像是完整的，但实际上被截断了。可以考虑在截断时始终追加 `...`，或者使用更智能的截断方式（按单词边界或句子边界）。
- **删除会话**：`deleteSession` 调用 `unlink` 删除文件，文件系统层面确认文件已被删除。

### 练习 2 思考

- **无效 parentId**：`getActiveBranch()` 中 `map.get(current.parentId)` 会返回 `undefined`，类型断言 `as unknown as AgentMessage` 会使其变为 `null`，从而终止循环。这实际上是安全的。
- **重建对话树**：需要遍历所有消息，以 `parentId` 为键构建子消息列表，然后从根（`parentId === null`）开始 DFS 遍历。

### 练习 3 思考

- **keepRecent=3 的影响**：LLM 只能看到最近 3 条消息，完全失去了对早期对话上下文的感知，Agent 可能无法持续完成复杂任务。
- **threshold 过大**：如果模型上下文窗口是 128K tokens，而 100 条消息可能已经超过 128K，LLM 会报错或丢失信息。
- **threshold === keepRecent**：当消息数刚好等于 threshold 时不会触发压缩；当消息数超过 threshold 时，如 11 条消息、threshold=10、keepRecent=10，则 oldMessages 为 1 条，压缩后变成 1 条摘要 + 10 条最近 = 11 条，实际上没有减少消息数量！这是一个边界情况，需要考虑。