# Handoff: add-manual-sync-direction-resolution

Date: 2026-05-20

## Use These Skills Next

- `siyuanmemo-plugin-dev`: mandatory for active SiYuanMemo runtime worktree and DDD gates.
- `openspec-apply-change`: continue `add-manual-sync-direction-resolution`.
- `diagnose`: if live SiYuan smoke fails or conflicts do not show.
- `agent-browser`: only if a runnable browser/plugin surface is available and UI interaction can be automated.

## Active Root

Use only:

`H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`

Do not edit baseline mirror:

`H:/project-F/flashcard/siyuan-plugin-siyuanmemo/`

Current branch:

`externalize-srs-algorithms-and-index-queues`

## Source Artifacts

- OpenSpec change: `openspec/changes/add-manual-sync-direction-resolution/`
- Task list: `openspec/changes/add-manual-sync-direction-resolution/tasks.md`
- Backlog delta: `docs/DDD_RESCAN_BACKLOG.md`, newest entry `2026-05-20 - Manual Sync Direction Resolution`
- Active plan context from workspace root: `H:/project-F/flashcard/specs/001-backend-migration-next/plan.md`

## Current State

OpenSpec progress is `22/23` complete.

Completed:

- Backend RPC contracts for `sync.conflict.summarize` and `sync.conflict.reload`.
- Backend read-only DB summary extraction for current and conflict DB bytes.
- FileService conflict source metadata, current DB backup, and DB replacement helpers.
- Application `SyncConflictDirectionResolutionService`.
- `ApplicationContext` preview/apply entrypoints.
- Command palette and topbar action now launch a compact manual conflict resolution dialog.
- Dialog supports smart merge, keep current local, selected conflict copy replacement, and cancel.
- i18n strings added in `src/i18n/en_US.json` and `src/i18n/zh_CN.json`.
- Rebuilt `dist/` copied to `H:\闪卡同步测试\data\plugins\siyuan-plugin-siyuanmemo`.

Remaining:

- Task `4.6`: live smoke test with existing conflict DB copies:
  - preview sources
  - smart merge
  - keep current local no-op
  - replacement into a disposable test workspace backup

## Important Runtime Path

UI entry:

- `src/index.ts`
- `src/application/managers/MenuManager.ts`
- `src/ui/syncConflict/manualSyncConflictResolutionDialog.ts`

Application:

- `src/application/ApplicationContext.ts`
- `src/application/services/SyncConflictDirectionResolutionService.ts`
- `src/application/services/SyncConflictMergeApplicationService.ts`

Backend/worker:

- `packages/contracts/src/backend-rpc.ts`
- `src/application/clients/SrsBackendClient.ts`
- `src/application/clients/BrowserSrsBackendWorkerTransport.ts`
- `worker/bootstrap/BackendKernel.ts`
- `worker/bootstrap/BackendWorkerProtocol.ts`
- `worker/bootstrap/backend-worker.entry.ts`
- `worker/db/SqliteDatabaseService.ts`
- `worker/db/SqlitePersistenceBridge.ts`

Infrastructure:

- `src/infrastructure/services/FileService.ts`

## Validation Already Run

Passed:

```powershell
pnpm vitest run src/application/services/__tests__/SyncConflictDirectionResolutionService.test.ts src/infrastructure/services/__tests__/FileService.test.ts src/application/clients/__tests__/SrsBackendClient.test.ts worker/__tests__/BackendKernel.test.ts
```

Result: 4 files passed, 94 tests passed.

Passed:

```powershell
pnpm run check:boundaries
```

Passed:

```powershell
pnpm build
```

Build notes:

- `check-i18n.cjs` reports existing non-blocking hardcoded/i18n warnings.
- Zip packing reports existing non-blocking `EPERM: operation not permitted, unlink ... package.zip`.
- Vite build completed and `check:srs-dist-hygiene` passed.

Deployment copied:

```powershell
Copy-Item -Path dist\* -Destination "H:\闪卡同步测试\data\plugins\siyuan-plugin-siyuanmemo" -Recurse -Force
```

## Next Session Checklist

1. Restart SiYuan using `H:\闪卡同步测试` so copied plugin bundle loads.
2. Open command palette or topbar menu action `Resolve SiYuanMemo Sync Conflicts` / `处理 SiYuanMemo 同步冲突`.
3. Confirm preview lists conflict DB copies with source id, path, size, counts, latest timestamp, and parse status.
4. Run smart merge on readable sources and verify message reports merge counts.
5. Reopen dialog and run keep-current; confirm no DB mutation and conflict files remain.
6. For replacement, use only a disposable workspace/backup. Confirm second prompt includes source id and backup warning, then verify backup path is reported.
7. If all smoke passes, mark task `4.6` complete in `openspec/changes/add-manual-sync-direction-resolution/tasks.md`.
8. Re-run `openspec instructions apply --change "add-manual-sync-direction-resolution" --json`; if `23/23`, archive can be next.

## Risks / Watchpoints

- Do not delete, move, or mark conflict files processed in this change. Spec says conflict files remain immutable.
- Replacement path is intentionally destructive to current DB, but it creates a backup first. Smoke replacement must use disposable data.
- Worker reload must remain backend-mediated. Do not let UI parse/write SQLite directly beyond FileService replacement helper through application service.
- `kernel.js` must not own DB merge, replacement, or sync policy.

