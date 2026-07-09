import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '../SqliteDatabaseService';
import {
  NATIVE_RIFF_IMPORT_EXCLUSION_KIND,
  SqlNativeRiffImportExclusionRepository,
} from '../SqlNativeRiffImportExclusionRepository';

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

describe('SqlNativeRiffImportExclusionRepository', () => {
  it('persists an idempotent exclusion and reloads it from the tombstone ledger', async () => {
    const fileService = new MemorySqliteFileService();
    const firstDatabase = new SqliteDatabaseService(fileService);
    await firstDatabase.init();
    const firstRepository = new SqlNativeRiffImportExclusionRepository(firstDatabase, {
      now: () => 1_788_537_600_000,
    });

    const first = await firstRepository.saveExclusion({
      blockId: '20260610140511-bb340gl',
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      source: 'legacy-blacklist',
      reason: 'migrated-riff-blacklist',
    });
    const duplicate = await firstRepository.saveExclusion({
      blockId: '20260610140511-bb340gl',
      nativeCardId: 'replacement-card',
      deckId: 'deck-2',
      source: 'user',
      reason: 'replacement-must-not-overwrite',
    });

    expect(duplicate).toEqual(first);
    expect(await firstRepository.hasExclusion('20260610140511-bb340gl')).toBe(true);
    expect(firstDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM tombstones WHERE kind = ? AND id = ?',
      [NATIVE_RIFF_IMPORT_EXCLUSION_KIND, '20260610140511-bb340gl'],
    )?.count).toBe(1);
    firstDatabase.dispose();

    const reloadedDatabase = new SqliteDatabaseService(fileService);
    await reloadedDatabase.init();
    const reloadedRepository = new SqlNativeRiffImportExclusionRepository(reloadedDatabase);

    await expect(
      reloadedRepository.findExclusion('20260610140511-bb340gl'),
    ).resolves.toEqual({
      version: 1,
      blockId: '20260610140511-bb340gl',
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      excludedAt: 1_788_537_600_000,
      source: 'legacy-blacklist',
      reason: 'migrated-riff-blacklist',
    });
  });

  it('removes only the selected import exclusion kind', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlNativeRiffImportExclusionRepository(database, {
      now: () => 1_788_537_600_000,
    });
    const blockId = '20260610140511-bb340gl';
    database.run(
      `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
      ['card', blockId, 100, null, JSON.stringify({ deletedAt: 100 })],
    );
    await repository.saveExclusion({
      blockId,
      source: 'user',
    });

    await expect(repository.removeExclusion(blockId)).resolves.toBe(true);
    await expect(repository.removeExclusion(blockId)).resolves.toBe(false);
    expect(await repository.hasExclusion(blockId)).toBe(false);
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM tombstones WHERE kind = ? AND id = ?',
      ['card', blockId],
    )?.count).toBe(1);
  });
});
