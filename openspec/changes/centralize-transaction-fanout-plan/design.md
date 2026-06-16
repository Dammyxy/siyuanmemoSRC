## Context

SiYuanMemo receives SiYuan `ws-main` transaction batches in the renderer, forwards relevant batches into the backend worker, and later dispatches queued actions back to renderer-side AutoCard, Native Riff, and Xiuyuan sync owners. The current policy is split across the WebSocket classifier, worker action collector, action pump, AutoCard listener, and legacy Native Riff handler.

Progressive excerpt materialization writes a known burst of plugin-authored operations: source mark updates, child docs or excerpt blocks, progressive attrs, local topic card creation, and Native Riff registration. Those transactions currently look like ordinary user edits, so AutoCard can do expensive settled-candidate reads before skipping bound blocks, while Native Riff upsert loses block scope and runs a broad incremental route.

## Goals / Non-Goals

**Goals:**
- Provide one shared transaction fan-out policy module for renderer and backend worker.
- Preserve execution ownership in existing modules.
- Represent plugin-authored excerpt writes as short-lived provenance, not broad debounce.
- Suppress only AutoCard candidate scheduling for provenance-matched blocks.
- Preserve Native Riff upsert block scope into Xiuyuan sync and native Riff reads.
- Keep document-tree refresh allowed for document structure changes.
- Keep the legacy Native Riff handler aligned with the shared policy.

**Non-Goals:**
- Do not move AutoCard execution, Xiuyuan sync, DocTree rebuild, or worker queue ownership into the coordinator.
- Do not create a long-lived event bus or global scheduler.
- Do not suppress user edits in excerpt docs after provenance expires.
- Do not add fallback broad incremental sync when a Native Riff upsert action lacks block IDs.

## Decisions

1. **Shared coordinator lives in `src/core/infrastructure/websocket`.**
   - Rationale: renderer and worker already share websocket transaction types from this layer, and worker must not import `src/application`.
   - Alternative rejected: `src/application/transactions`, because it would force worker to depend on application orchestration.

2. **Coordinator returns a plan, not side effects.**
   - Plan includes DocTree routing, AutoCard candidate/cancel/suppressed operations, Native Riff upsert/remove block IDs, kernel-ingest need, and diagnostic reasons.
   - Existing modules consume the plan and remain execution owners.

3. **Provenance is short-lived and block-scoped.**
   - A registry records known plugin-authored writes with expiration.
   - Matching only applies to explicit block IDs, not roots or subtrees.
   - Expired entries are ignored and pruned before plan generation.

4. **Worker recomputes plan.**
   - The worker consumes raw transactions and provenance snapshot, then uses the same coordinator to collect actions.
   - Renderer plan is diagnostic only, so queue restoration and follower relay do not depend on stale serialized plans.

5. **Native Riff upsert is scoped.**
   - Upsert actions carry `blockIds`.
   - `KernelTransactionActionPump` calls `handleNativeRiffUpsert(blockIds)`.
   - `XiuyuanSyncService` writes `scope.blockIds`.
   - The host read path uses `getRiffCardsByBlockIDs(blockIds)` when available.

## Risks / Trade-offs

- **Risk: coordinator becomes a god module** -> Keep it pure and declarative; no service calls, timers, or writes.
- **Risk: provenance misses create-doc transactions before IDs are known** -> Register known source/highlight IDs early and new doc/topic IDs immediately after creation; do not broaden suppression to root scope.
- **Risk: worker and renderer drift** -> Use one shared coordinator and targeted tests for both paths.
- **Risk: scoped upsert misses unscoped native signals** -> Treat missing block IDs as explicit unavailable/skip for transaction-triggered upserts; manual/full sync remains the path for wide reconciliation.
- **Risk: legacy handler divergence** -> Make it consume the same plan adapter instead of maintaining duplicate classifier logic.
