import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '../SqliteDatabaseService';
import { SqlQueueStateRepository } from '../SqlQueueStateRepository';

class MemorySqliteFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'> {
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
});
