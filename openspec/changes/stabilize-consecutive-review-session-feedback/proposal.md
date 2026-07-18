## Why

Incremental-learning rating currently spends seconds in `review.session.feedback` and can fail on rapid consecutive ratings with a 30s backend timeout. The logs show the hot path colliding with storage pressure inventory, truth flush/promotion, and writer lease restart behavior, so this needs a focused stability change rather than another broad storage maintenance patch.

## What Changes

- Protect `review.session.feedback` with the same review-feedback timing and host-effect suppression semantics already intended for review rating.
- Prevent queued Review truth flush/promotion from racing an in-flight session feedback mutation.
- Keep storage maintenance receipt writes from forcing canonical truth reconciliation during startup maintenance.
- Add regression coverage for consecutive session feedback, truth flush deferral, and maintenance apply lifecycle behavior.

## Capabilities

### New Capabilities
- `review-session-feedback-stability`: Consecutive Review session feedback remains fast and available while background truth and maintenance work is present.

### Modified Capabilities
- `review-domain-sync-independence`: Review session feedback is covered by the same non-blocking domain-sync and truth host-effect contract as legacy review feedback.

## Impact

- Affected code: `BrowserSrsBackendWorkerTransport`, worker Review feedback timing scope, backend worker request timing, `SrsBackendClient` truth flush scheduling, and backend storage maintenance lifecycle.
- Affected tests: focused client transport, backend client, worker timing scope, and storage maintenance tests.
- No public API or persisted schema change is expected.
