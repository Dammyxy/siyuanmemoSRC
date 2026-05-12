import { describe, expect, it, vi } from 'vitest';
import { CardType, type FSRSCard } from '@/types/card';
import { QueueType, type QueueReviewResult } from '@/types/unified-data-source';
import { ReviewSessionProjectionApplier } from '../ReviewSessionProjectionApplier';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = new Date('2026-05-13T08:00:00+08:00').getTime();
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: now,
    stability: 5,
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
    createdAt: now - 86_400_000,
    updatedAt: now,
    ...overrides,
  };
}

describe('ReviewSessionProjectionApplier', () => {
  it('applies patch-applied projection action to the review session cache', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const frontier = createCard({ id: 'card-3', blockId: 'block-3' });
    const hydrateCardsBySnapshotIds = vi.fn(async (rowIds: string[]) => (
      rowIds.map((rowId) => {
        if (rowId === 'card-2') {
          return second;
        }
        if (rowId === 'card-3') {
          return frontier;
        }
        throw new Error(`unexpected row ${rowId}`);
      })
    ));
    const applier = new ReviewSessionProjectionApplier({
      shouldReadLocally: () => false,
      hydrateCardsBySnapshotIds,
    });

    const result = await applier.apply({
      reviewedCard: first,
      result: {
        removedFromQueue: true,
        queueChanged: true,
        projectionAction: {
          status: 'patch-applied',
          queueType: QueueType.RetrievalPractice,
          generation: 2,
          policyHash: 'policy-a',
          reason: 'review-feedback',
        },
        projectionImpactEntry: {
          queueType: QueueType.RetrievalPractice,
          removedRowIds: ['card-1'],
          updatedRows: [{ rowId: 'card-2', cardId: 'card-2', queueIndexHint: 1 }],
          insertedRows: [{ rowId: 'card-3', cardId: 'card-3', queueIndexHint: 2 }],
          counters: {
            version: 2,
            remaining: 2,
            due: 2,
            total: 2,
            buckets: { all: 2, item: 2, descriptor: 0, topic: 0, concept: 0 },
          },
        },
      } as QueueReviewResult,
      forceRemove: true,
      state: {
        cacheValid: true,
        cachedCards: [first, second],
        currentIndex: 1,
        forwardBuffer: [first],
        lastCounterSnapshot: null,
      },
    });

    expect(result.outcome).toBe('patched');
    expect(result.state.cachedCards.map((card) => card.id)).toEqual(['card-2', 'card-3']);
    expect(result.state.currentIndex).toBe(0);
    expect(result.state.forwardBuffer).toEqual([]);
    expect(result.state.lastCounterSnapshot).toEqual(expect.objectContaining({
      remaining: 2,
      source: 'hot',
    }));
    expect(hydrateCardsBySnapshotIds).toHaveBeenCalledWith(['card-2', 'card-3']);
  });

  it('requires refresh for generation mismatch projection actions', async () => {
    const card = createCard();
    const applier = new ReviewSessionProjectionApplier({
      shouldReadLocally: () => false,
      hydrateCardsBySnapshotIds: vi.fn(async () => []),
    });

    const result = await applier.apply({
      reviewedCard: card,
      result: {
        projectionAction: {
          status: 'generation-mismatch',
          queueType: QueueType.RetrievalPractice,
          generation: 3,
          policyHash: 'policy-a',
          reason: 'generation-mismatch',
        },
      } as QueueReviewResult,
      state: {
        cacheValid: true,
        cachedCards: [card],
        currentIndex: 1,
        forwardBuffer: [],
        lastCounterSnapshot: null,
      },
    });

    expect(result.outcome).toBe('refresh-required');
    expect(result.state.cachedCards.map((cached) => cached.id)).toEqual(['card-1']);
  });

  it('does not apply projection actions for local queue reads', async () => {
    const card = createCard();
    const hydrateCardsBySnapshotIds = vi.fn(async () => [card]);
    const applier = new ReviewSessionProjectionApplier({
      shouldReadLocally: () => true,
      hydrateCardsBySnapshotIds,
    });

    const result = await applier.apply({
      reviewedCard: card,
      result: {
        projectionAction: {
          status: 'patch-applied',
          queueType: QueueType.FilterGroup,
          generation: 1,
          policyHash: 'policy-a',
          reason: 'review-feedback',
        },
        projectionImpactEntry: {
          queueType: QueueType.FilterGroup,
          removedRowIds: ['card-1'],
          updatedRows: [],
          insertedRows: [],
        },
      } as QueueReviewResult,
      state: {
        cacheValid: true,
        cachedCards: [card],
        currentIndex: 1,
        forwardBuffer: [],
        lastCounterSnapshot: null,
      },
    });

    expect(result.outcome).toBe('not-applicable');
    expect(result.state.cachedCards.map((cached) => cached.id)).toEqual(['card-1']);
    expect(hydrateCardsBySnapshotIds).not.toHaveBeenCalled();
  });
});
