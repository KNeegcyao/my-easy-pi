# my-easy-pi 能力缺口审计（OpenSpec）

> 状态：**审计报告** · 方式：`src/` 分层 vs `openspec/specs/` 能力基线的覆盖对照
> 依据：全量扫描 + `openspec list --specs` / `openspec validate --all`
>
> ⚠️ **评估基准**：本仓库为**教学项目**（受众：初学者/大学生）。目的是知识完整 + 有亮点 + 不过度复杂。
> 因此"风险/不足"一律以**教学价值**为标杆判定，不套用生产级健壮性/安全/性能标准。
> 一条代码只有满足「让学习者更懂原理」或「消除实现与注释不符的误导」才值得改；纯健壮性优化大多标为"进阶思考"。

## 总结

**9 个能力全部已建立主规格基线**,`openspec validate --specs` 全通过（9 passed / 0 failed）。
覆盖性缺口已补齐；下方「教学视角」重估此前阶段可能的清单，供授课取舍。

## 一、能力覆盖对照（src/ ↔ specs/）

| src/ 分层 | 对应能力规格 | 覆盖 |
|-----------|------------|------|
| `src/agent/` | `specs/agent`（5 需求） | ✅ |
| `src/tools/` | `specs/tools`（4 需求） | ✅ |
| `src/session/` | `specs/session`（5 需求） | ✅ |
| `src/ai/` | `specs/ai`（3 需求） | ✅ |
| `src/agent/permission.ts` | `specs/safety`（4 需求） | ✅ |
| `src/cli.ts` + `src/config/` | `specs/cli`（4 需求） | ✅ |
| `src/interface/` + `src/tui/` | `specs/interface`（3 需求） | ✅（本次补齐） |
| `src/sandbox/` | `specs/sandbox`（5 需求） | ✅（本次补齐） |
| `src/extension/` | `specs/extension`（2 需求） | ✅（Phase 1 试点） |

## 二、本审计补齐项

1. **输出接口与交互**（`specs/interface/spec.md`,新）— print / json / rpc 三模式 + TUI 全屏交互契约。
2. **沙箱执行**（`specs/sandbox/spec.md`,新）— 可用性探测 / 镜像就绪 / 受限执行（资源约束）/ 就地回退 / 结果契约。

## 三、教学习视角下的取舍（生产级"不足"→ 教学判定）

| 条目 | 描述 | 教学判定 |
|------|------|---------|
| retry 固定指数退避（无 jitter） | 1s→2s→4s | ✅ **保持**：模式清晰易学；jitter 标为「进阶思考」 |
| SSE 仅单行 data 解析 | 简化解析器 | ✅ **保持**：主流 provider 均适配；多行事件标「进阶」 |
| max_tokens 硬编码 8192 | 一个常量 | ✅ **保持**：比配置注入更易懂 |
| API key 明文落 config.json | 用户全局配置 | ⚠️ 可接受，建议在注释补一句「生产应加密/用 Secret Manager」 |
| 权限规则仅匹配命令开头 | 正则起始锚定 | ⚠️ 教学可接受；适合在注释说明「间接执行(shell 管道)是已知盲区」 |
| `src/interface/tui/index.ts` 标注 deprecated | TUI 旧实现残留 | 🟡 **建议**：删除旧副本，避免双实现分叉误导学习者 |
| 压缩策略只用截断 | 注释曾称"LLM 摘要" | ✅ **已修**：消除措辞与实现不符，并把"几种压缩策略"作为讲解点 |

> 原则：**让学习者理解取舍 > 堆功能**。多数"生产优化"只进注释/进阶思考，不进教学主体。

## 四、复跑方法

```bash
openspec validate --all     # 规格合法性
openspec list --specs       # 能力与需求数
```
对照 `src/` 目录与 `specs/` 清单核对覆盖;新能力/变更一律走 `openspec change`。

---
*审计完成：补齐能力规格，并以教学定位重估取舍。所有变更仅在本地，未 commit/push。*