# OpenSpec × superpowers — Spec-Driven Development 集成方案

> 状态：**已实施** · 定位：将 SDD 确立为 `my-easy-pi` 的**开发标准流程**
> 关联：与 `docs/README.md` 分层结构并列，属于"研发过程"而非"系统某层"的教学内容。
>
> **实施进度**
> - ✅ **Phase 0** — OpenSpec 初始化完成（`openspec init --tools claude`，spec-driven schema）
> - ✅ **基线规格** — 能力主规格建立：agent / tools / safety / session / ai / cli（`openspec/specs/`），项目上下文入 `openspec/config.yaml#context`
> - ✅ **Phase 1 试点** — 「扩展命令调用入口」走完 propose→review→apply→test→archive，已合入主规格
> - ✅ **Phase 2 固化** — 项目根 `CLAUDE.md` 将 SDD 定为强制开发协议

## 1. 背景与目标

当前 `pi-agent`（my-easy-pi）的开发引导主要依赖 harness 层注入的 **superpowers** 技能集
（brainstorming / planning / TDD / code-review 等），它们解决的是 **"怎么做"** 的问题：
拆解思路、规划步骤、先写测试、评审变更。

但 **"做什么 / 为什么做"** 仍然散落在会话记录里：
- 需求只存在于 chat history，跨会话即丢失；
- 没有一份可审查、可追溯的"需求基线"，AI 和人的对齐靠来回追问；
- 每个 feature 缺统一的落地模板，产物形态漂移。

**本方案目标**：引入 OpenSpec（`@fission-ai/openspec`）作为**规格层**，让"先对齐、后编码"
成为标准流程；同时把它与 superpowers 的工程质量 skill 串联成一条完整流水线。

OpenSpec 与 superpowers 是**互补而非替代**：

| 维度 | superpowers（已有） | OpenSpec（拟引入） |
|------|--------------------|--------------------|
| 回答的问题 | 怎么做（流程） | 做什么 / 为什么（需求基线） |
| 产物 | skill / agent 指令 | `openspec/` 下可审查的 markdown 工件 |
| 持久性 | 会话内形态 | **跨会话、进 git** 的单一事实源 |
| 触发方式 | harness 注入的 skill | `/opsx:*` slash commands + CLI |

## 2. OpenSpec 核心心智模型

OpenSpec 基于 `openspec/` 目录结构管理"规格与变更"：

```
openspec/
├── project.md            # 项目级规格（必要能力）
├── specs/                # 已定稿规格（系统当前应满足什么）
│   └── <capability>.md
├── criteria/             # 验收判据（场景驱动）
└── changes/              # 进行中的一次变更（一个 feature 一个文件夹）
    ├── <feature-name>/
    │   ├── proposal.md   # WHY / WHAT（人类可读、好审查）
    │   ├── specs/        # 变更引入的 spec delta（MARK vs ADDED）
    │   ├── design.md     # 技术落点
    │   └── tasks.md      # 可执行 checklist
    └── archive/          # 已合并的历史变更
```

核心产物是**纯 Markdown**，无 schema 学习成本：

```markdown
## ADDED Requirements
### Requirement: 主题切换
- The app SHALL 允许用户在深浅主题间切换，默认跟随系统偏好。
- **WHEN** 用户点击切换控件
- **THEN** 应用切换主题并持久化选择
```

工作流：**propose（产生工件）→ review spec（人对齐）→ apply（AI 按 spec 实现）→ archive（归档，spec 成为活文档）**。

## 3. 角色划分与串联方式

在 `pi-agent` 里把它们接成一条流水线：

```
1. 需求不明确
   └→ superpowers:brainstorming        # 澄清意图（怎么做之前先搞清要什么）
2. openspec /opsx:propose <id>          # 生成 openspec/changes/<id>/ 工件
   └→ 产出 proposal / specs / design / tasks（AI 起草）
3. 【人工 review 关卡】                 # 审spec，不审代码；不合意就改spec
   └→ 达成基线后才能进编码
4. superpowers:planning + TDD           # 在 tasks 上跑既有流程：先写测试→实现→重构
5. openspec /opsx:apply                 # AI 按对齐后的 spec 实现任务
6. superpowers:code-review / verify     # 评审 + 验证"实现了"也"做对了"
7. openspec /opsx:archive               # 归档变更，规格更新为"当前事实"
```

原则：
- **Human gate 在 spec，不在代码** —— 需审查的是"我们要建什么"的 Markdown，
  只在不可控时审查编码；
- **spec 是唯一基线** —— chat history、口头补充都收敛进 `openspec/`，不另开"隐藏需求"；
- **每个 feature 独立目录** —— 一个变更一处集中，不再拆散在多个文件里。

## 4. 落地步骤（分阶段，建议先从真实 feature 试点）

### Phase 0 — 初始化（一次性）✅
```bash
npm install -g @fission-ai/openspec@latest
cd /Users/lingyu/AIStudy/piagent
openspec init --tools claude   # 生成 openspec/ + Claude Code slash commands（spec-driven schema）
```
注意：`openspec init` 会向仓库写入 agent 指令与命令映射到 `.claude/skills` 与 `.claude/commands/opsx`；提交前先查看写入的文件是否与既有配置冲突（如 `settings.local.json`）。

### Phase 1 — 单 feature 试点（验证手感）✅
在真实 feature「扩展命令调用入口」上走完整 `propose → review → apply → test → validate → archive`，
验收结论：
- 人类在 spec 阶段能**无代码地**审清需求；
- tasks 可被既有 TDD 直接消费；
- 复盘：对比"无 OpenSpec vs 有 OpenSpec"的对齐成本与返工率。

### Phase 2 — 固化为标准流程 ✅
- 已创建项目根 `CLAUDE.md`，将 SDD 定为**强制开发协议**（铁律、流程口令、规格书写约定、工程约束）；
- 已把本文件与规格体系说明并入 `docs/README.md` 索引。

## 5. 风险与对策

| 风险 | 对策 |
|------|------|
| 过度流程化，反噬 small 改动 | 只对"有意义的 feature"走 SDD；单行/纯 bug 修复走轻量流程 |
| spec 与代码漂移 | archive 后由 verify 环节归因，spec 必须再过一遍 review |
| 依赖引入会污染教学 repo | OpenSpec 为 dev 流程；核心 agent 逻辑仍零 runtime 依赖 |
| 与既有 superpowers 重叠 | 用 caps 表划界（第二节），避免两套"流程"打架 |

## 6. 明确不做（YAGNI）

- 不上 `openspec` 的 *Stores*（跨仓库团队同步，beta 阶段、单 repo 用不到）；
- 不为 `pi-agent` 内置 spec 引擎，只把它当**开发工作流**，不做成产品 feature；
- 不定义自己的 DSL，沿用纯 Markdown 工件。

## 7. 决策记录

- [x] `openspec init` 使用 **Claude Code** 目标（`--tools claude`，spec-driven schema）
- [x] 首个 SDD 试点 = **「扩展命令调用入口」**，已走完整流程并归档
- [x] specs 纳入项目 `docs/` 教学路线,作为「研发流程」章节（见 `docs/README.md`）

---
*实施完成：以上为最终状态。所有变更仅存本地,提交/推送前另行确认。*