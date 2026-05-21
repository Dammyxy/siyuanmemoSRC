import { describe, expect, it, vi } from 'vitest';
import {
  ManualSyncBackupRetentionApplicationService,
  type ManualSyncBackupRetentionFileSource,
} from '../ManualSyncBackupRetentionApplicationService';
import type { ManualSyncBackupFileEntry } from '@/infrastructure/services/ManualSyncBackupInventory';

function backup(name: string, createdAt: number | null, size = 10): ManualSyncBackupFileEntry {
  const matchesPluginPattern = name.endsWith('.bak') && createdAt !== null;
  return {
    path: `manual-sync-backups/${name}`,
    name,
    size,
    modifiedAt: createdAt,
    createdAt,
    sourceId: matchesPluginPattern ? name.replace(/^siyuanmemo\.db\.[^.]+\.|\.bak$/g, '') : null,
    matchesPluginPattern,
    metadataValid: matchesPluginPattern,
  };
}

describe('ManualSyncBackupRetentionApplicationService', () => {
  const now = Date.UTC(2026, 4, 21, 0, 0, 0);

  it('previews conservative retention for newest, young, old, ignored, and invalid candidates', async () => {
    const files = [
      backup('siyuanmemo.db.2026-05-21T00-00-00-000Z.newest.bak', Date.UTC(2026, 4, 21), 1),
      backup('siyuanmemo.db.2026-05-20T00-00-00-000Z.second.bak', Date.UTC(2026, 4, 20), 2),
      backup('siyuanmemo.db.2026-05-19T00-00-00-000Z.third.bak', Date.UTC(2026, 4, 19), 3),
      backup('siyuanmemo.db.2026-05-18T00-00-00-000Z.young.bak', Date.UTC(2026, 4, 18), 4),
      backup('siyuanmemo.db.2026-05-01T00-00-00-000Z.old.bak', Date.UTC(2026, 4, 1), 5),
      backup('siyuanmemo.db.pre-stale-source-cleanup.db', null, 6),
      {
        ...backup('siyuanmemo.db.bad-date.source.bak', null, 7),
        matchesPluginPattern: false,
      },
    ];
    const service = new ManualSyncBackupRetentionApplicationService({
      listManualSyncBackupFiles: vi.fn(async () => files),
      deleteManualSyncBackupFile: vi.fn(),
    }, () => now);

    const preview = await service.preview();

    expect(preview.retention).toEqual({ keepNewest: 3, deleteOlderThanDays: 7 });
    expect(preview.eligibleCount).toBe(1);
    expect(preview.eligibleBytes).toBe(5);
    expect(preview.candidates.map((candidate) => [candidate.name, candidate.reason, candidate.eligible])).toEqual([
      ['siyuanmemo.db.2026-05-21T00-00-00-000Z.newest.bak', 'retained-newest', false],
      ['siyuanmemo.db.2026-05-20T00-00-00-000Z.second.bak', 'retained-newest', false],
      ['siyuanmemo.db.2026-05-19T00-00-00-000Z.third.bak', 'retained-newest', false],
      ['siyuanmemo.db.2026-05-18T00-00-00-000Z.young.bak', 'retained-young', false],
      ['siyuanmemo.db.2026-05-01T00-00-00-000Z.old.bak', 'eligible-old', true],
      ['siyuanmemo.db.pre-stale-source-cleanup.db', 'ignored-name', false],
      ['siyuanmemo.db.bad-date.source.bak', 'invalid-metadata', false],
    ]);
  });

  it('never deletes the only backup even when older than retention age', async () => {
    const files = [
      backup('siyuanmemo.db.2026-05-01T00-00-00-000Z.only.bak', Date.UTC(2026, 4, 1), 5),
    ];
    const service = new ManualSyncBackupRetentionApplicationService({
      listManualSyncBackupFiles: vi.fn(async () => files),
      deleteManualSyncBackupFile: vi.fn(),
    }, () => now);

    const preview = await service.preview();

    expect(preview.candidates[0]).toMatchObject({
      eligible: false,
      reason: 'retained-newest',
    });
  });

  it('applies cleanup only to eligible old backups and reports failures', async () => {
    const files = [
      backup('siyuanmemo.db.2026-05-21T00-00-00-000Z.newest.bak', Date.UTC(2026, 4, 21), 1),
      backup('siyuanmemo.db.2026-05-20T00-00-00-000Z.second.bak', Date.UTC(2026, 4, 20), 2),
      backup('siyuanmemo.db.2026-05-19T00-00-00-000Z.third.bak', Date.UTC(2026, 4, 19), 3),
      backup('siyuanmemo.db.2026-05-01T00-00-00-000Z.delete-a.bak', Date.UTC(2026, 4, 1), 4),
      backup('siyuanmemo.db.2026-04-30T00-00-00-000Z.delete-b.bak', Date.UTC(2026, 3, 30), 5),
    ];
    const deleteManualSyncBackupFile = vi.fn(async (path: string) => {
      if (path.endsWith('delete-b.bak')) {
        throw new Error('locked');
      }
    });
    const fileSource: ManualSyncBackupRetentionFileSource = {
      listManualSyncBackupFiles: vi.fn(async () => files),
      deleteManualSyncBackupFile,
    };
    const service = new ManualSyncBackupRetentionApplicationService(fileSource, () => now);

    const result = await service.apply();

    expect(deleteManualSyncBackupFile).toHaveBeenCalledTimes(2);
    expect(result.deleted).toEqual([
      { path: 'manual-sync-backups/siyuanmemo.db.2026-05-01T00-00-00-000Z.delete-a.bak', size: 4 },
    ]);
    expect(result.failed).toEqual([
      { path: 'manual-sync-backups/siyuanmemo.db.2026-04-30T00-00-00-000Z.delete-b.bak', reason: 'locked' },
    ]);
    expect(result.skipped).toHaveLength(3);
  });
});
