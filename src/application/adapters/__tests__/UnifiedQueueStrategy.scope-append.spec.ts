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
});
