import { describe, expect, it, vi } from 'vitest';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { HIDE_CURRENT_IN_SCOPE_COMMAND_ID } from '@/core/queue/abstraction/customActionIds';
import { QueueType, type IReviewQueue, type QueueCounterSnapshot } from '@/types/unified-data-source';
import { CardType, type FSRSCard } from '@/types/card';

function cloneCard(card: FSRSCard): FSRSCard {
  return JSON.parse(JSON.stringify(card)) as FSRSCard;
}

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now + 60_000,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Topic,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now - 60_000,
    ...overrides,
  };
}

function createCounterSnapshot(cards: FSRSCard[]): QueueCounterSnapshot {
  return {
    version: 1,
    remaining: cards.length,
    due: cards.length,
    total: cards.length,
    buckets: {
      all: cards.length,
      item: cards.filter((card) => card.type === CardType.Item).length,
      descriptor: cards.filter((card) => card.type === CardType.Descriptor).length,
      topic: cards.filter((card) => card.type === CardType.Topic).length,
      concept: cards.filter((card) => card.type === CardType.Concept).length,
    },
    source: 'hot',
  };
}

function createFilterGroupQueue(cards: FSRSCard[]) {
  const seedCards = cards.map(cloneCard);
  let liveCards = cards.map(cloneCard);

  const queue = {
    name: 'FilterGroupQueue',
    type: QueueType.FilterGroup,
    getType: () => QueueType.FilterGroup,
    getCards: vi.fn(async () => liveCards.map(cloneCard)),
    getAllCards: vi.fn(async () => liveCards.map(cloneCard)),
    getNextCard: vi.fn(async () => liveCards[0] ? cloneCard(liveCards[0]) : null),
    addCard: vi.fn(async () => {}),
    removeCard: vi.fn(async (cardIdOrBlockId: string) => {
      liveCards = liveCards.filter((card) => card.id !== cardIdOrBlockId && card.blockId !== cardIdOrBlockId);
    }),
    updateCard: vi.fn(async () => {}),
    handleReview: vi.fn(async () => {
      throw new Error('handleReview should not be called for hide-current-in-scope');
    }),
    skip: vi.fn(async () => {}),
    getStats: vi.fn(async () => ({
      total: liveCards.length,
      due: liveCards.length,
      new: 0,
      learning: 0,
      reviewed: 0,
    })),
    getCounterSnapshot: vi.fn(async () => createCounterSnapshot(liveCards)),
    getRemainingSize: vi.fn(async () => liveCards.length),
    getUIConfig: vi.fn(() => ({
      displayName: 'filter-group',
      buttons: [],
      showSkipButton: true,
      showProgressBar: true,
    })),
    isDynamic: vi.fn(() => true),
    refresh: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    rebuild: vi.fn(async () => {
      liveCards = seedCards.map(cloneCard);
    }),
    getSize: vi.fn(async () => liveCards.length),
    isEmpty: vi.fn(async () => liveCards.length === 0),
    sort: vi.fn(async () => {}),
    filter: vi.fn(async () => liveCards.map(cloneCard)),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    notifyObservers: vi.fn(),
    reorder: vi.fn(async () => true),
    clearCustomOrder: vi.fn(),
    insertAt: vi.fn(async () => {}),
    createRollbackSnapshot: vi.fn(async () => ({
      cards: liveCards.map(cloneCard),
    })),
    restoreRollbackSnapshot: vi.fn(async (snapshot: { cards?: FSRSCard[] }) => {
      liveCards = Array.isArray(snapshot?.cards) ? snapshot.cards.map(cloneCard) : [];
    }),
  } satisfies IReviewQueue & {
    createRollbackSnapshot: () => Promise<unknown>;
    restoreRollbackSnapshot: (snapshot: unknown) => Promise<void>;
  };

  return {
    queue,
    readLiveCards: () => liveCards.map(cloneCard),
  };
}

function createEventBusStub() {
  let queueChangedHandler: ((event: unknown) => void) | null = null;

  return {
    eventBus: {
      subscribe: vi.fn((eventName: string, handler: (event: unknown) => void) => {
        if (eventName === 'queue.changed') {
          queueChangedHandler = handler;
        }
      }),
      unsubscribe: vi.fn((eventName: string, handler: (event: unknown) => void) => {
        if (eventName === 'queue.changed' && queueChangedHandler === handler) {
          queueChangedHandler = null;
        }
      }),
    },
    emitQueueChanged(event: unknown) {
      queueChangedHandler?.(event);
    },
  };
}

describe('UnifiedQueueStrategy hide-current-in-scope', () => {
  it('removes the current filter-group topic card from the active scope and updates live counters', async () => {
    const firstCard = createCard({ id: 'topic-1', xiuyuanID: 'xy-1', blockId: 'block-1', type: CardType.Topic });
    const secondCard = createCard({ id: 'concept-2', xiuyuanID: 'xy-2', blockId: 'block-2', type: CardType.Concept });
    const { queue, readLiveCards } = createFilterGroupQueue([firstCard, secondCard]);
    const manager = {
      getQueue: vi.fn(() => queue),
    };
    const { eventBus } = createEventBusStub();

    const strategy = new UnifiedQueueStrategy(
      QueueType.FilterGroup,
      manager as never,
      eventBus as never,
      null,
    );

    const current = await strategy.next();
    expect(current?.id).toBe(firstCard.id);

    await strategy.onFeedback(current, {
      action: 'custom',
      customActionId: HIDE_CURRENT_IN_SCOPE_COMMAND_ID,
    });

    expect(queue.removeCard).toHaveBeenCalledWith(firstCard.id);
    expect(readLiveCards().map((card) => card.id)).toEqual([secondCard.id]);

    const snapshot = await strategy.getCounterSnapshot();
    expect(snapshot).toMatchObject({
      remaining: 1,
      total: 1,
      due: 1,
    });

    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);
  });

  it('restores the hidden filter-group card when going back', async () => {
    const firstCard = createCard({ id: 'topic-1', xiuyuanID: 'xy-1', blockId: 'block-1', type: CardType.Topic });
    const secondCard = createCard({ id: 'concept-2', xiuyuanID: 'xy-2', blockId: 'block-2', type: CardType.Concept });
    const { queue, readLiveCards } = createFilterGroupQueue([firstCard, secondCard]);
    const manager = {
      getQueue: vi.fn(() => queue),
    };
    const { eventBus } = createEventBusStub();

    const strategy = new UnifiedQueueStrategy(
      QueueType.FilterGroup,
      manager as never,
      eventBus as never,
      null,
    );

    const current = await strategy.next();
    expect(current?.id).toBe(firstCard.id);

    await strategy.onFeedback(current, {
      action: 'custom',
      customActionId: HIDE_CURRENT_IN_SCOPE_COMMAND_ID,
    });

    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);

    const previous = await strategy.goBack(next);
    expect(previous?.id).toBe(firstCard.id);
    expect(queue.restoreRollbackSnapshot).toHaveBeenCalledTimes(1);
    expect(readLiveCards().map((card) => card.id)).toEqual([firstCard.id, secondCard.id]);

    const restoredSnapshot = await strategy.getCounterSnapshot();
    expect(restoredSnapshot).toMatchObject({
      remaining: 2,
      total: 2,
      due: 2,
    });

    const replay = await strategy.next();
    expect(replay?.id).toBe(secondCard.id);
  });

  it('shows the hidden card again after filter-group rebuild reloads the queue', async () => {
    const firstCard = createCard({ id: 'topic-1', xiuyuanID: 'xy-1', blockId: 'block-1', type: CardType.Topic });
    const secondCard = createCard({ id: 'concept-2', xiuyuanID: 'xy-2', blockId: 'block-2', type: CardType.Concept });
    const { queue, readLiveCards } = createFilterGroupQueue([firstCard, secondCard]);
    const manager = {
      getQueue: vi.fn(() => queue),
    };
    const { eventBus, emitQueueChanged } = createEventBusStub();

    const strategy = new UnifiedQueueStrategy(
      QueueType.FilterGroup,
      manager as never,
      eventBus as never,
      null,
    );

    const current = await strategy.next();
    expect(current?.id).toBe(firstCard.id);

    await strategy.onFeedback(current, {
      action: 'custom',
      customActionId: HIDE_CURRENT_IN_SCOPE_COMMAND_ID,
    });

    expect(readLiveCards().map((card) => card.id)).toEqual([secondCard.id]);

    await queue.rebuild();
    emitQueueChanged({ queueType: QueueType.FilterGroup });

    const rebuiltSnapshot = await strategy.getCounterSnapshot();
    expect(rebuiltSnapshot).toMatchObject({
      remaining: 2,
      total: 2,
      due: 2,
    });

    const rebuiltCurrent = await strategy.next();
    expect(rebuiltCurrent?.id).toBe(firstCard.id);
    expect(readLiveCards().map((card) => card.id)).toEqual([firstCard.id, secondCard.id]);
  });
});
