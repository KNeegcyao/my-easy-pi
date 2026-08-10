---
对应源码: src/tools/registry.ts
最后更新: 2026-08-08
适用版本: piagent v0.1.0
---

# 工具注册与发现

## 1. 本节目标

理解 `ToolRegistry` 的设计与实现，包括：

- 注册表模式（Registry Pattern）在 Agent 系统中的应用
- `registerTool`、`getTool`、`listTools`、`unregisterTool` 四个方法
- 工具注册表如何与 Agent 构造函数集成
- 扩展层如何通过 `ExtensionAPI` 动态注册工具

## 2. 前置知识

- 熟悉 TypeScript 的 `Map<K, V>` 泛型
- 了解 `AgentTool` 接口（见 [README](README.md) 的 3.2 节）
- 了解 [03-agent-layer](../03-agent-layer/README.md) 中 Agent 的构造函数

## 3. 核心概念

### 3.1 什么是注册表模式

注册表模式（Registry Pattern）是一种**集中管理对象实例**的设计模式。它类似于一个"电话本"——你可以通过名字查找对应的对象，而不需要知道对象的具体位置或创建方式。

在 piagent 中，`ToolRegistry` 管理所有可用的工具，提供了四个核心操作：

| 方法 | 作用 | 类比 |
|------|------|------|
| `registerTool(tool)` | 注册一个工具 | 向电话本添加一个联系人 |
| `getTool(name)` | 按名称查找工具 | 在电话本中查找联系人 |
| `listTools()` | 列出所有工具 | 打印整个电话本 |
| `unregisterTool(name)` | 注销一个工具 | 从电话本删除联系人 |

### 3.2 为什么需要注册表

在 Agent 系统中，工具注册表解决了三个关键问题：

1. **解耦**：Agent 不需要知道具体有哪些工具，只需要通过注册表查询
2. **动态性**：可以在运行时动态添加或移除工具（例如，扩展层注册自定义工具）
3. **统一管理**：所有工具集中管理，便于审计和调试

## 4. 代码实现

### 4.1 完整源码

```typescript
// src/tools/registry.ts
import type { AgentTool } from '../agent/types.js'

export class ToolRegistry {
  /** 存储所有已注册的工具 */
  private tools = new Map<string, AgentTool>()

  /** 注册一个工具
   * @param tool - 要注册的工具
   */
  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool)   // 以工具名为 key 存入 Map
  }

  /** 注销一个工具
   * @param name - 工具名称
   */
  unregisterTool(name: string): void {
    this.tools.delete(name)           // 从 Map 中删除
  }

  /** 获取指定名称的工具 */
  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name)       // 根据名称查找
  }

  /** 列出所有已注册的工具 */
  listTools(): AgentTool[] {
    return Array.from(this.tools.values())  // 返回所有工具数组
  }
}
```

### 4.2 逐行注释

- **第 12 行**：`private tools = new Map<string, AgentTool>()` — 使用 `Map` 存储工具，key 是工具名，value 是工具实例。`Map` 的查找时间复杂度是 O(1)，比数组遍历更高效。
- **第 17 行**：`registerTool` — 注册工具时以 `tool.name` 作为 key。如果同名的工具被注册两次，后者会覆盖前者（`Map.set` 的默认行为）。
- **第 24 行**：`unregisterTool` — 注销工具。如果工具不存在，`Map.delete` 会静默返回 `false`，不会抛出异常。
- **第 29 行**：`getTool` — 按名称查找工具。返回 `AgentTool | undefined`，调用方需要处理工具不存在的情况。
- **第 34 行**：`listTools` — 使用 `Array.from()` 将 `Map.values()` 迭代器转为数组，方便遍历和传递给 LLM。

### 4.3 与 Agent 构造函数的集成

在 Agent 的构造函数中，工具注册表被创建并用传入的工具列表初始化：

```typescript
// src/agent/loop.ts（Agent 构造函数片段）
this.toolRegistry = new ToolRegistry()           // 1. 创建注册表
for (const tool of config.tools) {               // 2. 遍历传入的工具列表
  this.toolRegistry.registerTool(tool)           // 3. 逐个注册
}

this.state = createAgentState({
  systemPrompt: config.systemPrompt,
  model: config.model,
  tools: config.tools,                           // 4. 工具列表也存入 state
})
```

在 Agent 核心循环中，当 LLM 请求调用工具时，通过注册表查找并执行：

```typescript
// src/agent/loop.ts（executeToolCalls 方法片段）
const tool = this.toolRegistry.getTool(tc.name)  // 通过注册表查找工具
if (!tool) {
  // 工具不存在 → 返回错误消息给 LLM
  results.push({
    content: `工具 "${tc.name}" 未找到`,
    isError: true,
    terminate: false,
  })
  continue
}

// 工具存在 → 执行
const result = await tool.execute(
  tc.id,
  tc.args as Record<string, unknown>,
  this.abortController?.signal || new AbortController().signal,
)
```

### 4.4 扩展层如何动态注册工具

在 `ExtensionAPI` 中，扩展可以通过 `registerTool` 方法动态添加工具：

```typescript
// src/extension/api.ts
export class ExtensionAPI {
  constructor(
    private toolRegistry: ToolRegistry,  // 持有同一个注册表实例
    private agent: Agent,
  ) {}

  /** 注册自定义工具 */
  registerTool(tool: AgentTool): void {
    this.toolRegistry.registerTool(tool)  // 直接委托给注册表
  }

  /** 注销工具 */
  unregisterTool(name: string): void {
    this.toolRegistry.unregisterTool(name)  // 直接委托给注册表
  }
}
```

这样，第三方插件就可以在运行时注册自己的工具，而 Agent 不需要做任何修改。

## 5. 运行与验证

```bash
# 1. 确认代码编译通过
cd /workspace
npm run build

# 2. 快速测试：写一个小脚本验证注册表功能
node -e "
const { ToolRegistry } = require('./dist/tools/registry.js');
const registry = new ToolRegistry();
console.log('注册表已创建');

// 注册一个简易工具
registry.registerTool({
  name: 'hello',
  description: '测试工具',
  parameters: {},
  execute: async () => ({ content: [{ type: 'text', text: 'Hello!' }] }),
});

console.log('已注册工具数:', registry.listTools().length);
console.log('查找 hello:', registry.getTool('hello')?.name);
registry.unregisterTool('hello');
console.log('注销后:', registry.listTools().length);
"
```

## 6. 小结

`ToolRegistry` 虽然只有不到 40 行代码，但它是整个工具层的核心基础设施。它通过注册表模式实现了：

- **O(1) 时间复杂度的工具查找**：使用 `Map` 而不是数组
- **运行时动态注册/注销**：扩展层可以实时添加工具
- **与 Agent 生命周期的集成**：构造时初始化，运行时按需查找
- **与 ExtensionAPI 的配合**：第三方插件可以注册自定义工具

### 思考题

1. `ToolRegistry` 使用 `Map<string, AgentTool>` 存储工具。如果改成 `AgentTool[]`，`getTool` 方法的时间复杂度会变成多少？在工具数量较多时会有性能问题吗？
2. 当前注册表允许同名工具被覆盖。如果希望禁止覆盖（即同名工具已存在时抛出异常），应该如何修改 `registerTool` 方法？
3. 在 `executeToolCalls` 中，如果 `getTool` 返回 `undefined`，Agent 会返回错误消息给 LLM。LLM 收到这个错误后通常会怎么做？这对 Agent 的鲁棒性有什么影响？

---

> ← [上一节](./README.md) · [下一节](./02-bash-tool.md) →
>
> [📚 返回章节首页](../04-tools-layer/README.md)