import { describe, expect, it, vi } from 'vitest';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { isQueueItemUnavailableError } from '@/core/queue/abstraction/Strategy';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { QueueType, type DataChangeEvent, type IReviewQueue, type QueueReviewResult } from '@/types/unified-data-source';
import { CardType, type FSRSCard } from '@/types/card';

const DAY_MS = 86_400_000;

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
    createRollbackSnapshot?: (liveCards: FSRSCard[]) => Promise<unknown>;
    restoreRollbackSnapshot?: (snapshot: unknown, liveCards: FSRSCard[]) => Promise<void>;
  }
): IReviewQueue & {
  createRollbackSnapshot?: () => Promise<unknown>;
  restoreRollbackSnapshot?: (snapshot: unknown) => Promise<void>;
} {
  const liveCards = cards.map((card) => ({ ...card }));
  const resolveLiveCardBySnapshotId = (id: string): FSRSCard | undefined => {
    return liveCards.find((card) => card.id === id || card.riffCardId === id || card.blockId === id);
  };
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
    getSnapshotRows: vi.fn(async () => liveCards.map((card, index) => buildQueueSnapshotRow(card, {
      queueIndex: index + 1,
    }))),
    getCardsBySnapshotIds: vi.fn(async (ids: string[]) => ids
      .map(resolveLiveCardBySnapshotId)
      .filter((card): card is FSRSCard => Boolean(card))
      .map((card) => ({ ...card }))),
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
    createRollbackSnapshot: options?.createRollbackSnapshot
      ? () => options.createRollbackSnapshot!(liveCards)
      : undefined,
    restoreRollbackSnapshot: options?.restoreRollbackSnapshot
      ? (snapshot: unknown) => options.restoreRollbackSnapshot!(snapshot, liveCards)
      : undefined,
  };
}

function createFilterGroupLoopFixture(
  cards: FSRSCard[],
  options?: {
    handleReview?: (
      cardId: string,
      rating: number,
      liveCards: FSRSCard[],
    ) => Promise<Partial<QueueReviewResult> | void>;
  }
): {
  strategy: UnifiedQueueStrategy;
  queue: IReviewQueue;
} {
  let observer: { onDataChanged(event: DataChangeEvent): void } | null = null;
  const queue = createQueueStub(QueueType.FilterGroup, cards, {
    handleReview: async (cardId, rating, liveCards) => {
      observer?.onDataChanged({
        type: 'queue-changed',
        queueType: QueueType.FilterGroup,
        timestamp: Date.now(),
      });

      if (options?.handleReview) {
        return options.handleReview(cardId, rating, liveCards);
      }

      return {
        updatedCard: liveCards.find((card) => card.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: true,
        requiresCurrentViewReorder: false,
      };
    },
  });
  const manager = {
    getQueue: vi.fn((type: QueueType) => {
      if (type === QueueType.FinalDrill) {
        return createQueueStub(QueueType.FinalDrill, []);
      }
      return queue;
    }),
    getCard: vi.fn(async (cardId: string) => {
      const card = cards.find((candidate) => candidate.id === cardId);
      if (!card) {
        throw new Error('card not found');
      }
      return { ...card };
    }),
    getCards: vi.fn(async () => []),
    updateCard: vi.fn(async () => {}),
    registerObserver: vi.fn((nextObserver) => {
      observer = nextObserver;
    }),
    unregisterObserver: vi.fn(),
  };
  const eventBus = { subscribe: vi.fn() };

  return {
    queue,
    strategy: new UnifiedQueueStrategy(
      QueueType.FilterGroup,
      manager as never,
      eventBus as never,
      null
    ),
  };
}

describe('UnifiedQueueStrategy performance and rollback behavior', () => {
  it('loads review cards from projection rows when a queue is projection-backed', async () => {
    const cardA = createCard({ id: 'card-a', blockId: 'block-a' });
    const cardB = createCard({ id: 'card-b', blockId: 'block-b' });
    const queue = createQueueStub(QueueType.FilterGroup, [cardA, cardB]);
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    const projectionRows = [
      buildQueueSnapshotRow(cardB, { queueIndex: 1 }),
      buildQueueSnapshotRow(cardA, { queueIndex: 2 }),
    ];
    (queue.getSnapshotRows as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(projectionRows);
    (queue.getCardsBySnapshotIds as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([cardB, cardA]);
    const manager = {
      getQueue: vi.fn(() => queue),
      getQueueProjectionRolloutDiagnostics: vi.fn((queueType?: QueueType) => queueType === QueueType.FilterGroup ? [{
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }] : []),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(QueueType.FilterGroup, manager as never, eventBus as never, null);

    const next = await strategy.next();

    expect(next?.id).toBe('card-b');
    expect(queue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalledWith(projectionRows.map((row) => row.id));
    expect(getCardsSpy).not.toHaveBeenCalled();
  });

  it('recomputes nextDues for the same card id when scheduling fields change', async () => {
    const card = createCard({ id: 'cache-card', blockId: 'cache-block' });
    const changedCard = createCard({
      ...card,
      due: card.due + 30 * DAY_MS,
      stability: 30,
      scheduledDays: 30,
      elapsedDays: 30,
      reps: card.reps + 1,
    });
    const queue = createQueueStub(QueueType.RetrievalPractice, [card]);
    const manager = {
      getQueue: vi.fn(() => queue),
    };
    const eventBus = { subscribe: vi.fn() };
    const preview = vi.fn((previewCard: FSRSCard) => new Map([
      [1, { ...previewCard, due: Date.now() + 10 * 60_000 }],
      [2, { ...previewCard, due: Date.now() + previewCard.scheduledDays * DAY_MS }],
      [3, { ...previewCard, due: Date.now() + (previewCard.scheduledDays + 1) * DAY_MS }],
      [4, { ...previewCard, due: Date.now() + (previewCard.scheduledDays + 2) * DAY_MS }],
    ]));

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      { preview } as never
    );

    await strategy.hydrateCurrentItem(card);
    await strategy.hydrateCurrentItem(changedCard);

    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('recomputes stale nextDues carried by restored review-session snapshots', async () => {
    const card = createCard({
      id: 'snapshot-nextdues-card',
      blockId: 'snapshot-nextdues-block',
      stability: 30,
      scheduledDays: 30,
      elapsedDays: 30,
    }) as FSRSCard & { nextDues?: Partial<Record<1 | 2 | 3 | 4, string>> };
    card.nextDues = {
      1: '10 min',
      2: '2 d',
      3: '3 d',
      4: '4 d',
    };
    const queue = createQueueStub(QueueType.RetrievalPractice, [card]);
    const manager = {
      getQueue: vi.fn(() => queue),
    };
    const eventBus = { subscribe: vi.fn() };
    const preview = vi.fn((previewCard: FSRSCard) => new Map([
      [1, { ...previewCard, due: Date.now() + 10 * 60_000 }],
      [2, { ...previewCard, due: Date.now() + previewCard.scheduledDays * DAY_MS }],
      [3, { ...previewCard, due: Date.now() + (previewCard.scheduledDays + 1) * DAY_MS }],
      [4, { ...previewCard, due: Date.now() + (previewCard.scheduledDays + 2) * DAY_MS }],
    ]));

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      { preview } as never
    );

    const hydrated = await strategy.hydrateCurrentItem(card);

    expect(preview).toHaveBeenCalledTimes(1);
    expect(hydrated?.nextDues).toMatchObject({
      1: '10 min',
      2: '30 d',
      3: '31 d',
      4: '32 d',
    });
  });

  it('anchors nextDues preview for manual future cards and caches by memoryStateAsOf', async () => {
    const now = Date.now();
    const originalDue = now + 30 * DAY_MS;
    const card = createCard({
      id: 'manual-future-preview-card',
      blockId: 'manual-future-preview-block',
      due: originalDue,
      lastReview: originalDue - 30 * DAY_MS,
      stability: 30,
      scheduledDays: 30,
      elapsedDays: 30,
    });
    const queue = createQueueStub(QueueType.RetrievalPractice, [card]);
    const getReviewSchedulingContext = vi.fn(() => ({
      memoryStateAsOf: originalDue,
      reason: 'manual-early-review',
    }));
    queue.getReviewSchedulingContext = getReviewSchedulingContext;
    const manager = {
      getQueue: vi.fn(() => queue),
    };
    const eventBus = { subscribe: vi.fn() };
    const preview = vi.fn((previewCard: FSRSCard, options?: { reviewTime?: number | Date; memoryStateAsOf?: number | Date }) => {
      const anchor = Number(options?.reviewTime ?? Date.now());
      return new Map([
        [1, { ...previewCard, due: anchor + 10 * 60_000 }],
        [2, { ...previewCard, due: anchor + previewCard.scheduledDays * DAY_MS }],
        [3, { ...previewCard, due: anchor + (previewCard.scheduledDays + 5) * DAY_MS }],
        [4, { ...previewCard, due: anchor + (previewCard.scheduledDays + 10) * DAY_MS }],
      ]);
    });

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      { preview } as never
    );

    const hydrated = await strategy.hydrateCurrentItem(card);

    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id }),
      { memoryStateAsOf: originalDue }
    );
    expect(hydrated?.nextDues).toMatchObject({
      1: '10 min',
      2: '30 d',
      3: '35 d',
      4: '40 d',
    });

    getReviewSchedulingContext.mockReturnValue({
      memoryStateAsOf: originalDue + DAY_MS,
      reason: 'manual-early-review',
    });

    await strategy.hydrateCurrentItem(card);

    expect(preview).toHaveBeenCalledTimes(2);
  });

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

  it('hot-patches projection queueImpact frontier rows without a full queue reload', async () => {
    const firstCard = createCard({ id: 'card-1', blockId: 'block-1', priority: 10 });
    const secondCard = createCard({ id: 'card-2', blockId: 'block-2', priority: 20 });
    const frontierCard = createCard({ id: 'card-3', blockId: 'block-3', priority: 30 });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const removedIndex = liveCards.findIndex((card) => card.id === cardId);
        if (removedIndex >= 0) {
          liveCards.splice(removedIndex, 1);
        }
        if (!liveCards.some((card) => card.id === frontierCard.id)) {
          liveCards.push({ ...frontierCard });
        }
        return {
          updatedCard: { ...firstCard, due: Date.now() + DAY_MS },
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: true,
          queueImpact: {
            hotPatchable: true,
            refreshRequired: false,
            affectedQueues: [{
              queueType: QueueType.RetrievalPractice,
              policyHash: 'policy-a',
              generation: 2,
              currentGeneration: 2,
              requestedGeneration: 1,
              hotPatchable: true,
              refreshRequired: false,
              reason: 'review-feedback',
              removedRowIds: ['card-1'],
              insertedRows: [{
                rowId: 'card-3',
                cardId: 'card-3',
                queueIndexHint: 2,
                sortKey: '000000002:card-3',
              }],
              updatedRows: [{
                rowId: 'card-2',
                cardId: 'card-2',
                queueIndexHint: 1,
                sortKey: '000000001:card-2',
              }],
              reorderHints: [],
              counterGeneration: 2,
              counters: {
                version: 2,
                remaining: 2,
                due: 2,
                total: 2,
                buckets: {
                  all: 2,
                  item: 2,
                  descriptor: 0,
                  topic: 0,
                  concept: 0,
                },
                source: 'reconciled',
              },
            }],
          },
        } as Partial<QueueReviewResult>;
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
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard, frontierCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
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
    const second = await strategy.next();
    const third = await strategy.next();

    expect(second?.id).toBe('card-2');
    expect(third?.id).toBe('card-3');
    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalled();
  });

  it('hot-patches deferred projection queueImpact without a full queue reload', async () => {
    const firstCard = createCard({ id: 'leech-card-1', blockId: 'leech-block-1', priority: 10 });
    const secondCard = createCard({ id: 'leech-card-2', blockId: 'leech-block-2', priority: 20 });
    const queue = createQueueStub(QueueType.Leech, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const removedIndex = liveCards.findIndex((card) => card.id === cardId);
        if (removedIndex >= 0) {
          liveCards.splice(removedIndex, 1);
        }
        return {
          updatedCard: null,
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: true,
          queueImpact: {
            hotPatchable: true,
            refreshRequired: false,
            affectedQueues: [{
              queueType: QueueType.Leech,
              policyHash: 'policy-leech',
              generation: 2,
              currentGeneration: 2,
              requestedGeneration: 1,
              hotPatchable: true,
              refreshRequired: false,
              reason: 'review-feedback',
              removedRowIds: ['leech-card-1'],
              insertedRows: [],
              updatedRows: [{
                rowId: 'leech-card-2',
                cardId: 'leech-card-2',
                queueIndexHint: 1,
                sortKey: '000000001:leech-card-2',
              }],
              reorderHints: [],
              counterGeneration: 2,
              counters: {
                version: 2,
                remaining: 1,
                due: 1,
                total: 1,
                buckets: {
                  all: 1,
                  item: 1,
                  descriptor: 0,
                  topic: 0,
                  concept: 0,
                },
                source: 'reconciled',
              },
            }],
          },
        } as Partial<QueueReviewResult>;
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const strategy = new UnifiedQueueStrategy(
      QueueType.Leech,
      manager as never,
      { subscribe: vi.fn() } as never,
      null
    );

    const first = await strategy.next();
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const second = await strategy.next();

    expect(second?.id).toBe('leech-card-2');
    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalledWith(['leech-card-2']);
  });

  it('uses projection counters for promoted neural-roam remaining size', async () => {
    const neuralCard = createCard({ id: 'neural-card-1', blockId: 'neural-block-1' });
    const queue = createQueueStub(QueueType.NeuralRoam, [neuralCard]);
    (queue.getSize as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(99);
    const manager = {
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async () => ({ ...neuralCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: QueueType.NeuralRoam,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
      }]),
    };
    const strategy = new UnifiedQueueStrategy(
      QueueType.NeuralRoam,
      manager as never,
      { subscribe: vi.fn() } as never,
      null
    );

    await expect(strategy.getRemainingSize()).resolves.toBe(1);
    expect(queue.getCounterSnapshot).toHaveBeenCalled();
    expect(queue.getSize).not.toHaveBeenCalled();
  });

  it('refreshes projection-backed queues when queueImpact requires a generation refresh', async () => {
    const firstCard = createCard({ id: 'card-refresh-1', xiuyuanID: 'xy-refresh-1', blockId: 'block-refresh-1', priority: 10 });
    const secondCard = createCard({ id: 'card-refresh-2', xiuyuanID: 'xy-refresh-2', blockId: 'block-refresh-2', priority: 20 });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const removedIndex = liveCards.findIndex((card) => card.id === cardId);
        if (removedIndex >= 0) {
          liveCards.splice(removedIndex, 1);
        }
        liveCards.push({ ...secondCard });
        return {
          updatedCard: { ...firstCard, due: Date.now() + DAY_MS },
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: true,
          queueImpact: {
            hotPatchable: false,
            refreshRequired: true,
            affectedQueues: [{
              queueType: QueueType.RetrievalPractice,
              policyHash: 'policy-a',
              generation: 3,
              currentGeneration: 3,
              requestedGeneration: 2,
              hotPatchable: false,
              refreshRequired: true,
              reason: 'generation-mismatch',
              removedRowIds: [],
              insertedRows: [],
              updatedRows: [],
              reorderHints: [],
              counterGeneration: 3,
            }],
          },
        } as Partial<QueueReviewResult>;
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
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
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
    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();

    const next = await strategy.next();

    expect(next?.id).toBe('card-refresh-2');
    expect(getCardsSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps retrieval-practice Good/Easy cards out of the current session after late queue reloads', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    let observer: { onDataChanged(event: DataChangeEvent): void } | null = null;
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        observer?.onDataChanged({
          type: 'queue-changed',
          queueType: QueueType.RetrievalPractice,
          timestamp: Date.now(),
        });
        const current = liveCards.find((card) => card.id === cardId) ?? null;
        return {
          updatedCard: current ? { ...current, reps: current.reps + 1 } : null,
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: true,
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
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn((nextObserver) => {
        observer = nextObserver;
      }),
      unregisterObserver: vi.fn(),
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
    strategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.RetrievalPractice,
      timestamp: Date.now(),
    });

    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);
    const counterSnapshot = await strategy.getCounterSnapshot();
    expect(counterSnapshot?.remaining).toBe(1);
    expect(counterSnapshot?.buckets.all).toBe(1);
  });

  it('keeps retrieval-practice Good/Easy logical duplicates out of the current session after reloads', async () => {
    const firstCard = createCard({
      id: 'card-1',
      xiuyuanID: 'xy-1',
      blockId: 'block-shared',
      meta: { faceIndex: 0 },
    });
    const duplicateSameFace = createCard({
      id: 'card-1-canonical',
      xiuyuanID: 'xy-1',
      blockId: 'block-shared',
      meta: { faceIndex: 0 },
    });
    const sameBlockOtherFace = createCard({
      id: 'card-2',
      xiuyuanID: 'xy-1',
      blockId: 'block-shared',
      meta: { faceIndex: 1 },
    });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, sameBlockOtherFace], {
      handleReview: async (cardId, _rating, liveCards) => {
        const index = liveCards.findIndex((card) => card.id === cardId);
        if (index >= 0) {
          liveCards[index] = { ...duplicateSameFace };
        }
        return {
          updatedCard: { ...duplicateSameFace, reps: duplicateSameFace.reps + 1 },
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: true,
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
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, sameBlockOtherFace].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
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
    strategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.RetrievalPractice,
      timestamp: Date.now(),
    });

    const next = await strategy.next();
    expect(next?.id).toBe(sameBlockOtherFace.id);
  });

  it('keeps filter-group Good/Easy cards out of the current session despite self queue-changed events', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-shared' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-shared' });
    const { queue, strategy } = createFilterGroupLoopFixture([firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const current = liveCards.find((card) => card.id === cardId) ?? null;
        return {
          updatedCard: current ? { ...current, reps: current.reps + 1 } : null,
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: true,
          requiresCurrentViewReorder: false,
        };
      },
    });

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);

    await strategy.onFeedback(next, { action: 'rate', rating: 3 });
    await expect(strategy.next()).resolves.toBeNull();

    const counterSnapshot = await strategy.getCounterSnapshot();
    expect(counterSnapshot?.remaining).toBe(0);
    expect(counterSnapshot?.total).toBe(0);
    expect(counterSnapshot?.buckets.all).toBe(0);
    expect(getCardsSpy).toHaveBeenCalledTimes(0);
  });

  it('rotates filter-group Again/Hard behind later cards while suppressing self queue-changed events', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const { strategy } = createFilterGroupLoopFixture([firstCard, secondCard]);

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);

    const repeatLater = await strategy.next();
    expect(repeatLater?.id).toBe(firstCard.id);
  });

  it('clears filter-group session exclusions on full refresh queue changes', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const { strategy } = createFilterGroupLoopFixture([firstCard, secondCard]);

    const first = await strategy.next();
    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expect((await strategy.next())?.id).toBe(secondCard.id);

    strategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.FilterGroup,
      requiresFullRefresh: true,
      timestamp: Date.now(),
    });

    const afterFullRefresh = await strategy.next();
    expect(afterFullRefresh?.id).toBe(firstCard.id);
  });

  it('preserves filter-group session exclusions through review tab snapshots and reloads', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const { strategy } = createFilterGroupLoopFixture([firstCard, secondCard]);

    const first = await strategy.next();
    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const snapshot = strategy.serializeSessionSnapshot();
    expect(snapshot.sessionExcludedCardIds).toEqual([firstCard.id]);

    const { strategy: restoredStrategy } = createFilterGroupLoopFixture([firstCard, secondCard]);
    restoredStrategy.restoreSessionSnapshot(snapshot);
    restoredStrategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.FilterGroup,
      timestamp: Date.now(),
    });

    const next = await restoredStrategy.next();
    expect(next?.id).toBe(secondCard.id);
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

  it('restores queue and card memory snapshots when feedback persistence fails', async () => {
    const first = createCard({ id: 'card-first', blockId: 'block-first', priority: 10 });
    const second = createCard({ id: 'card-second', blockId: 'block-second', priority: 20 });
    const changedFirst = createCard({ ...first, due: first.due + DAY_MS, priority: 99 });
    const restoreCardSnapshotForFailedFeedback = vi.fn(async () => {});
    const queue = createQueueStub(QueueType.RetrievalPractice, [first, second], {
      createRollbackSnapshot: async (liveCards) => liveCards.map((card) => ({ ...card })),
      restoreRollbackSnapshot: async (snapshot, liveCards) => {
        liveCards.splice(0, liveCards.length, ...(snapshot as FSRSCard[]).map((card) => ({ ...card })));
      },
      handleReview: async (_cardId, _rating, liveCards) => {
        liveCards.splice(0, 1, changedFirst);
        throw new Error('mock persist failed');
      },
    });
    const manager = {
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async () => ({ ...first })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      restoreCardSnapshotForFailedFeedback,
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const current = await strategy.next();
    await expect(strategy.onFeedback(current, { action: 'rate', rating: 3 })).rejects.toThrow('mock persist failed');

    expect(restoreCardSnapshotForFailedFeedback).toHaveBeenCalledWith(expect.objectContaining({
      id: 'card-first',
      priority: 10,
    }));
    expect(strategy.canGoBack()).toBe(false);
    const next = await strategy.next();
    expect(next?.id).toBe('card-first');
    expect(next?.priority).toBe(10);
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
