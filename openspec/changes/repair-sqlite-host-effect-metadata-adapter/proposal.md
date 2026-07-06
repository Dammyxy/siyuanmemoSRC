## Why

Fresh live Review logs still show SQLite delta sealed segment reads during `review.session.feedback`, but every host effect is reported as `purpose=unknown substep=unknown`. The current runtime SQLite delta layer emits diagnostics as `{ diagnostics: { sqliteDeltaPurpose, sqliteDeltaSubstep } }`, while the worker persistence bridge expects `{ purpose, substep }`.

That shape mismatch makes the slow-path evidence non-actionable. Before choosing another storage optimization, the worker SQLite persistence Adapter must preserve the storage owner's diagnostic identity across the seam.

## What Changes

- Normalize runtime SQLite file-service diagnostics into bridge host-effect metadata at the worker SQLite persistence Adapter seam.
- Preserve existing direct `{ purpose, substep }` bridge metadata for callers that already use the bridge shape.
- Add focused regression coverage for sealed/open segment read/write and manifest JSON metadata forwarding.
- Keep durable commit semantics unchanged: no async commit, no fallback success, no skipped persisted reads.
- Record the architectural decision that this is an Adapter Interface repair, not a host bridge cache or Review queue workaround.

## Capabilities

### New Capabilities
- `sqlite-host-effect-metadata-adapter`: Covers worker SQLite persistence host-effect metadata preservation across runtime diagnostics and bridge shapes.

### Modified Capabilities

## Impact

- Affected code:
  - `worker/db/SqliteDatabaseService.ts`
  - `worker/db/__tests__/SqliteDatabaseService.metadata.test.ts`
  - `ARCHITECTURE.md`
  - `docs/DDD_RESCAN_BACKLOG.md`
- Affected systems:
  - Review feedback slow-path diagnostics
  - SQLite delta v2 host-effect attribution
  - Worker SQLite persistence Adapter
- Validation requires focused worker DB tests, strict OpenSpec validation, `pnpm run check:boundaries`, and `pnpm build`.
