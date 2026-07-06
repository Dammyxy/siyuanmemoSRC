## 1. Exploration and Invariants

- [x] 1.1 Trace ordinary Review answer persistence and identify every required durable fact.
- [x] 1.2 Define Review Ledger and Card Schedule Store Interfaces and invariants.
- [x] 1.3 Identify all SQLite delta reads/writes currently inside the answer success gate.

## 2. Tests First

- [x] 2.1 Add a regression test proving consecutive Review answers do not read historical sealed delta segments on the hot path.
- [ ] 2.2 Add idempotency test proving duplicate answer commands reconcile against ledger facts without duplicate Review events.
- [ ] 2.3 Add crash-recovery test proving ledger/card schedule facts replay without projection authority.
- [ ] 2.4 Add failure test proving ledger/card schedule failure fails the answer closed.

## 3. Implementation

- [ ] 3.1 Introduce named Review Ledger / Card Schedule Store seam around existing SQL/journal writes.
- [x] 3.2 Refactor SQLite delta append preflight to avoid sealed segment reads during ordinary same-runtime Review answers.
- [ ] 3.3 Move delta checkpoint/sync diagnostics out of kernel answer authority result.
- [x] 3.4 Preserve checksum/sequence evidence and startup recovery verification.

## 4. Docs and Validation

- [x] 4.1 Update `CONTEXT.md` with Review Ledger, Card Schedule Store, Delta Sync Adapter terms.
- [x] 4.2 Update `ARCHITECTURE.md` storage/Review path.
- [x] 4.3 Update `docs/DDD_RESCAN_BACKLOG.md`.
- [x] 4.4 Run focused SQLite delta and Review feedback tests.
- [x] 4.5 Run `pnpm run check:boundaries`.
- [x] 4.6 Run `pnpm build`.
- [x] 4.7 Run `openspec validate separate-review-ledger-from-delta-sync --strict`.
