# Handoff: Xiuyuan Startup Sync Registry Migration

## Current State

- Active worktree: `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`
- Branch: `externalize-srs-algorithms-and-index-queues`
- Working tree was clean before this handoff document was requested.
- Latest committed implementation:
  - Commit: `141263bf Route kernel companion background work lifecycle`
  - Added `KernelCompanionBackgroundWorkRegistry`.
  - Routed Review truth backfill through registry.
  - Routed `KernelTransactionActionPump` polling through registry as `kernel-transaction-action-polling`.
  - Updated OpenSpec/docs/backlog for managed background work.

## User Question Answered

The user asked whether `Xiuyuan startup sync` should be moved into the registry.

Recommendation: yes, but as a separate OpenSpec change. Do not amend it into `141263bf`.

Why:

- `XiuyuanSyncService.start()` currently fires startup full/incremental sync through `startStartupSyncInBackground()`.
- That helper is a shallow Module: it only starts a Promise and catches logs.
- Startup sync has real write side effects, so it needs lifecycle visibility, shutdown behavior, and late-result suppression.
- The registry is the right seam for lifecycle only: `submit/status/cancel/defer/shutdown`.
- Xiuyuan business writes must remain with existing Xiuyuan/backend owners.

## Proposed Change

Suggested OpenSpec change name:

`route-xiuyuan-startup-sync-through-background-work-registry`

Suggested registry job kind:

`xiuyuan-startup-sync`

Scope:

- Add `xiuyuan-startup-sync` to `KernelCompanionBackgroundWorkKind`.
- Add typed diagnostics for Xiuyuan startup sync.
- Replace `XiuyuanSyncService.startStartupSyncInBackground()` with registry submission.
- Preserve current startup order:
  - run `migrateLegacyCardTypeAttrsOnce()`
  - then choose due full sync or configured plugin-start incremental sync
- Keep `fullSync()` / `incrementalSync()` as existing owners of sync planning and writes.
- On registry shutdown:
  - accepted startup sync -> deferred
  - running startup sync -> canceled in lifecycle state
  - do not pretend already-issued SiYuan/backend writes were physically interrupted
  - suppress late result re-arming or follow-up background work after shutdown

## Boundaries

Do not move these into registry:

- Xiuyuan sync policy
- Riff/card writes
- SQLite DB ownership
- scheduler ownership
- msgpack Review truth ownership
- native Riff transaction sync business logic
- manual sync behavior

Do not add fallback/degrade/compat/dual-path behavior. Backend unavailable should remain explicit unavailable/fail-closed.

## Key Files

- `src/application/backgroundWork/KernelCompanionBackgroundWorkRegistry.ts`
- `src/application/services/XiuyuanSyncService.ts`
- `src/application/ApplicationContext.ts`
- `src/application/services/__tests__/XiuyuanSyncService.backend-facade.test.ts`
- `src/application/backgroundWork/__tests__/KernelCompanionBackgroundWorkRegistry.test.ts`
- `src/application/__tests__/ApplicationContext.backend-worker-runtime.test.ts`
- `CONTEXT.md`
- `ARCHITECTURE.md`
- `docs/DDD_RESCAN_BACKLOG.md`
- `openspec/changes/`

## Evidence Already Read

- `CONTEXT.md` defines `Kernel Companion Background Work` as the lifecycle Module for long maintenance jobs including Review truth backfill, Xiuyuan startup sync, and kernel transaction action polling.
- `ARCHITECTURE.md` says current P0 routes Review truth backfill and transaction polling through registry, and explicitly leaves Xiuyuan startup sync as the next candidate.
- `XiuyuanSyncService.start()` currently:
  - awaits `migrateLegacyCardTypeAttrsOnce()`
  - if full sync is due, calls `startStartupSyncInBackground('full', () => this.fullSync())`
  - else if plugin-start incremental is enabled, calls `startStartupSyncInBackground('incremental', () => this.incrementalSync(undefined, { source: 'startup', persistIdleCheckpoint: false }))`
- `startStartupSyncInBackground()` currently does only `void operation().catch(...)`.

## Implementation Checklist

1. Create OpenSpec change:
   - `route-xiuyuan-startup-sync-through-background-work-registry`
   - proposal/design/spec/tasks
2. Extend registry types:
   - add `xiuyuan-startup-sync`
   - add `KernelCompanionXiuyuanStartupSyncDiagnostics`
3. Inject/pass registry to `XiuyuanSyncService` at composition root.
4. Replace `startStartupSyncInBackground()` with registry submission.
5. Preserve all existing sync request shapes:
   - full sync unchanged
   - startup incremental keeps `source: 'startup'`
   - startup incremental keeps `persistIdleCheckpoint: false`
6. Add cancellation/defer behavior at lifecycle seam.
7. Add tests:
   - registry accepts/statuses/cancels `xiuyuan-startup-sync`
   - startup full sync is submitted through registry when due
   - startup incremental sync is submitted through registry when configured
   - startup remains non-blocking
   - registry shutdown prevents accepted startup sync from running
   - running job late result does not create new background work after shutdown
8. Update docs/backlog:
   - `CONTEXT.md`
   - `ARCHITECTURE.md`
   - `docs/DDD_RESCAN_BACKLOG.md`
9. Validate:
   - focused Vitest for registry/Xiuyuan/ApplicationContext
   - `node scripts/check-hidden-fallbacks.cjs`
   - `pnpm run check:boundaries`
   - `openspec validate route-xiuyuan-startup-sync-through-background-work-registry --strict`
   - `git diff --check`
   - `pnpm build`
10. Commit after validation.

## Risks

- Xiuyuan startup sync has real writes. Registry cancellation is cooperative lifecycle state, not guaranteed physical interruption of already-started backend/SiYuan writes.
- Keep this explicit in diagnostics/docs.
- Avoid broadening registry into a job scheduler or DB/write owner.
- Avoid touching baseline mirror: `H:/project-F/flashcard/siyuan-plugin-siyuanmemo/`.

## Final Response Style For Next Agent

Use Chinese. Keep terse.

If using `siyuanmemo-plugin-dev`, final sections must be exactly:

- `主改动`
- `顺手清掉的债`
- `暂缓债务`
- `验证`
