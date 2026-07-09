## Context

`route-xiuyuan-startup-sync-through-background-work-registry` moved startup full/incremental sync submission into Kernel Companion Background Work. That fixed lifecycle visibility at the outer job level, but the handler still delegates to existing `fullSync()` / `incrementalSync()` as one coarse unit.

The domain language now names **Kernel Companion Background Work** as a lifecycle Module for long maintenance jobs. It must not become the owner of Xiuyuan sync planning, native Riff compatibility, card writes, or SQLite persistence. The deeper Module should sit inside the Xiuyuan startup sync path and expose phase evidence to the registry.

## Goals / Non-Goals

**Goals:**

- Represent Xiuyuan startup sync as observable phases: scan input, plan change set, apply change set, checkpoint/final diagnostics.
- Check registry cancellation between phases and stop before issuing the next phase when canceled or deferred.
- Preserve startup non-blocking behavior and current startup incremental request shape.
- Preserve fail-closed backend unavailable behavior; do not revive local compatibility fallback.
- Concentrate startup lifecycle diagnostics in one Module with a small Interface usable from `XiuyuanSyncService`.
- Add tests that exercise the staged Interface instead of reaching into private helpers.

**Non-Goals:**

- No manual sync behavior change.
- No durable background-work registry persistence.
- No kernel RPC status endpoint.
- No move of Riff/card writes, scheduler state, msgpack truth, or SQLite writes into `kernel.js`.
- No broad `XiuyuanSyncService` rewrite beyond the startup lifecycle seam needed for this change.

## Decisions

1. **Deepen the startup lifecycle behind Xiuyuan sync, not inside the registry.**

   The registry passes `isCanceled()` and records job state. Xiuyuan startup sync owns when to check cancellation and how to describe phase diagnostics.

   Alternative rejected: make the registry orchestrate Xiuyuan scan/plan/apply. That would leak Xiuyuan-specific implementation into a generic lifecycle Module.

2. **Use cooperative cancellation at phase boundaries.**

   The implementation stops before a new phase starts when `context.isCanceled()` is true. It does not claim to interrupt already-issued backend or SiYuan writes.

   Alternative rejected: promise-level cancellation of backend calls. Current backend/client contracts do not support reliable physical cancellation and pretending they do would create false diagnostics.

3. **Stage diagnostics are the Interface test surface.**

   Tests should verify phase order, cancellation points, terminal state, and diagnostics through the startup lifecycle Module or registry job records. They should not couple to every private helper inside sync planning.

4. **Only sink existing helpers that earn Depth.**

   If deleting a helper only moves trivial calls around, keep it local. If deleting it would scatter cancellation/diagnostic/phase knowledge across callers, move it behind the startup lifecycle Module.

## Risks / Trade-offs

- Phase checks may leave partially applied writes when cancellation occurs after apply starts. This is acceptable if diagnostics are explicit and existing idempotency remains the recovery mechanism.
- Adding a lifecycle Module can become shallow if it only forwards to `fullSync()` / `incrementalSync()`. Mitigate by making phase evidence and cancellation semantics part of the Interface.
- Some useful cancellation points may require small extraction inside existing sync planner/apply runtime. Keep those changes narrow and test-backed.

