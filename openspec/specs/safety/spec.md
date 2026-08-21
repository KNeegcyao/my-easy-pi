# 安全与权限

## Purpose

定义 my-easy-pi 在执行 bash 工具前的权限校验路径,通过规则引擎分级评估命令风险,并在无确认通道时 fail-closed 拒绝,防止高危命令静默执行。

## Requirements

### Requirement: 命令风险分级
系统 SHALL 使用正则规则库把 bash 命令评估为 SAFE、NORMAL、DANGEROUS 三个风险等级。

#### Scenario: 危险命令识别
- **WHEN** 命令匹配强制删除(rm -rf)、sudo/su 提权、磁盘操作(mkfs/fdisk/dd)、远端执行(wget|curl 管道)等危险规则
- **THEN** 该命令被评估为 DANGEROUS

#### Scenario: 只读白名单识别
- **WHEN** 命令落在只读/无害白名单(ls、cat、head、grep、find、cd、echo 等)
- **THEN** 该命令被评估为 SAFE,无需确认

### Requirement: 复合命令聚合评估
系统 SHALL 把含换行 / && / || / ; / | 的复合命令拆段后逐段评估并聚合。

#### Scenario: 任一危险段提升整条
- **WHEN** 复合命令任一段评估为 DANGEROUS
- **THEN** 整条命令评为 DANGEROUS

#### Scenario: 控制流关键字剥离
- **WHEN** 命令段以 do / then / else / ( / ) / { 等独立 token 开头
- **THEN** 系统剥离这些控制流关键字后再评估真正命令,避免 `for...; done` 结构被误判

### Requirement: 确认与白名单
系统 SHALL 仅对非 SAFE 的 bash 命令请求用户确认,并在同一会话内记住已批准命令。

#### Scenario: 交互确认
- **WHEN** TTY 环境遇到一条 NORMAL 或 DANGEROUS 命令且尚未批准
- **THEN** 系统通过注入的 confirm 回调请求确认
- **AND** 用户确认后该命令加入会话内 approved 集合,本次会话内不再重复询问

#### Scenario: 用户拒绝
- **WHEN** 用户在确认回调中拒绝一条命令
- **THEN** 该工具调用被阻止,失败原因写入历史并标记 isError

### Requirement: 失败闭合
无可用确认通道时,系统 SHALL 拒绝非安全命令以防止静默执行。

#### Scenario: 非交互环境自动拒绝
- **WHEN** 非 TTY 环境且未注入 confirm 回调
- **THEN** 系统返回阻止结果并注明"非交互环境,已自动拒绝",绝不静默执行

#### Scenario: 无确认通道自动拒绝
- **WHEN** 已有确认通道缺失,confirm 回调为空
- **THEN** 系统同样拒绝命令,避免静默执行高危操作