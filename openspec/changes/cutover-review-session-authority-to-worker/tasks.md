## 1. Feedback Loop And Ownership Proof

- [x] 1.1 Add a worker Review session test that starts a retrieval-practice session, rates a card, and receives the next card from worker state without reading projection rows during feedback.
- [x] 1.2 Add a Review UI/application adapter test proving renderer does not call renderer `ReviewSessionCursor`/projection requery to decide the next card after worker feedback result.
- [x] 1.3 Add a slow SQLite delta host-effect test or fake proving `review.feedback` session advancement does not wait for manifest/sealed-segment reads.
- [x] 1.4 Add a fail-closed test proving worker session unavailable does not fall back to renderer local queue/cursor authority.

## 2. Worker Review Session Authority

- [x] 2.1 Add a worker-owned Review session runtime Module for session start/current/feedback/skip/diagnostics.
- [x] 2.2 Move active session cursor, current card, next-card selection, session exclusions, low-rating rotation, and session-local counters behind the worker Module.
- [x] 2.3 Add backend RPC methods or facets for worker Review session operations using existing backend RPC conventions.
- [x] 2.4 Ensure session startup can use projection rows when ready but does not make projection the post-feedback next-card authority.

## 3. Durable Journal Fact Boundary

- [x] 3.1 Change formal `review.feedback` success semantics so durable after-state journal append plus worker in-memory SQL/session update is sufficient for committed success.
- [x] 3.2 Ensure Review journal entries include deterministic after-state facts: before/after card state, review event evidence, queue impact, reviewedAt, rating, queue type, session identity, and idempotency key.
- [x] 3.3 Preserve idempotent retry and duplicate prevention for repeated feedback requests.
- [x] 3.4 Fail closed when journal append fails or worker in-memory SQL update fails.

## 4. Projection And SQLite Delta Off The Feedback Authority Path

- [x] 4.1 Remove queue projection persistence/rebuild/delta checkpoint from ordinary worker Review feedback success gating.
- [x] 4.2 Keep projection rows/counters as derived-cache for Browser, warmup, counters, and session initialization.
- [x] 4.3 Route projection refresh/reconciliation through background tasks driven by durable journal/review event evidence.
- [x] 4.4 Ensure ordinary Review feedback does not synchronously require SQLite delta manifest reads, sealed-segment reads, main DB snapshot persist, Browser counter refresh, or truth segment flush.

## 5. Renderer Cutover With No Dual Authority

- [x] 5.1 Replace active `UnifiedQueueStrategy` Review session feedback/next-card authority with a thin worker Review session adapter.
- [x] 5.2 Remove active production wiring from renderer `ReviewSessionCursor`, projection patch, and requery-after-feedback as next-card authority.
- [x] 5.3 Preserve UI display behavior, hotkeys, reveal/grade states, skip/custom actions, source refresh, tab transfer, and empty/session-complete states through worker session DTOs.
- [x] 5.4 Search and prove no active Review production path keeps renderer cursor as fallback authority.

## 6. Diagnostics, Docs, And Debt Ledger

- [x] 6.1 Add diagnostics for worker-session-unavailable, commit-failed, projection-stale/deferred, truth-flush-pending, and checkpoint-pending.
- [x] 6.2 Update `ARCHITECTURE.md` with worker-owned Review session authority and projection derived-cache role.
- [x] 6.3 Append `docs/DDD_RESCAN_BACKLOG.md` task delta with fixed and deferred debt.
- [x] 6.4 Update or retire stale docs/tests that describe renderer Review cursor as active authority.

## 7. Validation

- [x] 7.1 Run targeted worker Review session tests.
- [x] 7.2 Run targeted Review UI/application session tests.
- [x] 7.3 Run targeted worker `review.feedback` journal/durability/projection tests.
- [x] 7.4 Run targeted projection reconciler tests.
- [x] 7.5 Run transport timing tests covering slow host effects.
- [x] 7.6 Run `openspec validate cutover-review-session-authority-to-worker --strict`.
- [x] 7.7 Run `pnpm run check:boundaries`.
- [x] 7.8 Run `pnpm build`.
