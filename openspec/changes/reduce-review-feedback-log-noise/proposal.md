## Why

Live Review scoring is now functionally durable, but one answer still emits many normal-path diagnostics across renderer, client transport, worker entry, kernel, scheduler, SQLite, queue-impact, and Browser warmup Modules. The chain is not accidental; Review feedback crosses real seams for worker ownership, durability, projection maintenance, and Browser readiness. The noise comes from each shallow Module exposing its local timing as `info`.

Anki keeps the comparable answer path quieter by putting card mutation, revlog, undo, and queue advancement behind a deep scheduler/backend Interface. SiYuanMemo should keep its richer seams, but make normal Review feedback diagnostics behave like one deep Review Feedback Diagnostics Module: one copyable summary for slow feedback, with inner Implementation steps available at trace level.

## What Changes

- Move high-frequency Review feedback step diagnostics from `info`/`debug` to `trace` while preserving structured timing data and slow summary construction.
- Keep one copyable worker-handle slow summary as the `info`-level Review answer diagnostic.
- Move normal Browser warmup deferral during active Review to trace; it is expected scheduling pressure, not a user-visible event.
- Move normal scheduler answer decisions and SQLite transaction commits to trace.
- Update focused tests so they prove diagnostics still exist without requiring noisy `info` output.

## Capabilities

### New Capabilities

- `review-feedback-diagnostics`: Review scoring emits bounded user-visible diagnostics while preserving trace-level inner timing for debugging.

### Modified Capabilities

- `srs-review-kernel`: Kernel answer/commit diagnostics stay available without leaking every internal step to normal logs.
- `browser-projection-warmup-review-budget`: Active Review deferral remains observable at trace level and does not spam the normal console.

## Impact

- Review frontend/client path: `UnifiedQueueStrategy`, `SrsBackendClient`, `BrowserSrsBackendWorkerTransport`.
- Worker/kernel path: `backend-worker.entry`, `BackendKernel`, `WorkerReviewFeedbackRuntime`, `WorkerReviewCardMutationPersistenceModule`.
- Core/infrastructure normal-path diagnostics: `SchedulerRouter`, `SqliteDatabaseService`, Browser projection warmup runtime.
- Validation: focused logging tests, fallback/boundary checks, build, and strict OpenSpec validation.
