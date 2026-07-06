## Why

SiYuanMemo's SRS core now has Anki-level ambition but not yet Anki-level authority locality. Recent Review latency work fixed several local hot spots, yet live logs still show a broader design smell: one rating traverses `UnifiedQueueStrategy`, worker session runtime, queue projection status, CDF preparation, domain-sync diagnostics, SQLite delta persistence, and Browser projection side effects before the user sees stable feedback.

Anki's shape is simpler and stronger: a Review answer is owned by the Collection/Scheduler core, which computes the next card state, updates the card, writes revlog evidence, and keeps queue state in memory. Incrementum's document scheduler shows the opposite extreme: a thin FSRS wrapper is easy to understand but not enough to carry SiYuanMemo's Review/Browser/Sync/CDF platform.

SiYuanMemo should move toward an Anki-style deep SRS Review Kernel: one authoritative Module for session `next`, `answer`, `undo`, lookahead, and session counters. Renderer/application adapters should stop knowing how projection stale states, CDF evidence, durable commits, and storage checkpoints interact.

## What Changes

- Introduce `SrsReviewKernel` as the canonical Review session authority concept for active sessions.
- Define a small kernel Interface: start session, get current/next, answer current card, skip/session-remove current card, undo/go-back, expose lookahead/counters/diagnostics.
- Make `UnifiedQueueStrategy` and Review UI/application runtime thin adapters around kernel commands instead of authority holders.
- Keep worker-owned Review session authority as the production target; renderer-owned cursor/projection patching remains migration-only until disconnected.
- Treat CDF preparation, Browser projection, queue projection maintenance, and storage checkpoint work as auxiliary or derived states, not Review session authority.
- Add tests around the kernel Interface instead of testing only adapter internals.

## Capabilities

### New Capabilities

- `srs-review-kernel`: Active Review sessions are governed by one kernel Interface that owns answer, advancement, lookahead, undo, counters, and diagnostics.

### Modified Capabilities

- `worker-owned-review-session-authority`: Tightens worker authority into the kernel concept.
- `sql-first-card-runtime`: Review feedback success remains grounded in durable Review/card facts, but callers do not learn storage implementation details.

## Impact

- Affected Review path:
  - `src/ui/review/v2/useReviewSession.ts`
  - `src/ui/review/v2/reviewSessionController.ts`
  - `src/application/adapters/UnifiedQueueStrategy.ts`
  - `src/application/adapters/review-session/*`
  - `worker/review/WorkerReviewSessionRuntime.ts`
  - `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`
- Affected docs/tests:
  - `ARCHITECTURE.md`
  - `CONTEXT.md`
  - `docs/DDD_RESCAN_BACKLOG.md`
  - Review session/kernel tests, adapter tests, worker RPC tests, boundary/build checks.

## Out Of Scope

- No scheduler algorithm rewrite.
- No Browser read model rewrite in this change.
- No SQLite/native storage migration in this change.
- No hidden fallback to renderer Review cursor authority.
- No removal of legacy modules unless production wiring is already disconnected and tests prove it.
