## Context

The latest live logs classify slow rating as mostly frontend card preparation, not worker repair merge:

- `review.session.feedback` worker handle: about 600ms.
- `preMerge=kernel:sync-divergent-diagnostic 0ms skipped=true reason=review-rating-repair-gate`.
- Frontend `consume-advance`: about 1.8-1.9s.
- Dominant child: `consume-advance.prepare-selected-review-card` / `consume-advance.refresh-cdf-live-relation`.

The active call chain is:

`ReviewSessionController.grade()` -> `UnifiedQueueStrategy.onFeedback()` -> `consumeRuntimeAdvance()` -> `prepareSelectedReviewCard()` -> `refreshCdfLiveRelationOnReviewOpen()` -> `ReviewApplicationService.refreshCdfLiveRelationOnOpen()` -> `CdfLiveRelationRefreshService.refreshCurrentCardOnOpen()`.

## Goals / Non-Goals

**Goals:**

- Keep the visible rating path from blocking on repeated CDF live relation refresh when fresh preparation evidence is already available.
- Keep CDF correctness explicit: duplicate outcomes, blocking live relation status, or stale source evidence must still refresh before exposing the next card as safe to review.
- Keep `UnifiedQueueStrategy` as Review command orchestration, with a small preparation cache/gate rather than a broad Session Read Model.
- Preserve timing diagnostics for `consume-advance.prepare-selected-review-card` and `consume-advance.refresh-cdf-live-relation`.

**Non-Goals:**

- No Session Read Model / prepared-card window.
- No scheduler algorithm rewrite.
- No worker-side card preparation redesign.
- No CDF write/repair behavior change.
- No stale snapshot fallback when preparation evidence is missing or stale.

## Decisions

### Decision 1: Add a narrow per-card preparation evidence cache in `UnifiedQueueStrategy`

`UnifiedQueueStrategy` already owns `prepareSelectedReviewCard()` for the Review navigation surface. This change keeps the optimization local: when a card was just prepared and its CDF-relevant identity has not changed, the next `prepareSelectedReviewCard()` can reuse that result instead of calling the expensive refresh again.

Alternative considered: add a Session Read Model. Rejected for this change because live evidence points to one specific CDF refresh step, and a read model crosses wider queue/session ownership.

### Decision 2: Cache only CDF-safe preparation evidence

The cache key must include the selected card identity and CDF-relevant metadata signature. Reuse is allowed only when the card id/block id/source relation metadata signature matches. If duplicate outcome or updated card evidence exists, the cached prepared card is reused; if no cache exists, the existing refresh path runs.

Alternative considered: skip CDF refresh unconditionally after rating. Rejected because CDF blocking and duplicate outcomes are correctness gates, not decorative preparation.

### Decision 3: Invalidate on card/source-changing events inside the active slice

The cache is cleared when the queue reloads, current card is replaced by an unprepared source, Review write/repair occurs, or preparation throws. This keeps the module conservative without adding a global dependency tracker.

Alternative considered: observe all source transactions before reuse. Deferred because this change should stay local and prove the simple win first.

## Risks / Trade-offs

- [Risk] Reusing stale CDF evidence after a source edit could expose a card that should block. Mitigation: use conservative CDF metadata signatures and clear cache on Review write/repair paths; do not reuse when evidence is missing.
- [Risk] Cache hides duplicate-exit decisions. Mitigation: cache carries `currentReviewDuplicateOutcome` and applies the existing duplicate-exit path.
- [Risk] Metrics become misleading if cache hits are invisible. Mitigation: add diagnostics step/metadata for cache hit vs refresh.
- [Risk] Frontend still slow after cache. Mitigation: then proceed to Session Read Model as Change 4 with measured evidence.
