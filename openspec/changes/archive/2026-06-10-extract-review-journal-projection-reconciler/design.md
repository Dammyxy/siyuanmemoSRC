## Context

The previous restart durability change made Review queue projection recovery correct: startup replays durable SQL state, reconciles Review feedback journal entries, and fails closed when it cannot prove projection readiness. That reconciliation logic now lives inline in `worker/db/SqliteDatabaseService.ts`, next to unrelated SQL worker initialization, delta replay, repository setup, diagnostics, and queue readiness code.

The debt is architectural rather than behavioral. Understanding one Review concept requires reading a large SQL worker module, and focused tests must currently exercise the broad backend adapter path. The desired module is deep: callers should only ask for Review journal projection reconciliation, while the implementation owns journal entry normalization, durable event matching, projection staleness detection, and projection replacement.

## Goals / Non-Goals

**Goals:**

- Extract Review journal projection reconciliation into `worker/review/ReviewJournalProjectionReconciler.ts`.
- Keep `SqliteDatabaseService` as the startup owner that delegates to the reconciler after SQL replay and before queue readiness.
- Preserve current Review restart behavior, including stale `prepared` entry reconciliation and explicit failure when reconciliation cannot complete.
- Add focused tests against the reconciler interface so the logic is covered without the full backend RPC adapter harness.
- Reduce local debt in `SqliteDatabaseService.ts` by removing inline Review projection reconciliation helpers and related private types.

**Non-Goals:**

- No JSON-RPC method string, backend RPC registry, or method-family routing changes.
- No SQL worker authority, writer relay, kernel sidecar, or queue projection ownership changes.
- No queue projection storage format changes, Review truth compaction, domain-sync redesign, or native SQLite/WAL migration.
- No fallback, compatibility, dual path, or lazy reconciliation path that hides startup failures.
- No broad Review runtime rewrite beyond the extracted reconciler and its tests.

## Decisions

1. Extract a deep module with one public operation: `reconcile()`.

   The startup caller should not know how to group journal entries, match durable SQL events, or rebuild projection rows. Those details belong behind the reconciler interface.

   Alternative considered: extract pure helper functions only. Rejected because the caller would still need to orchestrate the same workflow and the debt would move rather than deepen.

2. Inject narrow adapters instead of moving SQL worker ownership.

   The reconciler receives dependencies for journal listing/status updates, durable event lookup, card queries, queue projection reads/replacement, and transaction execution. `SqliteDatabaseService` still owns SQL worker runtime and startup sequence.

   Alternative considered: make the reconciler import the SQL runtime directly. Rejected because that would blur the SQL worker authority boundary.

3. Keep failure behavior explicit.

   The reconciler does not catch and downgrade dependency failures. Startup already treats reconciliation failure as unavailable/preparing state, and the extracted module must preserve that fail-closed behavior.

   Alternative considered: catch journal or projection failures and skip reconciliation to keep startup moving. Rejected because it reintroduces stale Review queue readiness risk.

4. Test the module through its public interface with in-memory adapters.

   Focused tests should exercise real reconciliation behavior while using small in-memory adapters for journal, durable events, repository query results, queue projection state, and transactions. The existing backend adapter suite remains regression coverage for the startup integration.

   Alternative considered: only keep broad adapter tests. Rejected because the new module would not have a stable behavior harness and future edits would again require broad test setup.

## Risks / Trade-offs

- [Risk] Extracting normalization helpers can diverge from existing journal replay normalization. -> Mitigation: keep the extracted normalizer scoped to fields used by projection reconciliation and preserve existing journal replay helpers where they are still used.
- [Risk] Dependency injection can make the interface too wide. -> Mitigation: expose one public operation and keep dependency methods named after Review reconciliation concepts, not SQL implementation details.
- [Risk] Startup integration could accidentally change ordering. -> Mitigation: keep the same `reconcileReviewFeedbackJournalProjectionState` call site in `SqliteDatabaseService`, but delegate its body to the module.
- [Risk] Focused tests can overfit implementation details. -> Mitigation: assert observable outcomes: journal status updates, projection replacement calls, unchanged durable events, and propagated errors.

## Migration Plan

1. Validate the OpenSpec artifacts before production edits.
2. Add focused failing tests for the reconciler behavior.
3. Extract `ReviewJournalProjectionReconciler` and move the inline reconciliation logic behind `reconcile()`.
4. Wire `SqliteDatabaseService` to instantiate and call the reconciler at the existing startup reconciliation point.
5. Remove the old inline helpers and imports from `SqliteDatabaseService`.
6. Run focused reconciler tests, targeted backend Review restart tests, `pnpm run check:boundaries`, `git diff --check`, `pnpm build`, and `openspec validate`.

Rollback path: revert the module extraction and restore the previous inline reconciliation body. Do not add fallback behavior to preserve green tests.

## Open Questions

None. This is a behavior-preserving architecture extraction.
