## Why

Live Review grading after the repair-gate change still takes about 2.4-2.5s. Worker pre-request merge is now skipped, but frontend timing shows `consume-advance.prepare-selected-review-card` dominates at about 1.8-1.9s, almost entirely inside `consume-advance.refresh-cdf-live-relation`.

## What Changes

- Introduce a narrow Review card preparation optimization for CDF live relation refresh on the next card.
- Avoid blocking every successful rating on a full CDF live relation refresh when the selected card already has fresh preparation evidence.
- Preserve fail-closed CDF correctness: blocking/duplicate decisions must still apply before the card becomes reviewable, and stale or missing preparation evidence must refresh normally.
- Keep timing diagnostics copyable so rebuilt live logs can prove whether `prepare-selected-review-card` and `refresh-cdf-live-relation` moved off the visible rating path.
- Do not introduce a Session Read Model, prepared-card window, scheduler rewrite, or stale snapshot fallback in this change.

## Capabilities

### New Capabilities
- `review-card-preparation-cdf-refresh`: Review card preparation can reuse fresh CDF live relation preparation evidence so ordinary rating does not repeatedly block on CDF refresh for the next visible card.

### Modified Capabilities
- `sql-first-card-runtime`: SQL-first Review rating remains worker-owned while frontend next-card preparation avoids unnecessary CDF refresh work after a committed rating.

## Impact

- Affected Review path: `src/application/adapters/UnifiedQueueStrategy.ts`, `src/application/__tests__/UnifiedQueueStrategy.performance.test.ts`, and Review timing diagnostics.
- Affected CDF path: `ReviewApplicationService.refreshCdfLiveRelationOnOpen()` as the owned refresher entry; no direct UI-side CDF repair or stale fallback.
- Documentation: `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`, and this OpenSpec change.
- Validation: focused `UnifiedQueueStrategy.performance` tests, affected Review session tests, boundary check, build, and strict OpenSpec validation.
