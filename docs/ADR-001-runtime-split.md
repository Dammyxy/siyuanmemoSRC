# ADR-001 Runtime Split

- Status: Accepted
- Date: 2026-04-30

## Context

SiYuanMemo 当前运行时把 UI、应用编排、SQL 持久化与宿主事件能力集中在浏览器主线程。主线程压力与多窗口一致性风险持续增大。

## Decision

采用三层运行时模型：

1. `UI Shell`：Vue / Dialog / Tab / Dock / view cache。
2. `SrsBackendWorker`：唯一 SQL owner，承接数据库与核心后端命令。
3. `Kernel Sidecar`：`kernel.js` 常驻协调层，负责 RPC/事件/代理，不写主 DB。

## Consequences

- UI 主线程职责收敛，减少 SQL/事务热点。
- `kernel.js` 不再承担主数据写入，避免双写 ownership。
- 后续迁移按 phase 推进，不一次性改动全部 Review/Browser 主链。
