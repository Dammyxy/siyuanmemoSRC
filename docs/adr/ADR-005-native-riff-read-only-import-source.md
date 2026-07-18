# ADR-005: Native Riff 退役为只读显式导入源

> Series: Legacy DDD（已冻结）。权威状态见 [Architecture Decision Registry](../ADR-INDEX.md)。

## 状态

已接受（2026-07-10）

## 背景

SiYuanMemo 已拥有卡片身份、调度、复习历史和 Browser membership，但 Native Riff 仍通过启动/增量/全量同步、事务监听、checkpoint、blacklist、删除同步和评分回写形成第二套生命周期。该结构让 Riff 元信息缺失直接影响 Review 渲染，也让普通卡片路径承担不再需要的双向对账复杂度。

## 决策

Native Riff 只保留为 **Native Riff Read-Only Import Source**：

- 只有用户显式触发的 preview/apply 导入可以读取 Native Riff。
- SiYuanMemo 不再向 Native Riff 添加、删除或评分卡片。
- 插件启动、Browser/Review 打开、定时器和 Native Riff transaction 不触发扫描或同步。
- 新卡可一次性继承有效 Native Riff 当前调度快照；导入后调度永久归 SiYuanMemo。
- 已有 `riff-managed` 卡通过显式领养原地转为 `local-owned`，保留本地身份、调度和复习历史，并从实时块 Markdown 重建语义与渲染契约。
- tombstone 与 legacy blacklist exclusion 默认阻止重新导入；恢复必须显式执行。
- 只读 import receipt 仅用于去重和诊断，不表示 ownership 或活连接。

## 后果

- 删除持续同步、full reconcile、checkpoint、transaction handlers、Riff write/feedback bridge、同步设置和 blacklist runtime。
- 显式导入与已有卡修复保持分离；普通导入不修改已有 `local-owned` face。
- Native Riff 仍可由用户在思源原生功能中独立使用，SiYuanMemo 不干涉。
- 这是 breaking integration change；不保留旧同步兼容双路径。

## 替代方案

- 保留可选双向同步：拒绝。即使默认关闭，仍需维护完整 reconciliation implementation。
- 保留单向 transaction 导入：拒绝。离线补偿、删除语义和监听生命周期仍会重新形成持续同步。
- 将完整同步移入独立包：拒绝。当前产品目标不再需要双向 Native Riff integration。
