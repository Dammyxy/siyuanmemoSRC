## Why

Legacy unified-card migration has served its once-only bootstrapping job. Keeping the runtime importer, source detector, receipt reconciliation, and MessagePack allowlist alive now preserves a second truth path that conflicts with SQL-first / MessagePack truth ownership.

## What Changes

- **BREAKING**: Retire the runtime `unified-cards.msgpack` to truth importer after the cutover build.
- Remove startup paths that decode legacy unified-card snapshots or read split legacy card files as active recovery inputs.
- Keep current MessagePack truth segments, SQL projections, Review journal flush/backfill, and projection rebuild as the only active storage recovery path.
- Keep legacy migration evidence only as historical receipts/diagnostics where needed; do not keep import code for future startup.
- Tighten runtime MessagePack checks so legacy source/import files are no longer allowlisted once deleted.

## Capabilities

### New Capabilities

### Modified Capabilities
- `sql-first-card-runtime`: Legacy snapshot storage changes from runtime migration/recovery input to retired one-time migration artifact; active startup must fail closed or use truth/projection rebuild, not legacy import fallback.

## Impact

- Affected runtime files: `worker/truth/LegacyUnifiedCardsSource.ts`, `worker/truth/LegacyUnifiedCardsMigrationReceipt.ts`, `worker/truth/LegacyUnifiedCardsTruthMigration.ts`, and their tests.
- Affected wiring/docs/checks: backend startup storage gate, `ARCHITECTURE.md`, `scripts/check-no-runtime-msgpack.cjs`, and runtime MessagePack allowlist tests.
- Affected data: existing truth segments, SQL projections, review truth/backfill, and migration receipts remain readable as evidence; legacy unified-card snapshot import is no longer a supported active startup path.
