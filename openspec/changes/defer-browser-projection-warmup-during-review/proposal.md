## Why

Live Review logs after the P0/P1 durable-write work no longer show SQLite delta checksum mismatch or repair-required failures, but `review.feedback` still takes 2-4s while Browser queue projection warmup repeatedly prepares multiple queue read models. The next bottleneck is not native SQLite/WAL; it is Browser Queue View Lifecycle work competing with active Review feedback on the worker/kernel path.

## What Changes

- Add a Review-aware Browser projection warmup policy so active Review sessions can suppress broad sidebar warmup and run only current visible queue work.
- Coalesce targeted queue-projection live identity rewarms while Review is active, especially repeated `refreshed/materialized` events for non-active queues.
- Preserve explicit Browser Read Model readiness: Browser queue views must still report `refreshing`, `unavailable`, `stale`, or retry states rather than falling back to stale local snapshots.
- Keep Review Session Cursor and Review Feedback Advancement authority unchanged; this change only changes Browser warmup scheduling and diagnostics.
- Add diagnostics that show when Browser warmup was deferred because Review was active, including queue id, reason, and retry timing.
- Do not introduce native SQLite/WAL, kernel-side DB writes, or a second queue projection owner.

## Capabilities

### New Capabilities
- `browser-projection-warmup-review-budget`: Defines Review-aware Browser queue projection warmup scheduling, coalescing, deferral, and diagnostics.

### Modified Capabilities
- `sql-first-card-runtime`: Ordinary Review feedback must not be delayed by non-critical Browser projection warmup or queue read-model repair.

## Impact

- Affected Browser UI path: `src/ui/browser/browserQueueProjectionWarmupRuntime.ts`, `src/ui/browser/SRSBrowser.vue`, and focused Browser warmup tests.
- Affected Browser application path: `src/application/queries/browser/BrowserQueueViewLifecycle.ts`, `src/application/services/BrowserApplicationService.ts`, and queue read-model readiness tests if request metadata changes.
- Affected Review coordination path: Review active-state signal source near `reviewSessionController` / `useReviewSession` / existing Review surface registration, only as a read-only signal consumed by Browser warmup.
- Affected diagnostics: runtime performance spans and logs for `queue-projection.warmup`, deferred warmup, and targeted retry.
- Validation must include focused Browser warmup runtime tests, Browser Queue View Lifecycle tests, Review session tests proving answer advancement stays independent, `pnpm run check:boundaries`, and `pnpm build`.
