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
    type: 'descriptor',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {
      relationAuthority: 'live-backlink',
    },
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
      item: 0,
      descriptor: total,
      topic: 0,
      concept: 0,
    },
  };
}

describe('UnifiedQueueStrategy CDF live relation open refresh', () => {
  it('refreshes current-card CDF live relation metadata before exposing the next Review card', async () => {
    const initialCard = createCard('card-1', 'block-1');
    const updatedCard = {
      ...initialCard,
      meta: {
        ...initialCard.meta,
        liveRelationKey: 'block-1:concept-1:definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
      },
    };
    const queue = {
      getType: () => QueueType.FilterGroup,
      getCards: vi.fn(async () => [initialCard]),
      getCounterSnapshot: vi.fn(async () => createCounterSnapshot(1)),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const refreshCdfLiveRelationOnOpen = vi.fn(async () => ({
      attempted: true,
      card: initialCard,
      updatedCard,
      actions: [],
      derivedRelationCount: 1,
      currentReviewDuplicateOutcome: null,
      reason: 'refreshed' as const,
    }));

    const strategy = new UnifiedQueueStrategy(
      queue as never,
      {} as never,
      new EventBus(false),
      null,
      { refreshCdfLiveRelationOnOpen },
    );

    const next = await strategy.next();

    expect(refreshCdfLiveRelationOnOpen).toHaveBeenCalledWith(initialCard);
    expect(next).toMatchObject({
      id: 'card-1',
      meta: {
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
      },
    });
    expect(strategy.serializeSessionSnapshot().currentItem).toMatchObject({
      id: 'card-1',
      meta: updatedCard.meta,
    });

    strategy.cleanup();
  });
});
