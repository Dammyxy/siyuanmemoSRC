## 1. Baseline And Tests

- [x] 1.1 Add or update focused tests that prove SRS v2 Review feedback can consume the `answerAndAdvance` next-card result without calling a second full `queue.next()` path.
- [x] 1.2 Add UnifiedStorage tests proving `getCardDTOsByXiuyuanId()` does not mutate DTOs, indexes, or dirty state during reads.
- [x] 1.3 Add worker DB/preflight tests for no-conflict own-review fast-skip and real-conflict forced merge behavior.

## 2. Review Session Hot Path

- [x] 2.1 Extend the Review queue strategy/session interface to expose the next card and counter snapshot returned by SRS v2 `answerAndAdvance`.
- [x] 2.2 Update `ReviewSessionController.grade()` or its queue adapter path to apply the returned next item directly after successful feedback.
- [x] 2.3 Preserve explicit conflict/unavailable handling and avoid stale local fallback for Review feedback failure paths.

## 3. UnifiedStorage Read Purity And Indexing

- [x] 3.1 Add a maintained Xiuyuan-to-card DTO index populated during canonical store load and updated during DTO add/update/delete/rebind operations.
- [x] 3.2 Refactor `getCardDTOsByXiuyuanId()` to read from the maintained index without scanning the full DTO table or repairing bindings.
- [x] 3.3 Move legacy/malformed Xiuyuan binding repairs into explicit canonicalization or repair flows with diagnostics instead of read-time mutation.

## 4. Worker Review Preflight Precision

- [x] 4.1 Trace current fast-skip invalidation reasons around `queue.projection.replace` and own Review feedback persistence.
- [x] 4.2 Tighten invalidation so own Review feedback and projection replacement do not force persisted main DB reads without external conflict evidence.
- [x] 4.3 Keep durable commit checks fail-closed for missing storage envelope, failed journal/projection state, queue impact failure, or real conflict merge failure.

## 5. Validation And Documentation

- [x] 5.1 Run targeted Review/Queue/Storage tests for changed slices.
- [x] 5.2 Run `pnpm run check:boundaries` or `node scripts/check-hidden-fallbacks.cjs` as appropriate for touched code.
- [x] 5.3 Run `pnpm build`.
- [x] 5.4 Update `ARCHITECTURE.md` if runtime ownership or call-chain contracts change.
- [x] 5.5 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred debt after production code changes.
