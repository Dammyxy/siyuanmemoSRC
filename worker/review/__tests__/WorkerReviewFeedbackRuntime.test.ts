import { describe, expect, it, vi } from 'vitest';
import type { QueueProjectionDelta, QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import {
  beginBackendWorkerRequest,
  endBackendWorkerRequest,
} from '../../bootstrap/ReviewFeedbackTimingScope';
import { WorkerReviewFeedbackRuntime } from '../WorkerReviewFeedbackRuntime';

const REVIEWED_AT = 1_700_200_000_000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-card-1',
    blockId: 'block-1',
    due: REVIEWED_AT + 60_000,
    stability: 4,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    state: CardState.Review,
    lastReview: REVIEWED_AT - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: REVIEWED_AT - 86_400_000,
    updatedAt: REVIEWED_AT,
    meta: {},
    ...overrides,
  };
}

function createProjectionRow(
  card: FSRSCard,
  index: number,
  generation = 2,
): QueueProjectionRow {
  return {
    queueType: QueueType.FinalDrill,
    rowId: card.id,
    cardId: card.id,
    blockId: card.blockId,
    deckId: null,
    membershipReason: 'manual',
    dueAt: card.due,
    dueBucket: 'manual',
    priorityScore: card.priority,
    sortKey: `${String(index).padStart(9, '0')}:${card.id}`,
    queueIndexHint: index,
    policyHash: 'policy-a',
    sourceGeneration: generation,
    payload: { queueIndexHint: index },
    updatedAt: REVIEWED_AT,
  };
}

function createRuntimeFixture(cards: FSRSCard[]) {
  const storedCards = new Map(cards.map((card) => [card.id, card] as const));
  const reviewed = cards[0];
  const readRows = vi.fn(() => cards.map((card, index) => createProjectionRow(card, index + 1)));
  const applyQueueProjectionDelta = vi.fn((_delta: QueueProjectionDelta) => undefined);
  const queueProjection = {
    readGeneration: vi.fn(() => ({
      queueType: QueueType.FinalDrill,
      policyHash: 'policy-a',
      generation: 2,
      status: 'ready' as const,
      rebuildReason: null,
      updatedAt: REVIEWED_AT,
      metadata: {},
    })),
    readRows,
    applyQueueProjectionDelta,
  };
  const repository = {
    getCard: vi.fn((cardId: string) => storedCards.get(cardId) ?? null),
    upsertCards: vi.fn((updatedCards: FSRSCard[]) => {
      for (const card of updatedCards) {
        storedCards.set(card.id, card);
      }
    }),
    queryCards: vi.fn(() => Array.from(storedCards.values())),
    touchSyncMetadata: vi.fn(),
  };
  const runtime = {
    runTransaction: vi.fn(async (_name: string, task: () => unknown) => await task()),
    run: vi.fn(),
    getOne: vi.fn(() => null),
  };
  const reviewRuntime = new WorkerReviewFeedbackRuntime({
    repository,
    queueProjection,
    runtime,
  });

  return {
    reviewed,
    reviewRuntime,
    readRows,
    applyQueueProjectionDelta,
  };
}

async function flushDeferredMaintenance(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('WorkerReviewFeedbackRuntime', () => {
  it('returns deferred impact before non-SRS projection maintenance reads rows', async () => {
    const reviewed = createCard({ id: 'card-deferred', blockId: 'block-deferred' });
    const peer = createCard({ id: 'card-peer', blockId: 'block-peer' });
    const {
      reviewRuntime,
      readRows,
      applyQueueProjectionDelta,
    } = createRuntimeFixture([reviewed, peer]);
    const timing = beginBackendWorkerRequest(true, reviewed.id);
    let result;

    try {
      result = await reviewRuntime.reviewFeedback({
        cardId: reviewed.id,
        rating: 2,
        queueType: QueueType.FinalDrill,
        projectionGeneration: 2,
        projectionPolicyHash: 'policy-a',
        reviewedAt: REVIEWED_AT,
      });
    } finally {
      endBackendWorkerRequest(timing);
    }

    expect(readRows).not.toHaveBeenCalled();
    expect(applyQueueProjectionDelta).not.toHaveBeenCalled();
    expect(result.queueImpact).toMatchObject({
      hotPatchable: false,
      refreshRequired: false,
      affectedQueues: [{
        queueType: QueueType.FinalDrill,
        policyHash: 'policy-a',
        generation: 2,
        currentGeneration: 2,
        requestedGeneration: 2,
        outcome: 'deferred',
        hotPatchable: false,
        refreshRequired: false,
        reason: 'review-feedback-deferred',
        deferred: {
          reason: 'review-feedback',
          scheduled: true,
          coalesced: false,
        },
      }],
    });
    expect(timing?.innerSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layer: 'queue-impact',
        step: 'projection-deferred-enqueue',
        queueType: QueueType.FinalDrill,
      }),
    ]));
    expect(timing?.innerSteps.some((step) => step.step === 'projection-deferred-run')).toBe(false);

    await flushDeferredMaintenance();

    expect(readRows).toHaveBeenCalledOnce();
    expect(applyQueueProjectionDelta).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.FinalDrill,
      policyHash: 'policy-a',
      generation: 3,
      invalidation: expect.objectContaining({
        reason: 'review-feedback',
        metadata: expect.objectContaining({
          deferred: true,
          reviewedCardId: reviewed.id,
        }),
      }),
    }));
  });

  it('coalesces deferred projection maintenance by queue and policy identity', async () => {
    const reviewed = createCard({ id: 'card-coalesce', blockId: 'block-coalesce' });
    const peer = createCard({ id: 'card-coalesce-peer', blockId: 'block-coalesce-peer' });
    const {
      reviewRuntime,
      readRows,
      applyQueueProjectionDelta,
    } = createRuntimeFixture([reviewed, peer]);

    const first = await reviewRuntime.reviewFeedback({
      cardId: reviewed.id,
      rating: 4,
      queueType: QueueType.FinalDrill,
      projectionGeneration: 2,
      projectionPolicyHash: 'policy-a',
      reviewedAt: REVIEWED_AT,
    });
    const second = await reviewRuntime.reviewFeedback({
      cardId: reviewed.id,
      rating: 2,
      queueType: QueueType.FinalDrill,
      projectionGeneration: 2,
      projectionPolicyHash: 'policy-a',
      reviewedAt: REVIEWED_AT + 1,
    });

    expect(readRows).not.toHaveBeenCalled();
    expect(first.queueImpact?.affectedQueues[0]).toMatchObject({
      outcome: 'deferred',
      deferred: expect.objectContaining({ coalesced: false }),
    });
    expect(second.queueImpact?.affectedQueues[0]).toMatchObject({
      outcome: 'deferred',
      deferred: expect.objectContaining({ coalesced: true }),
    });

    await flushDeferredMaintenance();

    expect(readRows).toHaveBeenCalledOnce();
    expect(applyQueueProjectionDelta).toHaveBeenCalledOnce();
  });
});
