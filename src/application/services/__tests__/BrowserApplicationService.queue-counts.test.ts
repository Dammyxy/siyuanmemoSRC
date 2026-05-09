import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';

type QueueMock = {
  getCounterSnapshot: ReturnType<typeof vi.fn>;
  getRemainingSize: ReturnType<typeof vi.fn>;
  getStats: ReturnType<typeof vi.fn>;
  getSize: ReturnType<typeof vi.fn>;
  getConceptBlocks?: ReturnType<typeof vi.fn>;
};

function createQueue(
  remaining: number,
  due = remaining,
  fallbackSize = remaining,
  options: {
    conceptBlocks?: string[];
    conceptBlocksError?: Error;
  } = {},
): QueueMock {
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
    getSize: vi.fn().mockResolvedValue(fallbackSize),
  };

  if (options.conceptBlocksError) {
    queue.getConceptBlocks = vi.fn(() => {
      throw options.conceptBlocksError;
    });
  } else if (options.conceptBlocks) {
    queue.getConceptBlocks = vi.fn(() => options.conceptBlocks ?? []);
  }

  return queue;
}

describe('BrowserApplicationService queue counts', () => {
  let queueByType: Map<QueueType, QueueMock>;
  let manager: {
    getQueue: ReturnType<typeof vi.fn>;
    getQueueProjectionRolloutDiagnostics?: ReturnType<typeof vi.fn>;
  };
  let service: BrowserApplicationService;

  beforeEach(() => {
    queueByType = new Map<QueueType, QueueMock>();
    manager = {
      getQueue: vi.fn((type: QueueType) => {
        const queue = queueByType.get(type);
        if (!queue) {
          throw new Error(`Queue mock missing for ${type}`);
        }
        return queue as unknown as IReviewQueue;
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
        sql: vi.fn(async () => []),
        setBlockAttrs: vi.fn(),
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      } as never,
    );
  });

  it('reads counts from counter snapshots without calling getCards', async () => {
    const retrievalQueue = createQueue(2);
    const finalQueue = createQueue(1);
    const neuralQueue = createQueue(77, 77, 77, {
      conceptBlocks: Array.from({ length: 5 }, (_, index) => `concept-${index}`),
    });
    const filterQueue = createQueue(3);
    const incrementalQueue = createQueue(4);

    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);
    queueByType.set(QueueType.FinalDrill, finalQueue);
    queueByType.set(QueueType.NeuralRoam, neuralQueue);
    queueByType.set(QueueType.FilterGroup, filterQueue);
    queueByType.set(QueueType.IncrementalLearning, incrementalQueue);

    const counts = await service.getQueueCounts();

    expect(counts).toEqual({
      retrieval: 2,
      'final-drill': 1,
      'neural-roam': 5,
      'filter-group': 3,
      'incremental-learning': 4,
    });

    expect(retrievalQueue.getCounterSnapshot).toHaveBeenCalledTimes(1);
    expect(finalQueue.getCounterSnapshot).toHaveBeenCalledTimes(1);
    expect(neuralQueue.getConceptBlocks).toHaveBeenCalledTimes(1);
    expect(neuralQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(filterQueue.getCounterSnapshot).toHaveBeenCalledTimes(1);
    expect(incrementalQueue.getCounterSnapshot).toHaveBeenCalledTimes(1);
    expect(retrievalQueue.getRemainingSize).not.toHaveBeenCalled();
  });

  it('uses projection counters before neural session counts when neural-roam is promoted', async () => {
    const neuralQueue = createQueue(77, 77, 77, {
      conceptBlocks: Array.from({ length: 5 }, (_, index) => `concept-${index}`),
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

    expect(counts['neural-roam']).toBe(77);
    expect(neuralQueue.getCounterSnapshot).toHaveBeenCalledTimes(1);
    expect(neuralQueue.getConceptBlocks).not.toHaveBeenCalled();
  });

  it('fails closed instead of falling back when a projection-backed queue count is unavailable', async () => {
    const retrievalQueue = createQueue(1, 1, 11);
    retrievalQueue.getCounterSnapshot.mockRejectedValueOnce(new Error('projection unavailable'));
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

    await expect(service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    })).rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');

    expect(retrievalQueue.getRemainingSize).not.toHaveBeenCalled();
    expect(retrievalQueue.getSize).not.toHaveBeenCalled();
  });

  it('fails closed instead of trying alternate size APIs when non-projection snapshot reads fail', async () => {
    const retrievalQueue = createQueue(1, 1, 11);
    retrievalQueue.getCounterSnapshot.mockRejectedValueOnce(new Error('boom'));
    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);

    await expect(service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    })).rejects.toThrow('QUEUE_COUNT_UNAVAILABLE');

    expect(retrievalQueue.getRemainingSize).not.toHaveBeenCalled();
    expect(retrievalQueue.getStats).not.toHaveBeenCalled();
    expect(retrievalQueue.getSize).not.toHaveBeenCalled();
  });

  it('fails closed instead of trying visible counters when neural concept count fails', async () => {
    const neuralQueue = createQueue(3, 3, 33, {
      conceptBlocksError: new Error('neural-concepts-unavailable'),
    });
    queueByType.set(QueueType.NeuralRoam, neuralQueue);

    await expect(service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.NeuralRoam],
    })).rejects.toThrow('QUEUE_COUNT_UNAVAILABLE');

    expect(neuralQueue.getConceptBlocks).toHaveBeenCalledTimes(1);
    expect(neuralQueue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(neuralQueue.getRemainingSize).not.toHaveBeenCalled();
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
    expect(retrievalQueue.getCounterSnapshot).toHaveBeenCalledTimes(1);
    expect(finalQueue.getCounterSnapshot).toHaveBeenCalledTimes(1);

    retrievalQueue.getCounterSnapshot.mockClear();
    finalQueue.getCounterSnapshot.mockClear();

    const counts = await service.getQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [QueueType.RetrievalPractice],
    });

    expect(counts.retrieval).toBe(1);
    expect(counts['final-drill']).toBe(2);
    expect(retrievalQueue.getCounterSnapshot).toHaveBeenCalledTimes(1);
    expect(finalQueue.getCounterSnapshot).not.toHaveBeenCalled();
  });
});
