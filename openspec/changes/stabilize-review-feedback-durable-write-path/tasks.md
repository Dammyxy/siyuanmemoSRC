## 1. Regression Tests And Trace

- [x] 1.1 Add a focused SQLite delta test that corrupts `sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack` before `review.feedback` and proves the same corrupt segment is not replayed during recovery
- [x] 1.2 Add a focused SQLite delta test for successful checkpoint repair from the post-commit in-memory database with pending manifest state cleared
- [x] 1.3 Add a focused SQLite delta test for unsafe or failed checkpoint repair returning explicit repair-required/unavailable without committed success
- [x] 1.4 Add or update Review feedback timing diagnostics tests so corrupt-delta recovery reports repair mode and avoids repeated restore/replay loops

## 2. P0 Corrupt Delta Recovery

- [x] 2.1 Add a delta-layer corrupt-open-segment classification path for checksum mismatch on the v2 open segment
- [x] 2.2 Ensure restore/replay can exclude the known corrupt open segment during the current recovery attempt
- [x] 2.3 Implement checkpoint repair that writes a full durable SQLite checkpoint from proven post-commit in-memory state and clears pending delta metadata
- [x] 2.4 Return typed repair-required/unavailable diagnostics when corrupt-delta repair cannot be proven safe
- [x] 2.5 Add diagnostics for delta append, checkpoint repair, repair-required, unavailable, and corrupt segment cleanup

## 3. P1 Minimum Review Commit

- [x] 3.1 Trace the active `review.feedback` worker path and identify every synchronous side effect after scheduler/card state and review event persistence
- [x] 3.2 Tighten the durable success gate so committed success requires card scheduler/current state, append-only review evidence, and idempotency identity only
- [x] 3.3 Move or confirm queue projection patch/rebuild returns explicit patched/deferred/stale/refresh-required impact without blocking ordinary committed success on a full rebuild
- [x] 3.4 Move or confirm truth flush scheduling returns pending/failed diagnostics without blocking ordinary committed success after the minimum durable commit
- [x] 3.5 Ensure full-database checkpoint maintenance is not required for ordinary Review feedback success unless delta policy explicitly selects checkpoint repair or threshold checkpoint

## 4. Idempotency And Failure Semantics

- [x] 4.1 Add tests proving retry with the same idempotency key returns existing durable review evidence without duplicate review events
- [x] 4.2 Add tests proving mismatched idempotency retry fails closed with an explicit conflict diagnostic
- [x] 4.3 Ensure Review session state surfaces commit-applied, commit-failed, repair-required, unavailable, and derived-work-pending states without hidden success

## 5. Docs And Validation

- [x] 5.1 Update `ARCHITECTURE.md` if the Review feedback durable write sequence or ownership map changes
- [x] 5.2 Update `docs/DDD_RESCAN_BACKLOG.md` with deferred native SQLite/WAL and broader storage-topology debt
- [x] 5.3 Run focused SQLite delta/checkpoint tests
- [x] 5.4 Run focused backend Review feedback and Review session commit-state tests
- [x] 5.5 Run `pnpm run check:boundaries`
- [x] 5.6 Run `pnpm build`
