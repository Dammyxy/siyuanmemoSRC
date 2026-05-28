## Context

SiYuanMemo Browser already has several pieces of an Anki-style read path: `BrowserQuerySession` separates lite row identity from hydrated rows, deck reads can use backend aggregate snapshots, and SQL-first card-universe reads have explicit ports. The queue Browser path is weaker: `QueueBrowserQueryKernel` still resolves a queue and materializes Browser rows from `queue.getCards()`, then filters and sorts in memory.

That split matters during backend migration. Review feedback for `RetrievalPractice` and `IncrementalLearning` can commit through worker-owned persistence and update backend queue projection, while Browser queue reads can still see stale local queue cards. Browser count drift after Review feedback is therefore a read-model ownership problem, not a grid-cache problem.

Anki's Browser is useful as a reference shape: GUI state keeps ordered IDs and row cache, backend search produces matched IDs/order, and row content is hydrated by ID with column-aware rendering. SiYuanMemo should borrow that shape without copying Anki's storage quirks or desktop bridge model.

## Goals / Non-Goals

**Goals:**

- Define one Browser Read Model contract for matched identity/counts, page hydration, row-by-ID hydration, action targets, and source-existence state.
- Make projection-backed queue Browser reads consume queue projection identity before hydrating Browser rows from the SQL card universe.
- Keep deck, query, block-ID, and queue datasources converging on the same two-stage pattern: authoritative ordered lite rows first, visible-row hydration second.
- Preserve Browser UI semantics: filters, sort model, card-type filters, doc scope, missing-source behavior, batch action targets, and row ordering.
- Fail closed with diagnostics when the declared read owner is unavailable or cannot express the query.

**Non-Goals:**

- No complete Browser UI redesign.
- No new scheduler semantics, queue membership rules, or Review session advancement changes.
- No Anki-compatible search language.
- No speculative SQL indexes without runtime profile evidence.
- No hidden fallback from projection/backend reads to stale local queue or legacy snapshot reads.

## Decisions

### Decision 1: Browser Read Model is application-owned, not grid-owned

The Browser Read Model contract will live at the application read seam and be consumed by UI datasources. Grid sessions may cache ordered IDs and hydrated rows, but they do not decide which backend/projection/local owner is authoritative.

Alternatives considered:

- Keep logic inside each datasource. Rejected because the current drift exists partly because deck/query/queue datasources encode authority differently.
- Move authority into the grid session cache. Rejected because the grid session is a UI cache and should not know queue projection policy.

### Decision 2: projection-backed queue Browser reads use queue projection identity first

For queues declared projection-backed, Browser queue snapshots must read projection rows/counts by projection identity and hydrate visible/page row IDs through projection card hydration or SQL card-universe row hydration. `queue.getCards()` remains valid only for queues explicitly declared local-queue by policy.

Alternatives considered:

- Refresh local queue cards after Review feedback. Rejected because it creates another owner synchronization path and can hide worker/projection failure.
- Use projection rows only for counts but local queue rows for content. Rejected because count/content would still be split across owners.

### Decision 3: snapshot/query returns lite identity before full row content

Browser snapshot calls should return ordered lite rows or IDs, total count, fingerprint/generation, and action-target minimums. Full Browser row hydration happens only for requested pages or explicit row-by-ID requests.

Alternatives considered:

- Keep full-row snapshots and rely on LRU cache. Rejected because full snapshots front-load expensive content/source-existence work and make large queues scale poorly.
- Return only IDs and no action-target data. Rejected because batch actions need stable target identity without hydrating every row.

### Decision 4: source-existence is part of Browser Read Model, but background refresh stays separate

The read result should distinguish known source-existence state from queued refresh work. Visible rows may be patched from source-existence cache; refresh scheduling must not be treated as a read fallback.

Alternatives considered:

- Check every visible row against SiYuan synchronously. Rejected because it makes page hydration dependent on host SQL/API latency.
- Ignore source-existence during read model migration. Rejected because Browser currently has normal/missing-source semantics that must remain stable.

### Decision 5: profile before indexing or replacing SQL shapes

The proposal requires profile evidence for Browser Read Model snapshot, matched-ID, page-hydration, and rows-by-ID paths before adding indexes or changing query plans.

Alternatives considered:

- Add indexes proactively for all projected sort/filter fields. Rejected because the repo already has runtime profile discipline and real data may not show bottlenecks.

## Risks / Trade-offs

- Projection-backed queue hydration may expose missing projection/card mismatches that local queue reads used to mask -> return explicit projection unavailable or refresh-required diagnostics and add focused tests before cutover.
- Two-stage reads can introduce stale ID caches after mutations -> include fingerprint/generation invalidation and queue-changed/readiness events in the contract.
- Some Browser filters may not be expressible in SQL/projection immediately -> return unsupported-query diagnostics or keep an explicitly documented non-SQL path for that view, never silent fallback.
- Action targets may become inconsistent if lite rows and hydrated rows use different ID normalization -> centralize stable Browser row identity and test order preservation by card ID, row ID, and block ID.
- Migrating all datasources at once is broad -> implement in slices: queue projection correctness first, then deck/query/block-ID convergence, then profile-backed optimizations.

## Migration Plan

1. Add Browser Read Model types and tests around ordered lite rows, page hydration, row-by-ID hydration, action-target lookup, and unavailable diagnostics.
2. Convert projection-backed queue Browser reads to projection snapshot plus SQL/projection hydration; keep local queue path only for explicit local-queue policy.
3. Update Browser queue datasource tests to prove visible-row hydration only and stale local `queue.getCards()` is not called for projection-backed queues.
4. Align deck/query/block-ID datasources behind the same Browser Read Model interface where existing backend aggregate/query-session behavior already matches.
5. Extend runtime SQL profile to measure Browser Read Model snapshot/matched-ID/page-hydration/rows-by-ID shapes before index/query-plan changes.
6. Update `ARCHITECTURE.md` when implementation changes runtime ownership or call chain.
