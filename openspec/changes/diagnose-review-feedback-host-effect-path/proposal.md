## Why

Latest live Review grading logs still show `review.feedback` worker time around 1.3-1.4s, with nearly 1s attributed to host SQLite reads. The current slow summary reports only `sqlite.readJSON` or `sqlite.readBinary`, so it cannot distinguish whether the cost comes from the delta manifest, open segment, sealed segment, main database, diagnostics, or another SQLite-backed file.

## What Changes

- Add Review feedback slow-log observability that includes the slowest host effect path and storage class.
- Add layered slow-log observability for `review.session.feedback`, so `session-runtime-answer` latency can be split into worker receive delay, pre-request lifecycle, handler, session commit, session advance, transaction, queue-impact, and host effects.
- Include enough host-effect detail to classify the next root cause without requiring users to expand collapsed console objects.
- Preserve existing Review feedback behavior, durability policy, sync safety, and SQLite persistence behavior.
- Keep this change diagnostic-only; no cache, scheduler, queue, or domain sync behavior is changed by this proposal.

## Capabilities

### New Capabilities
- `review-feedback-host-effect-observability`: Slow Review feedback diagnostics expose the concrete host SQLite file path/storage class that dominates grading latency.

### Modified Capabilities

## Impact

- Affected code:
  - `src/application/clients/BrowserSrsBackendWorkerTransport.ts`
  - `worker/bootstrap/backend-worker.entry.ts`
  - `worker/bootstrap/BackendKernel.ts`
  - `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`
  - `worker/review/WorkerReviewSessionRuntime.ts`
  - `worker/bootstrap/ReviewFeedbackTimingScope.ts` if host-effect shaping needs a narrow extension
- Affected systems:
  - Review feedback slow-path diagnostics
  - backend worker host-effect attribution summaries
- No database schema, external dependency, queue contract, scheduler, or sync-safety behavior change.
