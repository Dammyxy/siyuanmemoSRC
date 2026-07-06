## Why

Current Review durability still lets SQLite delta-log mechanics leak into the Review answer hot path. Recent logs show ordinary Review feedback spending hundreds of milliseconds in `sqlite-delta.append-preflight`, reconstructing snapshots by reading sealed `msgpack` segments. That is storage/sync machinery, not SRS domain authority.

Anki keeps Review facts simple: update the card and append a revlog entry in a small transaction. Sync and storage maintenance can use those facts later. SiYuanMemo needs the same separation: Review Ledger and Card Schedule Store are domain facts; SQLite delta segments are one persistence/sync Adapter.

The goal is not to weaken durability. The goal is to make the durable Review fact O(1) and fail-closed, while preventing historical delta reconstruction from blocking every rating.

## What Changes

- Define Review Ledger as the authoritative append-only Review fact Module.
- Define Card Schedule Store as the authoritative current scheduling state Module.
- Require ordinary Review answer commit to write/update only the Review fact and current card schedule state needed for replay and recovery.
- Move SQLite delta snapshot reconstruction, sealed segment reads, checkpointing, and sync export behind a separate Delta Sync Adapter.
- Add regression tests that ordinary consecutive Review answers do not read historical sealed delta segments on the commit hot path.
- Keep crash recovery, idempotency, checksum/sequence evidence, and fail-closed semantics explicit.

## Capabilities

### New Capabilities

- `review-ledger-delta-sync-separation`: Review facts and current card schedule state are authoritative; SQLite delta log is a sync/durability Adapter that cannot become the Review answer proof.

### Modified Capabilities

- `sql-first-card-runtime`: Tightens Review persistence around O(1) card schedule update plus ledger append.
- `worker-owned-review-session-authority`: Kernel answer success depends on Review facts and worker state, not delta-log snapshot reconstruction.

## Impact

- Affected storage path:
  - `worker/db/SqliteDatabaseService.ts`
  - `worker/db/ReviewFeedbackJournalStore.ts`
  - `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`
  - `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`
  - `worker/db/SqlitePersistenceBridge.ts`
- Affected Review path:
  - `worker/review/*`
  - `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`
  - Review feedback tests and transport timing tests.
- Affected docs:
  - `CONTEXT.md`
  - `ARCHITECTURE.md`
  - `docs/DDD_RESCAN_BACKLOG.md`

## Out Of Scope

- No switch to native SQLite/WAL.
- No removal of SQLite delta log.
- No async "pretend committed" path for Review answers.
- No weakening of crash recovery or idempotency.
- No Browser projection redesign in this change.
