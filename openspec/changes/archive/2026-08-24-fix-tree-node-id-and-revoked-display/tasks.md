# 修复 /tree 节点 id 撞名 与 撤回节点未标记 — 任务清单

## 1. getTree 改造

- [x] 1.1 shortId 改取 id 末段（counter+时间戳尾），保证节点间唯一
- [x] 1.2 增加 isRevoked 字段，透传 revoked 状态

## 2. host 渲染

- [x] 2.1 撤回节点用灰色 + (已撤回) 前缀，与活跃节点视觉区分

## 3. 测试与验收

- [x] 3.1 单测：同秒创建的消息 shortId 互不相同
- [x] 3.2 单测：isRevoked 正确反映 revoked
- [x] 3.3 全量 npm test 无回归

## 4. 收尾

- [x] 4.1 openspec validate 通过
- [x] 4.2 归档 change