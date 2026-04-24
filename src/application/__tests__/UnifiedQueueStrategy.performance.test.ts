import { describe, expect, it, vi } from 'vitest';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { isQueueItemUnavailableError } from '@/core/queue/abstraction/Strategy';
import { QueueType, type IReviewQueue, type QueueReviewResult } from '@/types/unified-data-source';
import { CardType, type FSRSCard } from '@/types/card';

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
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now - 60_000,
    ...overrides,
  };
}

function createQueueStub(
  queueType: QueueType,
  cards: FSRSCard[],
  options?: {
    handleReview?: (
      cardId: string,
      rating: number,
      liveCards: FSRSCard[],
    ) => Promise<Partial<QueueReviewResult> | void>;
    createRollbackSnapshot?: () => Promise<unknown>;
    restoreRollbackSnapshot?: (snapshot: unknown) => Promise<void>;
  }
): IReviewQueue & {
  createRollbackSnapshot?: () => Promise<unknown>;
  restoreRollbackSnapshot?: (snapshot: unknown) => Promise<void>;
} {
  const liveCards = cards.map((card) => ({ ...card }));
  const buildSnapshot = () => ({
    version: 1,
    remaining: liveCards.length,
    due: liveCards.length,
    total: liveCards.length,
    buckets: {
      all: liveCards.length,
      item: liveCards.length,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'hot' as const,
  });

  return {
    name: `Queue-${queueType}`,
    type: queueType,
    getType: () => queueType,
    getCards: vi.fn(async () => liveCards.map((card) => ({ ...card }))),
    getAllCards: vi.fn(async () => liveCards.map((card) => ({ ...card }))),
    getNextCard: vi.fn(async () => liveCards[0] ?? null),
    addCard: vi.fn(async () => {}),
    removeCard: vi.fn(async () => {}),
    updateCard: vi.fn(async () => {}),
    handleReview: vi.fn(async (cardId: string, rating: number) => {
      const defaultResult: QueueReviewResult = {
        updatedCard: liveCards.find((card) => card.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: false,
        requiresCurrentViewReorder: false,
        counterSnapshot: buildSnapshot(),
        version: 1,
      };
      if (options?.handleReview) {
        const partial = await options.handleReview(cardId, rating, liveCards);
        return {
          ...defaultResult,
          ...partial,
          counterSnapshot: buildSnapshot(),
          version: 1,
        };
      }
      const index = liveCards.findIndex((card) => card.id === cardId);
      if (index >= 0 && rating >= 3) {
        liveCards.splice(index, 1);
      }
      return {
        updatedCard: liveCards.find((card) => card.id === cardId) ?? null,
        removedFromQueue: rating >= 3,
        remainsInQueue: rating < 3,
        queueChanged: rating >= 3,
        requiresCurrentViewReorder: false,
        counterSnapshot: buildSnapshot(),
        version: 1,
      };
    }),
    skip: vi.fn(async () => {}),
    getStats: vi.fn(async () => ({
      total: liveCards.length,
      due: liveCards.length,
      new: 0,
      learning: 0,
      reviewed: 0,
    })),
    getUIConfig: vi.fn(() => ({
      displayName: String(queueType),
      buttons: [],
      showSkipButton: true,
      showProgressBar: true,
    })),
    isDynamic: vi.fn(() => true),
    refresh: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    getSize: vi.fn(async () => cards.length),
    isEmpty: vi.fn(async () => cards.length === 0),
    sort: vi.fn(async () => {}),
    filter: vi.fn(async () => cards),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    notifyObservers: vi.fn(),
    reorder: vi.fn(async () => true),
    clearCustomOrder: vi.fn(),
    insertAt: vi.fn(async () => {}),
    getRemainingSize: vi.fn(async () => liveCards.length),
    getCounterSnapshot: vi.fn(async () => buildSnapshot()),
    createRollbackSnapshot: options?.createRollbackSnapshot,
    restoreRollbackSnapshot: options?.restoreRollbackSnapshot,
  };
}

describe('UnifiedQueueStrategy performance and rollback behavior', () => {
  it('reuses cached cards for getStats-next-getStats and avoids duplicate getCards', async () => {
    const card = createCard();
    const queue = createQueueStub(QueueType.RetrievalPractice, [card]);
    const manager = {
      getQueue: vi.fn(() => queue),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    await strategy.getStats();
    await strategy.next();
    await strategy.getStats();

    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    expect(getCardsSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps a single getCards reload on onFeedback-next-getStats path', async () => {
    const card = createCard();
    const queue = createQueueStub(QueueType.RetrievalPractice, [card], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...card })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    await strategy.next();
    await strategy.getStats();

    expect(getCardsSpy).toHaveBeenCalledTimes(0);
  });

  it('rotates low-rated card once when there are alternative cards', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const thirdCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-3' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard, thirdCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const current = liveCards.find((card) => card.id === cardId) ?? null;
        return {
          updatedCard: current,
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: false,
          requiresCurrentViewReorder: false,
        };
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });

    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);
  });

  it('keeps immediate repeat when low-rated card is the only candidate', async () => {
    const card = createCard();
    const queue = createQueueStub(QueueType.RetrievalPractice, [card], {
      handleReview: async (cardId, _rating, liveCards) => ({
        updatedCard: liveCards.find((candidate) => candidate.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: false,
        requiresCurrentViewReorder: false,
      }),
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...card })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(card.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    const next = await strategy.next();
    expect(next?.id).toBe(card.id);
  });

  it('does not rotate cards on rating 3/4', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);
  });

  it('requeries incremental learning after low feedback and advances to a different card when available', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const sameBlockSibling = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard], {
      handleReview: async (cardId, _rating, liveCards) => ({
        updatedCard: liveCards.find((card) => card.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: true,
        requiresCurrentViewReorder: true,
      }),
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    const next = await strategy.next();
    expect(next?.id).toBe(nextBlockCard.id);
  });

  it('requeries incremental learning after high feedback and avoids same-block sibling cards', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const sameBlockSibling = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const next = await strategy.next();
    expect(next?.id).toBe(nextBlockCard.id);
  });

  it('allows immediate repeat in incremental learning when the deferred card is the only candidate', async () => {
    const card = createCard();
    const queue = createQueueStub(QueueType.IncrementalLearning, [card], {
      handleReview: async (cardId, _rating, liveCards) => ({
        updatedCard: liveCards.find((candidate) => candidate.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: true,
        requiresCurrentViewReorder: true,
      }),
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...card })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(card.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    const next = await strategy.next();
    expect(next?.id).toBe(card.id);
  });

  it('requeries incremental learning after skip and advances to the next available card', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const sameBlockSibling = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-2' });
    const liveCards = [{ ...firstCard }, { ...sameBlockSibling }, { ...nextBlockCard }];
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    (queue.getCards as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => liveCards.map((card) => ({ ...card })));
    (queue.getCounterSnapshot as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      version: 1,
      remaining: liveCards.length,
      due: liveCards.length,
      total: liveCards.length,
      buckets: {
        all: liveCards.length,
        item: liveCards.length,
        descriptor: 0,
        topic: 0,
        concept: 0,
      },
      source: 'hot',
    }));
    (queue.skip as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (cardId: string) => {
      const index = liveCards.findIndex((card) => card.id === cardId);
      if (index === -1) {
        return;
      }
      const [skipped] = liveCards.splice(index, 1);
      if (skipped) {
        liveCards.push(skipped);
      }
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    await strategy.onFeedback(first, { action: 'skip' });
    const next = await strategy.next();
    expect(next?.id).toBe(nextBlockCard.id);
  });

  it('cleans a stale current item when incremental review reports the card no longer exists', async () => {
    const staleCard = createCard({ id: 'card-stale', xiuyuanID: 'xy-stale', blockId: 'block-stale' });
    const nextCard = createCard({ id: 'card-next', xiuyuanID: 'xy-next', blockId: 'block-next' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [staleCard, nextCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const index = liveCards.findIndex((card) => card.id === cardId);
        if (index >= 0) {
          liveCards.splice(index, 1);
        }
        throw new Error(`获取卡片失败 (${cardId}): Card not found: ${cardId}`);
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...staleCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(staleCard.id);

    let caught: unknown;
    try {
      await strategy.onFeedback(first, { action: 'rate', rating: 3 });
    } catch (error) {
      caught = error;
    }

    expect(isQueueItemUnavailableError(caught)).toBe(true);
    const next = await strategy.next();
    expect(next?.id).toBe(nextCard.id);
  });

  it('does not clear the current card when a deleted sibling shares the same block id', async () => {
    const currentCard = createCard({ id: 'card-current', xiuyuanID: 'xy-current', blockId: 'block-shared' });
    const deletedSibling = createCard({ id: 'card-deleted', xiuyuanID: 'xy-deleted', blockId: 'block-shared' });
    const otherCard = createCard({ id: 'card-other', xiuyuanID: 'xy-other', blockId: 'block-other' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [currentCard, deletedSibling, otherCard]);
    const manager = {
      getQueue: vi.fn(() => queue),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const current = await strategy.next();
    expect(current?.id).toBe(currentCard.id);

    strategy.onDataChanged({
      type: 'card-deleted',
      cardIds: [deletedSibling.id],
      blockIds: [deletedSibling.blockId],
      timestamp: Date.now(),
    });

    const snapshot = strategy.serializeSessionSnapshot();
    expect(snapshot.currentItem?.id).toBe(currentCard.id);
    expect(snapshot.cachedCards.map((card) => card.id)).toEqual([currentCard.id, otherCard.id]);
  });

  it('restores incremental-learning avoid-once block identity from review tab snapshots', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const sameBlockSibling = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [sameBlockSibling, nextBlockCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    strategy.restoreSessionSnapshot({
      version: 1,
      queueType: QueueType.IncrementalLearning,
      cacheValid: true,
      currentIndex: 0,
      cachedCards: [sameBlockSibling, nextBlockCard],
      currentItem: null,
      forwardBuffer: [],
      pendingRotateCardId: null,
      avoidOnceCardId: firstCard.id,
      avoidOnceBlockId: firstCard.blockId,
      deferOnceCardId: firstCard.id,
      lastCounterSnapshot: null,
    });

    const next = await strategy.next();
    expect(next?.id).toBe(nextBlockCard.id);
  });

  it('restores legacy incremental-learning deferOnceCardId snapshots as card-level avoid identity', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, nextBlockCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    strategy.restoreSessionSnapshot({
      version: 1,
      queueType: QueueType.IncrementalLearning,
      cacheValid: true,
      currentIndex: 0,
      cachedCards: [firstCard, nextBlockCard],
      currentItem: null,
      forwardBuffer: [],
      pendingRotateCardId: null,
      deferOnceCardId: firstCard.id,
      lastCounterSnapshot: null,
    });

    const next = await strategy.next();
    expect(next?.id).toBe(nextBlockCard.id);
  });

  it('restores queue snapshots and card state when going back after rating', async () => {
    const card = createCard();
    const nextCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    let cardStore: FSRSCard = { ...card };
    const queueCards = [card, nextCard];

    const primaryRestore = vi.fn(async () => {});
    const finalRestore = vi.fn(async () => {});

    const primaryQueue = createQueueStub(QueueType.RetrievalPractice, queueCards, {
      handleReview: async (cardId: string, rating: number) => {
        if (cardId === card.id && rating === 2) {
          cardStore = { ...cardStore, due: Date.now() + 86_400_000, reps: cardStore.reps + 1 };
          return {
            updatedCard: cardStore,
            removedFromQueue: false,
            remainsInQueue: true,
            queueChanged: false,
            requiresCurrentViewReorder: false,
          };
        }
        return {};
      },
      createRollbackSnapshot: async () => ({ primary: true }),
      restoreRollbackSnapshot: primaryRestore,
    });
    const finalDrillQueue = createQueueStub(QueueType.FinalDrill, [], {
      createRollbackSnapshot: async () => ({ final: true }),
      restoreRollbackSnapshot: finalRestore,
    });

    const manager = {
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return finalDrillQueue;
        }
        return primaryQueue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        if (cardId === card.id) {
          return { ...cardStore };
        }
        throw new Error('card not found');
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async (updatedCard: FSRSCard) => {
        cardStore = { ...updatedCard };
      }),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(card.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    const current = await strategy.next();
    expect(current?.id).toBe(nextCard.id);

    const previous = await strategy.goBack(current);
    expect(previous?.id).toBe(card.id);

    const replay = await strategy.next();
    expect(replay?.id).toBe(nextCard.id);

    const nextAfterReplay = await strategy.next();
    expect(nextAfterReplay?.id).toBe(card.id);

    expect(primaryRestore).toHaveBeenCalledTimes(1);
    expect(finalRestore).toHaveBeenCalledTimes(1);
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: card.id,
        due: card.due,
      })
    );
  });
});
