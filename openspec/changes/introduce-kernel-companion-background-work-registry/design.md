## Context

`kernel-companion-managed-background-work` hardened unload by splitting Review truth quick flush from heavy SQL truth backfill. Current remaining friction: Review truth backfill lifecycle still lives inside `SrsBackendClient` queue/timer fields, so the caller must know when work is heavy, how it is retried, and how shutdown suppresses late results.

The project language now has **Kernel Companion Background Work**: a lifecycle Module for long maintenance jobs coordinated with the kernel companion. P0 constraint remains: kernel companion code is coordination/relay only. DB, scheduler, Riff/card writes, and msgpack truth writes stay with current owners.

## Goals / Non-Goals

**Goals:**
- Add one deep registry Interface for long maintenance lifecycle: `submit`, `status`, `cancel`, `defer`, `shutdown`.
- Migrate Review truth SQL backfill scheduling into the registry as the first job kind.
- Keep Review truth quick flush separate and unload-safe.
- Make job state and diagnostics explicit enough for tests and future UI diagnostics.
- Make shutdown idempotent and fail closed: no heavy work starts after shutdown, no late-result retry/timer re-arm.

**Non-Goals:**
- No scheduler ownership migration.
- No Riff/card write ownership migration.
- No msgpack truth write ownership migration.
- No SQLite DB ownership migration into `kernel.js`.
- No Xiuyuan startup sync migration in this change.
- No kernel RPC job registry in this change; this change builds the application/backend-client registry seam first.

## Decisions

1. **Registry first, kernel RPC later**

   Build `KernelCompanionBackgroundWorkRegistry` in application code and keep `kernel.js` untouched. This gives locality for lifecycle rules now while preserving P0 guardrails. Later kernel companion RPC can become an Adapter at the same seam.

   Alternative: implement job registry directly in `kernel.js`. Rejected because P0 kernel companion must not become data owner and current shutdown bug can be fixed without widening the kernel surface.

2. **Review truth backfill is first job kind**

   Initial job kind: `review-truth-backfill`. It wraps existing backend `review.truth.backfill` calls and uses existing request payload/build rules. Quick `review.truth.flush` remains direct because unload needs bounded, immediate behavior.

   Alternative: migrate ActionPump and Xiuyuan together. Rejected because Review truth is the direct shutdown hazard and has clearest tests after P0 split.

3. **Registry owns lifecycle, not business writes**

   Job handler may call existing `SrsBackendClient.reviewTruthBackfill()`; it does not implement truth encoding, SQL patching, scheduler updates, or card writes. Ownership remains in worker/backend Review truth Modules.

4. **Status is observable and deterministic**

   Registry stores in-memory job records with kind, id, state, reason, submitted/updated timestamps, attempt count, last error, and diagnostic payload. It is not durable persistence yet.

## Risks / Trade-offs

- In-memory registry state disappears on reload -> acceptable for P0 because startup maintenance can re-detect pending rows; durable registry remains future work.
- New registry could become pass-through -> avoid by moving retry/shutdown/defer status logic behind its Interface and testing through registry behavior.
- Over-generalized job schema could slow implementation -> keep initial kind narrow, but shape state names to match future ActionPump/Xiuyuan work.
