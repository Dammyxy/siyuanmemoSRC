## Context

The captured logs show Review feedback phases taking about 1.5-4.0s and next-card phases taking about 2.5-7.5s. The active chain is:

`ReviewSessionController.grade -> UnifiedQueueStrategy.onFeedback -> SrsV2SessionQueueRuntime.answerAndAdvance -> queue.handleReview -> worker review.feedback -> queue impact -> ReviewSessionController.queue.next`

`SrsV2SessionQueueRuntime.answerAndAdvance()` already applies the review result and selects a next card before returning, but `ReviewSessionController.grade()` still calls `queue.next()` afterward. Separately, worker `review.feedback` runs database merge/preflight logic that can read the persisted main DB when fast-skip is invalidated. Storage logs also show repeated Xiuyuan canonicalization, and `UnifiedStorageManager.getCardDTOsByXiuyuanId()` performs read-time repair and marks storage dirty.

## Goals / Non-Goals

**Goals:**
- Reduce Review feedback-to-next-card latency without weakening Review durability guarantees.
- Keep Review feedback fail-closed when worker storage, journal, queue impact, or writer authority is unavailable.
- Make common UnifiedStorage card/Xiuyuan reads pure: no index mutation, no dirty flag, no canonical repair as a side effect.
- Give Xiuyuan-bound card reads an indexed path for Review/Queue/Browser hot paths.
- Preserve active DDD direction: `ui -> application -> core -> infrastructure`.

**Non-Goals:**
- No broad queue algorithm rewrite.
- No rollback of worker-owned Review durability, MessagePack truth, SQLite delta, or queue projection contracts.
- No compatibility fallback to stale local queue snapshots when backend/worker owners are unavailable.
- No baseline mirror edits outside the active worktree.

## Decisions

### 1. Treat `answerAndAdvance()` as the Review Session Cursor hot-path seam

`SrsV2SessionQueueRuntime.answerAndAdvance()` should be the deep Module that both commits session-local queue movement and returns the next visible card. `UnifiedQueueStrategy` already stores `pendingSrsV2NextCard` and `pendingSrsV2CounterSnapshot`; the Review UI path should consume that result through the existing queue strategy interface or a small extension rather than call `queue.next()` immediately after feedback.

Alternative considered: optimize `queue.next()` only. Rejected because it keeps duplicate control flow and makes the caller pay a second repair/hydration pass after `answerAndAdvance()` already selected the next card.

### 2. Keep worker durability strict, but make preflight invalidation precise

The worker DB Module must continue enforcing committed Review durability. The optimization target is the pre-request merge gate: own-review feedback writes and queue projection replacement should not invalidate main DB fast-skip unless they create evidence of an external sync/conflict source or persisted main DB divergence.

Alternative considered: skip `mergeExternalDatabaseIfChanged()` during Review feedback. Rejected because it can hide real sync conflicts and violates the current fail-closed storage policy.

### 3. Split UnifiedStorage canonicalization from read methods

Canonical store preparation may repair legacy/malformed storage during explicit load/save/repair flows. Ordinary read methods, especially `getCardDTOsByXiuyuanId()`, must not repair DTOs, mutate indexes, sort indexes, or mark storage dirty. Missing bindings should either be served from an already-canonical store/index or surfaced through an explicit repair diagnostic.

Alternative considered: keep read-time repair but throttle logs. Rejected because it keeps hidden mutation and does not remove latency or dirty-save churn.

### 4. Add Xiuyuan-card index as storage locality improvement

UnifiedStorage should maintain an index from Xiuyuan id to card DTO ids during canonical load and DTO writes. Reads by Xiuyuan id should use that index and preserve sorted deterministic output without scanning all DTOs.

Alternative considered: add a per-call memo cache. Rejected because cache invalidation would duplicate index logic and still leaves read-time repair semantics unclear.

## Risks / Trade-offs

- Review UI consumes stale `pendingSrsV2NextCard` after conflict → mitigate by retaining idempotency/fingerprint checks and falling back only to explicit unavailable/conflict handling, not silent queue reload.
- Preflight fast-skip becomes too permissive → mitigate with tests that force conflict source/main DB divergence and require merge/read behavior in those cases.
- Removing read-time repair exposes malformed legacy data earlier → mitigate with explicit canonicalization on load and clear repair diagnostics/actions.
- New Xiuyuan-card index can drift → mitigate by updating it from the same DTO write/delete/index update seam and adding invariant tests.

## Migration Plan

1. Add focused tests around current hot paths and read purity.
2. Implement Review session next-card consumption without changing durable worker commit semantics.
3. Add UnifiedStorage Xiuyuan-card index and remove read-time mutation from `getCardDTOsByXiuyuanId()`.
4. Tighten worker preflight invalidation only after Review/session tests are green.
5. Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` if production code changes alter runtime ownership or retire debt.

Rollback strategy: revert each slice independently. Review session consumption, storage read purity/indexing, and worker preflight precision should be separate commits/tasks so durability-sensitive changes can be backed out without losing read-path cleanup.

## Open Questions

- Should malformed Xiuyuan binding diagnostics be surfaced in Browser repair UI, a storage diagnostics command, or both?
- Should Review `queue.next()` remain as an explicit fallback for non-SRS queues only, or should the interface expose a generic "consume pending next" result?
