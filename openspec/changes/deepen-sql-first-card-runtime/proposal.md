## Why

SiYuanMemo has moved card persistence from binary snapshot storage toward SQLite, but several hot paths still require callers to understand legacy storage, full snapshots, projection readiness, or old SiYuan `fsrs_cards` queries. This change makes the SQL card universe the runtime authority for card reads, projection reads, NeuralRoam card facts, and selected mutation paths so the plugin can actually benefit from indexed queries, stable pagination, and fail-closed consistency.

## What Changes

- Deepen the SRS Browser Card Universe read path so Browser pagination, matched IDs, stats, source-existence status, and row hydration are SQL-first behind one Module.
- Deepen Queue Projection Readiness and hydration so Browser and Review consume one projection read Module for rows, cards, counters, readiness, and unavailable errors.
- Introduce a SQL-first card mutation persistence path for review-facing card updates, with explicit projection invalidation and no hidden snapshot fallback.
- Move NeuralRoam card facts such as concept-card identity and priority away from legacy SiYuan `fsrs_cards` lookups and toward the SQL card universe.
- Add a SQL-first Xiuyuan persistence adapter path for high-value repository reads and sync change application while preserving the accepted Xiuyuan source model from ADR-004.
- Keep legacy binary/snapshot storage only where it is an explicit migration, recovery, or compatibility source, not a normal hot-path fallback.

## Capabilities

### New Capabilities
- `sql-first-card-runtime`: Defines SQL-first runtime behavior for the card universe, Browser deck queries, queue projection reads, review card mutation persistence, NeuralRoam card facts, and Xiuyuan persistence migration.

### Modified Capabilities

## Impact

- Affected application Modules: `BrowserApplicationService`, Browser query kernels/data sources, `UnifiedDataSourceManager`, review strategy adapters, `ApplicationContext`.
- Affected core Modules: queue projection read behavior in review queues, NeuralRoam graph/query providers, Xiuyuan repository implementation.
- Affected infrastructure Modules: SQLite repositories/schema, backend worker database/query handlers, source-existence and projection invalidation logic.
- Affected tests: Browser deck query tests, queue projection/readiness tests, review feedback/projection tests, NeuralRoam graph tests, Xiuyuan repository tests, SQL repository tests, hidden fallback checks, boundary checks, build.
