import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '../SqliteDatabaseService';
import { SqlXiuyuanReadRepository } from '../SqlXiuyuanReadRepository';

type JsonFileService = Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'>;

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

describe('SqlXiuyuanReadRepository', () => {
  it('loads Xiuyuan by id and by indexed card block id', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlXiuyuanReadRepository(database);
    const now = Date.now();
    const xiuyuan = {
      id: 'xy-1',
      blockIDs: ['block-1'],
      fields: [{ name: 'question', blockID: 'block-1' }],
      templateID: 'basic',
      createdAt: now,
      updatedAt: now,
      meta: { cardIds: ['card-1'] },
    };
    const dto = {
      id: 'card-1',
      blockId: 'block-1',
      due: now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 0,
      type: 'basic',
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      xiuyuanID: 'xy-1',
      templateID: 'basic',
    };

    database.run('INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)', [
      'xy-1',
      now,
      JSON.stringify(xiuyuan),
    ]);
    database.run(
      `INSERT INTO cards (id, block_id, xiuyuan_id, updated_at, payload_json, dto_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['card-1', 'block-1', 'xy-1', now, JSON.stringify({ id: 'card-1', blockId: 'block-1' }), JSON.stringify(dto)],
    );

    expect(repository.findById('xy-1')?.id).toBe('xy-1');
    expect(repository.findByBlockId('block-1').map((item) => item.id)).toEqual(['xy-1']);
    expect(repository.getCardDTO('card-1')?.id).toBe('card-1');
    expect(repository.getCardDTOsByXiuyuanId('xy-1').map((item) => item.id)).toEqual(['card-1']);
  });

  it('does not return tombstoned Xiuyuan or card rows', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlXiuyuanReadRepository(database);
    const now = Date.now();

    database.run('INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)', [
      'xy-deleted',
      now,
      JSON.stringify({
        id: 'xy-deleted',
        blockIDs: ['block-deleted'],
        fields: [],
        templateID: 'basic',
        createdAt: now,
        updatedAt: now,
      }),
    ]);
    database.run(
      `INSERT INTO cards (id, block_id, xiuyuan_id, updated_at, payload_json, dto_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['card-deleted', 'block-deleted', 'xy-deleted', now, JSON.stringify({ id: 'card-deleted' }), null],
    );
    database.run(
      `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
      ['xiuyuan', 'xy-deleted', now, null, JSON.stringify({ deletedAt: now })],
    );

    expect(repository.findById('xy-deleted')).toBeNull();
    expect(repository.findByBlockId('block-deleted')).toEqual([]);
  });
});
