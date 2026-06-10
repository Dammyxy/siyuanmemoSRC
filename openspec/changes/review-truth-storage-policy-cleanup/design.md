## Context

Review feedback now has two durability stages after the button-return path:

- `review.truth.flush` drains `projection-applied` Review journal entries into MessagePack `review-events` truth segments and then marks entries `truth-flushed`.
- `review.truth.backfill` migrates SQL `review_events` rows without MessagePack refs into `review-events` truth segments and patches SQL projection refs.

The behavior is present, but ownership is distributed across `ReviewFeedbackTruthFlushRuntime`, `ReviewSqlTruthBackfillRuntime`, `BackendReviewRpcAdapter`, `SqliteDatabaseService`, `SrsBackendClient` scheduling, backend RPC contracts, architecture docs, and old backlog deltas. The cleanup should make this slice easier to test and safer to evolve without changing public method strings or Review hot-path success semantics.

## Goals / Non-Goals

**Goals:**

- Make Review truth flush/backfill storage policy explicit and test-covered.
- Preserve fail-closed behavior: dependency failures must be returned as failed/unavailable results or thrown adapter errors, not hidden by alternate reads or legacy storage paths.
- Preserve idempotency: duplicate truth evidence must not append duplicate Review truth records or mutate Review scheduling state.
- Preserve ownership: MessagePack `review-events` is long-term Review fact truth; SQL `review_events` is local projection/commit evidence and backfill source; journal entries remain command-intent/truth-candidate evidence until flushed.
- Keep diagnostics truthful enough for startup/background maintenance to decide whether pending SQL rows or journal entries remain.

**Non-Goals:**

- No JSON-RPC method string or request/result shape changes.
- No Review button-return path change; committed Review still succeeds after local durable journal/SQL projection requirements, not after async truth flush.
- No native SQLite/WAL migration, truth compaction redesign, cross-device sync protocol, or storage slimming deletion.
- No writer relay, kernel sidecar, SQL worker authority, or queue projection ownership change.
- No broad refactor of `BackendKernel`, backend RPC registry, or `SrsBackendClient` beyond targeted tests or tiny diagnostics wiring if needed.

## Decisions

1. Treat this as a storage-policy hardening slice, not a new storage system.

   The existing runtime modules stay in place unless tests reveal a small extraction would make the contract clearer. The primary output should be stronger invariants and focused tests around the current modules.

   Alternative considered: redesign Review truth ownership now. Rejected because native SQLite/WAL, compaction, and cross-device convergence are larger storage roadmap work.

2. Test through module interfaces first, then adapter seams.

   `ReviewFeedbackTruthFlushRuntime` and `ReviewSqlTruthBackfillRuntime` are the smallest useful interfaces for policy tests. `BackendReviewRpcAdapter` coverage should prove unavailable/device/generation diagnostics and RPC seam behavior without reopening broad kernel tests.

   Alternative considered: only add broad backend adapter tests. Rejected because future truth edits would again require broad setup to catch local policy regressions.

3. Keep duplicate handling idempotent and observable.

   Duplicate idempotency keys in truth replay should skip append, still advance the corresponding journal or report duplicate SQL rows as sync-visible where current behavior requires it, and should not write scheduler/card/queue state.

   Alternative considered: leave duplicates purely as no-op. Rejected because existing background maintenance needs diagnostics showing already-sync-visible truth.

4. Do not catch and downgrade dependency failures.

   Runtime result objects may report `ok=false` for module-level failures, and adapter precondition failures may throw typed unavailable errors. The cleanup must not add hidden fallback storage paths, legacy JSON reads, stale SQL projection reads, or local queue/card repair.

   Alternative considered: skip failed records and keep draining the rest. Rejected for this slice because partial failure semantics would need a separate repair policy.

## Risks / Trade-offs

- [Risk] Strengthening tests may reveal behavior drift in current code. -> Mitigation: fix only the drift inside Review truth/backfill storage policy, not adjacent sync/storage roadmap items.
- [Risk] Diagnostics expectations can become too brittle. -> Mitigation: assert stable fields used by startup/background scheduling, not full object snapshots.
- [Risk] SQL backfill and journal flush look similar but have different evidence sources. -> Mitigation: keep tests and requirements separate for journal transition versus SQL projection-ref patching.
- [Risk] Architecture docs already contain long Review storage prose. -> Mitigation: update docs only if implementation changes owner map or clears/defer production debt.

## Migration Plan

1. Validate this OpenSpec change before production edits.
2. Add/strengthen focused tests for Review truth flush and SQL truth backfill policy.
3. Add targeted backend Review RPC adapter tests only for seam-level preconditions/diagnostics.
4. Make minimal production changes only where tests prove drift.
5. Run focused tests, `pnpm run check:boundaries`, `git diff --check`, `pnpm build`, and strict OpenSpec validation.

Rollback path: revert the targeted tests and policy fixes. Do not add fallback behavior to keep startup/background maintenance green.

## Open Questions

None. This change intentionally uses the current ownership model and narrows implementation to test-backed policy cleanup.
