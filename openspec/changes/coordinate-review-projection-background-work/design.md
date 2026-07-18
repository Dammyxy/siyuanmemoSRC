## Context

Review dialogs and Review tabs currently keep their active queue in mutable manager fields. `SRSBrowser.vue` reads those fields through a Vue `computed`, but no reactive dependency changes when a manager field changes, so Browser pressure can remain stale for the life of the component. The warmup runtime compensates by rescheduling non-active queues every 750 ms, while queue-count refresh maintains a second deferred flag. Repeated snapshot reads then emit the same projection-stale INFO diagnostic on every call.

The change crosses application lifecycle, Browser scheduling, and projection diagnostics. It must preserve these boundaries:

- Review session and answer authority remain worker-owned.
- BrowserProjectionIndex remains derived Browser state and does not repair Canonical Truth.
- Dialog and tab managers report surface lifecycle but do not schedule Browser work.
- The coordinator is limited to Review pressure over Browser projection background work; it is not a general task scheduler.

## Goals / Non-Goals

**Goals:**

- Provide one synchronous, subscribable snapshot of the effective active Review surface and queue.
- Preserve Dialog-over-Tab priority and most-recently-active Tab selection.
- Coalesce deferred Browser projection work by stable key without a Review-period polling timer.
- Release pending work exactly once when Review becomes idle or its active queue makes work eligible.
- Use the same coordinator for projection warmup and deferred queue-count refresh.
- Emit non-ready projection INFO diagnostics only on meaningful per-queue state transitions.

**Non-Goals:**

- No change to Review answer, scheduling, queue membership, or persistence authority.
- No global background-work scheduler and no kernel-companion work registration.
- No stale projection fallback and no hidden projection repair.
- No redesign of ordinary transient readiness retry delays after work has been admitted.

## Decisions

### 1. Add an application-owned Review Projection Work Coordinator

`ReviewProjectionWorkCoordinator` exposes a small interface:

```ts
activateSurface({ surfaceId, surfaceKind, queueType }): {
  markActive(): void;
  release(): void;
}
getSnapshot(): ReviewProjectionActivitySnapshot
subscribe(listener): () => void
scheduleWork({ key, queueType, run }): 'started' | 'deferred' | 'coalesced'
cancelWork(key): void
dispose(): void
```

The coordinator owns surface ordering, the effective snapshot, pending work, and transition diagnostics. Dialog surfaces outrank tab surfaces. Among surfaces of the same kind, the latest activation ordinal wins. Repeated `markActive` and `release` calls are idempotent.

`queueType: null` means work is admitted only when Review is idle. Queue-scoped work is admitted while idle or when its queue is the active Review queue. Browser-visible work remains explicitly immediate in the Browser warmup policy and is not registered as deferred work.

Alternative rejected: wrap manager getters in Vue refs. That would fix invalidation in one component but leave the 750 ms loop and duplicate deferred state intact. Alternative rejected: use the kernel background-work registry. Browser projection warmup is renderer-local, short-lived derived work and does not belong to the cross-runtime maintenance registry.

### 2. Surface managers publish lifecycle; Browser subscribes once

`DialogManager` activates one stable dialog surface handle when it registers a Review dialog and releases it before destroy or from the dialog close callback. `TabManager` stores a coordinator handle beside each Review tab runtime, calls `markActive` from existing focus/activity paths, and releases it on unregister.

`SRSBrowser.vue` creates a Vue ref from `getSnapshot()` and updates it through `subscribe()`. Component unmount removes the subscription. The old `getActiveReviewQueueType()` methods and `IDialogManager` member are deleted so new callers cannot return to pull-based inference.

Alternative rejected: let each manager expose its own event API. That would force every consumer to reproduce Dialog priority and Tab recency rules.

### 3. Defer work as pending intent, not repeated timers

Warmup keeps its existing initial debounce and admitted transient-readiness retry timers. When a warmup pass partitions out non-active queues during Review, each queue is registered under a stable work key in the coordinator. It is not scheduled for another 750 ms attempt. A later effective activity transition drains only pending work that is now eligible.

Queue-count refresh continues to perform the active-queue-scoped read immediately. If the request also contains non-active work, it registers one idle-only full refresh key. Repeated requests replace the pending callback for that key instead of setting a separate Boolean flag.

Pending callbacks run in a microtask after the coordinator publishes its new snapshot. Failures are caught and logged by the coordinator so one work item cannot block other eligible work.

### 4. Deduplicate non-ready diagnostics by semantic signature

`QueueProjectionRuntime` stores the last non-ready diagnostic signature per queue. The signature covers status, unavailable reason, policy/generation validity and values, normalized cache state, counters, and freshness, but excludes call-local `forceRefresh` so repeated reads of the same backend state do not create new INFO logs.

The first non-ready state logs. A changed signature logs again. A ready snapshot clears the queue signature; a later regression to the same non-ready state is therefore observable. This changes diagnostics only and does not cache or alter readiness results.

Alternative rejected: logger-level throttling. Time throttling can hide real state transitions and leaves callers producing redundant diagnostic events.

## Risks / Trade-offs

- [A manager forgets to release a surface] -> Handles are stored with the existing manager runtime and released from every destroy, close, and unregister path; lifecycle tests cover idempotency.
- [A pending callback becomes stale before release] -> Stable-key replacement keeps the newest callback, and Browser runtime abort/dispose cancels its owned pending work keys.
- [Synchronous subscriptions cause re-entrancy] -> Snapshot listeners run after internal state is committed; deferred work runs in a microtask and listener failures are isolated.
- [Diagnostic signatures grow without bound] -> The map is bounded by the finite QueueType set and entries are cleared on ready/dispose.
- [Visible Browser work is accidentally deferred] -> Warmup partition tests retain explicit visible-queue admission during active Review.

## Migration Plan

1. Add and unit-test the coordinator in isolation.
2. Register it in `ApplicationContext`, then migrate Dialog and Tab lifecycle reporting.
3. Subscribe Browser state and migrate warmup/count deferral to stable work keys.
4. Remove pull getters, the 750 ms Review deferral constant/path, and the Browser count Boolean.
5. Add projection diagnostic transition tests and update domain language.

Rollback is source-level: restore the previous manager getter and Browser scheduling wiring. No persisted data or schema migration is involved.

## Open Questions

None. The coordinator scope and admission policy are fixed for this change.
