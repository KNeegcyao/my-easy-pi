# my-easy-pi 开发约定

> 本文档是项目的**强制开发协议**。任何 agent（含 Claude Code）在此仓库内工作都必须先读这里。
> 定位：教学向 TypeScript AI Coding Agent。分层即源码目录，见 `docs/` 10 章。

## 开发标准流程：Spec-Driven Development（MUST）

本项目把 **OpenSpec** 定为需求的标准流程。**"先对齐规格，后写代码"是硬性要求**，不是建议。

### 铁律（HARD RULES）

1. **任何有意义的 feature 必须先有 change**：创建并完成 OpenSpec change（`proposal → specs → design → tasks`），通过 review 后才动代码。点击式描述性需求、纯 bug 修复、纯文档/工具改动可走轻量路径，但需在 PR/提交说明里注明。
2. **Human gate 在 spec，不在代码**：需人工审的是 `openspec/changes/<name>/proposal.md` 与 `specs/` 的 delta spec（Markdown）。review 过关后才进入 apply。
3. **spec 是唯一事实源**：需求只存于 `openspec/specs/` 与进行中的 change；不得把隐藏需求塞进 chat 历史。改行为 = 改 spec。
4. **严禁绕过 change 直接改写已归档的主规格** `openspec/specs/**/spec.md`。改动必须带 change，archive 时由工具合并。

### 流程口令

```
/opsx:explore   需求不明确时先做思考伴侣（读代码、权衡方案、先不写码）
/opsx:propose   生成 openspec/changes/<name>/（proposal/specs/design/tasks）
（人工 review 关卡）审 proposal 与 spec，通过后再继续
/opsx:apply     按 tasks 实现，每完成一项勾选 checkbox
/opsx:sync      把 delta spec 同步到主规格（不归档时）
/opsx:archive   完成并归档，delta 合入主规格
```

### 命令（CLI）

```bash
openspec new change "<kebab-name>"      # 建 change
openspec status --change "<name>" --json # 查 artifact 构建顺序/完成度
openspec instructions <artifact> --change "<name>"  # 取该 artifact 的写作规范
openspec validate --all                  # 校验 specs + changes
openspec archive "<name>" --yes          # 归档并更新主规格
```

## 2. 规格书写约定

- 只用可观测行为；内部类名、库选型、实现步骤进 `design.md`，不进 spec。
- 用 **SHALL**（规范）；需求以 `### Requirement:` 开头，场景必须以 `#### Scenario:`（**恰好 4 个井号**），用 WHEN/THEN。
- 每个 Requirement 至少一个 Scenario。无法触发的行为不入 spec。
- 新能力 delta 以 `## Purpose`（≥50字符）开头；存档会自动生成主规格 Purpose。

## 3. 工程约束（不可漂移）

- Node >= 20，ESM，TS strict；`npm run build`(tsc)、`npm test`(vitest, 371 用例)。
- 零 runtime 框架依赖。分层即目录：src/{cli,config,ai,agent,tools,sandbox,session,extension,interface,tui}。
- 依赖注入优先：Operations、ToolRegistry、confirm 回调均构造注入。
- 内置工具 **7** 个：bash/read/write/edit/grep/find/ls；providers：deepseek/anthropic/openai。
- 详细架构约定见 `openspec/config.yaml#context`（AI 起草 spec 时的 SME）。

## 4. 现状口径（baseline）

- 内置工具 7 个；输出模式 print/json/rpc；配置 ~/.my-easy-pi/config.json；会话 ~/.my-easy-pi/sessions/。
- 扩展机制：启动扫描 `.pi/extensions/` 与 `~/.my-easy-pi/extensions/`，扩展可注册工具与命令（命令支持 `/命令名` 与首词精确触发两种入口）。

## 5. 运行与验证

```bash
npm run build && npm test        # 类型 + 全量测试
openspec validate --all           # 规格完整
```

改完代码必须全量跑 `npm test` 确认无回归，并推 SPEC 与代码同一次提交。