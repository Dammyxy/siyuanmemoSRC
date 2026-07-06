## 1. Feedback Loop

- [x] 1.1 Add focused `UnifiedQueueStrategy.performance` regression proving repeated preparation of the same fresh CDF card does not call `refreshCdfLiveRelationOnOpen` twice.
- [x] 1.2 Add focused regression proving stale/mismatched CDF metadata still refreshes normally.
- [x] 1.3 Add focused regression proving duplicate outcome from preparation evidence still exits/skips the card rather than exposing it.

## 2. Implementation

- [x] 2.1 Add a narrow Review card preparation evidence cache/gate inside `UnifiedQueueStrategy`.
- [x] 2.2 Key the evidence by card identity and CDF-relevant metadata signature.
- [x] 2.3 Reuse cached prepared card evidence only when the key matches; otherwise run existing refresh.
- [x] 2.4 Clear or bypass evidence on reload, unprepared replacement, preparation failure, and Review CDF write/repair paths.
- [x] 2.5 Preserve existing timing diagnostics and add cache-hit metadata where useful.

## 3. Docs And Debt Ledger

- [x] 3.1 Update `ARCHITECTURE.md` with Review card preparation cache ownership and non-goals.
- [x] 3.2 Append `docs/DDD_RESCAN_BACKLOG.md` task delta with fixed and deferred debts.
- [x] 3.3 Record Session Read Model as deferred Change 4 unless post-change logs still require it.

## 4. Validation

- [x] 4.1 Run focused `UnifiedQueueStrategy.performance` tests.
- [x] 4.2 Run affected Review session tests.
- [x] 4.3 Run `pnpm run check:boundaries`.
- [x] 4.4 Run `pnpm build`.
- [x] 4.5 Run `openspec validate optimize-review-card-preparation-cdf-refresh --strict`.
