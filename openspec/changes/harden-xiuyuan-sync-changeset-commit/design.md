## Context

Xiuyuan is the card source abstraction. Current sync code already mentions `SyncChangeSet`, but `XiuyuanSyncService` still performs planning and mutation across a long application service. `WorkerXiuyuanSyncPlanner` already has a backend-side plan/apply shape, so this change should align the application sync path with the same plan-then-commit discipline instead of creating another sync owner.

## Goals / Non-Goals

**Goals:**
- Concentrate Xiuyuan sync planning into a deep Module whose Interface returns a complete `SyncChangeSet`.
- Make canonical ownership selection explicit and testable.
- Commit Xiuyuan creates, metadata updates, and deletes through one repository seam.
- Preserve existing full and incremental sync semantics for valid Riff-managed cards.
- Make sync failure before commit leave local Xiuyuan storage unchanged.

**Non-Goals:**
- No Xiuyuan data model redesign.
- No SQL storage migration.
- No Review queue, scheduler, card feedback, writer relay, kernel sidecar, AI, or agent changes.
- No broad backend migration or command ownership change beyond the active Xiuyuan sync path.

## Decisions

1. Put the external Seam at a Xiuyuan Sync ChangeSet planner consumed by `XiuyuanSyncService`.
   - Rationale: callers need "plan sync" and "commit sync", not knowledge of ownership ranking, render hints, card type marker repair, and delete policy.
   - Alternative rejected: continue adding private helpers to `XiuyuanSyncService`; that keeps the Interface shallow and tests tied to the large service.

2. Keep repository mutation behind `applySyncChangeSet()`.
   - Rationale: a single commit seam improves Locality for persistence errors and rollback-style test assertions.
   - Alternative rejected: save each Xiuyuan as soon as it is planned; that keeps partial mutation failure hard to reason about.

3. Treat canonical ownership ranking as domain policy.
   - Rationale: `local-owned > riff-managed > updatedAt > createdAt > id` is durable sync language and should not be an incidental sort expression.
   - Alternative rejected: leave canonical choice implicit in latest timestamp checks; that caused ambiguity in the backlog.

4. Keep native Riff reads and block attr writes in existing adapters.
   - Rationale: the change deepens sync orchestration, not Siyuan integration.
   - Alternative rejected: fold adapter calls into the planner; that would leak infrastructure into the planning Interface.

## Risks / Trade-offs

- Risk: full sync delete behavior may become stricter than current implicit behavior. Mitigation: characterize current delete and managed/local ownership cases before refactor.
- Risk: render-hint metadata updates could drift during extraction. Mitigation: cover built-in Riff, multi-cloze, concept, descriptor, and list templates through focused tests.
- Risk: existing backend planner and application planner diverge. Mitigation: reuse shared policy helpers where safe, or add parity tests for plan summaries.
