## 1. Focused Coverage

- [x] 1.1 Add a focused TabManager Review tab test proving valid Review queue snapshot DTOs reach the queue restore path.
- [x] 1.2 Add a focused TabManager Review tab test proving malformed snapshot card/counter DTOs are rejected during restore normalization.

## 2. Implementation

- [x] 2.1 Add narrow `TabManager` DTO guards/normalizers for `FSRSCard` values in Review queue snapshots.
- [x] 2.2 Add narrow `TabManager` DTO guard/normalizer for `QueueCounterSnapshot`.
- [x] 2.3 Route `normalizeReviewQueueSessionSnapshot()` through the new DTO normalizers without changing Review tab payload shape or queue restore ownership.

## 3. Validation And Debt Ledger

- [x] 3.1 Verify filtered `tsc --noEmit` no longer reports `TabManager.ts` Review queue snapshot DTO errors.
- [x] 3.2 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred type debt.
- [x] 3.3 Run focused Vitest, OpenSpec strict validation, `pnpm run check:boundaries`, `git diff --check`, and `pnpm build`.
