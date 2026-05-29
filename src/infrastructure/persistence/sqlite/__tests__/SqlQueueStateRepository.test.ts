import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '../SqliteDatabaseService';
import { SqlQueueStateRepository } from '../SqlQueueStateRepository';

class MemorySqliteFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'> {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  writeBinaryCount = 0;

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
    this.writeBinaryCount += 1;
    this.binary.set(fileName, new Uint8Array(bytes));
  }

  resetWriteCounts(): void {
    this.writeBinaryCount = 0;
  }
}

describe('SqlQueueStateRepository', () => {
  it('strips transient nextDues snapshots before queue state persistence', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlQueueStateRepository(database);

    repository.set('queue', {
      entries: [
        { cardId: 'a', nextDues: { good: 1 }, due: 2 },
        { cardId: 'b', preview: { nextDues: { hard: 3 }, label: 'kept' } },
      ],
    });

    expect(repository.loadAll()).toEqual({
      queue: {
        entries: [
          { cardId: 'a', due: 2 },
          { cardId: 'b', preview: { label: 'kept' } },
        ],
      },
    });
  });

  it('skips equal queue state writes so startup and refresh do not dirty sqlite', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    const repository = new SqlQueueStateRepository(database);

    repository.set('incrementalLearningQueue', []);
    await repository.persist();
    const firstUpdatedAt = database.getOne<{ updated_at: number }>(
      'SELECT updated_at FROM queue_state WHERE key = ?',
      ['incrementalLearningQueue'],
    )?.updated_at;
    fileService.resetWriteCounts();

    repository.set('incrementalLearningQueue', []);
    await repository.persist();

    expect(database.getOne<{ updated_at: number }>(
      'SELECT updated_at FROM queue_state WHERE key = ?',
      ['incrementalLearningQueue'],
    )?.updated_at).toBe(firstUpdatedAt);
    expect(fileService.writeBinaryCount).toBe(0);
  });

  it('skips replacing all queue state when migrated content is unchanged', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    const repository = new SqlQueueStateRepository(database);

    repository.replaceAll({
      retrievalPracticeQueue: [{ cardId: 'a', nextDues: { good: 1 } }],
      incrementalLearningQueue: [],
    });
    await repository.persist();
    const firstUpdatedAtRows = database.getAll<{ key: string; updated_at: number }>(
      'SELECT key, updated_at FROM queue_state ORDER BY key',
    );
    fileService.resetWriteCounts();

    repository.replaceAll({
      incrementalLearningQueue: [],
      retrievalPracticeQueue: [{ cardId: 'a' }],
    });
    await repository.persist();

    expect(database.getAll<{ key: string; updated_at: number }>(
      'SELECT key, updated_at FROM queue_state ORDER BY key',
    )).toEqual(firstUpdatedAtRows);
    expect(fileService.writeBinaryCount).toBe(0);
  });
});
