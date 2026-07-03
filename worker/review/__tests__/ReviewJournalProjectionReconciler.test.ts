import { describe, expect, it, vi } from 'vitest';
import type {
  QueueProjectionCounters,
  QueueProjectionGeneration,
  QueueProjectionRow,
} from '@/application/ports/QueueProjectionPort';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type { ReviewFeedbackJournalEntryStatus } from '../../db/ReviewFeedbackJournalStore';
import {
  ReviewJournalProjectionReconciler,
  type ReviewJournalProjectionReconcilerDeps,
} from '../ReviewJournalProjectionReconciler';

const REVIEWED_AT = 1_779_188_200_000;
const NOW = REVIEWED_AT + 60_000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-card-1',
    blockId: 'block-1',
    due: REVIEWED_AT - 10_000,
    stability: 4,
    difficulty: 5,
    reps: 4,
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

function createJournalEntry(
  overrides: Partial<{
    id: string;
    status: ReviewFeedbackJournalEntryStatus;
    queueType: QueueType;
    rating: number;
    reviewedAt: number;
    cardId: string;
    blockId: string;
    idempotencyKey: string;
    projectionGeneration: number;
    projectionPolicyHash: string;
    recordedAt: number;
  }> = {},
) {
  const cardId = overrides.cardId ?? 'card-1';
  const idempotencyKey = overrides.idempotencyKey ?? 'review-commit:card-1';
  return {
    id: overrides.id ?? `review-feedback:${idempotencyKey}`,
    requestId: null,
    cardId,
    idempotencyKey,
    status: overrides.status ?? 'projection-applied',
    recordedAt: overrides.recordedAt ?? REVIEWED_AT - 1_000,
    request: {
      cardId,
      rating: overrides.rating ?? 4,
      queueType: overrides.queueType ?? QueueType.IncrementalLearning,
      projectionGeneration: overrides.projectionGeneration ?? 1,
      projectionPolicyHash: overrides.projectionPolicyHash ?? 'policy-a',
      reviewedAt: overrides.reviewedAt ?? REVIEWED_AT,
      idempotencyKey,
    },
    appliedAt: null,
    projectionAppliedAt: null,
    projectionFailedAt: null,
    lastError: null,
  };
}

function createDurableEvent(
  overrides: Partial<{
    cardId: string;
    blockId: string;
    rating: number;
    reviewedAt: number;
    queueType: QueueType;
  }> = {},
) {
  const cardId = overrides.cardId ?? 'card-1';
  const blockId = overrides.blockId ?? 'block-1';
  const rating = overrides.rating ?? 4;
  const reviewedAt = overrides.reviewedAt ?? REVIEWED_AT;
  const queueType = overrides.queueType ?? QueueType.IncrementalLearning;
  return {
    card_id: cardId,
    rating,
    reviewed_at: reviewedAt,
    payload_json: JSON.stringify({
      cardId,
      blockId,
      rating,
      reviewedAt,
      queueType,
    }),
  };
}

function createGeneration(overrides: Partial<QueueProjectionGeneration> = {}): QueueProjectionGeneration {
  return {
    queueType: QueueType.IncrementalLearning,
    policyHash: 'policy-a',
    generation: 2,
    status: 'ready',
    rebuildReason: null,
    updatedAt: REVIEWED_AT,
    metadata: {},
    ...overrides,
  };
}

function createCounters(overrides: Partial<QueueProjectionCounters> = {}): QueueProjectionCounters {
  return {
    queueType: QueueType.IncrementalLearning,
    policyHash: 'policy-a',
    generation: 2,
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
    updatedAt: REVIEWED_AT,
    ...overrides,
  };
}

function createProjectionRow(card = createCard()): QueueProjectionRow {
  return {
    queueType: QueueType.IncrementalLearning,
    rowId: card.id,
    cardId: card.id,
    blockId: card.blockId,
    deckId: null,
    membershipReason: 'review-due',
    dueAt: card.due,
    dueBucket: 'due',
    priorityScore: card.priority,
    sortKey: `000000001:${card.id}`,
    queueIndexHint: 1,
    policyHash: 'policy-a',
    sourceGeneration: 2,
    payload: {
      cardType: card.type,
      state: card.state,
    },
    updatedAt: REVIEWED_AT,
  };
}

function createDeps(entries: unknown[] = []): ReviewJournalProjectionReconcilerDeps {
  const entriesByStatus = new Map<ReviewFeedbackJournalEntryStatus, unknown[]>();
  for (const entry of entries) {
    const status = (entry as { status?: ReviewFeedbackJournalEntryStatus }).status ?? 'prepared';
    entriesByStatus.set(status, [...(entriesByStatus.get(status) ?? []), entry]);
  }
  const listEntriesByStatus = vi.fn(async (status: ReviewFeedbackJournalEntryStatus) => (
    [...(entriesByStatus.get(status) ?? [])]
  ));
  const updateEntryStatus = vi.fn(async () => ({
    entryCount: 0,
    pendingCount: 0,
    pendingBytes: 0,
    oldestPendingAt: null,
    statusCounts: {},
    updatedAt: NOW,
  }));
  const durableEvents = new Map<string, ReturnType<typeof createDurableEvent>>();
  for (const entry of entries) {
    const idempotencyKey = String((entry as { idempotencyKey?: string | null }).idempotencyKey ?? '').trim();
    if (idempotencyKey) {
      durableEvents.set(idempotencyKey, createDurableEvent({
        cardId: String((entry as { cardId?: string }).cardId || 'card-1'),
        rating: Number((entry as { request?: { rating?: number } }).request?.rating ?? 4),
        reviewedAt: Number((entry as { request?: { reviewedAt?: number } }).request?.reviewedAt ?? REVIEWED_AT),
        queueType: ((entry as { request?: { queueType?: QueueType } }).request?.queueType ?? QueueType.IncrementalLearning),
      }));
    }
  }
  const runTransaction: ReviewJournalProjectionReconcilerDeps['runTransaction'] = vi.fn(
    async <T>(_label: string, task: () => T | Promise<T>) => await task(),
  );
  return {
    journalStore: {
      listEntriesByStatus,
      updateEntryStatus,
    },
    queueProjection: {
      readGeneration: vi.fn(() => createGeneration()),
      listReadyGenerations: vi.fn(() => [createGeneration()]),
      readCounters: vi.fn(() => createCounters()),
      readRows: vi.fn(() => []),
      replaceQueueProjection: vi.fn(),
    },
    repository: {
      queryCards: vi.fn(() => []),
    },
    getDurableReviewEventByIdempotencyKey: vi.fn((idempotencyKey: string) => durableEvents.get(idempotencyKey) ?? null),
    runTransaction,
    replayBatchLimit: 32,
    now: () => NOW,
  };
}

describe('ReviewJournalProjectionReconciler', () => {
  it('completes without projection replacement when no relevant journal entries exist', async () => {
    const deps = createDeps();

    await new ReviewJournalProjectionReconciler(deps).reconcile();

    expect(deps.journalStore?.listEntriesByStatus).toHaveBeenCalledTimes(3);
    expect(deps.getDurableReviewEventByIdempotencyKey).not.toHaveBeenCalled();
    expect(deps.queueProjection?.replaceQueueProjection).not.toHaveBeenCalled();
    expect(deps.runTransaction).not.toHaveBeenCalled();
  });

  it('sorts projection candidates across journal statuses before applying the replay batch limit', async () => {
    const laterProjectionEntry = createJournalEntry({
      id: 'review-feedback:later',
      idempotencyKey: 'review-commit:later',
      cardId: 'card-later',
      status: 'projection-applied',
      recordedAt: REVIEWED_AT,
    });
    const earlierTruthEntry = createJournalEntry({
      id: 'review-feedback:earlier',
      idempotencyKey: 'review-commit:earlier',
      cardId: 'card-earlier',
      status: 'truth-flushed',
      recordedAt: REVIEWED_AT - 10_000,
    });
    const deps = createDeps([laterProjectionEntry, earlierTruthEntry]);
    deps.replayBatchLimit = 1;
    vi.mocked(deps.queueProjection!.readRows).mockReturnValue([
      createProjectionRow(createCard({ id: 'card-earlier', blockId: 'block-earlier' })),
    ]);

    await new ReviewJournalProjectionReconciler(deps).reconcile();

    expect(deps.getDurableReviewEventByIdempotencyKey).toHaveBeenCalledWith('review-commit:earlier');
    expect(deps.getDurableReviewEventByIdempotencyKey).not.toHaveBeenCalledWith('review-commit:later');
    expect(deps.queueProjection?.replaceQueueProjection).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        reconciledCardIds: ['card-earlier'],
      }),
    }));
  });

  it('replaces stale Review projection rows from repository query results when durable evidence matches', async () => {
    const entry = createJournalEntry({ status: 'truth-flushed' });
    const deps = createDeps([entry]);
    vi.mocked(deps.queueProjection!.readRows).mockReturnValue([createProjectionRow()]);

    await new ReviewJournalProjectionReconciler(deps).reconcile();

    expect(deps.repository?.queryCards).toHaveBeenCalledWith(expect.objectContaining({
      dueDate: { lte: expect.any(Number) },
      includeSuspended: false,
      sourceStatus: 'active',
    }));
    expect(deps.runTransaction).toHaveBeenCalledWith(
      'reviewFeedback.journal-projection-reconcile',
      expect.any(Function),
      { persist: false },
    );
    expect(deps.queueProjection?.replaceQueueProjection).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-a',
      generation: 3,
      rows: [],
      metadata: expect.objectContaining({
        reason: 'review-feedback-journal-reconciliation',
        source: 'review-feedback-journal',
        reconciledCardIds: ['card-1'],
        reconciledBlockIds: ['block-1'],
      }),
    }));
  });

  it('rebuilds every ready policy for the queue when stale reviewed rows exist across policies', async () => {
    const entry = createJournalEntry({ status: 'truth-flushed', projectionPolicyHash: 'policy-a' });
    const deps = createDeps([entry]);
    const policyARow = createProjectionRow();
    const policyBRow: QueueProjectionRow = {
      ...createProjectionRow(),
      rowId: 'policy-b-row',
      policyHash: 'policy-b',
    };
    vi.mocked(deps.queueProjection!.listReadyGenerations).mockReturnValue([
      createGeneration({ policyHash: 'policy-a' }),
      createGeneration({ policyHash: 'policy-b' }),
    ]);
    vi.mocked(deps.queueProjection!.readRows).mockImplementation((query) => {
      if (query.policyHash === 'policy-a') {
        return [policyARow];
      }
      if (query.policyHash === 'policy-b') {
        return [policyBRow];
      }
      return [policyARow, policyBRow];
    });

    await new ReviewJournalProjectionReconciler(deps).reconcile();

    expect(deps.queueProjection?.replaceQueueProjection).toHaveBeenCalledTimes(2);
    expect(deps.queueProjection?.replaceQueueProjection).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-a',
      rows: [],
    }));
    expect(deps.queueProjection?.replaceQueueProjection).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.IncrementalLearning,
      policyHash: 'policy-b',
      rows: [],
      metadata: expect.objectContaining({
        reconciledCardIds: ['card-1'],
      }),
    }));
  });

  it('leaves journal and projection unchanged when durable event evidence mismatches', async () => {
    const entry = createJournalEntry();
    const deps = createDeps([entry]);
    vi.mocked(deps.getDurableReviewEventByIdempotencyKey).mockReturnValue(createDurableEvent({ rating: 3 }));

    await new ReviewJournalProjectionReconciler(deps).reconcile();

    expect(deps.journalStore?.updateEntryStatus).not.toHaveBeenCalled();
    expect(deps.queueProjection?.readGeneration).not.toHaveBeenCalled();
    expect(deps.queueProjection?.replaceQueueProjection).not.toHaveBeenCalled();
  });

  it('advances stale prepared entries to projection-applied only when durable evidence matches', async () => {
    const entry = createJournalEntry({ status: 'prepared' });
    const deps = createDeps([entry]);

    await new ReviewJournalProjectionReconciler(deps).reconcile();

    expect(deps.journalStore?.updateEntryStatus).toHaveBeenCalledWith(
      entry.id,
      'projection-applied',
      expect.objectContaining({
        appliedAt: REVIEWED_AT,
        projectionAppliedAt: NOW,
        projectionFailedAt: null,
        lastError: null,
      }),
    );
  });

  it('propagates journal dependency failures without fallback', async () => {
    const deps = createDeps();
    vi.mocked(deps.journalStore!.listEntriesByStatus).mockRejectedValueOnce(
      new Error('BACKEND_UNAVAILABLE: review journal projection reconciliation unavailable'),
    );

    await expect(new ReviewJournalProjectionReconciler(deps).reconcile()).rejects.toThrow(
      'BACKEND_UNAVAILABLE: review journal projection reconciliation unavailable',
    );
    expect(deps.queueProjection?.replaceQueueProjection).not.toHaveBeenCalled();
  });
});
