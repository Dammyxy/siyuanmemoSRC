import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType } from '@/types/card';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';

describe('WorkerSqliteDatabaseService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads previously persisted database bytes with sql.js runtime', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();

    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.runTransaction('seed-worker-db', (db) => {
      db.run('CREATE TABLE worker_db_seed (id TEXT PRIMARY KEY, value TEXT)');
      db.run('INSERT INTO worker_db_seed (id, value) VALUES (?, ?)', ['a', 'persisted']);
    });
    await first.persist();
    first.dispose();

    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();
    const row = second.getOne<{ value: string }>(
      'SELECT value FROM worker_db_seed WHERE id = ?',
      ['a'],
    );

    expect(row).toEqual({ value: 'persisted' });
  });

  it('exposes transferable array buffer helper for binary bridge payloads', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const service = new WorkerSqliteDatabaseService(bridge);
    await service.init();
    await service.persist();

    const snapshot = bridge.snapshot();
    expect(snapshot.bytes).toBeTruthy();
    expect(snapshot.bytes!.byteLength).toBeGreaterThan(16);
  });

  it('does not rewrite the sqlite file during worker init', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));

    const first = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await first.init();
    await first.persist();
    const writesAfterSeed = writeBinary.mock.calls.length;
    first.dispose();

    const second = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await second.init();

    expect(writeBinary).toHaveBeenCalledTimes(writesAfterSeed);
  });

  it('coalesces repeated queue projection replacements into one deferred sqlite write', async () => {
    vi.useFakeTimers();
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-card',
      blockId: 'projection-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection card' },
    }]);
    const writesBeforeProjection = writeBinary.mock.calls.length;

    for (const queueType of ['retrieval-practice', 'incremental-learning', 'final-drill']) {
      await database.replaceQueueProjection({
        queueType,
        policyHash: `${queueType}:policy`,
        generation: 1,
        rows: [{
          rowId: `${queueType}:row`,
          cardId: 'projection-card',
          blockId: 'projection-block',
          deckId: null,
          membershipReason: 'test',
          dueAt: 1_700_000_000_000,
          dueBucket: 'due',
          priorityScore: 40,
          sortKey: `0001:${queueType}`,
          queueIndexHint: 1,
          payload: { source: 'test' },
        }],
        reason: 'test-materialization',
      });
    }

    expect(writeBinary).toHaveBeenCalledTimes(writesBeforeProjection);
    await vi.advanceTimersByTimeAsync(1000);
    await database.persist();

    expect(writeBinary).toHaveBeenCalledTimes(writesBeforeProjection + 1);
  });

  it('flushes a pending queue projection write once before explicit persist and skips clean repeat', async () => {
    vi.useFakeTimers();
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-flush-card',
      blockId: 'projection-flush-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection flush card' },
    }]);
    const writesBeforeProjection = writeBinary.mock.calls.length;

    await database.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:flush-policy',
      generation: 1,
      rows: [{
        rowId: 'retrieval-practice:flush-row',
        cardId: 'projection-flush-card',
        blockId: 'projection-flush-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:retrieval-practice',
        queueIndexHint: 1,
        payload: { source: 'test' },
      }],
      reason: 'test-flush',
    });

    await database.persist();
    expect(writeBinary).toHaveBeenCalledTimes(writesBeforeProjection + 1);

    await database.persist();
    expect(writeBinary).toHaveBeenCalledTimes(writesBeforeProjection + 1);
  });
});
