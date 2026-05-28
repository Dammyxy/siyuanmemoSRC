## Context

`modernize-browser-read-model` established the right Browser grid shape: resolve ordered row identity/count first, then hydrate visible rows by requested IDs. The remaining Browser-open slowdown is outside that first-row grid path:

- `BrowserHierarchy.vue` still derives document counts from `rowsForFocus`, which is populated by delayed full-row snapshot hydration.
- `SRSBrowser.vue` schedules `scheduleAllRowsSnapshot()` for the global Browser view and `startAllRowsSnapshot()` eventually hydrates every matched row through `getAllMatchedIds()` plus chunked `getRowsByIds()`.
- Queue Browser selection consumes `Queue Projection Readiness`, but invalidated projections can still be materialized on the selected/open path, returning repeated `refreshing` states before the datasource attaches.

The Anki reference shape is useful here: the table owns ordered IDs and row cache, while sidebar/tree counts are built through separate read paths. For SiYuanMemo, the equivalent is:

```text
Browser open
  ├─ Grid read model: ordered IDs -> visible row hydration
  ├─ Hierarchy read model: root/doc count rows -> doc title lookup
  └─ Queue readiness: projection warmup -> ready identity or explicit refreshing/unavailable
```

## Goals / Non-Goals

**Goals:**

- Make document hierarchy counts count-only and independent of all-row BrowserCard hydration.
- Preserve first grid rows as the primary open-time path; hierarchy/count refresh must not block first visible rows.
- Prewarm projection-backed queue read models in the background after Browser open and after relevant invalidation/live-identity events.
- Keep projection-backed queue reads fail-closed when the declared owner is preparing or unavailable.
- Retain full-row snapshots only for explicit user workflows that require all hydrated rows, such as an all-matching bulk action path that cannot use action-target lookup.
- Add tests and profile evidence that prove hierarchy counts avoid `getRowsByIds()` full scans and projection prewarm reduces queue selection work without hidden fallback.

**Non-Goals:**

- No Browser UI redesign or new hierarchy visual layout.
- No scheduler, Review feedback, queue membership, or algorithm semantic changes.
- No Anki search language compatibility.
- No speculative SQL index work unless the profile shows the count/warmup query is the bottleneck.
- No local queue fallback for projection-backed queue Browser reads.

## Decisions

### Decision 1: Add a separate Browser hierarchy read model

The hierarchy will consume `{ rootId, count }[]` plus title lookup inputs instead of `BrowserCard[]`. The application seam should expose a method equivalent to `getBrowserDocumentCounts(scope)` that supports global, queue, preset, search text, card type, active doc, and scope-doc filters where the declared owner can express them.

Alternatives considered:

- Keep using `rowsForFocus` but increase chunk size. Rejected because it still hydrates content, source state, card type, and action fields only to count `rootId`.
- Reuse the grid visible rows. Rejected because visible rows undercount documents not on the first page.
- Compute counts inside `BrowserHierarchy.vue`. Rejected because UI would keep depending on hydrated rows and owner selection would leak into presentation code.

### Decision 2: Hierarchy count reads follow the same declared owner as the Browser view

Deck/global/query views read counts from the SQL card universe when available. Projection-backed queue views read counts from queue projection rows joined or hydrated through the card universe as needed. Explicit local-queue policy may compute counts locally, but diagnostics must identify that owner.

Alternatives considered:

- Always use SQL `cards GROUP BY root_id`. Rejected because queue views need projection membership and ordering policy, not all matching cards.
- Always use projection counters. Rejected because global/deck/search document hierarchy is broader than queue counters.

### Decision 3: Projection warmup is background preparation, not fallback

Browser open should schedule a bounded prewarm for projection-backed queues. Prewarm may call `ensureQueueProjectionReady()` or a dedicated warmup method for configured queues and current Browser filters, but it must not attach a datasource or mutate visible grid state. Queue selection still consumes readiness and shows explicit refreshing/unavailable states.

Alternatives considered:

- Materialize synchronously before Browser displays. Rejected because it delays first rows.
- Materialize only after user selects a queue. Rejected because current evidence shows selection pays invalidated-projection cost.
- Use stale rows while materialization runs. Rejected because it reintroduces hidden dual-path behavior.

### Decision 4: All-row snapshot becomes explicit opt-in

The default hierarchy path should not call `scheduleAllRowsSnapshot()`. Full matched-row hydration should be triggered only by commands that truly need every Browser row and cannot use lite action targets or count-only reads.

Alternatives considered:

- Keep the 4.8s delayed snapshot as a low-priority background job. Rejected because it still creates visible hierarchy delay and competes with later user work.
- Delete all snapshot code immediately. Rejected because some selection/bulk flows may still need it until action-target coverage is verified.

### Decision 5: Measure runtime orchestration before query/index changes

The profile should report hierarchy count timing, rows-hydrated-for-hierarchy count, projection warmup timing/status, and queue selection readiness wait. Indexes are allowed only when those metrics show SQL count/projection queries are slow.

Alternatives considered:

- Add `root_id`/projection indexes now. Rejected because the inspected DB showed count-only SQL at about sub-millisecond scale, so orchestration is the current bottleneck.

## Risks / Trade-offs

- Count-only hierarchy may diverge from hydrated row filters -> mitigate with shared Browser Read Model scope normalization and tests for global, preset, search, doc scope, and queue views.
- Projection warmup can waste work for queues the user never opens -> mitigate with bounded queue list, debounce, cancellation on Browser close, and skip when projection is already ready.
- Background warmup may race live invalidation -> mitigate by consuming projection identity/generation and rechecking readiness on queue selection.
- Removing default all-row snapshot can expose hidden consumers -> mitigate by tests/grep for `allRows`, `rowsForFocus`, `ensureAllRowsSnapshot`, and adding explicit call sites for remaining full-row workflows.
- Follower instances may not be allowed to materialize projections directly -> mitigate by routing warmup through existing writer/backend readiness contracts and returning explicit `writer_unavailable`/`backend_unavailable` diagnostics.

## Migration Plan

1. Add hierarchy count types and application service seam with tests that prove count-only reads do not hydrate full Browser rows.
2. Wire SQL card-universe and projection-backed queue implementations for document counts, including unsupported/unavailable diagnostics.
3. Change `BrowserHierarchy.vue` and `SRSBrowser.vue` to consume hierarchy count results and titles rather than `rowsForFocus` full rows for default document counts.
4. Add projection prewarm runtime in Browser load lifecycle with bounded background scheduling, live identity/invalidation handling, and explicit diagnostics.
5. Restrict default all-row snapshot scheduling and keep explicit full-row snapshot helpers only for workflows that still require them.
6. Extend runtime profile/diagnostics and run targeted Browser hierarchy, queue readiness, read-model, hidden fallback, boundary, and build checks.

## Open Questions

- Which bulk actions still require full `BrowserCard[]` rather than action targets? Implementation should answer this by tracing `allRows` and `ensureAllRowsSnapshot()` call sites before removing snapshot callers.
- Should queue projection warmup cover all projection-backed queues on global Browser open, or only visible queue list entries plus the active queue? Recommended answer: visible projection-backed queue list entries, debounced and bounded, with active queue first.
