## Context

The active storage model is already settled: durable truth is MessagePack truth plus SQLite delta, while `siyuanmemo.db` is a rebuildable temp SQL projection. The previous bootstrap extraction moved startup storage ordering out of `WorkerSqliteDatabaseService`, but the Review feedback hot path still assembles storage durability evidence inside the broad worker DB module.

The other remaining shallow surface is `packages/contracts/src/backend-rpc.ts`: backend RPC contracts, storage diagnostics, MessagePack truth family schemas, truth storage policies, SQL projection schema/policy declarations, and request/response contracts all share one large file. Existing modular backend RPC method files already show the desired direction: keep compatibility exports, but move policy/catalog responsibility into a smaller module.

This change is a locality refactor, not a storage redesign.

## Goals / Non-Goals

**Goals:**

- Extract Review feedback storage-state assembly into a focused module.
- Keep Review feedback mutation and persistence authority in existing worker-owned runtimes.
- Keep the storage envelope result shape exactly compatible with `BackendReviewFeedbackStorageState`.
- Move MessagePack truth and SQL projection policy declarations into a catalog module.
- Preserve existing imports from `backend-rpc.ts` through re-exports.
- Add focused tests proving envelope assembly and policy export compatibility.

**Non-Goals:**

- Do not change Review feedback commit semantics, journal storage schema, truth candidate format, SQL projection queue impact, or delta/checkpoint behavior.
- Do not introduce fallback, best-effort success, or dual storage paths.
- Do not change JSON-RPC methods or public backend contract shapes.
- Do not extract the whole Review feedback runtime or worker DB facade in this change.
- Do not implement storage repair UI/commands or old root-level SQLite delta cleanup in this change.

## Decisions

1. Extract an envelope module, not a pass-through helper.

   The module should own the ordering and interpretation needed to build `BackendReviewFeedbackStorageState`: read journal diagnostics, read SQLite delta diagnostics safely, derive local-intent/truth-flush/sql-projection/checkpoint status, and surface explicit diagnostic errors in the returned envelope.

2. Keep mutation authority in current owners.

   `WorkerSqliteDatabaseService.reviewFeedback()` still appends journal entries, creates truth candidates, invokes `WorkerReviewFeedbackRuntime`, marks journal projection state, and updates counters. The new module only assembles storage state from worker-supplied diagnostic readers and the Review feedback result.

3. Preserve contract exports.

   `packages/contracts/src/backend-rpc.ts` remains the public import surface. The new storage policy catalog module owns definitions and constants internally, and `backend-rpc.ts` re-exports them. This avoids churn across worker/runtime/tests while shrinking the learning surface for policy edits.

4. Test the new interfaces directly.

   Focused tests should exercise storage envelope outcomes without constructing full Review runtime behavior. Existing contract tests should continue importing from `backend-rpc.ts`, proving compatibility.

## Risks / Trade-offs

- [Risk] Envelope extraction changes subtle status mapping. -> Mitigation: move logic mechanically, add direct tests for committed/preview, queueImpact, pending journal, and delta error cases.
- [Risk] Policy catalog split causes circular imports or broken type exports. -> Mitigation: keep catalog independent of runtime contracts, re-export from `backend-rpc.ts`, and run existing contract tests/build.
- [Risk] Dirty bootstrap/checksum diff makes review harder. -> Mitigation: keep this change scoped to new OpenSpec files, Review envelope module, policy catalog module, and minimal docs/tasks updates.

## Migration Plan

1. Create OpenSpec artifacts and validate them.
2. Add Review feedback storage envelope module and direct tests.
3. Wire `WorkerSqliteDatabaseService.reviewFeedback()` to the new module without changing commit flow.
4. Move storage policy declarations into a contracts catalog module and re-export from `backend-rpc.ts`.
5. Run focused envelope/contract tests, hidden-fallback checks, boundary checks, build, and diff whitespace checks.

Rollback path: inline the envelope builder back into `WorkerSqliteDatabaseService` and move catalog definitions back into `backend-rpc.ts`. No data migration is introduced.

## Open Questions

None for this slice. Storage repair UI/commands, old root-level SQLite delta cleanup, and broader worker DB facade splitting remain follow-up architecture candidates.
