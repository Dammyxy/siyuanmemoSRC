## Why

Review and Browser currently share too much queue/projection machinery. Recent logs show Review feedback followed by repeated queue creation, projection warmup readiness, filter-group projection repair, and Browser read-model activity. Some of this work is correct, but it should not shape Review session latency or authority.

Anki separates active study queues from Browser/search/read models. The study session can advance from its in-memory queue while Browser counts and searches are derived from storage and can refresh independently.

SiYuanMemo needs the same separation: Session Queue Index for active Review sessions, Browser Projection Index for browsing/count/filter/read-model surfaces.

## What Changes

- Define `SessionQueueIndex` as the active Review session queue/lookahead owner.
- Define `BrowserProjectionIndex` as the Browser/read-model/projection warmup owner.
- Prevent Browser projection warmup, filter-group repair, and projection rebuild from becoming Review answer switching dependencies.
- Ensure Review session initialization may consume Browser/queue projection snapshots, but after session start, answer advancement uses Session Queue Index.
- Add diagnostics that show whether latency belongs to session queue, Browser projection, projection repair, or storage.

## Capabilities

### New Capabilities

- `session-queue-browser-projection-separation`: Active Review session queues and Browser projection read models are separate Modules with explicit handoff and diagnostics.

### Modified Capabilities

- `browser-read-model`: Browser projection remains read-model authority for Browser surfaces only.
- `srs-review-kernel`: Kernel uses Session Queue Index for active session advancement.

## Impact

- Affected Review path:
  - `src/application/adapters/UnifiedQueueStrategy.ts`
  - `src/application/adapters/review-session/*`
  - `worker/review/WorkerReviewSessionRuntime.ts`
- Affected Browser/projection path:
  - `src/application/services/queue-projection/*`
  - `worker/queue-projection/*`
  - `src/ui/browser/*`
  - `src/application/queries/browser/*`
- Affected docs/tests:
  - `ARCHITECTURE.md`
  - `CONTEXT.md`
  - Browser projection tests, Review session tests, timing diagnostics tests.

## Out Of Scope

- No Browser UI redesign.
- No removal of queue projection storage.
- No scheduler algorithm rewrite.
- No hidden local queue fallback for projection-backed Browser reads.
