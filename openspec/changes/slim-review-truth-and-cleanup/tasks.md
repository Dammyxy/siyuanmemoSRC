## 1. Baseline

- [x] 1.1 Run strict OpenSpec validation for `slim-review-truth-and-cleanup`.
- [x] 1.2 Trace current Review truth publication, replay, generation, storage pressure, and maintenance entry points in the active worktree.

## 2. Stop New Review Truth Bloat

- [x] 2.1 Add focused tests proving Review truth promotion never appends `operations`, full `affectedAggregates`, or `storage.review.*` records for Review outputs.
- [x] 2.2 Add a Review truth publication encoder that emits skinny Review fact records from Review mutation envelopes.
- [x] 2.3 Add Review truth record guardrails for operation-bearing and oversized payloads before segment append.
- [x] 2.4 Wire `WorkerTruthPublicationModule` to use the Review encoder and keep card/queue encoders unchanged.

## 3. Preserve Legacy Replay

- [x] 3.1 Add or tighten tests proving existing operation-bearing `storage.review.*` records still reconstruct Review event rows.
- [x] 3.2 Name and isolate legacy Review operation replay behavior so it is not confused with the new publication format.

## 4. Verified Cleanup

- [x] 4.1 Add tests for rewriting bloated Review truth into skinny Review facts with equivalent Review projection rows.
- [x] 4.2 Extend or wrap snapshot generation/fence support for `review-events`.
- [x] 4.3 Implement Review truth cleanup rewrite, verification, fenced generation publish, previous-generation retention, and failure-no-delete behavior.
- [x] 4.4 Wire cleanup into bounded storage maintenance/recovery and refresh inventory after successful cleanup.

## 5. Validation

- [x] 5.1 Run focused truth publication/reconstruction/cleanup Vitest coverage.
- [x] 5.2 Run affected storage pressure and Review feedback runtime tests.
- [x] 5.3 Run `pnpm run check:boundaries`.
- [x] 5.4 Run `git diff --check`.
- [x] 5.5 Run `pnpm build`.
- [x] 5.6 Run `openspec validate slim-review-truth-and-cleanup --strict`.
