## Why

Fresh `review.session.feedback` diagnostics show the remaining slow path can be sealed SQLite delta segment reads during append preflight snapshot reconstruction. The architectural opportunity is to deepen the `SqliteDeltaCheckpointLayer` module so verified segment evidence reuse stays local to the storage invariant owner instead of leaking cache policy into Review, queue, or host bridge callers.

## What Changes

- Add an identity-scoped sealed segment evidence reuse capability for same-runtime SQLite delta append preflight.
- Reuse only verified segment envelopes whose manifest entry identity still matches path, sequence, sealed flag, checksum, entry count, and byte size.
- Preserve cold recovery, diagnostics, replay, repair, checkpoint, discard, startup, failure, checksum mismatch, and legacy recovery persisted-byte reads.
- Keep `review.session.feedback` fail-closed: no acknowledged commit without durable SQLite delta write/checkpoint evidence.
- Keep host timing attribution (`purpose` / `substep`) so live logs can still distinguish avoided hot-path reads from required recovery reads.

## Capabilities

### New Capabilities
- `sqlite-delta-sealed-evidence-reuse`: Covers identity-scoped reuse of same-runtime verified sealed segment evidence during SQLite delta append preflight while preserving durable recovery and fail-closed semantics.

### Modified Capabilities

## Impact

- Affected code:
  - `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`
  - `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`
  - `src/infrastructure/persistence/sqlite/__tests__/SqliteDatabaseService.test.ts`
  - `worker/db/*` only if tracing proves host attribution propagation needs updates
- Affected systems:
  - Review session feedback durable commit
  - SQLite delta v2 append preflight snapshot reconstruction
  - SQLite delta sealed/open segment evidence identity
  - Runtime performance diagnostics and host-effect attribution
- No data migration expected.
