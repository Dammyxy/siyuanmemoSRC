import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';

type QueueMock = {
  getCards: ReturnType<typeof vi.fn>;
  getSize: ReturnType<typeof vi.fn>;
};

function createCard(
  id: string,
  options?: { missing?: boolean },
): FSRSCard {
  const now = Date.now();
  return {
    id,
    xiuyuanID: `xy-${id}`,
    blockId: `block-${id}`,
    due: now,
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: options?.missing ? { blockType: 'missing' } : {},
  };
}

function createQueue(cards: FSRSCard[], fallbackSize = cards.length): QueueMock {
  return {
    getCards: vi.fn().mockResolvedValue(cards),
    getSize: vi.fn().mockResolvedValue(fallbackSize),
  };
}

describe('BrowserApplicationService queue counts', () => {
  let queueByType: Map<QueueType, QueueMock>;
  let manager: { getQueue: ReturnType<typeof vi.fn> };
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
    );
  });

  it('excludes missing cards from queue counts when getCards is available', async () => {
    queueByType.set(
      QueueType.RetrievalPractice,
      createQueue([createCard('r1'), createCard('r2', { missing: true })], 99),
    );
    queueByType.set(
      QueueType.FinalDrill,
      createQueue([createCard('f1', { missing: true })], 88),
    );
    queueByType.set(
      QueueType.NeuralRoam,
      createQueue([createCard('n1'), createCard('n2')], 77),
    );
    queueByType.set(
      QueueType.FilterGroup,
      createQueue([createCard('g1'), createCard('g2', { missing: true }), createCard('g3')], 66),
    );
    queueByType.set(
      QueueType.IncrementalLearning,
      createQueue([createCard('i1', { missing: true }), createCard('i2')], 55),
    );

    const counts = await service.getQueueCounts();

    expect(counts).toEqual({
      retrieval: 1,
      'final-drill': 0,
      'neural-roam': 2,
      'filter-group': 2,
      'incremental-learning': 1,
    });
  });

  it('falls back to getSize when getCards throws', async () => {
    const retrievalQueue = createQueue([createCard('r1')], 11);
    const finalQueue = createQueue([createCard('f1')], 22);
    const neuralQueue = createQueue([createCard('n1')], 33);
    const filterQueue = createQueue([createCard('g1')], 44);
    const incrementalQueue = createQueue([createCard('i1')], 55);

    neuralQueue.getCards.mockRejectedValueOnce(new Error('boom'));

    queueByType.set(QueueType.RetrievalPractice, retrievalQueue);
    queueByType.set(QueueType.FinalDrill, finalQueue);
    queueByType.set(QueueType.NeuralRoam, neuralQueue);
    queueByType.set(QueueType.FilterGroup, filterQueue);
    queueByType.set(QueueType.IncrementalLearning, incrementalQueue);

    const counts = await service.getQueueCounts();

    expect(counts['neural-roam']).toBe(33);
    expect(neuralQueue.getSize).toHaveBeenCalledTimes(1);
  });
});
