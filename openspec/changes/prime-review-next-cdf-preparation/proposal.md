## Why

Fresh Review logs after the SQLite metadata Adapter repair show attribution is now correct, but visible grading is still slow:

- Backend `review.session.feedback`: about 568-636ms, with labeled `sqlite-delta.append-preflight` sealed reads.
- Frontend `slow review feedback frontend summary`: about 2.5-5.0s.
- Dominant frontend step: `consume-advance.prepare-selected-review-card` / `consume-advance.refresh-cdf-live-relation`.

The existing CDF preparation cache only reuses evidence when the same current card is prepared again. Ordinary rating advances to a new next card, so its CDF live relation refresh still runs synchronously after feedback.

## What Changes

- Prime CDF preparation evidence for the next Review session card after the current card is prepared and displayed.
- Add a backend Review session one-card lookahead contract so worker-backed sessions expose the next preparation candidate without projection reread or UI-side selection.
- Reuse that prepared evidence when `review.session.feedback` advances to the same next card.
- Keep the existing key/signature guard so stale or mismatched next-card evidence falls back to full refresh.
- Keep duplicate handling fail-closed: cached duplicate outcomes still discard the noncanonical current card rather than exposing it as reviewable.
- Preserve existing timing diagnostics, surfacing reuse as `reuse-cdf-preparation-evidence`.

## Capabilities

### New Capabilities
- `review-next-card-cdf-preparation`: Covers Review card preparation evidence that can be safely computed before a rating consumes the next card.

### Modified Capabilities

## Impact

- Affected code:
  - `src/application/adapters/UnifiedQueueStrategy.ts`
  - `src/application/adapters/review-session/WorkerReviewSessionQueueRuntime.ts`
  - `worker/review/WorkerReviewSessionRuntime.ts`
  - `packages/contracts/src/backend-rpc.ts`
  - `src/application/__tests__/UnifiedQueueStrategy.performance.test.ts`
  - `ARCHITECTURE.md`
  - `docs/DDD_RESCAN_BACKLOG.md`
- Affected systems:
  - Review Feedback Advancement
  - Runtime-backed RetrievalPractice / IncrementalLearning current-card preparation
  - CDF live relation refresh diagnostics
- Validation requires focused `UnifiedQueueStrategy.performance` tests, affected Review session tests, strict OpenSpec validation, `pnpm run check:boundaries`, and `pnpm build`.
