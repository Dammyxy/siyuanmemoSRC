## 1. Preflight And Context

- [x] 1.1 Run `git status --short --branch` in the active worktree and confirm no unrelated Browser or backend RPC debt is mixed into this change.
- [x] 1.2 Read this change's `proposal.md`, `design.md`, `tasks.md`, and `specs/review-journal-projection-reconciler/spec.md`.
- [x] 1.3 Run `openspec status --change "extract-review-journal-projection-reconciler" --json` and `openspec validate extract-review-journal-projection-reconciler --strict`.
- [x] 1.4 Trace the existing Review journal projection reconciliation path in `worker/db/SqliteDatabaseService.ts` and the active Review restart adapter tests.

## 2. Focused Reconciler Tests

- [x] 2.1 Add a focused `ReviewJournalProjectionReconciler` test proving no relevant journal work completes without projection replacement.
- [x] 2.2 Add a focused test proving a proven stale Review projection is replaced from repository query results.
- [x] 2.3 Add a focused test proving mismatched durable `review_events` evidence leaves journal/projection state unchanged.
- [x] 2.4 Add a focused test proving stale `prepared` entries advance to `projection-applied` only when durable event evidence matches.
- [x] 2.5 Add a focused test proving dependency failure propagates without fallback.

## 3. Module Extraction

- [x] 3.1 Create `worker/review/ReviewJournalProjectionReconciler.ts` with one public `reconcile()` operation and narrow dependency interfaces.
- [x] 3.2 Move Review feedback journal projection entry normalization, durable-event matching, queue-type resolution, staleness detection, and projection replacement logic into the new module.
- [x] 3.3 Keep queue projection row building and repository query semantics identical to the previous inline implementation.

## 4. SQL Worker Startup Wiring

- [x] 4.1 Replace the inline `SqliteDatabaseService` reconciliation body with delegation to `ReviewJournalProjectionReconciler` at the existing startup reconciliation point.
- [x] 4.2 Remove now-unused inline helper methods, private types, and imports from `SqliteDatabaseService.ts`.
- [x] 4.3 Confirm no JSON-RPC method string, SQL worker authority, writer relay, kernel sidecar, fallback, compat, or dual-path behavior changed.

## 5. Validation And Docs

- [x] 5.1 Run `pnpm exec vitest run worker/review/__tests__/ReviewJournalProjectionReconciler.test.ts --reporter=dot`.
- [x] 5.2 Run targeted backend Review restart adapter coverage for existing restart/journal projection scenarios.
- [x] 5.3 Run `pnpm run check:boundaries`, `git diff --check`, and `pnpm build`.
- [x] 5.4 Update `docs/DDD_RESCAN_BACKLOG.md` only if production debt is cleared or deferred, and update `ARCHITECTURE.md` only if runtime responsibility mapping changes.
- [x] 5.5 Run `openspec validate extract-review-journal-projection-reconciler --strict` before handoff.
