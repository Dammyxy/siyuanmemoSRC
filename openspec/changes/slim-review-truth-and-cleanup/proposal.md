## Why

Review rating is still slow after the previous hot-path work because `review-events` MessagePack truth has grown into hard storage pressure. Ordinary `review.session.feedback` now runs synchronous exact inventory before commit, and that exact inventory repeatedly reads the SQLite projection and lists truth files on the rating path.

The pressure is not caused by the current scheduler or SQL mutation itself. It is caused by bloated Review truth records that publish full SQLite operation evidence into the `review-events` family, so cleanup must stop new bloat and rewrite existing bloated truth into skinny Review facts.

## What Changes

- Add a Review-specific truth publication encoder for `review/event` and `review/metadata` outputs that emits skinny Review fact records instead of generic storage records carrying SQL operations.
- Add a Review truth size/shape guard so new `review-events` truth records cannot include SQL `operations` or oversized aggregate payloads.
- Keep legacy operation replay for old `storage.review.*` records, but make it an explicit legacy adapter and prevent new publication from producing those records.
- Add verified Review truth cleanup that replays existing Review evidence, rewrites bloated operation-bearing records into skinny facts, verifies projection equivalence, publishes a fenced generation, and retains previous generation until the rewrite is verified.
- Refresh storage pressure after cleanup so old `review-events` bloat no longer forces synchronous exact inventory during ordinary Review feedback.
- Do not add a blanket Review feedback hard-pressure bypass. Any admission relaxation must be growth-aware and only after root cleanup is available.

## Capabilities

### New Capabilities
- `review-truth-slimming`: Defines skinny Review truth publication, bloat guards, legacy operation replay boundaries, verified cleanup, and the post-cleanup Review feedback storage-pressure contract.

### Modified Capabilities
None.

## Impact

- Affected production code: `worker/truth/WorkerTruthPublicationModule.ts`, a new Review truth publication encoder module, `worker/truth/CompactableCanonicalTruth.ts`, Review truth segment/generation storage, `worker/truth/WorkerTruthCompactionModule.ts`, `worker/db/SqliteDatabaseService.ts`, and startup/background storage maintenance orchestration.
- Affected tests: focused Review truth publication tests, canonical truth reconstruction tests for legacy operation evidence, Review truth cleanup rewrite tests, storage pressure admission tests, and targeted `review.session.feedback` latency/pressure regression coverage.
- Validation: `openspec validate slim-review-truth-and-cleanup --strict`, focused Vitest for the touched truth/runtime modules, `pnpm run check:boundaries`, `git diff --check`, and `pnpm build`.
