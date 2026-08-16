# docs/ 变更日志

## 2026-08-16
- 改名：教学文档项目名全面统一为 `my-easy-pi`（51 篇文档，235 处 `piagent` → `my-easy-pi`）
- 改名：存储路径 `~/.piagent/` → `~/.my-easy-pi/`、Docker 镜像 `piagent-sandbox` → `my-easy-pi-sandbox`
- 改名：CLI 命令示例 `piagent -m/-p/--rpc` → `my-easy-pi -m/-p/--rpc`、`npx piagent` → `npx my-easy-pi`
- 改名：扩展导入 `import ... from 'piagent'` → `from 'my-easy-pi'`
- 同步：`package.json` / `package-lock.json` name 改为 `my-easy-pi`；源码可见字符串（帮助、banner、thinking、systemPrompt）同步改名

## 2026-08-09
- 同步：文档与代码对齐（Phase 5 TUI 全屏渲染器已完成）
- 重写：07-interface-layer/04-tui.md 跟进 `src/tui/` 新框架（Component/TUI 契约、双渲染器、渲染管线，配 Mermaid 架构图）
- 更新：README.md 测试徽章 49→347、项目结构补 `src/tui/`、TUI 特性改为已完成
- 更新：01-before-start/03-project-structure.md 目录树补 `src/tui/`、测试结构（31 文件 347 用例）
- 修正：04-tools-layer/README.md 将 `web_fetch` 归为自定义工具教学案例（非内置工具，内置仍为 7 个）

## 2026-08-08
- 新增：全部 10 章学习文档（共 ~45 篇）
- 新增：docs/README.md 学习路线图
- 新增：docs/MAINTENANCE.md 文档维护指南
- 新增：docs/CHANGELOG.md 变更日志

## 2026-08-10
- 改进：README.md 添加「📖 学习指南」章节表入口
- 改进：docs/README.md 更新为 GitHub 学习仓库风格布局
- 新增：所有文档底部添加上一节/下一节导航链接
- 增强：07-interface-layer print 模式文档（160→412行）增加时序图、对比表、FAQ
- 增强：07-interface-layer json 模式文档（143→411行）增加架构图、jq 实战、CI/CD 最佳实践
- 增强：05-session-layer README（99→214行）增加双架构图、JSONL/树/压缩概念详解
- 增强：07-interface-layer README（174→252行）增加四模式对比表、选择指南
- 增强：10-advanced-topics README（95→176行）增加依赖图、原则说明
- 增强：08-config-and-sandbox README（31→264行）从骨架扩充为完整章节概览
- 增强：04-search-tools 增加 grep/find 对比表、通配符正则入门、FAQ
- 增强：01-environment-setup 增加 14 条故障排除表
- 增强：02-retry-mechanism 增加 3 个实战场景（含 429 时序图）
- 增强：03-agent-loop 增加 AgentState 全生命周期变化表
- 增强：06-extension-layer API 和 Loader 文档增加手机 App 类比、时序图、容错流程图