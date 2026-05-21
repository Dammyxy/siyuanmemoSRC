# Manual Sync Backup Retention Handoff

Date: 2026-05-21
Focus: add a retention strategy for `manual-sync-backups`
Workspace used during diagnosis: `H:\闪卡同步测试`
Active worktree: `H:\project-F\flashcard\.worktrees\siyuan-plugin-siyuanmemo\kernel-companion-p0`

## Why This Exists

The sync conflict cleanup work now handles real SiYuan conflict database copies under:

`temp/repo/sync/conflicts/**/siyuanmemo.db`

That cleanup deliberately does not touch:

`data/storage/petal/siyuan-plugin-siyuanmemo/manual-sync-backups`

Files in `manual-sync-backups` are safety backups of the current local `siyuanmemo.db` created before replacing the current library with a selected conflict copy. They are not conflict sources, do not participate in domain sync diagnostics, and should not affect review entry safety.

The user wants a separate backup retention strategy so these backups do not grow forever.

## Current Runtime Path

Backup creation:

- `src/application/services/SyncConflictDirectionResolutionService.ts`
  - In the `replaceWithConflictCopy` branch, calls `fileSource.backupCurrentSqliteDatabase({ sourceId, now })`.
  - Then writes the selected conflict copy over current `siyuanmemo.db`.

- `src/infrastructure/services/FileService.ts`
  - `backupCurrentSqliteDatabase()` reads current `siyuanmemo.db`.
  - Writes `manual-sync-backups/siyuanmemo.db.{timestamp}.{safeSourceId}.bak`.
  - Returns `{ backupPath, bytes }`.

UI display:

- `src/ui/syncConflict/manualSyncConflictResolutionDialog.ts`
  - Shows replace result message with the backup path.

Tests already around this path:

- `src/infrastructure/services/__tests__/FileService.test.ts`
- `src/application/services/__tests__/SyncConflictDirectionResolutionService.test.ts`

Related but separate cleanup:

- Sync conflict copy cleanup is backed by backend RPC and `domain_sync_processed_sources`.
- Do not merge manual backup cleanup into that panel without clear UI separation.

## Product Decision To Preserve

Keep two concepts separate:

- Conflict copies: remote/local sync conflict candidates from SiYuan sync; can be scanned, merged, imported, and cleaned when processed.
- Manual sync backups: local rollback points created before destructive replacement; can be pruned by age/count, but are not evidence for sync health.

Recommended UX wording in Chinese:

- `手动同步备份`
- `保留最近 N 个备份`
- `删除早于 N 天的备份`
- `清理旧备份`
- `最近备份会保留，用于回滚误替换`

Avoid wording like `冲突副本` for this feature.

## Suggested Retention Policy

Default behavior should be conservative:

- Keep at least the newest 3 manual backups.
- Delete only backups older than 7 days by default.
- Never delete the newest backup, even if it is older than the age limit.
- Only match files produced by the plugin naming pattern:
  - `manual-sync-backups/siyuanmemo.db.*.bak`
  - optionally include earlier diagnostic `.db` files only if explicitly labeled as plugin-created backup files.
- Show a preview before deletion.
- Manual cleanup only for first version; avoid automatic cleanup on startup until UI and logging are proven.

Useful candidate states:

- `retained-newest`: protected by minimum count.
- `retained-young`: newer than age threshold.
- `eligible-old`: older than age threshold and outside minimum count.
- `ignored-name`: not matching known backup naming pattern.
- `invalid-metadata`: cannot parse timestamp or size.

## Proposed Contract Shape

If implemented through backend/client contract, add separate methods instead of reusing conflict source cleanup:

- `manualSyncBackups.retention.preview`
- `manualSyncBackups.retention.apply`

Possible result types:

```ts
type BackendManualSyncBackupRetentionCandidate = {
  path: string;
  name: string;
  size: number;
  createdAt: number | null;
  sourceId: string | null;
  eligible: boolean;
  reason: 'eligible-old' | 'retained-newest' | 'retained-young' | 'ignored-name' | 'invalid-metadata';
};

type BackendManualSyncBackupRetentionPreviewResult = {
  status: 'preview';
  retention: {
    keepNewest: number;
    deleteOlderThanDays: number;
  };
  candidates: BackendManualSyncBackupRetentionCandidate[];
  eligibleCount: number;
  eligibleBytes: number;
};

type BackendManualSyncBackupRetentionApplyResult = {
  status: 'applied';
  deleted: Array<{ path: string; size: number }>;
  skipped: BackendManualSyncBackupRetentionCandidate[];
  failed: Array<{ path: string; reason: string }>;
};
```

Keep this separate from `BackendDomainSyncConflictSourceCleanup*`.

## Implementation Plan

1. Add a file service method for listing manual sync backups.
   - Use `readDir`/existing SiYuan file API abstraction if available.
   - Keep parsing in `FileService`, not UI.
   - Return metadata: path, file name, size, modified time, parsed source id.

2. Add a retention service in application layer.
   - Suggested name: `ManualSyncBackupRetentionApplicationService`.
   - It should classify candidates and calculate preview/apply results.
   - Do not delete directly from UI.

3. Add backend/client contract only if deletion needs backend authority.
   - If existing file deletion already lives in frontend-side `FileService`, application service may be enough.
   - If using kernel/backend RPC for authority, add contract to `packages/contracts/src/backend-rpc.ts` and handler in `worker/bootstrap/BackendKernel.ts`.

4. Add UI in sync conflict dialog or settings.
   - Prefer a separate section named `手动同步备份`.
   - Display count, total size, newest retained count, old eligible count.
   - Add `预览清理` and `清理旧备份`.
   - Do not place it inside conflict-copy candidate table.

5. Add tests.
   - `FileService.test.ts`: file name parsing and listing.
   - New application service test: retention classification.
   - UI test: preview shows old backups and apply deletes only eligible files.
   - If backend RPC used: `BackendKernel.test.ts` and client test.

6. Update docs/backlog.
   - Add delta to `docs/DDD_RESCAN_BACKLOG.md`.
   - Mention separation from conflict copy cleanup.

## Acceptance Checklist

- Existing conflict source cleanup still only targets `temp/repo/sync/conflicts/**/siyuanmemo.db`.
- Manual backup cleanup only targets `manual-sync-backups/siyuanmemo.db.*.bak` unless explicitly expanded.
- Preview is available before deletion.
- Default keeps at least 3 backups and deletes only backups older than 7 days.
- Unrecognized files in `manual-sync-backups` are ignored, not deleted.
- UI text makes clear these are rollback backups, not conflict copies.
- Tests cover newest/old/unknown-name/failure cases.
- `node scripts/check-hidden-fallbacks.cjs` passes.
- `pnpm run check:boundaries` passes if production wiring changes.
- `pnpm build` passes before deploy.

## Suggested Skills For Next Session

- `siyuanmemo-plugin-dev`: required for this repository.
- `brainstorming`: use if changing UX placement or settings behavior.
- `tdd`: use for retention classification before implementation.
- `diagnose`: use only if existing backup deletion/listing behavior fails.

## Notes From Current Workspace

Observed backup directory:

`H:\闪卡同步测试\data\storage\petal\siyuan-plugin-siyuanmemo\manual-sync-backups`

Examples seen:

- `siyuanmemo.db.2026-05-19T16-42-26-998Z...bak`
- `siyuanmemo.db.2026-05-20T20-27-18-284Z...bak`
- `siyuanmemo.db.2026-05-21T06-37-10-500Z...bak`
- `siyuanmemo.db.pre-stale-domain-sync-row-cleanup-2026-05-21T0515.db`
- `siyuanmemo.db.pre-stale-source-cleanup-2026-05-21T1449.db`

The `.bak` files are generated by `backupCurrentSqliteDatabase()`.
The `pre-stale-*` `.db` files appear to be manual diagnostic backups from this debugging session. Do not include them in the first automated retention rule unless a later decision explicitly expands cleanup to diagnostic backups.
