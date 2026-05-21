import { describe, expect, it, vi } from 'vitest';
import { QueuePersistenceError, QueuePersistenceService } from '../QueuePersistenceService';
import type { SqlQueueStateRepository } from '@/infrastructure/persistence/sqlite';

describe('QueuePersistenceService', () => {
  it('loads and flushes queue state through the SQL repository without touching legacy msgpack', async () => {
    const repository = {
      loadAll: vi.fn(() => ({ retrievalPracticeQueue: { remaining: 1 } })),
      set: vi.fn(),
      delete: vi.fn(),
      persist: vi.fn(async () => undefined),
    } as unknown as SqlQueueStateRepository;
    const service = new QueuePersistenceService(repository);

    await service.init();
    expect(service.get<{ remaining: number }>('retrievalPracticeQueue')).toEqual({ remaining: 1 });

    await service.set('retrievalPracticeQueue', { remaining: 2 });
    await service.flush();

    expect(repository.set).toHaveBeenCalledWith('retrievalPracticeQueue', { remaining: 2 });
    expect(repository.persist).toHaveBeenCalledTimes(1);
  });

  it('fails closed instead of reading legacy queue msgpack when SQL repository is unavailable', async () => {
    const service = new QueuePersistenceService(null);

    await expect(service.init()).rejects.toMatchObject({
      operation: 'init',
      key: 'all',
      message: expect.stringContaining('SQLite queue repository unavailable'),
    } satisfies Partial<QueuePersistenceError>);
  });
});
