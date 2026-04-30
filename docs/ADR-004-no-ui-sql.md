# ADR-004 No UI SQL

- Status: Accepted
- Date: 2026-04-30

## Context

UI/Application 层历史上存在 SQL 直连与 sqlite repository 依赖。迁移期需要边界护栏，防止新增路径继续扩散。

## Decision

新增边界检查脚本并接入 `check:boundaries`：

1. `scripts/check-no-ui-sql.cjs`
2. `scripts/check-no-kernel-db-owner.cjs`

规则：

- `src/ui/**` 禁止 SQL/sqlite 直连。
- `src/application/**` 禁止新增 SQL/sqlite 直连，迁移期仅允许显式遗留白名单。
- `kernel.js` 禁止接触 `siyuanmemo.db` 或 `/api/file/{getFile,putFile}`。

## Consequences

- 新增代码会被持续阻断，避免回到旧 ownership。
- 遗留白名单可随迁移 phase 逐步收窄，最终实现纯 Worker SQL authority。
