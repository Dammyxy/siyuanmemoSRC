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

  it('keeps current Review card when duplicate reconciliation says it is canonical', async () => {
    const current = createCard('card-current', 'block-1');
    const updatedCurrent = {
      ...current,
      meta: {
        ...current.meta,
        liveRelationKey: 'block-1:concept-1:definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
      },
    };
    const queue = {
      getType: () => QueueType.FilterGroup,
      getCards: vi.fn(async () => [current]),
      getCounterSnapshot: vi.fn(async () => createCounterSnapshot(1)),
      skip: vi.fn(async () => undefined),
      handleReview: vi.fn(async () => {
        throw new Error('handleReview should not be called');
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const refreshCdfLiveRelationOnOpen = vi.fn(async () => ({
      attempted: true,
      card: current,
      updatedCard: updatedCurrent,
      actions: [],
      derivedRelationCount: 1,
      currentReviewDuplicateOutcome: {
        cardId: 'card-current',
        relationKey: 'block-1:concept-1:definition-forward',
        kind: 'current-canonical-continues' as const,
        canonicalCardId: 'card-current',
        duplicateCardIds: ['card-duplicate'],
      },
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

    expect(next).toMatchObject({ id: 'card-current' });
    expect(strategy.serializeSessionSnapshot().currentItem).toMatchObject({
      id: 'card-current',
      meta: expect.objectContaining({ liveRelationStatus: 'active-live' }),
    });
    expect(queue.skip).not.toHaveBeenCalled();
    expect(queue.handleReview).not.toHaveBeenCalled();

    strategy.cleanup();
  });

  it('exits current noncanonical duplicate without scoring and advances to next Review card', async () => {
    const duplicate = createCard('card-duplicate', 'block-1');
    const nextCard = createCard('card-next', 'block-2');
    const refreshedDuplicate = {
      ...duplicate,
      meta: {
        ...duplicate.meta,
        liveRelationKey: 'block-1:concept-1:definition-forward',
        liveRelationStatus: 'duplicate-live-relation',
        liveContentStatus: 'content-complete',
      },
    };
    const queue = {
      getType: () => QueueType.FilterGroup,
      getCards: vi.fn(async () => [duplicate, nextCard]),
      getCounterSnapshot: vi.fn(async () => createCounterSnapshot(2)),
      skip: vi.fn(async () => undefined),
      handleReview: vi.fn(async () => {
        throw new Error('handleReview should not be called');
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const refreshCdfLiveRelationOnOpen = vi.fn(async (card: FSRSCard) => {
      if (card.id === duplicate.id) {
        return {
          attempted: true,
          card: duplicate,
          updatedCard: refreshedDuplicate,
          actions: [],
          derivedRelationCount: 1,
          currentReviewDuplicateOutcome: {
            cardId: 'card-duplicate',
            relationKey: 'block-1:concept-1:definition-forward',
            kind: 'current-noncanonical-exits' as const,
            canonicalCardId: 'card-canonical',
            duplicateCardIds: ['card-duplicate'],
          },
          reason: 'refreshed' as const,
        };
      }
      return {
        attempted: false,
        card,
        updatedCard: null,
        actions: [],
        derivedRelationCount: 0,
        currentReviewDuplicateOutcome: null,
        reason: 'non-cdf-card' as const,
      };
    });

    const strategy = new UnifiedQueueStrategy(
      queue as never,
      {} as never,
      new EventBus(false),
      null,
      { refreshCdfLiveRelationOnOpen },
    );

    const next = await strategy.next();

    expect(next).toMatchObject({ id: 'card-next' });
    expect(strategy.serializeSessionSnapshot()).toMatchObject({
      currentItem: expect.objectContaining({ id: 'card-next' }),
      sessionExcludedCardIds: ['card-duplicate'],
    });
    expect(queue.skip).not.toHaveBeenCalled();
    expect(queue.handleReview).not.toHaveBeenCalled();

    strategy.cleanup();
  });
});
