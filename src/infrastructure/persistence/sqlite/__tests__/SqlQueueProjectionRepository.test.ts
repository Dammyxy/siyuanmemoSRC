import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import { QueueType } from '@/types/unified-data-source';
import type {
  QueueProjectionCounters,
  QueueProjectionRow,
} from '@/application/ports/QueueProjectionPort';

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

function row(overrides: Partial<QueueProjectionRow> = {}): QueueProjectionRow {
  return {
    queueType: QueueType.RetrievalPractice,
    rowId: 'row-a',
    cardId: 'card-a',
    blockId: 'block-a',
    deckId: 'deck-a',
    membershipReason: 'due',
    dueAt: 100,
    dueBucket: 'due',
    priorityScore: 0.7,
    sortKey: '0001',
    queueIndexHint: 1,
    policyHash: 'policy-a',
    sourceGeneration: 1,
    payload: { cardType: 'item' },
    updatedAt: 1000,
    ...overrides,
  };
}

function counters(overrides: Partial<QueueProjectionCounters> = {}): QueueProjectionCounters {
  return {
    queueType: QueueType.RetrievalPractice,
    policyHash: 'policy-a',
    generation: 1,
    version: 1,
    remaining: 2,
    due: 2,
    total: 2,
    buckets: {
      all: 2,
      item: 2,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    updatedAt: 1000,
    ...overrides,
  };
}

async function createRepository(): Promise<SqlQueueProjectionRepository> {
  const database = new SqliteDatabaseService(new MemorySqliteFileService());
  await database.init();
  return new SqlQueueProjectionRepository(database);
}

describe('SqlQueueProjectionRepository', () => {
  it('stores projection rows, counters, and generation with stable row ordering', async () => {
    const repository = await createRepository();

    repository.replaceQueueProjection({
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-a',
      generation: 1,
      rows: [
        row({ rowId: 'row-b', cardId: 'card-b', sortKey: '0002', queueIndexHint: 2 }),
        row({ rowId: 'row-a', cardId: 'card-a', sortKey: '0001', queueIndexHint: 1 }),
      ],
      counters: counters(),
      metadata: { rebuiltBy: 'test' },
    });

    expect(repository.readRows({ queueType: QueueType.RetrievalPractice }).map((entry) => entry.rowId)).toEqual([
      'row-a',
      'row-b',
    ]);
    expect(repository.readCounters(QueueType.RetrievalPractice)).toMatchObject({
      generation: 1,
      version: 1,
      total: 2,
      buckets: { item: 2 },
    });
    expect(repository.readGeneration(QueueType.RetrievalPractice)).toMatchObject({
      policyHash: 'policy-a',
      generation: 1,
      status: 'ready',
      metadata: { rebuiltBy: 'test' },
    });
  });

  it('hydrates projection rows by requested row identity order', async () => {
    const repository = await createRepository();
    repository.replaceQueueProjection({
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-a',
      generation: 1,
      rows: [
        row({ rowId: 'row-a', cardId: 'card-a' }),
        row({ rowId: 'row-b', cardId: 'card-b', sortKey: '0002' }),
      ],
      counters: counters(),
    });

    expect(repository.readRowsByIds(QueueType.RetrievalPractice, ['row-b', 'row-a']).map((entry) => entry.cardId)).toEqual([
      'card-b',
      'card-a',
    ]);
  });

  it('keeps projection row ids isolated by policy hash', async () => {
    const repository = await createRepository();

    repository.replaceQueueProjection({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-a',
      generation: 1,
      rows: [
        row({
          queueType: QueueType.IncrementalLearning,
          rowId: 'shared-row',
          cardId: 'card-policy-a',
          policyHash: 'policy-a',
          sourceGeneration: 1,
        }),
      ],
      counters: counters({
        queueType: QueueType.IncrementalLearning,
        policyHash: 'policy-a',
        generation: 1,
        total: 1,
        remaining: 1,
        due: 1,
      }),
    });
    repository.replaceQueueProjection({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-b',
      generation: 2,
      rows: [
        row({
          queueType: QueueType.IncrementalLearning,
          rowId: 'shared-row',
          cardId: 'card-policy-b',
          policyHash: 'policy-b',
          sourceGeneration: 2,
        }),
      ],
      counters: counters({
        queueType: QueueType.IncrementalLearning,
        policyHash: 'policy-b',
        generation: 2,
        total: 1,
        remaining: 1,
        due: 1,
      }),
    });

    expect(repository.readRows({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-a',
    }).map((entry) => entry.cardId)).toEqual(['card-policy-a']);
    expect(repository.readRows({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-b',
    }).map((entry) => entry.cardId)).toEqual(['card-policy-b']);
    expect(repository.readRows({ queueType: QueueType.IncrementalLearning })).toHaveLength(2);
  });

  it('rejects duplicate projection row ids before counters can claim missing rows', async () => {
    const repository = await createRepository();

    expect(() => repository.replaceQueueProjection({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-collision',
      generation: 3,
      rows: [
        row({
          queueType: QueueType.IncrementalLearning,
          rowId: 'shared-riff-id',
          cardId: 'card-local',
          policyHash: 'policy-collision',
          sourceGeneration: 3,
        }),
        row({
          queueType: QueueType.IncrementalLearning,
          rowId: 'shared-riff-id',
          cardId: 'card-prefixed',
          policyHash: 'policy-collision',
          sourceGeneration: 3,
        }),
      ],
      counters: counters({
        queueType: QueueType.IncrementalLearning,
        policyHash: 'policy-collision',
        generation: 3,
      }),
    })).toThrow(/QUEUE_PROJECTION_IDENTITY_COLLISION/);
  });

  it.each([
    QueueType.FilterGroup,
    QueueType.FinalDrill,
    QueueType.Leech,
    QueueType.NeuralRoam,
  ])('preserves typed deferred payload metadata for %s rows', async (queueType) => {
    const repository = await createRepository();
    const payload = {
      queueKind: queueType,
      sourceType: 'test-source',
      nested: {
        retained: true,
      },
    };

    repository.replaceQueueProjection({
      queueType,
      policyHash: 'policy-deferred',
      generation: 8,
      rows: [
        row({
          queueType,
          rowId: `${queueType}:row-a`,
          cardId: `${queueType}:card-a`,
          policyHash: 'policy-deferred',
          sourceGeneration: 8,
          payload,
        }),
      ],
      counters: counters({
        queueType,
        policyHash: 'policy-deferred',
        generation: 8,
        version: 8,
        remaining: 1,
        due: 1,
        total: 1,
        buckets: { all: 1, item: 1, descriptor: 0, topic: 0, concept: 0 },
      }),
      metadata: { deferred: true },
    });

    expect(repository.readRows({ queueType })[0]).toMatchObject({
      queueType,
      policyHash: 'policy-deferred',
      sourceGeneration: 8,
      payload,
    });
    expect(repository.readGeneration(queueType)).toMatchObject({
      queueType,
      generation: 8,
      metadata: { deferred: true },
    });
  });

  it('applies queue deltas and advances counter versions', async () => {
    const repository = await createRepository();
    repository.replaceQueueProjection({
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-a',
      generation: 1,
      rows: [
        row({ rowId: 'row-a', cardId: 'card-a' }),
        row({ rowId: 'row-b', cardId: 'card-b', sortKey: '0002' }),
      ],
      counters: counters(),
    });

    repository.applyQueueProjectionDelta({
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-a',
      generation: 2,
      removeRowIds: ['row-a'],
      upsertRows: [
        row({
          rowId: 'row-c',
          cardId: 'card-c',
          sortKey: '0003',
          sourceGeneration: 2,
        }),
      ],
      counters: counters({
        generation: 2,
        version: 2,
        remaining: 2,
        due: 1,
        total: 2,
        buckets: { all: 2, item: 1, descriptor: 1, topic: 0, concept: 0 },
        updatedAt: 2000,
      }),
      invalidation: {
        queueType: QueueType.RetrievalPractice,
        reason: 'review-feedback',
        affectedCardIds: ['card-a', 'card-c'],
        affectedBlockIds: ['block-a', 'block-c'],
        generation: 2,
        metadata: { ordinaryFeedback: true },
      },
    });

    expect(repository.readRows({ queueType: QueueType.RetrievalPractice }).map((entry) => entry.rowId)).toEqual([
      'row-b',
      'row-c',
    ]);
    expect(repository.readCounters(QueueType.RetrievalPractice)).toMatchObject({
      generation: 2,
      version: 2,
      due: 1,
      buckets: { descriptor: 1 },
    });
    expect(repository.listInvalidations(QueueType.RetrievalPractice, 5)[0]).toMatchObject({
      reason: 'review-feedback',
      affectedCardIds: ['card-a', 'card-c'],
      metadata: { ordinaryFeedback: true },
    });
  });

  it('records invalidation, rebuild, repair, and count diagnostics', async () => {
    const repository = await createRepository();
    repository.replaceQueueProjection({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-b',
      generation: 5,
      rows: [
        row({
          queueType: QueueType.IncrementalLearning,
          rowId: 'inc-row-a',
          cardId: 'card-a',
          policyHash: 'policy-b',
          sourceGeneration: 5,
        }),
      ],
      counters: counters({
        queueType: QueueType.IncrementalLearning,
        policyHash: 'policy-b',
        generation: 5,
        total: 1,
      }),
    });

    const invalidations = repository.invalidateQueues({
      queueTypes: [QueueType.IncrementalLearning],
      reason: 'settings-policy-changed',
      affectedCardIds: ['card-a'],
      generation: 6,
      createdAt: 3000,
      metadata: { broad: true },
    });
    expect(invalidations[0]).toMatchObject({
      queueType: QueueType.IncrementalLearning,
      reason: 'settings-policy-changed',
      generation: 6,
    });
    expect(repository.readGeneration(QueueType.IncrementalLearning)).toMatchObject({
      status: 'invalidated',
      rebuildReason: 'settings-policy-changed',
    });

    const rebuild = repository.beginRebuild({
      queueType: QueueType.IncrementalLearning,
      reason: 'repair',
      policyHash: 'policy-b',
      generation: 7,
      startedAt: 4000,
      metadata: { command: 'manual-repair' },
    });
    expect(repository.readGeneration(QueueType.IncrementalLearning)).toMatchObject({
      status: 'repairing',
      generation: 7,
    });
    expect(repository.completeRebuild(rebuild.id, 'completed', { rowsWritten: 1 })).toMatchObject({
      id: rebuild.id,
      status: 'completed',
      metadata: {
        command: 'manual-repair',
        rowsWritten: 1,
      },
    });
    expect(repository.readGeneration(QueueType.IncrementalLearning)).toMatchObject({
      status: 'ready',
      generation: 7,
    });
    expect(repository.compareCounts({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-b',
      sourceTruthCount: 2,
      checkedAt: 5000,
    })).toMatchObject({
      projectionRowCount: 1,
      projectionCounterTotal: 1,
      sourceTruthCount: 2,
      mismatch: true,
      checkedAt: 5000,
    });
  });
});
