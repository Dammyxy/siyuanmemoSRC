## Context

The current startup compensation path calls `diagnostics.status` to decide whether to run pending Review truth work. That status call aggregates Review journal diagnostics, SQLite delta diagnostics, truth backfill diagnostics, and Domain Sync status. A slow host effect in any unrelated diagnostic can skip Review truth scheduling.

Passive backend reads also run a read-only pre-request merge. Even when main DB reads are skipped, `mergeExternalDatabaseIfChanged()` still scans sync-conflict database sources. That makes Browser deck rows, queue projection snapshots, and Review entry guards depend on host conflict-source IO even though those surfaces only need local projection/status reads.

## Goals / Non-Goals

**Goals:**
- Give Review startup maintenance one small Interface that returns only pending Review journal and SQL truth-backfill status.
- Make startup truth scheduling independent of SQLite delta diagnostics and Domain Sync diagnostics.
- Make read-only and Review-entry preflights skip sync-conflict source scans when they explicitly skip main DB reads.
- Preserve explicit conflict-source scans for sync conflict merge/summarize/cleanup and forced Review retry.
- Keep fail-closed behavior for operations that really need external source reads.

**Non-Goals:**
- No new truth format or SQLite delta format.
- No fallback to stale queue materialization.
- No change to JSON-RPC method ownership outside the Review family.
- No change to explicit sync conflict merge/cleanup semantics.

## Decisions

1. Add Review-owned maintenance status instead of reusing full diagnostics.

   `review.truth.maintenanceStatus` returns Review journal diagnostics and truth-backfill diagnostics only. This gives startup scheduling a deep Review Interface: callers ask "is Review truth maintenance needed?" without knowing Domain Sync, SQLite delta, or Browser storage diagnostics.

   Alternative considered: keep `diagnostics.status` and make every nested diagnostic best-effort. Rejected because it hides unrelated storage failures and keeps Review startup coupled to broad system health.

2. Treat `skipMainDbRead` read-only preflights as "no external source scan".

   When `mergeExternalDatabaseIfChanged()` is invoked with `skipMainDbRead` in `read-only-preflight` or `review-feedback-preflight`, it reads the local status snapshot only. Explicit merge paths and forced main DB retry still scan sync-conflict source files.

   Alternative considered: add a second fallback around `readSyncConflictDatabaseSources()`. Rejected because passive reads should not own conflict-source IO at all.

3. Keep explicit repair/cleanup fail-closed.

   Sync conflict cleanup candidates, cleanup apply, conflict merge, and forced Review retry continue to call host conflict-source readers and surface errors when those readers time out.

   Alternative considered: suppress host scan errors everywhere. Rejected because explicit repair workflows need accurate conflict-source state.

## Risks / Trade-offs

- [Risk] Startup may run a small no-op Review truth maintenance check more often. -> Mitigation: the new status path reads only Review-owned local diagnostics and remains bounded.
- [Risk] Passive reads no longer opportunistically clean stale skipped conflict-source rows. -> Mitigation: stale cleanup remains in explicit cleanup-candidate paths where source scanning belongs.
- [Risk] A real external conflict will not be discovered during Browser first page. -> Mitigation: explicit sync-conflict workflows and forced Review retry still discover conflicts; Browser/readiness must not block on host source scans.

## Migration Plan

1. Add the new Review maintenance status contract and backend/client routing.
2. Switch `SrsBackendClient.schedulePendingReviewTruthFlush()` to the new Review status path.
3. Skip sync-conflict source scans for `skipMainDbRead` read-only/review-entry preflights.
4. Add focused regressions for startup scheduling and passive preflight paths.
5. Validate with focused Vitest, hidden fallback check, boundary check, OpenSpec validation, and build.

Rollback path: revert the Review maintenance status contract and preflight-skip change. Do not replace it with best-effort diagnostics suppression.
