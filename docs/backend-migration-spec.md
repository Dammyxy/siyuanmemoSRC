# SiYuanMemo 后端迁移 Spec / 施工计划

## Summary

适合写 spec，但不适合写成一个巨型 spec。采用：

- 1 个 umbrella spec：`UI Shell + SRS Backend Worker + Kernel Sidecar` 总边界。
- 多个施工 spec：每个 spec 只覆盖一个可验证里程碑。
- 第一施工目标：先完成 `Phase 0-1`，即边界 ADR / 检查脚本 / Worker 后端骨架，不直接迁 Review 热路径。

当前默认施工 worktree：

`H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0`

该 worktree 已有 kernel companion P0 与未提交 RPC params 修复。施工 AI 必须保留这些改动，先验证并纳入基线，不 reset。

上游依据需每轮复核：

- SiYuan PR #17487 本地摘要: `docs/UPSTREAM_PR_17487_SUMMARY.md`
- `kernel.d.ts`: H:/project-F/flashcard/资料/kernel.d.ts

## Key Changes

- Runtime ownership：
  - UI 主线程只保留 Vue / Protyle / Dialog / Tab / Dock / view cache。
  - `SrsBackendWorker` 成为唯一 `sql.js` / `siyuanmemo.db` owner。
  - `kernel.js` 只做 sidecar：writer lease、事件收集、host API batch proxy、network proxy、private HTTP facade。
  - kernel 不写 canonical DB，不保存 cards / review_events / queue_state / AI sessions。

- New contracts：
  - `packages/contracts/src/backend-rpc.ts`：Worker command/query envelope、`MutationResult`、revision、changed set。
  - `packages/contracts/src/kernel-rpc.ts`：kernel health、capabilities、writer lease、broadcast event DTO。
  - `packages/domain/src/*`：纯领域类型，禁止 Vue / Siyuan / sql.js import。
  - `src/application/clients/SrsBackendClient.ts`：UI/application 调 Worker 唯一入口。
  - `src/application/clients/KernelSidecarClient.ts`：扩展现有 `KernelCompanionPort`，仍由 `SiyuanKernelCompanionAdapter` 统一访问 `/api/plugin/rpc/*`。

- Phase 0 first：
  - 写 `docs/ADR-001-runtime-split.md`、`ADR-002-sql-worker-authority.md`、`ADR-003-kernel-sidecar-coordinator.md`、`ADR-004-no-ui-sql.md`。
  - 新增 `scripts/check-no-ui-sql.cjs`、`scripts/check-no-kernel-db-owner.cjs`，并接入 `check:boundaries`。
  - 规则锁死：`src/ui/**` 和 `src/application/**` 不 import `sql.js` / sqlite repository；`kernel.js` 不读写 `siyuanmemo.db`。

- Phase 1 first：
  - 新增 `worker/index.ts`、`worker/bootstrap/BackendKernel.ts`、`worker/db/SqliteDatabaseService.ts`、`worker/db/SqlitePersistenceBridge.ts`。
  - 从现有 `SqliteDatabaseService` 迁出 CPU/SQL/export 逻辑；主线程只做 `FileService.readBinary/writeBinary` bridge。
  - `ApplicationContext` 暂时保留旧 SQL path，但新增 feature-flagged Worker bootstrap；不改 Review/Browser 行为。
  - Worker 提供 `system.health`、`db.load`、`db.persist`、`diagnostics.status`，并返回 explicit unavailable/error envelope。

- Later specs：
  - Phase 2：Browser `getDeckPage/getStats/getMatchedIds/source-existence` 迁 Worker。
  - Phase 3：Review / Queue / Scheduler `review.feedback` 单事务迁 Worker。
  - Phase 4：kernel writer lease，多窗口 single-writer。
  - Phase 5：Transaction / AutoCard / Riff：kernel 收集，Worker 决策提交。
- Phase 6（historical target）：Progressive / Xiuyuan / Topic-derived 迁 Worker。
- P6（current execution in this branch）：AutoCard decision/execute writer+worker ownership milestone。旧 Phase 6 Progressive/Xiuyuan/Topic-derived 迁移改为 closure backlog，详见 `docs/backend-migration-p6-scope-reconciliation.md`。
  - Phase 7（historical target）：AI session 入 Worker，network/streaming 走 kernel proxy。
  - Phase 7（current release truth）：foundation-only（contracts/session-job scaffolding/diagnostics），prompt runtime 仍未完成 backend prompt/network/streaming cutover；详见 `docs/backend-migration-phase7-truthfulness.md`。
  - Phase 8：private HTTP API，经 writer relay 调 Worker。
  - Phase 9：删除旧前端 SQL / scheduler / review commit 主路径。

## Test Plan

- 每个生产代码阶段最低跑：
  - `pnpm run check:boundaries`
  - `pnpm build`
  - `git diff --check`

- Phase 0 focused checks：
  - `node scripts/check-no-ui-sql.cjs`
  - `node scripts/check-no-kernel-db-owner.cjs`
  - grep 确认 `sql.js` 只允许在 diagnostics、tests、worker 或临时 allowlist。

- Phase 1 focused tests：
  - Worker RPC health/status 测试。
  - `SqliteDatabaseService` worker 版 load existing `siyuanmemo.db`。
  - binary persist bridge 使用 transferable `ArrayBuffer`，主线程只写文件。
  - persist 失败恢复为 explicit error，不默默 fallback 双写。

- Acceptance：
  - Phase 1 完成后，功能行为不变。
  - Worker 可加载/保存 DB。
  - UI 主线程没有新增 SQL owner。
  - kernel capabilities 仍报告 `writesSiyuanMemoDb: false`。
  - `ARCHITECTURE.md` 和 `docs/DDD_RESCAN_BACKLOG.md` 同步更新。

## Assumptions

- 不把 SQL 放进 kernel；当前 PR 17487 未提供 SQLite/database API。
- 不用 `siyuan.storage.put` 模拟数据库热路径。
- 默认先桌面平台：`windows/linux/darwin`。
- 不做隐藏 fallback。Worker 或 kernel 不可用时返回 explicit unavailable。
- 施工 AI 每个 phase 必须更新对应 spec/plan 状态；生产 `src/` 改动必须追加 `DDD_RESCAN_BACKLOG.md` task delta。
