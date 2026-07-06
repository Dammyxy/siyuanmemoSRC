## 1. Feedback Loop

- [x] 1.1 Trace active `review.session.feedback` commit path from worker handler to SQLite delta persistence.
- [x] 1.2 Add focused diagnostics/test coverage proving slow summaries can distinguish session commit, SQLite delta host effects, queue impact, and handler/request-total.
- [x] 1.3 Add focused SQLite/Review regression counting redundant persisted segment reads or manifest writes during ordinary consecutive Review commits.

## 2. Implementation

- [x] 2.1 Preserve existing CDF preparation cache behavior while working only on worker/session/SQLite commit path.
- [ ] 2.2 Implement the smallest measured optimization for redundant SQLite delta host work, scoped to the owner of storage evidence invariants.
- [ ] 2.3 Invalidate same-runtime evidence on diagnostics, replay, repair, checkpoint, discard, startup, failure, and checksum mismatch paths.
- [x] 2.4 Preserve fail-closed durable Review commit envelope when storage evidence is missing or failed.
- [x] 2.5 Preserve or improve copyable worker-handle timing summary fields for post-change live classification.

## 3. Docs And Debt Ledger

- [x] 3.1 Update `ARCHITECTURE.md` with Review session SQLite commit hot-path ownership and non-goals.
- [x] 3.2 Append `docs/DDD_RESCAN_BACKLOG.md` task delta with fixed and deferred debts.
- [x] 3.3 Record any larger deferred architecture option, such as native SQLite/WAL, host bridge cache, or async durability, only if tracing proves it is needed.

## 4. Validation

- [x] 4.1 Run focused SQLite/Review session commit tests.
- [x] 4.2 Run affected Review session hot-path tests.
- [x] 4.3 Run `pnpm run check:boundaries`.
- [x] 4.4 Run `pnpm build`.
- [x] 4.5 Run `openspec validate optimize-review-session-sqlite-commit-hot-path --strict`.
