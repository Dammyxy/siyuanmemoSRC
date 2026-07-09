## 1. Characterization

- [x] 1.1 Read current Xiuyuan startup sync tests and identify the existing full/incremental startup paths.
- [x] 1.2 Add focused characterization for startup full and incremental registry jobs before refactor.
- [x] 1.3 Add a cancellation characterization that proves current coarse handler cannot stop before an inner phase once started.

## 2. Startup Lifecycle Module

- [x] 2.1 Add a narrow Xiuyuan startup sync lifecycle Module or internal runtime with phase diagnostics.
- [x] 2.2 Route startup full sync through the staged lifecycle without changing manual full sync.
- [x] 2.3 Route startup incremental sync through the staged lifecycle while preserving `source: 'startup'` and `persistIdleCheckpoint: false`.
- [x] 2.4 Check `KernelCompanionBackgroundWorkRunContext.isCanceled()` between scan, plan, apply, and checkpoint/finalization phases.
- [x] 2.5 Preserve explicit unavailable/fail-closed behavior when backend authority is required.

## 3. XiuyuanSyncService Depth

- [x] 3.1 Apply the deletion test to startup helper code inside `XiuyuanSyncService`.
- [x] 3.2 Move only cancellation/diagnostic/phase knowledge that earns Depth into the startup lifecycle Module.
- [x] 3.3 Keep existing Xiuyuan sync planner/apply runtime ownership intact.

## 4. Documentation And Validation

- [x] 4.1 Update `CONTEXT.md`, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred startup lifecycle debt.
- [x] 4.2 Run focused Xiuyuan sync lifecycle and registry tests.
- [x] 4.3 Run hidden-fallback and boundary checks.
- [x] 4.4 Run `openspec validate deepen-xiuyuan-startup-sync-lifecycle --strict`.
- [x] 4.5 Run `git diff --check` and `pnpm build`.
