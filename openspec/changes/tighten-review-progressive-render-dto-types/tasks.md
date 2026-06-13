## 1. Characterization Tests

- [x] 1.1 Add focused Review render DTO tests for valid progressive metadata pass-through, malformed DTO rejection, and legacy source-lineage fallback.
- [x] 1.2 Run the focused tests in red state or document which existing behavior already passes before refactor.

## 2. Implementation

- [x] 2.1 Add a typed progressive render DTO normalizer in the Review render context module.
- [x] 2.2 Refactor `UnifiedReviewAdapter` to delegate progressive render metadata normalization and remove adapter-local progressive DTO casts.
- [x] 2.3 Preserve legacy excerpt/piece source-lineage fallback behavior through the shared normalizer.

## 3. Verification And Debt Ledger

- [x] 3.1 Run focused Review adapter/render DTO Vitest coverage.
- [x] 3.2 Run `openspec validate tighten-review-progressive-render-dto-types --strict`.
- [x] 3.3 Run `pnpm run check:boundaries`, `git diff --check`, and targeted TypeScript/build checks as needed.
- [x] 3.4 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred type debt.
