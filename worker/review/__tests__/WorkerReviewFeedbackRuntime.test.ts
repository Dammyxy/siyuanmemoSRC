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
  queueType = QueueType.FinalDrill,
): QueueProjectionRow {
  return {
    queueType,
    rowId: card.id,
    cardId: card.id,
    blockId: card.blockId,
    deckId: null,
    membershipReason: queueType === QueueType.FinalDrill ? 'manual' : 'due',
    dueAt: card.due,
    dueBucket: queueType === QueueType.FinalDrill ? 'manual' : 'review',
    priorityScore: card.priority,
    sortKey: `${String(index).padStart(9, '0')}:${card.id}`,
    queueIndexHint: index,
    policyHash: 'policy-a',
    sourceGeneration: generation,
    payload: { queueIndexHint: index },
    updatedAt: REVIEWED_AT,
  };
}

function createRuntimeFixture(cards: FSRSCard[], queueType = QueueType.FinalDrill) {
  const storedCards = new Map(cards.map((card) => [card.id, card] as const));
  const queueStateValues = new Map<string, unknown>();
  const reviewEventsByIdempotencyKey = new Map<string, {
    id: string;
    card_id: string | null;
    rating: number | null;
    reviewed_at: number;
    event_type: string;
    payload_json: string;
  }>();
  const reviewed = cards[0];
  const readRows = vi.fn(() => cards.map((card, index) => createProjectionRow(card, index + 1, 2, queueType)));
  const applyQueueProjectionDelta = vi.fn((_delta: QueueProjectionDelta) => undefined);
  const queueProjection = {
    readGeneration: vi.fn(() => ({
      queueType,
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
    run: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT OR REPLACE INTO review_events') && params) {
        const idempotencyKey = typeof params[5] === 'string' ? params[5] : null;
        if (idempotencyKey) {
          reviewEventsByIdempotencyKey.set(idempotencyKey, {
            id: String(params[0]),
            card_id: typeof params[1] === 'string' ? params[1] : null,
            rating: typeof params[3] === 'number' ? params[3] : null,
            reviewed_at: Number(params[4]),
            event_type: String(params[8]),
            payload_json: String(params[9]),
          });
        }
        return;
      }
      if (sql.includes('INSERT OR REPLACE INTO queue_state') && params) {
        queueStateValues.set(String(params[0]), JSON.parse(String(params[1])));
      }
    }),
    getOne: vi.fn((_sql: string, params?: unknown[]) => {
      if (_sql.includes('SELECT value_json FROM queue_state')) {
        const key = typeof params?.[0] === 'string' ? params[0] : null;
        if (!key || !queueStateValues.has(key)) {
          return null;
        }
        return { value_json: JSON.stringify(queueStateValues.get(key)) };
      }
      const idempotencyKey = typeof params?.[0] === 'string' ? params[0] : null;
      return idempotencyKey ? reviewEventsByIdempotencyKey.get(idempotencyKey) ?? null : null;
    }),
  };
  const reviewRuntime = new WorkerReviewFeedbackRuntime({
    repository,
    queueProjection,
    runtime,
  });

  return {
    reviewed,
    reviewRuntime,
    repository,
    runtime,
    readRows,
    applyQueueProjectionDelta,
    queueStateValues,
  };
}

async function flushDeferredMaintenance(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('WorkerReviewFeedbackRuntime', () => {
  it('clears manual SRS queue membership inside the committed worker feedback transaction', async () => {
    const reviewed = createCard({ id: 'card-manual', blockId: 'block-manual' });
    const {
      reviewRuntime,
      queueStateValues,
    } = createRuntimeFixture([reviewed], QueueType.RetrievalPractice);
    queueStateValues.set('retrievalPracticeQueue', [reviewed.id, reviewed.blockId, 'keep-retrieval']);
    queueStateValues.set('incrementalLearningQueue', [reviewed.id, reviewed.blockId, 'keep-incremental']);

    const result = await reviewRuntime.reviewFeedback({
      cardId: reviewed.id,
      rating: 3,
      queueType: QueueType.RetrievalPractice,
      reviewedAt: REVIEWED_AT,
      idempotencyKey: 'manual-membership-cleanup-1',
    });

    expect(result).toMatchObject({
      committed: true,
      queueType: QueueType.RetrievalPractice,
    });
    expect(queueStateValues.get('retrievalPracticeQueue')).toEqual(['keep-retrieval']);
    expect(queueStateValues.get('incrementalLearningQueue')).toEqual(['keep-incremental']);
  });

  it('does not clear manual queue membership when worker feedback commit fails', async () => {
    const reviewed = createCard({ id: 'card-manual-fails', blockId: 'block-manual-fails' });
    const {
      reviewRuntime,
      repository,
      queueStateValues,
    } = createRuntimeFixture([reviewed], QueueType.RetrievalPractice);
    queueStateValues.set('retrievalPracticeQueue', [reviewed.id, reviewed.blockId, 'keep-retrieval']);
    repository.upsertCards.mockImplementation(() => {
      throw new Error('BACKEND_UNAVAILABLE: card schedule store unavailable');
    });

    await expect(reviewRuntime.reviewFeedback({
      cardId: reviewed.id,
      rating: 3,
      queueType: QueueType.RetrievalPractice,
      reviewedAt: REVIEWED_AT,
      idempotencyKey: 'manual-membership-cleanup-fails',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: card schedule store unavailable');

    expect(queueStateValues.get('retrievalPracticeQueue')).toEqual([reviewed.id, reviewed.blockId, 'keep-retrieval']);
  });

  it('returns deferred impact before SRS projection maintenance reads rows', async () => {
    const reviewed = createCard({ id: 'card-srs-deferred', blockId: 'block-srs-deferred' });
    const peer = createCard({ id: 'card-srs-peer', blockId: 'block-srs-peer' });
    const {
      reviewRuntime,
      readRows,
      applyQueueProjectionDelta,
    } = createRuntimeFixture([reviewed, peer], QueueType.RetrievalPractice);

    const result = await reviewRuntime.reviewFeedback({
      cardId: reviewed.id,
      rating: 3,
      queueType: QueueType.RetrievalPractice,
      projectionGeneration: 2,
      projectionPolicyHash: 'policy-a',
      reviewedAt: REVIEWED_AT,
      idempotencyKey: 'srs-deferred-1',
    });

    expect(readRows).not.toHaveBeenCalled();
    expect(applyQueueProjectionDelta).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      committed: true,
      queueImpact: {
        hotPatchable: false,
        refreshRequired: false,
        affectedQueues: [{
          queueType: QueueType.RetrievalPractice,
          policyHash: 'policy-a',
          generation: 2,
          currentGeneration: 2,
          requestedGeneration: 2,
          outcome: 'deferred',
          reason: 'review-feedback-deferred',
          deferred: expect.objectContaining({
            reason: 'review-feedback',
            scheduled: true,
          }),
        }],
      },
    });

    await flushDeferredMaintenance();

    expect(readRows).toHaveBeenCalledOnce();
    expect(applyQueueProjectionDelta).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-a',
      generation: 3,
    }));
  });

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

  it('returns feedback before slow projection maintenance host effects run', async () => {
    const reviewed = createCard({ id: 'card-slow-host-effect', blockId: 'block-slow-host-effect' });
    const peer = createCard({ id: 'card-slow-host-peer', blockId: 'block-slow-host-peer' });
    const {
      reviewRuntime,
      readRows,
      applyQueueProjectionDelta,
    } = createRuntimeFixture([reviewed, peer], QueueType.RetrievalPractice);
    readRows.mockImplementation(() => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 150) {
        // Simulates a blocking host read such as sqlite delta manifest/sealed segment IO.
      }
      return [reviewed, peer].map((card, index) => (
        createProjectionRow(card, index + 1, 2, QueueType.RetrievalPractice)
      ));
    });

    const startedAt = Date.now();
    const result = await reviewRuntime.reviewFeedback({
      cardId: reviewed.id,
      rating: 3,
      queueType: QueueType.RetrievalPractice,
      projectionGeneration: 2,
      projectionPolicyHash: 'policy-a',
      reviewedAt: REVIEWED_AT,
      idempotencyKey: 'slow-host-effect-1',
    });
    const feedbackDurationMs = Date.now() - startedAt;

    expect(readRows).not.toHaveBeenCalled();
    expect(applyQueueProjectionDelta).not.toHaveBeenCalled();
    expect(feedbackDurationMs).toBeLessThan(120);
    expect(result.queueImpact?.affectedQueues[0]).toMatchObject({
      queueType: QueueType.RetrievalPractice,
      outcome: 'deferred',
      reason: 'review-feedback-deferred',
    });

    await flushDeferredMaintenance();

    expect(readRows).toHaveBeenCalledOnce();
    expect(applyQueueProjectionDelta).toHaveBeenCalledOnce();
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

  it('reconciles duplicate answer commands from review ledger without duplicate review events', async () => {
    const reviewed = createCard({ id: 'card-duplicate', blockId: 'block-duplicate' });
    const {
      reviewRuntime,
      repository,
      runtime,
      queueStateValues,
      readRows,
      applyQueueProjectionDelta,
    } = createRuntimeFixture([reviewed], QueueType.RetrievalPractice);

    const request = {
      cardId: reviewed.id,
      rating: 3 as const,
      queueType: QueueType.RetrievalPractice,
      projectionGeneration: 2,
      projectionPolicyHash: 'policy-a',
      reviewedAt: REVIEWED_AT,
      idempotencyKey: 'duplicate-review-1',
    };

    const first = await reviewRuntime.reviewFeedback(request);
    queueStateValues.set('retrievalPracticeQueue', [reviewed.id, reviewed.blockId, 'keep-duplicate']);
    const second = await reviewRuntime.reviewFeedback(request);

    const reviewEventInsertCalls = runtime.run.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT OR REPLACE INTO review_events')
    ));
    const domainSyncInsertCalls = runtime.run.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT OR IGNORE INTO domain_sync_operations')
    ));

    expect(first).toMatchObject({
      committed: true,
      duplicate: false,
      idempotencyKey: 'duplicate-review-1',
    });
    expect(second).toMatchObject({
      committed: true,
      duplicate: true,
      idempotencyKey: 'duplicate-review-1',
      queueImpact: null,
    });
    expect(reviewEventInsertCalls).toHaveLength(1);
    expect(domainSyncInsertCalls).toHaveLength(1);
    expect(repository.upsertCards).toHaveBeenCalledOnce();
    expect(repository.touchSyncMetadata).toHaveBeenCalledOnce();
    expect(queueStateValues.get('retrievalPracticeQueue')).toEqual(['keep-duplicate']);
    expect(readRows).not.toHaveBeenCalled();
    expect(applyQueueProjectionDelta).not.toHaveBeenCalled();
  });

  it('fails closed when card schedule store cannot persist the after-answer state', async () => {
    const reviewed = createCard({ id: 'card-schedule-fails', blockId: 'block-schedule-fails' });
    const {
      reviewRuntime,
      repository,
      runtime,
      readRows,
      applyQueueProjectionDelta,
    } = createRuntimeFixture([reviewed], QueueType.RetrievalPractice);
    repository.upsertCards.mockImplementation(() => {
      throw new Error('BACKEND_UNAVAILABLE: card schedule store unavailable');
    });

    await expect(reviewRuntime.reviewFeedback({
      cardId: reviewed.id,
      rating: 3,
      queueType: QueueType.RetrievalPractice,
      projectionGeneration: 2,
      projectionPolicyHash: 'policy-a',
      reviewedAt: REVIEWED_AT,
      idempotencyKey: 'schedule-failure-1',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: card schedule store unavailable');

    const reviewEventInsertCalls = runtime.run.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT OR REPLACE INTO review_events')
    ));
    const domainSyncInsertCalls = runtime.run.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT OR IGNORE INTO domain_sync_operations')
    ));

    expect(reviewEventInsertCalls).toHaveLength(0);
    expect(domainSyncInsertCalls).toHaveLength(0);
    expect(repository.touchSyncMetadata).not.toHaveBeenCalled();
    expect(readRows).not.toHaveBeenCalled();
    expect(applyQueueProjectionDelta).not.toHaveBeenCalled();
  });
});
