## Context

Recent live logs show six slow `review.feedback` calls after several Review answers:

- 2.0-4.35s per worker handler.
- no SQLite checksum mismatch.
- no `SQLITE_DELTA_REPAIR_REQUIRED`.
- three `QUEUE_PROJECTION_UNAVAILABLE` row hydration misses.
- around forty Browser queue projection warmup readiness logs and repeated queue creation.

The existing `browserQueueProjectionWarmupRuntime` is a shallow Module for the current problem: callers can schedule a broad warmup or targeted live-identity warmup, but the Interface has no concept of Review pressure, queue criticality, or warmup budget. The implementation then serially calls `ensureQueueReadModelReady` for `retrieval`, `incremental-learning`, `final-drill`, and `filter-group`, and targeted live identity events can rewarm non-active queues while Review is trying to commit answers.

Architecture constraints:

- SQL worker remains the only `siyuanmemo.db` owner per ADR-002.
- Browser Read Model remains authoritative for Browser row/count hydration per ADR-005.
- Review Session Cursor / Review Feedback Advancement remain the active Review answer authority.
- Browser warmup can prepare read models, but it is derived work and must not compete with the Review answer hot path.

## Goals / Non-Goals

**Goals:**

- Stop non-critical Browser queue projection warmup from competing with active Review answers.
- Keep Browser visible queue readiness explicit and fail-closed.
- Coalesce repeated targeted warmups and retries while Review is active.
- Make deferred warmup observable in logs/diagnostics.
- Keep implementation bounded to Browser warmup and Review-active signal wiring.

**Non-Goals:**

- No native SQLite/WAL migration.
- No kernel-side DB writer.
- No new queue projection owner.
- No stale local snapshot fallback for Browser.
- No broad redesign of Browser Read Model or Review session authority.

## Decisions

### Decision 1: Add Review pressure as an input to Browser warmup

`browserQueueProjectionWarmupRuntime` should accept a small read-only Review pressure signal, for example `{ active: boolean; activeQueueType?: QueueType | null }`.

When Review is active:

- broad `browser-open` warmup is not allowed to run all projection-backed queues immediately.
- only the active Browser queue, if visible, or the Review-relevant queue may warm immediately.
- non-critical queues become deferred and coalesced.

This deepens the warmup Module because callers no longer need to know how to budget warmup under Review pressure.

### Decision 2: Coalesce targeted live-identity warmup by queue

Targeted live-identity warmups should replace older pending targeted timers for the same queue/reason bucket rather than add another timer. During Review pressure, non-active target queues should be delayed by a bounded quiet window.

This preserves projection freshness without creating a timer/request storm.

### Decision 3: Visible Browser queue remains explicit

If the user is actively viewing a Browser queue, readiness for that visible queue may still run and may return `refreshing` or `unavailable`. The UI must not silently use stale local queue rows as a substitute.

This keeps ADR-005 intact: Browser Read Model owner data wins, and unavailable owner data stays unavailable.

### Decision 4: Review active signal should be read-only and lifecycle-owned

Do not let Browser warmup mutate Review state. The seam is a tiny read-only adapter that answers whether a Review surface is active and which Review queue type is under pressure. Browser warmup consumes that signal only for scheduling.

## Deepening Opportunities Considered

1. **Deepen Browser Projection Warmup Runtime**
   - Files: `browserQueueProjectionWarmupRuntime.ts`, its tests, and `SRSBrowser.vue` wiring.
   - Problem: current Interface exposes scheduling but not priority/budget; caller-visible complexity leaks as repeated broad warmups.
   - Solution: put Review-aware budget, per-queue coalescing, and deferred diagnostics behind the runtime Interface.
   - Benefit: locality for timer/coalescing decisions; tests exercise one module seam.

2. **Deepen Queue Projection Readiness Service**
   - Files: `QueueProjectionReadinessService.ts`, `UnifiedDataSourceManager.ts`.
   - Problem: readiness can report refreshing/unavailable but does not own UI warmup scheduling.
   - Solution: less suitable for this change; it would mix Browser UI lifecycle concerns into application readiness.
   - Benefit: not selected for P0 because it broadens the seam and risks changing backend readiness semantics.

3. **Deepen Review/Browser Shared Activity Runtime**
   - Files: Review surface registry, Browser warmup, ApplicationContext.
   - Problem: multiple surfaces compete for worker/kernel time.
   - Solution: future P2-ish scheduler for cross-surface background work.
   - Benefit: useful later, but too broad for current log symptom.

Selected: **Deepen Browser Projection Warmup Runtime**.

## Proposed Runtime Behavior

- `schedule('browser-open-after-first-rows')` while Review active:
  - warms only currently visible queue if that queue needs first rows.
  - defers sidebar queues (`retrieval`, `incremental-learning`, `final-drill`, `filter-group`) into a single delayed batch.
- `handleLiveIdentityEvent(refreshed/materialized/invalidated)` while Review active:
  - active visible queue: immediate targeted warmup.
  - non-active queue: coalesced deferred targeted warmup.
- retry from `refreshing`:
  - keep bounded retry, but per queue only one pending retry.
- repairable `projection_stale`:
  - do not launch repeated repair for non-active queues during Review pressure; defer and coalesce.
- diagnostics:
  - log `Queue projection warmup deferred during active Review` with queue ids, reason, and delay.

## Open Questions

- Exact quiet window: start with 750-1000ms during Review active; tune after focused tests.
- Review active signal source: prefer existing Review surface/session registry if already exposed; otherwise pass a small read-only ref from current UI composition.
- Should Browser warmup skip non-visible queues completely during Review active, or delay them until Review idle? Initial proposal: delay, not drop.
