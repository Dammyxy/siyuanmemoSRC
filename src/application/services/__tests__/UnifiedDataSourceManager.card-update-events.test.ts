import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type DataChangeEvent, type IDataRouter, type IDataSourceObserver } from '@/types/unified-data-source';
import { UnifiedDataSourceManager } from '../UnifiedDataSourceManager';

function createCard(): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 1000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 2000,
    updatedAt: now - 1000,
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(() => resolve()));
}

describe('UnifiedDataSourceManager card update notifications', () => {
  beforeEach(() => {
    UnifiedDataSourceManager.resetInstance();
  });

  afterEach(() => {
    UnifiedDataSourceManager.resetInstance();
  });

  it('emits queue-changed for dynamic due queues after card updates', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    const router: IDataRouter = {
      getCard: vi.fn(),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      deleteCard: vi.fn(async () => {}),
      getAvailableQueueTypes: vi.fn(() => []),
    } as unknown as IDataRouter;
    manager.setAdvancedRouter(router);

    const events: DataChangeEvent[] = [];
    const observer: IDataSourceObserver = {
      onDataChanged: (event) => {
        events.push(event);
      },
    };
    manager.registerObserver(observer);

    const card = createCard();
    await manager.updateCard(card);
    await flushMicrotasks();

    expect(router.updateCard).toHaveBeenCalledWith(card);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card-updated',
        cardIds: [card.id, card.blockId],
      }),
      expect.objectContaining({
        type: 'queue-changed',
        queueType: QueueType.RetrievalPractice,
      }),
      expect.objectContaining({
        type: 'queue-changed',
        queueType: QueueType.IncrementalLearning,
      }),
      expect.objectContaining({
        type: 'queue-changed',
        queueType: QueueType.FilterGroup,
      }),
    ]);
  });

  it('emits card-created and queue-changed for dynamic queues after card creation sync', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    const router: IDataRouter = {
      getCard: vi.fn(),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      deleteCard: vi.fn(async () => {}),
      getAvailableQueueTypes: vi.fn(() => []),
    } as unknown as IDataRouter;
    manager.setAdvancedRouter(router);

    const events: DataChangeEvent[] = [];
    const observer: IDataSourceObserver = {
      onDataChanged: (event) => {
        events.push(event);
      },
    };
    manager.registerObserver(observer);

    const card = createCard();
    await manager.onCardCreated(card);
    await flushMicrotasks();

    expect(events).toEqual([
      expect.objectContaining({
        type: 'card-created',
        cardIds: [card.id, card.blockId],
      }),
      expect.objectContaining({
        type: 'queue-changed',
        queueType: QueueType.RetrievalPractice,
      }),
      expect.objectContaining({
        type: 'queue-changed',
        queueType: QueueType.IncrementalLearning,
      }),
      expect.objectContaining({
        type: 'queue-changed',
        queueType: QueueType.FilterGroup,
      }),
    ]);
  });
});
