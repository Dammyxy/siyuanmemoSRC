import { describe, expect, it, vi } from 'vitest';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

function createSyntheticNeuralCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: '20230209054609-tu5wnpo',
    xiuyuanID: '20230209054609-tu5wnpo',
    blockId: '20230209054609-tu5wnpo',
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: 'topic',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createQueueStub(): IReviewQueue {
  const queue = {
    name: 'NeuralRoamQueue',
    type: QueueType.NeuralRoam,
    getType: () => QueueType.NeuralRoam,
    getCards: vi.fn(async () => []),
    getAllCards: vi.fn(async () => []),
    getNextCard: vi.fn(async () => null),
    addCard: vi.fn(async () => {}),
    removeCard: vi.fn(async () => {}),
    handleReview: vi.fn(async () => {}),
    skip: vi.fn(async () => {}),
    getStats: vi.fn(async () => ({ total: 0, due: 0, new: 0, learning: 0, reviewed: 0 })),
    getUIConfig: vi.fn(() => ({ displayName: 'Neural Roam', buttons: [], showSkipButton: true, showProgressBar: true })),
    isDynamic: vi.fn(() => false),
    refresh: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    getSize: vi.fn(async () => 0),
    isEmpty: vi.fn(async () => true),
    sort: vi.fn(async () => {}),
    filter: vi.fn(async () => []),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    notifyObservers: vi.fn(),
    reorder: vi.fn(async () => true),
    clearCustomOrder: vi.fn(),
    getTemporaryBlacklistSize: vi.fn(() => 0),
    clearTemporaryBlacklist: vi.fn(),
    insertAt: vi.fn(async () => {}),
    getRemainingSize: vi.fn(async () => 0),
  } as unknown as IReviewQueue;

  return queue;
}

function createStrategyWithQueue(queue: IReviewQueue): {
  strategy: UnifiedQueueStrategy;
  manager: {
    getQueue: ReturnType<typeof vi.fn>;
    getCard: ReturnType<typeof vi.fn>;
    getCards: ReturnType<typeof vi.fn>;
    updateCard: ReturnType<typeof vi.fn>;
  };
} {
  const manager = {
    getQueue: vi.fn(() => queue),
    getCard: vi.fn(async () => {
      throw new Error('Card not found');
    }),
    getCards: vi.fn(async () => []),
    updateCard: vi.fn(async () => {}),
  };

  const eventBus = {
    subscribe: vi.fn(),
  };

  const strategy = new UnifiedQueueStrategy(
    QueueType.NeuralRoam,
    manager as never,
    eventBus as never,
    null
  );

  return { strategy, manager };
}

describe('UnifiedQueueStrategy neural-roam snapshot', () => {
  it('does not query card storage snapshot for synthetic neural cards', async () => {
    const queue = createQueueStub();
    const { strategy, manager } = createStrategyWithQueue(queue);

    const currentItem = createSyntheticNeuralCard();
    await strategy.onFeedback(currentItem, { action: 'rate', rating: 3 });

    expect(manager.getCard).not.toHaveBeenCalled();
    expect(manager.getCards).not.toHaveBeenCalled();
    expect((queue.handleReview as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      currentItem.id,
      3
    );
  });

  it('uses queue.getSize fast-path for neural stats', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      getCards: ReturnType<typeof vi.fn>;
      getSize: ReturnType<typeof vi.fn>;
    };
    queue.getSize.mockResolvedValue(42);

    const { strategy } = createStrategyWithQueue(queue);
    const stats = await strategy.getStats();

    expect(stats).toEqual({
      size: 42,
      label: '42 due',
      extra: '42 total',
    });
    expect(queue.getSize).toHaveBeenCalledTimes(1);
    expect(queue.getCards).not.toHaveBeenCalled();
  });

  it('uses queue.getSize fast-path for neural remaining size', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      getCards: ReturnType<typeof vi.fn>;
      getSize: ReturnType<typeof vi.fn>;
    };
    queue.getSize.mockResolvedValue(17);

    const { strategy } = createStrategyWithQueue(queue);
    const remaining = await strategy.getRemainingSize();

    expect(remaining).toBe(17);
    expect(queue.getSize).toHaveBeenCalledTimes(1);
    expect(queue.getCards).not.toHaveBeenCalled();
  });
});
