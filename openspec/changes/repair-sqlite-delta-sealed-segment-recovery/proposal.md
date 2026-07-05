## Why

Live Review feedback now fails on `SQLite delta segment checksum mismatch: sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack`. Local storage inspection confirms the active `sqlite-delta/v2` manifest references 27 sealed segments plus one open segment, but none of the referenced versioned segment files exist, and legacy root-level segment files do not match the manifest byte sizes or checksums.

This must be handled as a sealed-segment recovery problem, not a card-rating algorithm bug. The storage layer currently fails closed, which is correct for data integrity, but it needs an explicit recovery contract so operators and tests can distinguish recoverable path/metadata drift from unrecoverable missing or corrupt durable replay evidence.

## What Changes

- Add sealed SQLite delta segment recovery semantics for cases where manifest metadata can be proven against real segment bytes.
- Keep sealed segment checksum mismatch fail-hard when no byte-size and checksum match exists.
- Add diagnostics that identify whether the failure is missing segment, mismatched legacy candidate, or unrecoverable durable replay evidence.
- Add an operator-safe storage repair path that can restore or rewrite segment locations only when manifest checksum and byte size match exactly.
- Document that deleting or ignoring sealed segments is not allowed when manifest checkpoint metadata is absent.

## Capabilities

### New Capabilities
- `sqlite-delta-sealed-segment-recovery`: Defines safe recovery and fail-closed behavior for sealed SQLite delta segment corruption, missing files, and legacy path drift.

### Modified Capabilities
- `worker-sqlite-runtime-families`: Clarifies that Review feedback durability depends on validated SQLite delta replay evidence and must surface repair-required/unavailable results instead of hiding sealed segment failures.

## Impact

- Affected storage path: `SqliteDatabaseService -> SqliteDeltaCheckpointLayer.readSnapshot/readSegmentEnvelope -> review.feedback durability gate`.
- Affected tests: focused SQLite delta persistence/replay tests in `src/infrastructure/persistence/sqlite/__tests__/SqliteDatabaseService.test.ts`.
- Affected docs: `docs/DDD_RESCAN_BACKLOG.md`, and `ARCHITECTURE.md` only if storage ownership wording changes.
- No dependency changes, no native SQLite/WAL migration, no renderer-side scheduler fallback, and no hidden downgrade path.
