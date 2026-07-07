## 1. Manual Queue Review Semantics

- [x] 1.1 Add focused regression coverage for a Browser-added Retrieval Practice card reviewed through worker session feedback, proving formal schedule commit and persisted manual membership cleanup.
- [x] 1.2 Add local-session regression coverage for the same manual Retrieval Practice review semantics.
- [x] 1.3 Route manual Retrieval Practice review context to `write-schedule` for explicit Browser-added cards while preserving preview-only for unrelated filtered preview flows.
- [x] 1.4 Add or wire a commit-gated manual membership cleanup command for worker review-session feedback without calling full `queue.handleReview()` from the worker path.
- [x] 1.5 Ensure cleanup is idempotent for duplicate feedback and does not run after failed, unavailable, or conflicting feedback.

## 2. Browser Add Menu Simplification

- [x] 2.1 Update `buildAddToQueueAction()` so Retrieval Practice and Incremental Learning each appear once in the visible submenu.
- [x] 2.2 Keep legacy `add-to-*-queue-all` route IDs internally routeable or explicitly mapped to the visible action behavior.
- [x] 2.3 Update action feedback, i18n/test expectations, and menu snapshots for the simplified add menu.

## 3. Batch Operation Performance

- [x] 3.1 Inventory Browser batch action paths for queue add/remove, delete, priority, suspend, postpone, advance, spread, and review-scope preparation.
- [x] 3.2 Convert high-impact selected-row actions to bulk manager/application APIs where available, failing explicitly when authority is unavailable.
- [x] 3.3 Coalesce cache invalidation, observer notification, queue count refresh, and projection refresh for one batch action into one grouped flow.
- [x] 3.4 Add representative large-selection tests or instrumentation assertions proving no per-row live queue reads and bounded refresh calls.

## 4. Validation And Debt Ledger

- [x] 4.1 Run targeted Vitest suites for Browser datasource/menu actions, Retrieval/Incremental manual membership, UnifiedQueueStrategy session feedback, and worker review session feedback.
- [x] 4.2 Run `pnpm run check:boundaries` or `node scripts/check-hidden-fallbacks.cjs` and fix active-slice violations.
- [x] 4.3 Run `pnpm build`.
- [x] 4.4 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred debt for the touched Review/Queue/Browser slices.
