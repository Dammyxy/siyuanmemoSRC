## Context

Kernel Companion Background Work now provides the application/backend-client lifecycle Module for long maintenance jobs. Review truth backfill and kernel transaction action polling already submit jobs through the shared registry. Xiuyuan startup sync still uses a shallow background helper that starts a Promise and logs errors.

Xiuyuan startup sync must remain a Xiuyuan/backend sync concern. The registry should only own lifecycle visibility, cancellation state, shutdown defer/cancel semantics, and late-result suppression.

## Goals / Non-Goals

**Goals:**
- Submit startup full sync as `xiuyuan-startup-sync` when full sync is due.
- Submit startup incremental sync as `xiuyuan-startup-sync` when plugin-start incremental sync is enabled.
- Keep startup non-blocking.
- Keep startup incremental request shape unchanged, including `source: 'startup'` and `persistIdleCheckpoint: false`.
- Share the same registry instance exposed by `SrsBackendClient` when backend runtime is available.
- Defer accepted jobs and cancel running jobs through existing registry shutdown/service-stop behavior.

**Non-Goals:**
- No scheduler, Riff/card write, SQLite write, msgpack truth, or backend sync ownership moves into the registry.
- No manual sync behavior change.
- No durable registry persistence.
- No kernel RPC status endpoint.
- No fallback, degrade, compat, or dual-path behavior for backend unavailability.

## Decisions

1. **Registry owns lifecycle only.**
   - `XiuyuanSyncService.start()` submits the chosen startup sync to the registry.
   - `fullSync()` and `incrementalSync()` continue to execute the actual sync.
   - Alternative rejected: moving sync planning into the registry. That would make the lifecycle Module a write owner.

2. **Preserve startup ordering.**
   - `migrateLegacyCardTypeAttrsOnce()` still completes before startup sync job submission.
   - Alternative rejected: putting legacy migration inside the registry job. It is still an initialization prerequisite, not a long background job.

3. **Use the shared application registry when available.**
   - `ApplicationContext` passes `srsBackendClient.getBackgroundWorkRegistry()` through the AutoCard/Xiuyuan service bundle.
   - If backend runtime is unavailable, `XiuyuanSyncService` keeps a private registry so the service contract remains explicit.
   - Alternative rejected: a hard backend-client dependency for Xiuyuan startup. Local sync paths still exist and should not require backend runtime construction.

4. **Cancellation is cooperative lifecycle state.**
   - Accepted jobs are deferred by registry shutdown before their handler runs.
   - Running jobs are canceled in registry state on shutdown/service stop.
   - Already-issued backend/SiYuan writes are not claimed to be physically interrupted.

## Risks / Trade-offs

- Running startup sync may still finish backend writes after service stop; the registry suppresses late completion state but cannot undo writes already issued.
- Sharing the registry means backend-client shutdown can defer Xiuyuan startup jobs too; this is intended during unload because all long maintenance should quiesce.
- Diagnostics are in-memory only; durable status remains out of scope until cross-reload UI/status needs are proven.

