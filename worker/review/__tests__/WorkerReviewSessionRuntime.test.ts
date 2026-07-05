import { describe, expect, it, vi } from 'vitest';
import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import { WorkerReviewSessionRuntime } from '../WorkerReviewSessionRuntime';

const NOW = 1_779_300_000_000;

function createCard(id: string, dueOffset = 0): FSRSCard {
  return {
    id,
    xiuyuanID: `xy-${id}`,
    blockId: `block-${id}`,
    due: NOW + dueOffset,
    stability: 4,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    state: CardState.Review,
    lastReview: NOW - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW,
    meta: {},
  };
}

function createProjectionRow(card: FSRSCard, index: number): QueueProjectionRow {
  return {
    queueType: QueueType.RetrievalPractice,
    rowId: card.id,
    cardId: card.id,
    blockId: card.blockId,
    deckId: null,
    membershipReason: 'due',
    dueAt: card.due,
    dueBucket: 'review',
    priorityScore: card.priority,
    sortKey: `${String(index).padStart(9, '0')}:${card.id}`,
    queueIndexHint: index,
    policyHash: 'retrieval-policy',
    sourceGeneration: 7,
    payload: {},
    updatedAt: NOW,
  };
}

describe('WorkerReviewSessionRuntime', () => {
  it('starts from projection rows but advances feedback from worker session state without rereading projection rows', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const readRows = vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]);
    const feedbackRuntime = {
      reviewFeedback: vi.fn(async () => ({
        cardId: first.id,
        committed: true,
        reviewedAt: NOW,
        queueType: QueueType.RetrievalPractice,
        updatedCard: { ...first, reps: first.reps + 1, due: NOW + 86_400_000 },
        idempotencyKey: 'feedback-key',
        queueImpact: {
          hotPatchable: false,
          refreshRequired: false,
          affectedQueues: [],
        },
      })),
    };
    const runtime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: vi.fn((cardId: string) => cardsById.get(cardId) ?? null),
      },
      queueProjection: {
        readGeneration: vi.fn(() => ({
          queueType: QueueType.RetrievalPractice,
          policyHash: 'retrieval-policy',
          generation: 7,
          status: 'ready',
        })),
        readRows,
      },
      feedbackRuntime,
    });

    const started = await runtime.startSession({
      sessionId: 'session-a',
      queueType: QueueType.RetrievalPractice,
    });

    expect(started.current?.id).toBe(first.id);
    expect(started.counters).toMatchObject({ remaining: 2, source: 'worker-session' });
    expect(readRows).toHaveBeenCalledOnce();

    const result = await runtime.feedback({
      sessionId: started.sessionId,
      cardId: first.id,
      rating: 3,
      reviewedAt: NOW,
      idempotencyKey: 'feedback-key',
    });

    expect(result.answeredCardId).toBe(first.id);
    expect(result.current?.id).toBe(second.id);
    expect(result.counters).toMatchObject({ remaining: 1, total: 1, source: 'worker-session' });
    expect(readRows).toHaveBeenCalledOnce();
    expect(feedbackRuntime.reviewFeedback).toHaveBeenCalledWith(expect.objectContaining({
      cardId: first.id,
      rating: 3,
      queueType: QueueType.RetrievalPractice,
      sessionId: 'session-a',
      idempotencyKey: 'feedback-key',
    }));
  });

  it('fails closed when worker session authority is unavailable', async () => {
    const readRows = vi.fn(() => []);
    const feedbackRuntime = {
      reviewFeedback: vi.fn(async () => ({
        cardId: 'missing-card',
        committed: true,
        reviewedAt: NOW,
        queueType: QueueType.RetrievalPractice,
        updatedCard: null,
      })),
    };
    const runtime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: vi.fn(() => null),
      },
      queueProjection: {
        readGeneration: vi.fn(() => ({
          queueType: QueueType.RetrievalPractice,
          policyHash: 'retrieval-policy',
          generation: 7,
          status: 'ready',
        })),
        readRows,
      },
      feedbackRuntime,
    });

    await expect(runtime.feedback({
      sessionId: 'missing-session',
      cardId: 'missing-card',
      rating: 3,
      reviewedAt: NOW,
    })).rejects.toThrow('WORKER_REVIEW_SESSION_UNAVAILABLE: missing-session');

    expect(readRows).not.toHaveBeenCalled();
    expect(feedbackRuntime.reviewFeedback).not.toHaveBeenCalled();
  });

  it('skips the current card from worker session state without committing review feedback', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const readRows = vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]);
    const feedbackRuntime = {
      reviewFeedback: vi.fn(async () => ({
        cardId: first.id,
        committed: true,
        reviewedAt: NOW,
        queueType: QueueType.RetrievalPractice,
        updatedCard: null,
      })),
    };
    const runtime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: vi.fn((cardId: string) => cardsById.get(cardId) ?? null),
      },
      queueProjection: {
        readGeneration: vi.fn(() => ({
          queueType: QueueType.RetrievalPractice,
          policyHash: 'retrieval-policy',
          generation: 7,
          status: 'ready',
        })),
        readRows,
      },
      feedbackRuntime,
    });

    const started = await runtime.startSession({
      sessionId: 'session-a',
      queueType: QueueType.RetrievalPractice,
    });
    const skipped = runtime.skip({
      sessionId: started.sessionId,
      cardId: first.id,
    });

    expect(skipped).toMatchObject({
      skippedCardId: first.id,
      current: expect.objectContaining({ id: second.id }),
      counters: expect.objectContaining({ remaining: 2, total: 2, source: 'worker-session' }),
    });
    expect(readRows).toHaveBeenCalledOnce();
    expect(feedbackRuntime.reviewFeedback).not.toHaveBeenCalled();
  });
});
