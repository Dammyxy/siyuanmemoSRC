## Why

Browser reads are currently split across deck, arbitrary query, queue snapshot, row hydration, source-existence patching, and grid session modules. Some paths already use an Anki-like two-stage shape, but projection-backed queue reads can still materialize full Browser rows from stale local queue cards, which creates correctness drift after Review feedback and makes large Browser views expensive.

This change proposes one Browser Read Model contract so Browser views first resolve authoritative ordered row IDs/counts, then hydrate only requested rows from the same authority.

## What Changes

- Introduce a Browser Read Model capability with explicit query snapshot, matched IDs, page hydration, row-by-ID hydration, action-target lookup, and source-existence behavior.
- Route projection-backed Browser queue views through queue projection identity and SQL card-universe hydration instead of `queue.getCards()` full-row materialization.
- Make deck, SQL-query, block-ID, and queue Browser datasources consume the same two-stage contract where practical: ordered lite rows/IDs first, visible-row hydration second.
- Keep unsupported query shapes and unavailable read authorities explicit; do not add hidden fallback from backend/projection reads to stale local queue reads.
- Add performance/profile expectations based on real runtime profile evidence before adding indexes or replacing query plans.
- Preserve existing Browser UI behavior, filters, sort model semantics, action targets, and missing-source visibility while changing the read model behind those surfaces.

## Capabilities

### New Capabilities
- `browser-read-model`: Defines the Browser-wide read contract for authoritative snapshots, ordered IDs, page hydration, row-by-ID hydration, source-existence status, unsupported-query diagnostics, and projection-backed queue reads.

### Modified Capabilities
- `sql-first-card-runtime`: Tightens the existing Queue projection read Module requirement so Browser queue reads use projection-backed snapshot/hydration for projection-backed queues and do not bypass projection via local queue card reads.
- `sql-runtime-profile`: Extends profile evidence expectations to Browser Read Model snapshot, matched-ID, page-hydration, and row-by-ID hydration surfaces before query/index optimization.

## Impact

- Affected Browser application modules: `BrowserApplicationService`, `BrowserCardUniverseReadModule`, `QueueBrowserQueryKernel`, `BrowserDeckQueryKernel`, and Browser read ports.
- Affected Browser UI datasources/session modules: `BrowserQuerySession`, `DeckDataSource`, `QueryDataSource`, `BlockIdsDataSource`, `RetrievalDataSource`, `IncrementalLearningDataSource`, and queue datasource adapters.
- Affected backend/projection modules: `SrsBackendClient`, backend Browser aggregate reads, queue projection snapshot/rows-by-ids contracts, and SQL card-universe hydration.
- Tests must cover stale queue read prevention after Review feedback, ordered ID preservation, visible-row hydration only, unsupported-query diagnostics, source-existence behavior, and profile evidence hooks.
