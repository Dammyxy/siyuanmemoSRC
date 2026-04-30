# ADR-002 SQL Worker Authority

- Status: Accepted
- Date: 2026-04-30

## Context

上游内核插件系统（PR #17487）未提供 SQLite/database API。`siyuan.storage.put` 为字符串文件写入，不适合作为 SQL 热路径。

## Decision

`SrsBackendWorker` 成为 `siyuanmemo.db` 唯一 owner：

1. SQL 计算、事务、导出在 Worker 内执行。
2. 主线程仅作为 `readBinary/writeBinary` 持久化桥。
3. `kernel.js` 与 UI 不直接读写 `siyuanmemo.db`。

## Consequences

- 消除 DB ownership 双写风险。
- Worker 不可用时返回 explicit unavailable，不做隐式 fallback 双写。
- 后续 Review/Queue/Scheduler 迁移以 Worker 事务边界为唯一正式写路径。
