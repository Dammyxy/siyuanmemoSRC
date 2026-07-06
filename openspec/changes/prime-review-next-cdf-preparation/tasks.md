## 1. Feedback Loop

- [x] 1.1 Read fresh live logs and confirm backend attribution is now labeled while frontend CDF preparation dominates.
- [x] 1.2 Trace `consume-advance.prepare-selected-review-card` through `UnifiedQueueStrategy.prepareSelectedReviewCard()`.
- [x] 1.3 Identify that the existing cache only covers repeated preparation of the same card, not the next card after rating.

## 2. Implementation

- [x] 2.1 Add pending next-card CDF preparation evidence inside `UnifiedQueueStrategy`.
- [x] 2.2 Add worker Review session one-card lookahead state so runtime-backed Review sessions can expose the backend-owned next candidate.
- [x] 2.3 Prime the next card after current-card preparation/display for runtime-backed Review sessions.
- [x] 2.4 Reuse matching pending evidence when feedback advances to that card.
- [x] 2.5 Clear pending evidence on reload, restore, and cache invalidation.
- [x] 2.6 Preserve stale-evidence fallback, duplicate-current-card handling, and fail-closed Review behavior.
- [x] 2.7 Preserve keyed CDF preparation evidence across delayed ordinary `queue-changed` events while still clearing it for full refresh and matching card identity changes.
- [x] 2.8 Preserve next-card pending evidence when a delayed current-card `card-updated` event invalidates only completed current evidence.
- [x] 2.9 Extract `ReviewCdfPreparationEvidenceStore` so pending/completed evidence, event-order invalidation, diagnostics, and self-update preservation live behind one Review-side Module interface.

## 3. Tests

- [x] 3.1 Add focused regression proving next-card CDF preparation is primed before feedback consumes it.
- [x] 3.2 Add focused regression proving current-card updates do not erase next-card pending evidence.
- [x] 3.3 Run focused `UnifiedQueueStrategy.performance` CDF preparation tests.
- [x] 3.4 Run affected Review session tests.
- [x] 3.5 Add focused store regressions for self-issued pending update preservation, second matching pending update invalidation, and completed-current/pending-next slot separation.

## 4. Docs And Validation

- [x] 4.1 Update architecture/debt docs with the next-card preparation ownership decision.
- [x] 4.2 Run `pnpm run check:boundaries`.
- [x] 4.3 Run `pnpm build`.
- [x] 4.4 Run `openspec validate prime-review-next-cdf-preparation --strict`.
