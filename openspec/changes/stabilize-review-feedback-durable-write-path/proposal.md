## Why

Live Review logs show `review.feedback` can fail with `SQLite delta segment checksum mismatch: sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack`, then spend tens of seconds in the persist/restore path before surfacing failure. The prior hot-path decoupling removed projection sync as the main blocker, so the next bottleneck is the durable write path itself: corrupted delta recovery must fail fast or repair safely, and ordinary Review commits must only wait on the minimum authoritative data needed for durability.

## What Changes

- Add P0 recovery semantics for corrupted SQLite delta v2 open segments: quarantine or discard the corrupt open segment, avoid replaying it, attempt a full durable checkpoint from proven in-memory state when safe, and return explicit repair-required diagnostics when safe checkpoint repair is impossible.
- Add P0 latency guards so `review.feedback` cannot loop through repeated restore/replay of the same corrupt delta segment for tens of seconds.
- Add P1 Review hot-path durability semantics: ordinary formal Review feedback blocks only on the authoritative scheduler/card state, append-only review fact/event, and idempotency identity.
- Move queue projection maintenance, Browser projection refresh, truth flush, and full-database checkpoint work off the ordinary Review answer hot path unless required to prove the current commit's durability.
- Preserve fail-closed behavior: a Review commit may report pending, failed, unavailable, or repair-required, but must not claim durable success when the minimum durable commit was not proven.
- Do not introduce native SQLite/WAL, a new sync service, or a kernel-side DB writer in this change.

## Capabilities

### New Capabilities
- `review-feedback-durable-write-path`: Defines P0 corrupt-delta repair/fast-fail behavior and P1 minimum durable Review feedback commit semantics.

### Modified Capabilities
- `sql-first-card-runtime`: Tightens the existing SQL-first Review card mutation requirement so ordinary Review feedback only waits on minimum authoritative persistence and reports derived projection work separately.

## Impact

- Affected runtime: `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`, `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`, backend Review feedback runtime, Review commit queue/session diagnostics, Review truth flush scheduling, and queue projection maintenance.
- Affected tests: SQLite delta/checkpoint corruption suites, backend Review feedback suites, Review session commit-state tests, transport timing tests, and durability-gate tests.
- Affected docs: active runtime `ARCHITECTURE.md` if ownership or hot-path sequencing changes, plus `docs/DDD_RESCAN_BACKLOG.md` for deferred native WAL / broader storage topology debt.
