# 扩展命令调用入口

## Why

扩展机制当前只有**注册面**没有**调用面**:`ExtensionAPI.registerCommand` 已实现,但交互式会话/CLI 从不消费 `listCommands` / `getCommand`,扩展注册的自定义命令形同虚设。补齐调用入口,让扩展命令真正可被用户执行,闭合"扩展命令"这条端到端链路。

## What Changes

- 新增**扩展命令能力规格**(此前该能力在基线 `specs/README.md` 标为"待建")。
- 在 print/interaction 交互路径中消费扩展注册的命令:用户键入的命令若命中扩展命令名,则执行其 `execute(args)` 并展示结果。
- `listCommands` 提供一个可见入口(如帮助/`/commands`)。
- 未注册命令走既有未知输入处理,不产生行为回归。

## Capabilities

- **New Capabilities**
  - `extension` — 覆盖扩展注册命令的注册面与调用面契约。

- **Modified Capabilities**
  - (none)

## Impact

- 代码:`src/cli.ts`(交互循环)、`src/interface/print.ts` 或交互输入处理处、`src/extension/api.ts`(如需暴露命令执行返回)。
- 测试:`tests/unit/extension/**`、`tests/unit/cli/**`。
- 依赖:无新增 runtime 依赖(沿用现有 readline/交互通道)。
- 兼容:纯增量,不影响既有的 7 内置工具与模型调用路径。