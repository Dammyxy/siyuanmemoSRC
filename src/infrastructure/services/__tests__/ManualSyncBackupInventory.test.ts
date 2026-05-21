import { describe, expect, it, vi } from 'vitest';
import { ManualSyncBackupInventory } from '../ManualSyncBackupInventory';

describe('ManualSyncBackupInventory', () => {
  it('lists manual sync backup files with parsed metadata and ignored names', async () => {
    const inventory = new ManualSyncBackupInventory({
      resolvePluginDataPath: (path) => `/data/storage/petal/siyuan-plugin-siyuanmemo/${path}`,
      readDir: vi.fn(async () => [
        { name: 'siyuanmemo.db.2026-05-20T01-02-03-000Z.siyuan-sync-conflict-abc.bak', isDir: false, size: 100, updated: 11 },
        { name: 'siyuanmemo.db.pre-stale-source-cleanup-2026-05-21T1449.db', isDir: false, size: 200, updated: 22 },
        { name: 'nested', isDir: true },
      ]),
      readBinary: vi.fn(),
      deleteFile: vi.fn(),
    });

    const files = await inventory.listManualSyncBackupFiles();

    expect(files).toEqual([
      {
        path: 'manual-sync-backups/siyuanmemo.db.2026-05-20T01-02-03-000Z.siyuan-sync-conflict-abc.bak',
        name: 'siyuanmemo.db.2026-05-20T01-02-03-000Z.siyuan-sync-conflict-abc.bak',
        size: 100,
        modifiedAt: 11,
        createdAt: Date.UTC(2026, 4, 20, 1, 2, 3),
        sourceId: 'siyuan-sync-conflict-abc',
        matchesPluginPattern: true,
        metadataValid: true,
      },
      {
        path: 'manual-sync-backups/siyuanmemo.db.pre-stale-source-cleanup-2026-05-21T1449.db',
        name: 'siyuanmemo.db.pre-stale-source-cleanup-2026-05-21T1449.db',
        size: 200,
        modifiedAt: 22,
        createdAt: null,
        sourceId: null,
        matchesPluginPattern: false,
        metadataValid: false,
      },
    ]);
  });

  it('uses backup file byte length when SiYuan readDir omits manual backup size', async () => {
    const readBinary = vi.fn(async () => new Uint8Array([1, 2, 3, 4, 5]));
    const inventory = new ManualSyncBackupInventory({
      resolvePluginDataPath: (path) => `/data/storage/petal/siyuan-plugin-siyuanmemo/${path}`,
      readDir: vi.fn(async () => [
        { name: 'siyuanmemo.db.2026-05-20T01-02-03-000Z.siyuan-sync-conflict-abc.bak', isDir: false },
      ]),
      readBinary,
      deleteFile: vi.fn(),
    });

    const files = await inventory.listManualSyncBackupFiles();

    expect(readBinary).toHaveBeenCalledWith(
      'manual-sync-backups/siyuanmemo.db.2026-05-20T01-02-03-000Z.siyuan-sync-conflict-abc.bak',
    );
    expect(files[0].size).toBe(5);
  });

  it('deletes only valid manual sync backup files through the adapter', async () => {
    const deleteFile = vi.fn();
    const inventory = new ManualSyncBackupInventory({
      resolvePluginDataPath: (path) => path,
      readDir: vi.fn(),
      readBinary: vi.fn(),
      deleteFile,
    });

    await inventory.deleteManualSyncBackupFile(
      'manual-sync-backups/siyuanmemo.db.2026-05-20T01-02-03-000Z.siyuan-sync-conflict-abc.bak',
    );

    expect(deleteFile).toHaveBeenCalledWith(
      'manual-sync-backups/siyuanmemo.db.2026-05-20T01-02-03-000Z.siyuan-sync-conflict-abc.bak',
    );
  });

  it('rejects manual sync backup deletion outside the plugin backup pattern', async () => {
    const deleteFile = vi.fn();
    const inventory = new ManualSyncBackupInventory({
      resolvePluginDataPath: (path) => path,
      readDir: vi.fn(),
      readBinary: vi.fn(),
      deleteFile,
    });

    await expect(inventory.deleteManualSyncBackupFile('manual-sync-backups/siyuanmemo.db.pre-stale.db'))
      .rejects.toThrow('manual sync backup path does not match plugin backup pattern');
    await expect(inventory.deleteManualSyncBackupFile('../siyuanmemo.db.2026-05-20T01-02-03-000Z.x.bak'))
      .rejects.toThrow('manual sync backup path is outside backup directory');
    expect(deleteFile).not.toHaveBeenCalled();
  });
});
