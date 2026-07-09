import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '../SqliteDatabaseService';
import { NATIVE_RIFF_IMPORT_EXCLUSION_KIND } from '../SqlNativeRiffImportExclusionRepository';
import { SqlNativeRiffImportRestoreRepository } from '../SqlNativeRiffImportRestoreRepository';

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

describe('SqlNativeRiffImportRestoreRepository', () => {
  it('removes only suppression evidence matching the selected candidate', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlNativeRiffImportRestoreRepository(database);
    const blockId = '20260610140511-bb340gl';
    const nativeCardId = '20260610192850-rzrmc29';
    const rows = [
      [
        NATIVE_RIFF_IMPORT_EXCLUSION_KIND,
        blockId,
        { version: 1, blockId, excludedAt: 100, source: 'user' },
      ],
      [
        'card',
        'deleted-card-selected',
        { deletedAt: 100, blockId, riffCardId: nativeCardId },
      ],
      [
        'xiuyuan',
        'deleted-xiuyuan-selected',
        { deletedAt: 100, blockIds: [blockId], riffCardId: nativeCardId },
      ],
      [
        'card',
        'deleted-card-unrelated',
        { deletedAt: 100, blockId: 'unrelated-block', riffCardId: 'unrelated-riff' },
      ],
    ] as const;
    for (const [kind, id, payload] of rows) {
      database.run(
        `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
        [kind, id, 100, null, JSON.stringify(payload)],
      );
    }

    await expect(repository.restoreCandidate({
      blockId,
      nativeCardId,
    })).resolves.toEqual({
      removedExclusion: true,
      removedCardTombstoneIds: ['deleted-card-selected'],
      removedXiuyuanTombstoneIds: ['deleted-xiuyuan-selected'],
    });
    expect(database.getAll<{ kind: string; id: string }>(
      'SELECT kind, id FROM tombstones ORDER BY kind, id',
    )).toEqual([{
      kind: 'card',
      id: 'deleted-card-unrelated',
    }]);
  });
});
