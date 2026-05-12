import { describe, expect, it, vi } from 'vitest';
import { UnifiedQueueStrategy } from '../UnifiedQueueStrategy';
import { SubsetReviewQueue } from '@/core/queue/domain/SubsetReviewQueue';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { CardType, type FSRSCard } from '@/types/card';
import { QueueType, type QueueCounterSnapshot } from '@/types/unified-data-source';

function createCard(id: string, blockId: string): FSRSCard {
  const now = Date.now();
  return {
    id,
    xiuyuanID: `xy-${id}`,
    blockId,
    due: now,
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
      item: cards.length,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'reconciled',
  };
}

function createProjectionQueueImpact(projectedCard: FSRSCard) {
  return {
    affectedQueues: [{
      queueType: QueueType.FilterGroup,
      hotPatchable: true,
      refreshRequired: false,
      removedRowIds: [],
      updatedRows: [{
        rowId: projectedCard.id,
        cardId: projectedCard.id,
        blockId: projectedCard.blockId,
        queueIndexHint: 1,
      }],
      insertedRows: [],
      counters: createCounterSnapshot([projectedCard]),
    }],
  };
}

function createProjectionBackedManager(scopedCard: FSRSCard, projectedCard: FSRSCard) {
  const cardsById = new Map([
    [scopedCard.id, scopedCard],
    [projectedCard.id, projectedCard],
  ]);
  const readQueueProjectionSnapshot = vi.fn(async () => ({
    queueType: QueueType.FilterGroup,
    policyHash: 'global-filter-group-projection',
    generation: 1,
    rows: [buildQueueSnapshotRow(projectedCard, { queueIndex: 1 })],
    counters: createCounterSnapshot([projectedCard]),
  }));
  const getQueueProjectionCardsBySnapshotIds = vi.fn(async () => [{ ...projectedCard }]);

  return {
    getCards: vi.fn(async (filter?: { blockIds?: string[] }) => {
      const blockIds = Array.isArray(filter?.blockIds) ? filter.blockIds : [];
      if (blockIds.includes(scopedCard.blockId)) {
        return [{ ...scopedCard }];
      }
      return [{ ...projectedCard }, { ...scopedCard }];
    }),
    getCard: vi.fn(async (cardId: string) => {
      const card = cardsById.get(cardId);
      if (!card) {
        throw new Error(`card not found: ${cardId}`);
      }
      return { ...card };
    }),
    getQueueProjectionRolloutDiagnostics: vi.fn((queueType?: QueueType) => (
      queueType === QueueType.FilterGroup
        ? [{
          queueType: QueueType.FilterGroup,
          projectionBacked: true,
          state: 'backend-projection',
          readPath: 'backend-projection',
          reason: 'rollout-enabled',
          nextCoverageTask: null,
        }]
        : []
    )),
    readQueueProjectionSnapshot,
    getQueueProjectionCardsBySnapshotIds,
    commitReview: vi.fn(async ({ cardId, rating }: { cardId: string; rating: number }) => {
      const card = cardsById.get(cardId);
      if (!card) {
        throw new Error(`card not found: ${cardId}`);
      }
      const updatedCard = {
        ...card,
        due: Date.now() + 7 * 86_400_000,
        reps: card.reps + 1,
        lastReview: Date.now(),
        updatedAt: Date.now(),
      };
      cardsById.set(cardId, updatedCard);
      return {
        card: { ...card },
        updatedCard: { ...updatedCard },
        committed: true,
        queueImpact: createProjectionQueueImpact(projectedCard),
      };
    }),
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
    updateCard: vi.fn(),
    notifyObservers: vi.fn(),
  };
}

describe('UnifiedQueueStrategy static subset projection policy', () => {
  it('keeps a static subset review on its exact card scope when filter-group is projection-backed', async () => {
    const scopedCard = createCard('scoped-card', 'scoped-block');
    const projectedCard = createCard('projected-card', 'projected-block');
    const manager = createProjectionBackedManager(scopedCard, projectedCard);
    const queue = new SubsetReviewQueue(manager as never, [scopedCard.blockId], {
      cardIds: [scopedCard.id],
      preferredCardId: scopedCard.id,
    });
    const strategy = new UnifiedQueueStrategy(
      queue,
      manager as never,
      { subscribe: vi.fn(), unsubscribe: vi.fn() } as never,
      null,
    );

    const next = await strategy.next();

    expect(queue.getType()).toBe(QueueType.FilterGroup);
    expect(next?.id).toBe(scopedCard.id);
    expect(manager.readQueueProjectionSnapshot).not.toHaveBeenCalled();
    expect(manager.getQueueProjectionCardsBySnapshotIds).not.toHaveBeenCalled();

    strategy.cleanup();
  });

  it('ignores global filter-group queueImpact after rating a static subset card', async () => {
    const scopedCard = createCard('scoped-card', 'scoped-block');
    const projectedCard = createCard('projected-card', 'projected-block');
    const manager = createProjectionBackedManager(scopedCard, projectedCard);
    const queue = new SubsetReviewQueue(manager as never, [scopedCard.blockId], {
      cardIds: [scopedCard.id],
      preferredCardId: scopedCard.id,
    });
    const getCardsBySnapshotIds = vi.spyOn(queue, 'getCardsBySnapshotIds');
    const strategy = new UnifiedQueueStrategy(
      queue,
      manager as never,
      { subscribe: vi.fn(), unsubscribe: vi.fn() } as never,
      null,
    );

    const first = await strategy.next();
    expect(first?.id).toBe(scopedCard.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 3 });
    const next = await strategy.next();

    expect(manager.commitReview).toHaveBeenCalledWith(expect.objectContaining({
      cardId: scopedCard.id,
      rating: 3,
      context: expect.objectContaining({
        queueType: QueueType.FilterGroup,
      }),
    }));
    expect(getCardsBySnapshotIds).not.toHaveBeenCalled();
    expect(manager.readQueueProjectionSnapshot).not.toHaveBeenCalled();
    expect(manager.getQueueProjectionCardsBySnapshotIds).not.toHaveBeenCalled();
    expect(next).toBeNull();

    strategy.cleanup();
  });
});
