## Context

Kernel Companion Background Work now provides the application/backend-client lifecycle Module for long or recurring maintenance jobs. Review truth backfill already uses it, but `KernelTransactionActionPump` still duplicates polling lifecycle concerns with direct `setInterval`, local in-flight flags, dispose guards, and late-result suppression.

The pump must still own transaction-action semantics: dequeue/requeue routing, writer relay behavior, native Riff upsert/remove handoff, and AutoCard candidate handoff. The registry should only own job lifecycle.

## Goals / Non-Goals

**Goals:**
- Move ActionPump polling lifecycle into `KernelCompanionBackgroundWorkRegistry`.
- Keep polling observable through registry `status()`.
- Preserve existing backoff, wake, relay, requeue, deferred upsert, and AutoCard behavior.
- Cancel/defer polling cleanly on dispose/shutdown and suppress late results.

**Non-Goals:**
- No scheduler, native Riff write, card write, msgpack truth, or SQLite DB ownership moves into kernel companion code.
- No durable registry persistence.
- No kernel RPC status endpoint.
- No Xiuyuan startup sync migration in this change.

## Decisions

1. **Use registry for polling jobs, not business writes.**
   - `KernelTransactionActionPump.start()` submits recurring polling work as background work.
   - `pollOnce()` remains the semantic owner for dequeue and action handling.
   - Alternative rejected: moving transaction handling into the registry. That would make the registry shallow on lifecycle but too broad on business semantics.

2. **One polling job at a time.**
   - The pump tracks the active polling job id and only submits another job after a non-canceled run completes and interval/backoff rules allow it.
   - Alternative rejected: keeping `setInterval` plus registry status. That preserves duplicate lifecycle ownership.

3. **Registry cancellation is the late-result gate.**
   - Polling job handlers receive `isCanceled()` and check it around async boundaries.
   - Dispose cancels the active job and clears deferred upsert timers.
   - Alternative rejected: relying only on pump-local `disposed`. That would keep status split across two Modules.

4. **Shared registry instance comes from application composition.**
   - `SrsBackendClient` owns the registry instance today; `ApplicationContext` passes that instance to ActionPump.
   - Alternative rejected: each pump creating its own registry. That would fragment background work status.

## Risks / Trade-offs

- Recurring polling through one-shot registry jobs could accidentally stop after errors -> mitigate with focused tests for retry/reschedule after empty, error, and wake paths.
- Dispose during async dequeue/action handling could still schedule follow-up work -> mitigate by checking registry cancel state and pump dispose state before scheduling next poll or upsert.
- Registry shutdown owned by `SrsBackendClient` now affects ActionPump too -> acceptable because both live in the same runtime lifecycle and unload should quiesce all background work.
