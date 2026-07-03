import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { QueueType, type QueueCounterSnapshot } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import { UnifiedQueueStrategy } from '../UnifiedQueueStrategy';

function createCard(id: string, blockId: string): FSRSCard {
  const now = Date.now();
  return {
    id,
    blockId,
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {},
  } as FSRSCard;
}

function createCounterSnapshot(total: number): QueueCounterSnapshot {
  return {
    version: 1,
    remaining: total,
    due: total,
    total,
    source: 'hot',
    buckets: {
      all: total,
      item: total,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
  };
}

describe('UnifiedQueueStrategy appendCardsToTail', () => {
  it('starts learn-ahead from the visible exhausted session even when queue counters are stale', async () => {
    const normalCard = createCard('card-normal', 'block-normal');
    const learnAheadCard = createCard('card-learn-ahead', 'block-learn-ahead');
    let normalCards = [normalCard];
    const queue = {
      getType: () => QueueType.IncrementalLearning,
      getCards: vi.fn(async () => normalCards),
      getCounterSnapshot: vi.fn(async () => ({
        ...createCounterSnapshot(1),
        learnAheadAvailable: 1,
        scheduledTotal: 1,
      })),
      getRemainingSize: vi.fn(async () => 1),
      getLearnAheadCards: vi.fn(async () => [learnAheadCard]),
      handleReview: vi.fn(async () => {
        normalCards = [];
        return {
          cardId: normalCard.id,
          rating: 3,
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: true,
          counterSnapshot: {
            ...createCounterSnapshot(1),
            learnAheadAvailable: 1,
            scheduledTotal: 1,
          },
        };
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const strategy = new UnifiedQueueStrategy(
      queue as any,
      { getCard: vi.fn(async () => normalCard) } as any,
      new EventBus(false),
      null,
    );

    expect(await strategy.next()).toMatchObject({ id: normalCard.id });
    await strategy.onFeedback(normalCard, { action: 'rate', rating: 3 });
    expect(await strategy.next()).toBeNull();

    await expect(strategy.learnAhead()).resolves.toBe(true);
    expect(queue.getLearnAheadCards).toHaveBeenCalledTimes(1);
    await expect(strategy.next()).resolves.toMatchObject({ id: learnAheadCard.id });

    strategy.cleanup();
  });

  it('continues from the current position after appending new scope cards', async () => {
    const initialCards = [createCard('card-1', 'block-1')];
    const queue = {
      getType: () => QueueType.FilterGroup,
      getCards: vi.fn(async () => initialCards),
      getCounterSnapshot: vi.fn(async () => createCounterSnapshot(initialCards.length)),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const strategy = new UnifiedQueueStrategy(
      queue as any,
      {} as any,
      new EventBus(false),
      null,
    );

    const first = await strategy.next();
    expect(first?.id).toBe('card-1');

    const appendedCount = strategy.appendCardsToTail([
      createCard('card-2', 'block-2'),
      createCard('card-3', 'block-3'),
    ]);

    expect(appendedCount).toBe(2);

    const second = await strategy.next();
    const third = await strategy.next();

    expect(second?.id).toBe('card-2');
    expect(third?.id).toBe('card-3');

    strategy.cleanup();
  });

  it('keeps incremental-learning runtime and cursor aligned after appending new scope cards', async () => {
    const firstCard = createCard('card-1', 'block-1');
    const secondCard = createCard('card-2', 'block-2');
    const thirdCard = createCard('card-3', 'block-3');
    let liveCards = [firstCard];
    const queue = {
      getType: () => QueueType.IncrementalLearning,
      getCards: vi.fn(async () => liveCards),
      getCounterSnapshot: vi.fn(async () => createCounterSnapshot(liveCards.length)),
      handleReview: vi.fn(async (cardId: string, rating: number) => {
        liveCards = liveCards.filter((card) => card.id !== cardId);
        return {
          cardId,
          rating,
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: false,
          counterSnapshot: createCounterSnapshot(liveCards.length),
        };
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const strategy = new UnifiedQueueStrategy(
      queue as any,
      {
        getCard: vi.fn(async (cardId: string) => liveCards.find((card) => card.id === cardId) ?? null),
        getCards: vi.fn(async () => liveCards),
      } as any,
      new EventBus(false),
      null,
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    liveCards = [firstCard, secondCard, thirdCard];
    expect(strategy.appendCardsToTail([secondCard, thirdCard])).toBe(2);

    await strategy.onFeedback(first, { action: 'rate', rating: 3, commitIdempotencyKey: 'grade-card-1' });

    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);
    await expect(strategy.onFeedback(next, { action: 'rate', rating: 3, commitIdempotencyKey: 'grade-card-2' }))
      .resolves
      .toBeUndefined();

    strategy.cleanup();
  });

  it('accepts feedback for the refreshed visible card after review-open repair changes its fingerprint', async () => {
    const originalCard = createCard('card-1', 'block-1');
    const refreshedCard = {
      ...originalCard,
      updatedAt: originalCard.updatedAt + 1000,
      meta: {
        ...originalCard.meta,
        xiuyuanID: 'xy-card-1',
      },
    };
    let liveCards = [originalCard];
    const queue = {
      getType: () => QueueType.IncrementalLearning,
      getCards: vi.fn(async () => liveCards),
      getCounterSnapshot: vi.fn(async () => createCounterSnapshot(liveCards.length)),
      handleReview: vi.fn(async (cardId: string, rating: number) => {
        liveCards = liveCards.filter((card) => card.id !== cardId);
        return {
          cardId,
          rating,
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: false,
          counterSnapshot: createCounterSnapshot(liveCards.length),
        };
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const strategy = new UnifiedQueueStrategy(
      queue as any,
      {
        getCard: vi.fn(async (cardId: string) => liveCards.find((card) => card.id === cardId) ?? null),
        getCards: vi.fn(async () => liveCards),
      } as any,
      new EventBus(false),
      null,
      {
        refreshCdfLiveRelationOnOpen: vi.fn(async () => ({ updatedCard: refreshedCard })),
      },
    );

    const visible = await strategy.next();

    expect(visible).toMatchObject({
      id: refreshedCard.id,
      updatedAt: refreshedCard.updatedAt,
    });
    await expect(strategy.onFeedback(visible!, {
      action: 'rate',
      rating: 3,
      commitIdempotencyKey: 'grade-refreshed-card',
    }))
      .resolves
      .toBeUndefined();

    strategy.cleanup();
  });

  it('restores a serialized review-tab session snapshot and continues from the next queued card', async () => {
    const initialCards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-2'),
      createCard('card-3', 'block-3'),
    ];
    const queue = {
      getType: () => QueueType.RetrievalPractice,
      getCards: vi.fn(async () => initialCards),
      getCounterSnapshot: vi.fn(async () => createCounterSnapshot(initialCards.length)),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const strategy = new UnifiedQueueStrategy(
      queue as any,
      {} as any,
      new EventBus(false),
      null,
    );

    const current = await strategy.next();
    expect(current?.id).toBe('card-1');

    const snapshot = strategy.serializeSessionSnapshot();
    strategy.cleanup();

    const restored = new UnifiedQueueStrategy(
      queue as any,
      {} as any,
      new EventBus(false),
      null,
    );
    restored.restoreSessionSnapshot(snapshot);

    expect(restored.serializeSessionSnapshot().currentItem?.id).toBe('card-1');

    const next = await restored.next();
    expect(next?.id).toBe('card-2');

    restored.cleanup();
  });

  it('fails closed when counter snapshot read fails during remaining-size calculation', async () => {
    const queue = {
      getType: () => QueueType.RetrievalPractice,
      getCards: vi.fn(async () => [createCard('card-1', 'block-1')]),
      getCounterSnapshot: vi.fn(async () => {
        throw new Error('counter unavailable');
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const strategy = new UnifiedQueueStrategy(
      queue as any,
      {} as any,
      new EventBus(false),
      null,
    );

    await expect(strategy.getRemainingSize()).rejects.toThrow('QUEUE_COUNT_UNAVAILABLE');
    await expect(strategy.getStats()).rejects.toThrow('QUEUE_COUNT_UNAVAILABLE');

    strategy.cleanup();
  });

  it('fails closed when reload cannot refresh the queue counter snapshot', async () => {
    const queue = {
      getType: () => QueueType.FilterGroup,
      getCards: vi.fn(async () => [createCard('card-1', 'block-1')]),
      getCounterSnapshot: vi.fn(async () => {
        throw new Error('snapshot unavailable');
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const strategy = new UnifiedQueueStrategy(
      queue as any,
      {} as any,
      new EventBus(false),
      null,
    );

    await expect(strategy.next()).rejects.toThrow('QUEUE_COUNT_UNAVAILABLE');

    strategy.cleanup();
  });
});
