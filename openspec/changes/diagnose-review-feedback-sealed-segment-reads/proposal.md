## Why

Fresh live Review logs show frontend preparation, repair pre-merge, worker queueing, and session advance are no longer the dominant rating latency. The remaining 480-669ms path sits inside `review.session.feedback` commit, with `hostBreakdown` repeatedly showing multiple `sqlite.readBinary sealed-*.msgpack` effects during one Review feedback commit.

This change diagnoses why ordinary Review rating reads sealed SQLite delta segments, then narrows the next optimization decision to the exact owner of that read path without weakening durable fail-closed Review commits.

## What Changes

- Add deeper attribution for sealed SQLite delta segment reads inside `review.session.feedback` / `database:reviewFeedback.total`.
- Distinguish whether sealed reads come from replay, diagnostics, projection rebuild, checkpoint recovery, transaction preflight, queue-impact computation, or another commit substep.
- Add focused tests or harness coverage that reproduces the sealed-read pattern and proves ordinary Review feedback can classify it.
- Preserve existing durable Review commit semantics: no async/fire-and-forget commit, no fallback path, no stale success.
- Defer any actual read-removal or manifest/open-segment write-frequency optimization until the attribution proves the safe owner and invariant.

## Capabilities

### New Capabilities
- `review-feedback-sealed-segment-read-attribution`: Covers Review feedback commit diagnostics that attribute sealed SQLite delta segment reads to their exact commit substep and storage owner.

### Modified Capabilities

## Impact

- Affected code:
  - `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`
  - `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`
  - `src/infrastructure/persistence/sqlite/__tests__/*`
  - `worker/bootstrap/ReviewFeedbackTimingScope.ts`
  - `worker/review/*` only if tracing shows the Review runtime is the caller of sealed reads
- Affected systems:
  - Review session feedback commit
  - SQLite delta v2 sealed/open segment reads
  - Review feedback host-effect timing diagnostics
  - Durable Review commit envelope
- Validation requires focused SQLite/Review tests, strict OpenSpec validation, `pnpm run check:boundaries`, and `pnpm build`.
