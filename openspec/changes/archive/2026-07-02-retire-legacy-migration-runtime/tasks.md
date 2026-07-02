## 1. Implementation

- [x] 1.1 Trace backend startup storage gate and identify every call to `LegacyUnifiedCardsTruthMigration`, `LegacyUnifiedCardsSource`, and migration receipt reconciliation.
- [x] 1.2 Remove the active startup import path that decodes `unified-cards.msgpack` or split legacy card files into MessagePack truth.
- [x] 1.3 Delete retired legacy unified-card migration source/import modules and update imports, exports, and tests.
- [x] 1.4 Keep only passive migration receipt evidence if still needed; ensure it cannot trigger legacy source reads or imports.
- [x] 1.5 Update `scripts/check-no-runtime-msgpack.cjs` and its tests so retired legacy importer files are no longer runtime MessagePack allowlist exceptions.
- [x] 1.6 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` to state legacy unified-card import is retired after one-time migration.

## 2. Validation

- [x] 2.1 Add/update focused tests for backend startup without truth: explicit migration-required/storage-unavailable result, no legacy snapshot decode.
- [x] 2.2 Add/update focused tests proving truth/projection rebuild paths still work without legacy import fallback.
- [x] 2.3 Run runtime MessagePack audit and affected migration/storage tests.
- [x] 2.4 Run `pnpm build`.
