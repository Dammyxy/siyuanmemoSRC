## 1. Feedback Loop

- [x] 1.1 Add a focused SQLite delta test proving same-runtime sealed evidence is reused during append preflight.
- [x] 1.2 Preserve the reload/cold-runtime test proving persisted sealed bytes are still read and attributed.

## 2. Implementation

- [x] 2.1 Rename the checkpoint evidence option from open-segment-specific to identity-scoped verified segment evidence.
- [x] 2.2 Route append-preflight snapshot reconstruction through verified segment evidence for both open and sealed segments.
- [x] 2.3 Preserve existing evidence invalidation on diagnostics, replay, repair, checkpoint, discard, startup/reload, failure, and checksum mismatch paths.
- [x] 2.4 Keep fail-closed behavior for missing, corrupt, or checksum-mismatched sealed segments.

## 3. Docs And Debt Ledger

- [x] 3.1 Update `ARCHITECTURE.md` with the sealed evidence reuse ownership decision.
- [x] 3.2 Append `docs/DDD_RESCAN_BACKLOG.md` task delta with fixed and deferred debts.

## 4. Validation

- [x] 4.1 Run focused SQLite delta tests for sealed/open evidence reuse and recovery paths.
- [x] 4.2 Run `pnpm run check:boundaries`.
- [x] 4.3 Run `pnpm build`.
- [x] 4.4 Run `openspec validate optimize-sqlite-delta-sealed-evidence-reuse --strict`.
