## 1. Acceptance And Current Path Audit

- [x] 1.1 Trace current Browser deck/query/block-ID/queue read paths from UI datasources through `BrowserApplicationService` into application/backend read owners.
- [x] 1.2 Record the current queue Browser stale-count failure mode with a focused test around `QueueBrowserQueryKernel` where `queue.getCards()` is stale and projection rows are current.
- [x] 1.3 Identify which queue types are projection-backed versus explicit local-queue policy in active rollout/read-policy code.

## 2. Browser Read Model Contract

- [x] 2.1 Add Browser Read Model types for read owner metadata, query fingerprint/generation, ordered lite row identity, total count, unavailable/unsupported diagnostics, and action targets.
- [x] 2.2 Add a Browser Read Model application seam consumed by Browser datasources instead of duplicating owner selection in each datasource.
- [x] 2.3 Centralize stable row identity normalization so card ID, row ID, FSRS card ID, and block ID lookup preserve requested order consistently.
- [x] 2.4 Add focused unit tests for snapshot identity, row-by-ID hydration ordering, missing-row diagnostics, and action-target lookup without full-row hydration.

## 3. Projection-Backed Queue Browser Reads

- [x] 3.1 Change `QueueBrowserQueryKernel` to use queue projection snapshot rows for projection-backed queues and reject hidden fallback to local `queue.getCards()`.
- [x] 3.2 Hydrate queue Browser rows by requested projection/card IDs through projection card hydration or SQL card-universe row hydration while preserving projection order and queue index.
- [x] 3.3 Keep explicit local-queue behavior only for queue policies that are not projection-backed and include diagnostics/read-owner metadata for that path.
- [x] 3.4 Update queue Browser tests to assert projection-backed retrieval/incremental reads call `getSnapshotRows()`/`getCardsBySnapshotIds()` and do not call `getCards()`.

## 4. Datasource Convergence

- [x] 4.1 Adapt retrieval and incremental queue datasources to consume Browser Read Model snapshots and hydrate only requested pages.
- [x] 4.2 Align deck/query/block-ID datasources with the Browser Read Model seam where existing `BrowserQuerySession` and backend aggregate behavior already match the two-stage pattern.
- [x] 4.3 Preserve existing Browser filters, sort model semantics, doc scope, card-type filters, missing-source views, and batch action targets with regression tests.
- [x] 4.4 Verify source-existence cache patching remains read-model metadata and refresh scheduling is not treated as a fallback read source.

## 5. Profile And Diagnostics

- [x] 5.1 Extend runtime SQL profile output to include Browser Read Model snapshot, matched-ID, page-hydration, row-by-ID hydration, and action-target lookup timings for implemented surfaces.
- [x] 5.2 Add diagnostics for unsupported query shapes and required owner unavailable states.
- [x] 5.3 Use profile evidence before adding or changing SQL indexes for Browser Read Model paths.

## 6. Validation And Documentation

- [x] 6.1 Run targeted Browser read model and queue Browser tests, including stale-count prevention after Review feedback.
- [x] 6.2 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, and `pnpm build` after production code changes.
- [x] 6.3 Update `ARCHITECTURE.md` when the Browser Read Model implementation changes runtime ownership/call-chain documentation.
- [x] 6.4 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred Browser read-model debt after production code changes.
