import { describe, expect, it, vi } from 'vitest';
import type { NativeRiffImportExclusionPort } from '@/application/ports/NativeRiffImportExclusionPort';
import type { NativeRiffLegacyBlacklistPort } from '@/application/ports/NativeRiffLegacyBlacklistPort';
import { UnifiedStorageManager, type UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import { UnifiedStorageNativeRiffLegacyBlacklistAdapter } from '@/infrastructure/persistence/UnifiedStorageNativeRiffLegacyBlacklistAdapter';
import { SqlNativeRiffImportExclusionRepository } from '@/infrastructure/persistence/sqlite/SqlNativeRiffImportExclusionRepository';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import type { IFileService } from '@/infrastructure/services/FileService';
import { NativeRiffLegacyBlacklistMigrationModule } from '../NativeRiffLegacyBlacklistMigrationModule';

type JsonFileService = Pick<
  IFileService,
  'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'
>;

class MemorySqliteFileService implements JsonFileService {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, new Uint8Array(bytes));
  }
}

describe('NativeRiffLegacyBlacklistMigrationModule', () => {
  it('writes every durable exclusion before clearing the legacy blacklist', async () => {
    const legacy: NativeRiffLegacyBlacklistPort = {
      listBlockIds: vi.fn(async () => [
        ' block-b ',
        'block-a',
        'block-b',
        '',
      ]),
      clear: vi.fn(async () => undefined),
    };
    const exclusions: NativeRiffImportExclusionPort = {
      findExclusion: vi.fn(async () => null),
      hasExclusion: vi.fn(async () => false),
      saveExclusion: vi.fn(async input => ({
        version: 1,
        blockId: input.blockId,
        excludedAt: 100,
        source: input.source,
        ...(input.reason ? { reason: input.reason } : {}),
      })),
      removeExclusion: vi.fn(async () => false),
    };
    const module = new NativeRiffLegacyBlacklistMigrationModule({
      legacy,
      exclusions,
    });

    await expect(module.migrate()).resolves.toEqual({
      migratedBlockIds: ['block-a', 'block-b'],
      migratedCount: 2,
      legacyCleared: true,
    });
    expect(exclusions.saveExclusion).toHaveBeenNthCalledWith(1, {
      blockId: 'block-a',
      source: 'legacy-blacklist',
      reason: 'migrated-riff-blacklist',
    });
    expect(exclusions.saveExclusion).toHaveBeenNthCalledWith(2, {
      blockId: 'block-b',
      source: 'legacy-blacklist',
      reason: 'migrated-riff-blacklist',
    });
    expect(vi.mocked(legacy.clear).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(exclusions.saveExclusion).mock.invocationCallOrder[1] ?? 0,
    );
  });

  it('keeps the legacy blacklist when any durable exclusion write fails', async () => {
    const legacy: NativeRiffLegacyBlacklistPort = {
      listBlockIds: vi.fn(async () => ['block-a', 'block-b']),
      clear: vi.fn(async () => undefined),
    };
    const exclusions: NativeRiffImportExclusionPort = {
      findExclusion: vi.fn(async () => null),
      hasExclusion: vi.fn(async () => false),
      saveExclusion: vi.fn(async input => {
        if (input.blockId === 'block-b') {
          throw new Error('durable exclusion write failed');
        }
        return {
          version: 1,
          blockId: input.blockId,
          excludedAt: 100,
          source: input.source,
        };
      }),
      removeExclusion: vi.fn(async () => false),
    };
    const module = new NativeRiffLegacyBlacklistMigrationModule({
      legacy,
      exclusions,
    });

    await expect(module.migrate()).rejects.toThrow('durable exclusion write failed');
    expect(exclusions.saveExclusion).toHaveBeenCalledTimes(2);
    expect(legacy.clear).not.toHaveBeenCalled();
  });

  it('migrates persisted legacy entries once and remains idempotent after reload', async () => {
    let persistedStore: UnifiedCardStore = {
      version: 2,
      xiuyuans: {},
      cards: {},
      cardDTOs: {},
      deletedCardDTOs: {},
      deletedXiuyuans: {},
      riffBlacklist: ['block-b', 'block-a', 'block-a'],
      riffSyncState: {},
    };
    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async store => {
        persistedStore = JSON.parse(JSON.stringify(store)) as UnifiedCardStore;
      },
      async () => JSON.parse(JSON.stringify(persistedStore)) as UnifiedCardStore,
    );
    expect((await storage.load()).ok).toBe(true);

    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    const exclusions = new SqlNativeRiffImportExclusionRepository(database, {
      now: () => 1_788_537_600_000,
    });
    const module = new NativeRiffLegacyBlacklistMigrationModule({
      legacy: new UnifiedStorageNativeRiffLegacyBlacklistAdapter(storage),
      exclusions,
    });

    await expect(module.migrate()).resolves.toEqual({
      migratedBlockIds: ['block-a', 'block-b'],
      migratedCount: 2,
      legacyCleared: true,
    });
    await expect(module.migrate()).resolves.toEqual({
      migratedBlockIds: [],
      migratedCount: 0,
      legacyCleared: false,
    });
    expect(persistedStore.riffBlacklist).toEqual([]);
    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM tombstones
       WHERE kind = 'native-riff-import-exclusion'`,
    )?.count).toBe(2);
    database.dispose();

    const reloadedDatabase = new SqliteDatabaseService(fileService);
    await reloadedDatabase.init();
    const reloadedExclusions = new SqlNativeRiffImportExclusionRepository(reloadedDatabase);
    await expect(reloadedExclusions.hasExclusion('block-a')).resolves.toBe(true);
    await expect(reloadedExclusions.hasExclusion('block-b')).resolves.toBe(true);
  });
});
