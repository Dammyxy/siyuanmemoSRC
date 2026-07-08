import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import { CardState, CardType } from '@/types/card';

const browserLoggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => browserLoggerMocks,
}));

type QueueMock = {
  getCounterSnapshot: ReturnType<typeof vi.fn>;
  getSnapshotRows: ReturnType<typeof vi.fn>;
  getCards: ReturnType<typeof vi.fn>;
  getRemainingSize: ReturnType<typeof vi.fn>;
  getStats: ReturnType<typeof vi.fn>;
  getSize: ReturnType<typeof vi.fn>;
  getConceptBlocks?: ReturnType<typeof vi.fn>;
  getSourceSnapshot?: ReturnType<typeof vi.fn>;
};

function createQueue(
  remaining: number,
  due = remaining,
  fallbackSize = remaining,
  options: {
    conceptBlocks?: string[];
    conceptBlocksError?: Error;
    sourceSnapshot?: unknown[];
    snapshotRowCount?: number;
  } = {},
): QueueMock {
  const snapshotRowCount = options.snapshotRowCount ?? remaining;
  const queue: QueueMock = {
    getCounterSnapshot: vi.fn().mockResolvedValue({
      version: 1,
      remaining,
      due,
      total: remaining,
      buckets: {
        all: remaining,
        item: remaining,
        descriptor: 0,
        topic: 0,
        concept: 0,
      },
      source: 'reconciled' as const,
    }),
    getRemainingSize: vi.fn().mockResolvedValue(remaining),
    getStats: vi.fn().mockResolvedValue({
      total: remaining,
      due,
      new: 0,
      learning: 0,
      reviewed: 0,
    }),
    getSnapshotRows: vi.fn().mockResolvedValue(
      Array.from({ length: snapshotRowCount }, (_, index) => ({
        id: `row-${index}`,
        fsrsCardId: `card-${index}`,
        blockId: `block-${index}`,
      })),
    ),
    getCards: vi.fn().mockResolvedValue(
      Array.from({ length: snapshotRowCount }, (_, index) => ({
        id: `card-${index}`,
        xiuyuanID: '',
        blockId: `block-${index}`,
        due: Date.now(),
        stability: 3,
        difficulty: 4,
        reps: 1,
        lapses: 0,
        state: CardState.Review,
        lastReview: Date.now() - 60_000,
        elapsedDays: 1,
        scheduledDays: 2,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now() - 120_000,
        updatedAt: Date.now(),
        meta: {
          content: `card-${index}`,
          rootId: 'doc-a',
          deckId: 'deck-a',
        },
      })),
    ),
    getSize: vi.fn().mockResolvedValue(fallbackSize),
  };

  if (options.conceptBlocksError) {
    queue.getConceptBlocks = vi.fn(() => {
      throw options.conceptBlocksError;
    });
  } else if (options.conceptBlocks) {
    queue.getConceptBlocks = vi.fn(() => options.conceptBlocks ?? []);
  }
  if (options.sourceSnapshot) {
    queue.getSourceSnapshot = vi.fn(() => options.sourceSnapshot ?? []);
    queue.getSize.mockResolvedValue(options.sourceSnapshot.length);
  }

  return queue;
}

function createProjectionCounters(total: number) {
  return {
    version: 1,
    remaining: total,
    due: total,
    total,
    buckets: {
      all: total,
      item: total,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'reconciled' as const,
  };
}

describe('BrowserApplicationService queue counts', () => {
  let queueByType: Map<QueueType, QueueMock>;
  let projectionCountersByType: Map<QueueType, ReturnType<typeof createProjectionCounters> | null>;
  let manager: {
    getQueue: ReturnType<typeof vi.fn>;
    readQueueProjectionSnapshot?: ReturnType<typeof vi.fn>;
    getQueueProjectionRolloutDiagnostics?: ReturnType<typeof vi.fn>;
  };
  let service: BrowserApplicationService;

  beforeEach(() => {
    browserLoggerMocks.debug.mockClear();
    browserLoggerMocks.info.mockClear();
    browserLoggerMocks.warn.mockClear();
    browserLoggerMocks.error.mockClear();
    browserLoggerMocks.trace.mockClear();
    queueByType = new Map<QueueType, QueueMock>();
    projectionCountersByType = new Map<QueueType, ReturnType<typeof createProjectionCounters> | null>();
    manager = {
      getQueue: vi.fn((type: QueueType) => {
        const queue = queueByType.get(type);
        if (!queue) {
          throw new Error(`Queue mock missing for ${type}`);
        }
        return queue as unknown as IReviewQueue;
      }),
      readQueueProjectionSnapshot: vi.fn(async (type: QueueType, options?: { forceRefresh?: boolean }) => {
        const queue = queueByType.get(type);
        if (!queue) {
          throw new Error(`Queue mock missing for ${type}`);
        }
        return {
          queueType: type,
          policyHash: `policy-${type}`,
          generation: 1,
          rows: await queue.getSnapshotRows(Boolean(options?.forceRefresh)),
          counters: projectionCountersByType.get(type) ?? null,
        };
      }),
    };

    service = new BrowserApplicationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      manager as never,
      {
        ATTR_CARD_ID: 'custom-fsrs-card-id',
        ATTR_PRIORITY: 'custom-fsrs-priority',
        ATTR_SUSPENDED: 'custom-fsrs-suspended',
        ATTR_CARD_TYPE: 'custom-fsrs-card-type',
        ATTR_A_FACTOR: 'custom-fsrs-a-factor',
        sql: vi.fn(async (stmt: string) => (
          Array.from(stmt.matchAll(/'([^']+)'/g), (match) => ({ id: match[1] }))
        )),
        setBlockAttrs: vi.fn(),
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      } as never,
      {
        ATTR_CARD_ID: 'custom-fsrs-card-id',
        ATTR_PRIORITY: 'custom-fsrs-priority',
        ATTR_SUSPENDED: 'custom-fsrs-suspended',
        ATTR_CARD_TYPE: 'custom-fsrs-card-type',
        ATTR_A_FACTOR: 'custom-fsrs-a-factor',
        sql: vi.fn(async (stmt: string) => (
          Array.from(stmt.matchAll(/'([^']+)'/g), (match) => ({ id: match[1] }))
        )),
        setBlockAttrs: vi.fn(),
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      } as never,
    );
  });

  it('reads counts from browser-visible projection snapshots when projection counters are stale', async () => {
    const retrievalQueue = createQueue(59, 59, 59, { snapshotRowCount: 29 });
    const finalQueue = createQueue(8, 8, 8, { snapshotRowCount: 7 });
    const neuralQueue = createQueue(77, 77, 77, {
      conceptBlocks: [],
      sourceSnapshot: Array.from({ length: 5 }, (_, index) => ({
        nodeId: `source-${index}`,
      })),
    });
    const filterQueue = createQueue(3, 3, 3, { snapshotRowCount: 3 });
    const incrementalQueue = createQueue(59, 59, 59, { snapshotRowCount: 29 });

    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);
    queueByType.set(QueueType.FinalDrill, finalQueue);
    queueByType.set(QueueType.NeuralRoam, neuralQueue);
    queueByType.set(QueueType.FilterGroup, filterQueue);
    queueByType.set(QueueType.IncrementalLearning, incrementalQueue);
    projectionCountersByType.set(QueueType.RetrievalPractice, createProjectionCounters(59));
    projectionCountersByType.set(QueueType.FinalDrill, createProjectionCounters(8));
    projectionCountersByType.set(QueueType.FilterGroup, createProjectionCounters(3));
    projectionCountersByType.set(QueueType.IncrementalLearning, createProjectionCounters(59));

    const counts = await service.getQueueCounts();

    expect(counts).toEqual({
      retrieval: 29,
      'final-drill': 7,
      'neural-roam': 5,
      'filter-group': 3,
      'incremental-learning': 29,
    });

    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
    expect(retrievalQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(finalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(finalQueue.getCards).not.toHaveBeenCalled();
    expect(finalQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(neuralQueue.getSize).toHaveBeenCalledTimes(1);
    expect(neuralQueue.getConceptBlocks).not.toHaveBeenCalled();
    expect(neuralQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(filterQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(filterQueue.getCards).not.toHaveBeenCalled();
    expect(filterQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(incrementalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(incrementalQueue.getCards).not.toHaveBeenCalled();
    expect(incrementalQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(retrievalQueue.getRemainingSize).not.toHaveBeenCalled();
  });

  it('uses projection counter totals when counters match browser-visible snapshot rows', async () => {
    const retrievalQueue = createQueue(6, 6, 99, { snapshotRowCount: 6 });
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);
    projectionCountersByType.set(QueueType.RetrievalPractice, createProjectionCounters(6));

    const counts = await service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    });

    expect(counts.retrieval).toBe(6);
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
    expect(retrievalQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(retrievalQueue.getRemainingSize).not.toHaveBeenCalled();
    expect(retrievalQueue.getSize).not.toHaveBeenCalled();
  });

  it('scopes broad count refresh to Retrieval during active Review without instantiating non-active queues', async () => {
    const retrievalQueue = createQueue(4, 4, 4, { snapshotRowCount: 4 });
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);

    const counts = await service.getQueueCounts({
      forceRefresh: true,
      reviewPressure: {
        active: true,
        activeQueueType: QueueType.RetrievalPractice,
      },
    });

    expect(counts.retrieval).toBe(4);
    expect(manager.readQueueProjectionSnapshot).toHaveBeenCalledTimes(1);
    expect(manager.readQueueProjectionSnapshot).toHaveBeenCalledWith(QueueType.RetrievalPractice, { forceRefresh: true });
    expect(manager.getQueue).not.toHaveBeenCalled();
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(retrievalQueue.getCounterSnapshot).not.toHaveBeenCalled();
  });

  it('refreshes deferred non-active counts after Review pressure clears', async () => {
    const retrievalQueue = createQueue(4, 4, 4, { snapshotRowCount: 4 });
    const finalQueue = createQueue(2, 2, 2, { snapshotRowCount: 2 });
    const incrementalQueue = createQueue(3, 3, 3, { snapshotRowCount: 3 });
    const filterQueue = createQueue(1, 1, 1, { snapshotRowCount: 1 });
    const neuralQueue = createQueue(5, 5, 5, {
      sourceSnapshot: Array.from({ length: 5 }, (_, index) => ({ nodeId: `source-${index}` })),
    });

    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);
    queueByType.set(QueueType.FinalDrill, finalQueue);
    queueByType.set(QueueType.IncrementalLearning, incrementalQueue);
    queueByType.set(QueueType.FilterGroup, filterQueue);
    queueByType.set(QueueType.NeuralRoam, neuralQueue);

    await service.getQueueCounts({
      forceRefresh: true,
      reviewPressure: {
        active: true,
        activeQueueType: QueueType.RetrievalPractice,
      },
    });
    expect(manager.readQueueProjectionSnapshot).toHaveBeenCalledTimes(1);
    expect(manager.readQueueProjectionSnapshot).toHaveBeenCalledWith(QueueType.RetrievalPractice, { forceRefresh: true });
    expect(manager.getQueue).not.toHaveBeenCalled();

    manager.readQueueProjectionSnapshot?.mockClear();
    manager.getQueue.mockClear();

    const counts = await service.getQueueCounts({
      forceRefresh: true,
      reviewPressure: {
        active: false,
        activeQueueType: null,
      },
    });

    expect(counts).toMatchObject({
      retrieval: 4,
      'final-drill': 2,
      'incremental-learning': 3,
      'filter-group': 1,
      'neural-roam': 5,
    });
    expect(manager.readQueueProjectionSnapshot?.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      QueueType.RetrievalPractice,
      QueueType.FinalDrill,
      QueueType.IncrementalLearning,
      QueueType.FilterGroup,
    ]));
    expect(manager.getQueue).toHaveBeenCalledTimes(1);
    expect(manager.getQueue).toHaveBeenCalledWith(QueueType.NeuralRoam);
  });

  it('keeps neural-roam count on the route-owned queue size even when projection diagnostics exist', async () => {
    const neuralQueue = createQueue(77, 77, 77, {
      conceptBlocks: [],
      sourceSnapshot: Array.from({ length: 5 }, (_, index) => ({
        nodeId: `source-${index}`,
        nodeKind: index === 0 ? 'excerpt' : 'concept',
      })),
    });
    manager.getQueueProjectionRolloutDiagnostics = vi.fn((queueType?: QueueType) => {
      if (queueType === QueueType.NeuralRoam) {
        return [{
          queueType: QueueType.NeuralRoam,
          state: 'backend-projection',
          readPath: 'backend-projection',
          reason: 'rollout-enabled',
          checkedAt: Date.now(),
        }];
      }
      return [];
    });

    queueByType.set(QueueType.RetrievalPractice, createQueue(1));
    queueByType.set(QueueType.FinalDrill, createQueue(2));
    queueByType.set(QueueType.NeuralRoam, neuralQueue);
    queueByType.set(QueueType.FilterGroup, createQueue(3));
    queueByType.set(QueueType.IncrementalLearning, createQueue(4));

    const counts = await service.getQueueCounts();

    expect(counts['neural-roam']).toBe(5);
    expect(neuralQueue.getSize).toHaveBeenCalledTimes(1);
    expect(neuralQueue.getConceptBlocks).not.toHaveBeenCalled();
    expect(neuralQueue.getCounterSnapshot).not.toHaveBeenCalled();
  });

  it('retries a transient projection-backed count read before caching a value', async () => {
    const retrievalQueue = createQueue(11, 11, 11);
    retrievalQueue.getSnapshotRows
      .mockRejectedValueOnce(new Error('QUEUE_PROJECTION_UNAVAILABLE: projection unavailable'))
      .mockResolvedValueOnce(createQueue(11).getSnapshotRows());
    manager.getQueueProjectionRolloutDiagnostics = vi.fn((queueType?: QueueType) => {
      if (queueType === QueueType.RetrievalPractice) {
        return [{
          queueType: QueueType.RetrievalPractice,
          projectionBacked: true,
          state: 'backend-projection',
          readPath: 'backend-projection',
          reason: 'rollout-enabled',
          nextCoverageTask: null,
        }];
      }
      return [];
    });
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);

    const counts = await service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    });

    expect(counts.retrieval).toBe(11);
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(2);
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
  });

  it('does not force materialize projection-backed counts during passive refresh without a cached value', async () => {
    const retrievalQueue = createQueue(11, 11, 11);
    retrievalQueue.getSnapshotRows.mockRejectedValue(new Error('QUEUE_PROJECTION_UNAVAILABLE: projection unavailable'));
    manager.getQueueProjectionRolloutDiagnostics = vi.fn((queueType?: QueueType) => {
      if (queueType === QueueType.RetrievalPractice) {
        return [{
          queueType: QueueType.RetrievalPractice,
          projectionBacked: true,
          state: 'backend-projection',
          readPath: 'backend-projection',
          reason: 'rollout-enabled',
          nextCoverageTask: null,
        }];
      }
      return [];
    });
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);

    const counts = await service.getQueueCounts({
      affectedQueueTypes: [QueueType.RetrievalPractice],
    });

    expect(counts.retrieval).toBe(0);
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledWith(false);
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
    expect(browserLoggerMocks.info).toHaveBeenCalledWith(
      'QUEUE_COUNT_UNAVAILABLE: passive queue count unavailable; keeping empty count until projection is readable',
      expect.objectContaining({
        queueId: 'retrieval',
        queueType: QueueType.RetrievalPractice,
        forceRefresh: false,
        error: expect.stringContaining('QUEUE_PROJECTION_UNAVAILABLE'),
        rolloutDiagnostics: [
          expect.objectContaining({
            queueType: QueueType.RetrievalPractice,
            projectionBacked: true,
            readPath: 'backend-projection',
          }),
        ],
      }),
    );

    retrievalQueue.getSnapshotRows.mockResolvedValueOnce(createQueue(11).getSnapshotRows());
    const recoveredCounts = await service.getQueueCounts({
      affectedQueueTypes: [QueueType.RetrievalPractice],
    });

    expect(recoveredCounts.retrieval).toBe(11);
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known projection-backed queue count when a refresh is temporarily unavailable', async () => {
    const retrievalQueue = createQueue(3, 3, 11);
    manager.getQueueProjectionRolloutDiagnostics = vi.fn((queueType?: QueueType) => {
      if (queueType === QueueType.RetrievalPractice) {
        return [{
          queueType: QueueType.RetrievalPractice,
          projectionBacked: true,
          state: 'backend-projection',
          readPath: 'backend-projection',
          reason: 'rollout-enabled',
          nextCoverageTask: null,
        }];
      }
      return [];
    });
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);

    const initialCounts = await service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    });
    expect(initialCounts.retrieval).toBe(3);

    retrievalQueue.getSnapshotRows.mockRejectedValueOnce(new Error('QUEUE_PROJECTION_UNAVAILABLE: projection unavailable'));

    const refreshedCounts = await service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    });

    expect(refreshedCounts.retrieval).toBe(3);
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
    expect(retrievalQueue.getRemainingSize).not.toHaveBeenCalled();
    expect(retrievalQueue.getSize).not.toHaveBeenCalled();
  });

  it('keeps other queue counts when one projection-backed count remains temporarily unavailable', async () => {
    const retrievalQueue = createQueue(5, 5, 11);
    const incrementalQueue = createQueue(3, 3, 3);
    retrievalQueue.getSnapshotRows.mockRejectedValue(new Error('QUEUE_PROJECTION_UNAVAILABLE: projection unavailable'));
    manager.getQueueProjectionRolloutDiagnostics = vi.fn((queueType?: QueueType) => {
      if (queueType === QueueType.RetrievalPractice) {
        return [{
          queueType: QueueType.RetrievalPractice,
          projectionBacked: true,
          state: 'backend-projection',
          readPath: 'backend-projection',
          reason: 'rollout-enabled',
          nextCoverageTask: null,
        }];
      }
      return [];
    });
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);
    queueByType.set(QueueType.IncrementalLearning, incrementalQueue);

    const counts = await service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice, QueueType.IncrementalLearning],
    });

    expect(counts.retrieval).toBe(0);
    expect(counts['incremental-learning']).toBe(3);
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(2);
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
    expect(retrievalQueue.getRemainingSize).not.toHaveBeenCalled();
    expect(retrievalQueue.getSize).not.toHaveBeenCalled();
  });

  it('fails closed instead of trying alternate size APIs when projection snapshot reads fail', async () => {
    const retrievalQueue = createQueue(1, 1, 11);
    retrievalQueue.getSnapshotRows.mockRejectedValueOnce(new Error('boom'));
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);

    await expect(service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    })).rejects.toThrow('QUEUE_COUNT_UNAVAILABLE');

    expect(retrievalQueue.getRemainingSize).not.toHaveBeenCalled();
    expect(retrievalQueue.getStats).not.toHaveBeenCalled();
    expect(retrievalQueue.getSize).not.toHaveBeenCalled();
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
  });

  it('fails closed instead of trying visible counters when neural queue size fails', async () => {
    const neuralQueue = createQueue(3, 3, 33, {
      conceptBlocks: [],
    });
    neuralQueue.getSize.mockRejectedValue(new Error('neural-size-unavailable'));
    queueByType.set(QueueType.NeuralRoam, neuralQueue);

    await expect(service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.NeuralRoam],
    })).rejects.toThrow('QUEUE_COUNT_UNAVAILABLE');

    expect(neuralQueue.getSize).toHaveBeenCalledTimes(1);
    expect(neuralQueue.getConceptBlocks).not.toHaveBeenCalled();
    expect(neuralQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(neuralQueue.getRemainingSize).not.toHaveBeenCalled();
  });

  it('fails closed when queue lookup throws instead of returning a missing queue', () => {
    manager.getQueue.mockImplementationOnce(() => {
      throw new Error('queue registry unavailable');
    });

    expect(() => service.getQueueById('filter-group')).toThrow('QUEUE_UNAVAILABLE');
  });

  it('normalizes browser queue aliases at service lookup boundary', () => {
    const retrievalQueue = createQueue(1);
    const neuralQueue = createQueue(2);
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);
    queueByType.set(QueueType.NeuralRoam, neuralQueue);

    expect(service.getQueueById('retrieval-practice')).toBe(retrievalQueue);
    expect(service.getQueueById('neural')).toBe(neuralQueue);
    expect(service.getQueueById('missing-queue')).toBeNull();
    expect(manager.getQueue).toHaveBeenCalledWith(QueueType.RetrievalPractice);
    expect(manager.getQueue).toHaveBeenCalledWith(QueueType.NeuralRoam);
  });

  it('invalidates only affected queue caches on targeted refresh', async () => {
    const retrievalQueue = createQueue(1);
    const finalQueue = createQueue(2);
    const neuralQueue = createQueue(3);
    const filterQueue = createQueue(4);
    const incrementalQueue = createQueue(5);

    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);
    queueByType.set(QueueType.FinalDrill, finalQueue);
    queueByType.set(QueueType.NeuralRoam, neuralQueue);
    queueByType.set(QueueType.FilterGroup, filterQueue);
    queueByType.set(QueueType.IncrementalLearning, incrementalQueue);

    await service.getQueueCounts();
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(finalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
    expect(finalQueue.getCards).not.toHaveBeenCalled();

    retrievalQueue.getSnapshotRows.mockClear();
    finalQueue.getSnapshotRows.mockClear();

    const counts = await service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    });

    expect(counts.retrieval).toBe(1);
    expect(counts['final-drill']).toBe(2);
    expect(retrievalQueue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(finalQueue.getSnapshotRows).not.toHaveBeenCalled();
    expect(retrievalQueue.getCards).not.toHaveBeenCalled();
    expect(finalQueue.getCards).not.toHaveBeenCalled();
  });
});
