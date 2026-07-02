## Context

The active runtime already treats SQL projections and MessagePack truth segments as storage authority. Legacy unified-card migration still keeps a runtime importer and source detector for `unified-cards.msgpack`, plus receipt reconciliation and a MessagePack allowlist exception. That code was useful for the first cutover, but now keeps an old storage truth path alive.

## Goals / Non-Goals

**Goals:**
- Remove runtime import from legacy unified-card snapshots after the one-time migration window.
- Make startup use existing truth/projection rebuild paths or fail closed with explicit storage-unavailable diagnostics.
- Remove legacy migration files from runtime MessagePack allowlists and tests once the importer is deleted.
- Keep historical migration receipts as evidence only, not as an active import trigger.

**Non-Goals:**
- Do not redesign MessagePack truth segment storage.
- Do not change Review journal flush/backfill semantics.
- Do not add a new compatibility mode for users who skipped the migration window.
- Do not retire unrelated SQLite initial migration helpers in this change unless they are directly wired to the unified-card truth importer.

## Decisions

- Retire import code instead of hiding it behind a flag. The user decision is "migrate once, then delete"; a flag would preserve the second path and keep the MessagePack allowlist debt.
- Treat missing truth after cutover as explicit unsupported/migration-required startup failure. Silent import from `unified-cards.msgpack` would make legacy storage authoritative again.
- Preserve truth-without-receipt handling only if it is still needed as passive evidence. It must not read or decode legacy source files.
- Use existing storage gate diagnostics. No new recovery surface is added; Browser/Review should already stop on backend startup storage failure.

## Risks / Trade-offs

- Users who never ran the cutover migration cannot be auto-imported by a post-retirement build -> Mitigation: fail closed with a clear migration-required/storage-unavailable diagnostic instead of corrupting or inventing truth.
- Existing tests may encode first-start import behavior -> Mitigation: replace them with tests proving no legacy source decode/read happens on active startup.
- Runtime MessagePack audit may still allow deleted files -> Mitigation: update `scripts/check-no-runtime-msgpack.cjs` allowlist and its tests in the same implementation.

