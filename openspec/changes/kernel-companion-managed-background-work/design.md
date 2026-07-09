## Context

SiYuan's kernel plugin system gives plugin code a real lifecycle: `onload`, `onrunning`, `onunload`, cancellable kernel context, plugin-scoped storage, RPC, and private HTTP/WS/SSE handlers. The frontend plugin lifecycle is weaker for long async cleanup: frontend `onunload` calls plugin cleanup synchronously and `kernel.destroy()` only closes the frontend RPC WebSocket. Therefore renderer-owned long background work must be safe to abandon during unload, and future long-running maintenance should be represented as kernel-companion-managed jobs rather than long frontend awaits.

Current SiYuanMemo still lets Review truth startup backfill, Xiuyuan startup full sync, and kernel transaction action polling run as renderer/worker background tasks with long request timeouts. When a host effect such as `truth.readJSON` times out or stalls, shutdown can see pending backend work for 30s/300s and users experience SiYuan as unable to exit.

## Goals / Non-Goals

**Goals:**
- Define a deep lifecycle Interface for long background work: submit/status/cancel/defer/shutdown.
- Make unload fail closed: no new heavy work, no waiting on in-flight heavy work, no timer re-arm after disposal.
- Split Review truth quick flush from heavy backfill.
- Keep frontend requests short; long maintenance becomes resumable/deferred work with explicit diagnostics.
- Prepare migration toward kernel-companion-managed jobs without moving DB or scheduler ownership into `kernel.js`.

**Non-Goals:**
- No scheduler, Riff/card writes, msgpack truth writes, or SQLite ownership in `kernel.js`.
- No silent local fallback when backend is unavailable.
- No full rewrite of backend RPC transport in this change.
- No UX redesign beyond lifecycle diagnostics/log behavior.

## Decisions

1. **Use a Background Work Lifecycle Interface, not scattered timers**

   `SrsBackendClient` becomes the first concrete owner for shutdown-safe maintenance semantics. It tracks disposed state, clears queued maintenance, refuses new Review truth work after dispose, and prevents finally blocks from re-arming timers after shutdown.

   Alternative considered: only extend `ApplicationContext.runBoundedDisposalStep`. Rejected because it bounds one await but leaves source timers/in-flight chains alive.

2. **Separate quick flush and heavy backfill**

   `flushReviewTruthBeforeUnload()` attempts only queued quick flush work. Startup backfill remains resumable maintenance and is skipped/deferred when unloading or when another flush/backfill is already in flight.

   Alternative considered: keep backfill inside `runQueuedReviewTruthFlush()` and rely on a short race. Rejected because the underlying request can still occupy worker/host effect resources after the race resolves.

3. **Treat kernel companion as future long-job coordinator, not P0 data owner**

   The spec names kernel-companion-managed jobs as the architectural direction. The first implementation hardens the renderer/backend seam and adds job-like shutdown semantics without moving storage writes into kernel JS. This honors current guardrails while allowing later migration to `submit/status/cancel` RPCs.

   Alternative considered: immediately port Review truth and Xiuyuan sync into `kernel.js`. Rejected because P0 kernel companion must remain coordination/relay authority and must not own SQLite/msgpack/card writes.

4. **Fail closed under backend unavailability**

   Backend unavailable or host-effect timeout must stop maintenance scheduling and surface diagnostics. It must not silently run local compatibility paths.

## Risks / Trade-offs

- Deferred backfill may leave historical SQL rows unbackfilled until next startup or manual maintenance. Mitigation: keep explicit pending counts and retry through startup compensation.
- Skipping unload backfill can leave sync-visible truth slightly behind. Mitigation: Review answer durability already resides in Review Ledger/Card Schedule Store; backfill is maintenance, not answer success authority.
- Kernel-managed job architecture may need another change to move more work behind companion RPC. Mitigation: this change defines the Interface and fixes immediate shutdown hazard first.

## Migration Plan

1. Harden `SrsBackendClient` lifecycle and Review truth maintenance split.
2. Add unload regression tests for stuck backfill/host effects.
3. Wire ApplicationContext disposal to rely on shutdown-safe client behavior.
4. Update docs/backlog with remaining kernel job migration tasks.
5. Later change can add companion `backgroundWork.submit/status/cancel` RPCs for Xiuyuan sync and action pump.

## Open Questions

- Exact kernel companion job persistence format for future resumable jobs remains deferred.
- Whether Xiuyuan full sync should become a kernel job or a backend worker job coordinated by kernel companion remains deferred until the current shutdown hazard is locked down.
