## 1. Browser Queue Command Retirement

- [x] 1.1 Add regression coverage proving Browser queue add/remove paths do not require direct queue mutation methods.
- [x] 1.2 Replace Browser add-to-queue direct `queue.addCards()` fallback with application command dispatch or explicit unavailable.
- [x] 1.3 Replace Browser remove-from-queue direct `queue.removeCards()` fallback with application command dispatch or explicit unavailable.
- [x] 1.4 Keep one-shot/local queue test helpers out of Browser runtime command paths.

## 2. Browser Queue Read Retirement

- [x] 2.1 Add regression coverage for Browser long-lived queue datasource fail-closed reads without `queue.getCards()`.
- [x] 2.2 Remove remaining long-lived Browser datasource `queue.getCards()` reads for projection-owned queues.
- [x] 2.3 Keep Retrieval/Incremental legacy read behavior classified or move them to projection reads if active runtime requires it.

## 3. Review Transfer And Filter Runtime

- [x] 3.1 Add regression coverage for Review transfer state obtained through transfer runtime rather than direct View-layer snapshot access.
- [x] 3.2 Move direct `serializeSessionSnapshot()` / `restoreSessionSnapshot()` dependencies out of `ReviewView.vue` where runtime transfer helpers can own them.
- [x] 3.3 Replace direct runtime `FilterGroupQueue.setFilter()` usage with explicit Review filter command handling or unavailable result.

## 4. Boundary Governance

- [x] 4.1 Add a checker that rejects public queue authority methods in guarded UI/runtime files.
- [x] 4.2 Wire the checker into `pnpm run check:boundaries`.
- [x] 4.3 Add focused checker tests/fixtures for allowed internal queue implementation and rejected UI runtime calls.

## 5. Docs And Validation

- [x] 5.1 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with public queue API retirement rules and deferred internal cleanup.
- [x] 5.2 Run targeted Browser/Review/queue tests touched by this change.
- [x] 5.3 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 5.4 Run `pnpm run check:boundaries`.
- [x] 5.5 Run `pnpm build`.
- [x] 5.6 Run `openspec validate retire-public-review-queue-api --strict`.
