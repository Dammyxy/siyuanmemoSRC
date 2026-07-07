## Context

After `separate-browser-queue-count-read-model`, Browser sidebar count refresh no longer explains the remaining unrelated queue creation logs. The new live log points at Review scoring:

`review.feedback -> consume-advance.prepare-selected-review-card -> refresh-cdf-live-relation -> updateCard -> invalidateQueuesForCardMutation -> FilterGroupQueue load`

This means Review card preparation still mixes two different jobs:

- show the next card quickly;
- repair/write CDF live-relation metadata and fan out queue/projection invalidation.

Anki keeps answer switching small: answer transaction updates the card, study queue state advances, and broader queue rebuild/maintenance is separate from the visible reviewer step. SiYuanMemo should keep CDF safety and SQL/projection ownership, but the Review scoring hot path must not create unrelated queue Modules just because a CDF metadata refresh happened.

## Goals / Non-Goals

**Goals:**

- Keep Review scoring and next-card display independent from CDF write repair and broad queue invalidation.
- Make CDF preparation in Review hot path read-only or explicitly deferred.
- Add precise queue impact for metadata-only card updates so CDF metadata refresh does not invalidate every dynamic queue.
- Preserve CDF duplicate detection and fail-closed behavior where a noncanonical current Review card must not be scored.
- Add tests proving Retrieval Practice scoring does not create or reload FilterGroup/NeuralRoam queue Modules via CDF preparation.

**Non-Goals:**

- No scheduler algorithm rewrite.
- No rewrite of Browser Queue Count Read Model.
- No hidden fallback to stale queue snapshots.
- No removal of CDF live-relation repair; it moves behind explicit repair/deferred evidence.
- No broad async commit queue rewrite; this change is the smaller follow-up focused on CDF + queue invalidation.

## Decisions

1. Review CDF preparation becomes read-mostly on the scoring hot path.

   `UnifiedQueueStrategy` may ask for CDF preparation evidence before showing a card, but ordinary `prepareSelectedReviewCard()` must not synchronously persist CDF metadata repair. It can consume current card duplicate evidence and updated-card presentation evidence, but write repair is deferred or explicit.

   Alternative rejected: keep current synchronous `refreshCdfLiveRelationOnOpen()` writes. This preserves metadata freshness but keeps Review speed coupled to CDF tree scans, card writes, and queue fanout.

2. CDF repair writes declare narrow queue impact.

   `CardMutationOptions` or equivalent mutation metadata will distinguish schedule/membership-changing updates from CDF metadata-only repair. Metadata-only CDF repair should notify affected cards/blocks and projection repair state, but must not blindly invalidate `RetrievalPractice`, `IncrementalLearning`, and `FilterGroup`.

   Alternative rejected: lower log level only. That hides symptom but still pays queue creation and cache churn cost.

3. Queue invalidation becomes impact-driven.

   `UnifiedDataSourceManager.invalidateQueuesForCardMutation()` should no longer be the only path for all card writes. It should accept/derive mutation impact and invalidate only affected queue read models. Broad invalidation remains for unknown or scheduling/membership mutations.

   Alternative rejected: skip invalidation for all metadata updates. Some metadata affects priority, source existence, Browser rows, or CDF duplicate state, so unknown updates still need safe invalidation.

4. Duplicate safety stays synchronous only when needed.

   If CDF evidence says the currently visible card is a noncanonical duplicate, Review must still exit/skip that card before scoring. But that evidence should be obtained from read-only reconciliation where possible; repair writes that mark other cards are deferred.

   Alternative rejected: defer all CDF work including duplicate detection. That risks scoring a duplicate card the user should not answer.

## Risks / Trade-offs

- [Risk] CDF metadata appears stale for a short time after Review opens a card. Mitigation: expose deferred/repair-required evidence and let Browser/repair flows reconcile later.
- [Risk] Too-narrow queue impact misses a real queue membership change. Mitigation: default unknown mutations to broad invalidation; use narrow impact only for explicitly classified CDF metadata-only repair.
- [Risk] Existing tests expect `refreshCdfLiveRelationOnOpen()` to write during Review open. Mitigation: update behavior tests to assert visible-card safety and deferred repair evidence, not hidden writes.
- [Risk] Deferred CDF repair failures become invisible. Mitigation: add typed diagnostics/logs for `cdf-repair-deferred` and `cdf-repair-required` rather than swallowing failures.

## Migration Plan

1. Add failing Review/CDF regression proving Retrieval Practice scoring does not create FilterGroup via CDF preparation.
2. Add focused queue-impact regression for metadata-only CDF update.
3. Split CDF Review preparation options into read-only/deferred vs write repair.
4. Route Review preparation through read-only/deferred mode.
5. Add precise queue-impact handling for CDF metadata-only updates.
6. Update docs/backlog with the new ownership rule.
7. Run focused tests, hidden fallback check, boundary check, build, and strict OpenSpec validation.

Rollback strategy: revert this change as a unit. Do not keep a runtime fallback toggle with two CDF preparation authorities.

## Open Questions

- Should deferred CDF repair run immediately after visible card assignment or only during idle/background maintenance? Recommended first implementation: schedule after visible assignment, non-blocking, with diagnostics.
- Should CDF duplicate detection be read-only in all cases? Recommended first implementation: yes for Review hot path; repair writes happen after the card is hidden/skipped.
