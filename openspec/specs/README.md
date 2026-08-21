# 能力基线规格 (main specs)

本目录是 my-easy-pi **当前系统能力的主规格**(单一事实源)。每个 `specs/<capability>/spec.md`
描述项目"当前应满足"的可观测行为。所有后续 OpenSpec change 的 delta specs 在归档时合并回这里。

## 能力清单

| 能力 | 路径 | 对应源码层 | 状态 |
|------|------|-----------|------|
| Agent 循环 | `agent/spec.md` | `src/agent/` | 基线 |
| 工具层 | `tools/spec.md` | `src/tools/` | 基线 |
| 会话与持久化 | `session/spec.md` | `src/session/` | 基线 |
| 安全与权限 | `safety/spec.md` | `src/agent/permission.ts` | 基线 |
| AI 提供商层 | `ai/spec.md` | `src/ai/` | 基线 |
| CLI 与配置 | `cli/spec.md` | `src/cli.ts`、`src/config/` | 基线 |
| 输出接口与交互 | `interface/spec.md` | `src/interface/`、`src/tui/` | 基线 |
| 沙箱执行 | `sandbox/spec.md` | `src/sandbox/` | 基线 |
| 扩展机制 | `extension/spec.md` | `src/extension/` | 基线 |

## 验收判据(Criteria)在哪

本 schema 不设独立 criteria 文件;每个 **Requirement** 下的每个 **`#### Scenario: <名字>`** 即该需求的验收判据。
状态合计规则:
- 一个 Requirement 的全部 Scenario 通过 → 该 Requirement 满足
- 一个 capability 的全部 Requirement 满足 → 该能力在规格层面达成

若要新增/修改能力,一律走 change:`openspec change` 新建,参照 `config.yaml` context 与这里的主规格起草 delta spec。

## 维护约定

- 只描述可观测行为;内部类名、库选型、实现步骤进 design.md,不进 spec。
- 用 SHALL 表述规范性要求。
- 每一个 requirement 至少一个 scenario。
- 删除/改需求必须带对应 change,禁止绕过 change 直接改主规格。