import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type { QueueReviewCommitResult } from '@/core/queue/managers/UnifiedDataSourceManager';
import { ReviewAttemptKernel } from '../ReviewAttemptKernel';
import { mapReviewProjectionReceipt } from '../ReviewProjectionReceipt';

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
    state: CardState.Review,
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
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

function createCommitResult(
  overrides: Partial<QueueReviewCommitResult> = {},
  queueType: QueueType = QueueType.RetrievalPractice,
): QueueReviewCommitResult & ReturnType<typeof mapReviewProjectionReceipt> {
  const card = createCard();
  const updatedCard = createCard({ due: card.due + 86_400_000 });
  const result = {
    card,
    updatedCard,
    committed: true,
    queueImpact: null,
    ...overrides,
  };
  return {
    ...result,
    ...mapReviewProjectionReceipt(queueType, result.queueImpact),
  };
}

describe('ReviewAttemptKernel', () => {
  it('returns a normalized formal review attempt outcome', async () => {
    const commitResult = createCommitResult();
    const execute = vi.fn(async () => commitResult);
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    const result = await kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.RetrievalPractice,
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        sessionId: 'session-1',
      },
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'card-1',
      rating: Rating.Good,
    }));
    expect(result.committed).toBe(true);
    expect(result.updatedCard?.id).toBe('card-1');
    expect(result.projectionAction.status).toBe('not-applicable');
    expect(result.diagnostics).toEqual(expect.objectContaining({
      cardId: 'card-1',
      queueType: QueueType.RetrievalPractice,
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      sessionId: 'session-1',
    }));
  });

  it('normalizes patchable projection queue impact for the active queue', async () => {
    const queueImpact = {
      hotPatchable: true,
      refreshRequired: false,
      affectedQueues: [{
        queueType: QueueType.RetrievalPractice,
        policyHash: 'policy-a',
        generation: 7,
        hotPatchable: true,
        refreshRequired: false,
        reason: 'review-feedback',
        removedRowIds: ['card-1'],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: 7,
        counters: null,
      }],
    };
    const execute = vi.fn(async () => createCommitResult({ queueImpact }));
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    const result = await kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.RetrievalPractice,
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    });

    expect(result.projectionAction).toEqual(expect.objectContaining({
      status: 'patch-applied',
      queueType: QueueType.RetrievalPractice,
      generation: 7,
      policyHash: 'policy-a',
    }));
  });

  it('normalizes projection generation mismatch as a refresh action', async () => {
    const queueImpact = {
      hotPatchable: false,
      refreshRequired: true,
      affectedQueues: [{
        queueType: QueueType.RetrievalPractice,
        policyHash: 'policy-b',
        generation: 8,
        requestedGeneration: 7,
        currentGeneration: 8,
        hotPatchable: false,
        refreshRequired: true,
        reason: 'generation-mismatch',
        removedRowIds: [],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: 8,
        counters: null,
      }],
    };
    const execute = vi.fn(async () => createCommitResult({ queueImpact }));
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    const result = await kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.RetrievalPractice,
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    });

    expect(result.projectionAction).toEqual(expect.objectContaining({
      status: 'generation-mismatch',
      queueType: QueueType.RetrievalPractice,
      generation: 8,
      policyHash: 'policy-b',
    }));
  });

  it('normalizes explicit refresh-required projection impact outcome', async () => {
    const queueImpact = {
      hotPatchable: false,
      refreshRequired: true,
      affectedQueues: [{
        queueType: QueueType.RetrievalPractice,
        policyHash: 'policy-refresh',
        generation: 9,
        outcome: 'refresh-required',
        hotPatchable: false,
        refreshRequired: true,
        reason: 'projection-invalidated',
        removedRowIds: [],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: null,
        counters: null,
      }],
    };
    const execute = vi.fn(async () => createCommitResult({ queueImpact }));
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    const result = await kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.RetrievalPractice,
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    });

    expect(result.projectionAction).toEqual(expect.objectContaining({
      status: 'refresh-required',
      queueType: QueueType.RetrievalPractice,
      generation: 9,
      policyHash: 'policy-refresh',
    }));
  });

  it('normalizes deferred projection impact outcome for safe Review queues', async () => {
    const queueImpact = {
      hotPatchable: false,
      refreshRequired: false,
      affectedQueues: [{
        queueType: QueueType.FinalDrill,
        policyHash: 'policy-deferred',
        generation: 4,
        currentGeneration: 4,
        requestedGeneration: 4,
        outcome: 'deferred',
        hotPatchable: false,
        refreshRequired: false,
        reason: 'review-feedback-deferred',
        deferred: {
          reason: 'review-feedback',
          scheduled: true,
          coalesced: false,
          queuedAt: 1_700_000_000_000,
        },
        removedRowIds: [],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: null,
        counters: null,
      }],
    };
    const execute = vi.fn(async () => createCommitResult({ queueImpact }, QueueType.FinalDrill));
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    const result = await kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.FinalDrill,
        queueMode: 'drill',
        commitPolicy: 'drill-only',
      },
    });

    expect(result.projectionAction).toEqual(expect.objectContaining({
      status: 'deferred',
      queueType: QueueType.FinalDrill,
      generation: 4,
      policyHash: 'policy-deferred',
    }));
  });

  it('normalizes unavailable projection impact outcome without fallback', async () => {
    const queueImpact = {
      hotPatchable: false,
      refreshRequired: false,
      affectedQueues: [{
        queueType: QueueType.FilterGroup,
        policyHash: 'policy-unavailable',
        generation: 3,
        outcome: 'unavailable',
        unavailableReason: 'queue-projection-unavailable',
        hotPatchable: false,
        refreshRequired: false,
        reason: 'projection-unavailable',
        removedRowIds: [],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: null,
        counters: null,
      }],
    };
    const execute = vi.fn(async () => createCommitResult({ queueImpact }, QueueType.FilterGroup));
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    const result = await kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.FilterGroup,
        queueMode: 'filtered-rescheduling',
        commitPolicy: 'write-schedule',
      },
    });

    expect(result.projectionAction).toEqual(expect.objectContaining({
      status: 'unavailable',
      queueType: QueueType.FilterGroup,
      generation: 3,
      policyHash: 'policy-unavailable',
    }));
  });

  it('returns preview-only outcomes without converting them into committed attempts', async () => {
    const execute = vi.fn(async () => createCommitResult({
      committed: false,
      updatedCard: null,
    }));
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    const result = await kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.FilterGroup,
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
      },
    });

    expect(result.committed).toBe(false);
    expect(result.updatedCard).toBeNull();
    expect(result.diagnostics).toEqual(expect.objectContaining({
      queueType: QueueType.FilterGroup,
      queueMode: 'filtered-preview',
      commitPolicy: 'preview-only',
    }));
  });

  it('returns drill-only outcomes without persisting a formal schedule update', async () => {
    const execute = vi.fn(async () => createCommitResult({
      committed: false,
      updatedCard: null,
    }));
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    const result = await kernel.execute({
      cardId: 'card-1',
      rating: Rating.Again,
      context: {
        queueType: QueueType.FinalDrill,
        queueMode: 'drill',
        commitPolicy: 'drill-only',
      },
    });

    expect(result.committed).toBe(false);
    expect(result.updatedCard).toBeNull();
    expect(result.diagnostics).toEqual(expect.objectContaining({
      queueType: QueueType.FinalDrill,
      queueMode: 'drill',
      commitPolicy: 'drill-only',
    }));
  });

  it('propagates explicit backend unavailable errors without fallback commit', async () => {
    const unavailable = new Error('BACKEND_UNAVAILABLE: review.feedback requires backend-worker ownership');
    const execute = vi.fn(async () => {
      throw unavailable;
    });
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    await expect(kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.RetrievalPractice,
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback requires backend-worker ownership');

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('propagates explicit writer relay unavailable errors without local fallback', async () => {
    const unavailable = new Error('BACKEND_UNAVAILABLE: review.feedback requires writer relay runtime');
    const execute = vi.fn(async () => {
      throw unavailable;
    });
    const kernel = new ReviewAttemptKernel({ reviewCommitter: { execute } });

    await expect(kernel.execute({
      cardId: 'card-1',
      rating: Rating.Good,
      context: {
        queueType: QueueType.RetrievalPractice,
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback requires writer relay runtime');

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
