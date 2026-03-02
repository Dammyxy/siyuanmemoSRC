import { describe, expect, it, vi } from 'vitest';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

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
    type: 'item',
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
    handleReview?: (cardId: string, rating: number) => Promise<void>;
    createRollbackSnapshot?: () => Promise<unknown>;
    restoreRollbackSnapshot?: (snapshot: unknown) => Promise<void>;
  }
): IReviewQueue & {
  createRollbackSnapshot?: () => Promise<unknown>;
  restoreRollbackSnapshot?: (snapshot: unknown) => Promise<void>;
} {
  return {
    name: `Queue-${queueType}`,
    type: queueType,
    getType: () => queueType,
    getCards: vi.fn(async () => cards.map((card) => ({ ...card }))),
    getAllCards: vi.fn(async () => cards.map((card) => ({ ...card }))),
    getNextCard: vi.fn(async () => cards[0] ?? null),
    addCard: vi.fn(async () => {}),
    removeCard: vi.fn(async () => {}),
    updateCard: vi.fn(async () => {}),
    handleReview: vi.fn(async (cardId: string, rating: number) => {
      if (options?.handleReview) {
        await options.handleReview(cardId, rating);
      }
    }),
    skip: vi.fn(async () => {}),
    getStats: vi.fn(async () => ({
      total: cards.length,
      due: cards.length,
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
    getTemporaryBlacklistSize: vi.fn(() => 0),
    clearTemporaryBlacklist: vi.fn(),
    insertAt: vi.fn(async () => {}),
    getRemainingSize: vi.fn(async () => cards.length),
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
      handleReview: async () => {},
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

    expect(getCardsSpy).toHaveBeenCalledTimes(1);
  });

  it('rotates low-rated card once when there are alternative cards', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const thirdCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-3' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard, thirdCard], {
      handleReview: async () => {},
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
      handleReview: async () => {},
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
      handleReview: async () => {},
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
    expect(next?.id).toBe(firstCard.id);
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
        }
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
