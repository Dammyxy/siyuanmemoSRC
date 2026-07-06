import { describe, expect, it, vi } from 'vitest';
import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import { WorkerReviewSessionRuntime } from '../WorkerReviewSessionRuntime';
import { WorkerSrsReviewKernelAdapter } from '../SrsReviewKernel';

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

function createKernel(cards: FSRSCard[]) {
  const cardsById = new Map(cards.map((card) => [card.id, card] as const));
  const readRows = vi.fn(() => cards.map((card, index) => createProjectionRow(card, index + 1)));
  const reviewFeedback = vi.fn(async (request: { cardId: string; rating: 1 | 2 | 3 | 4 }) => ({
    cardId: request.cardId,
    committed: true,
    reviewedAt: NOW,
    queueType: QueueType.RetrievalPractice,
    updatedCard: { ...cardsById.get(request.cardId), reps: (cardsById.get(request.cardId)?.reps ?? 0) + 1 },
    idempotencyKey: `feedback-${request.cardId}`,
    queueImpact: {
      hotPatchable: false,
      refreshRequired: false,
      affectedQueues: [],
    },
  }));
  const sessionRuntime = new WorkerReviewSessionRuntime({
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
    feedbackRuntime: {
      reviewFeedback,
    },
  });
  return {
    kernel: new WorkerSrsReviewKernelAdapter(sessionRuntime),
    readRows,
    reviewFeedback,
  };
}

describe('SrsReviewKernel', () => {
  it('answers from kernel session state without rereading Browser projection rows', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const started = await kernel.startSession({ queueType: QueueType.RetrievalPractice });
    expect(started.current?.id).toBe(first.id);
    expect(kernel.counters(started.sessionId)).toMatchObject({ remaining: 2, source: 'worker-session' });
    expect(kernel.lookahead(started.sessionId)).toEqual([expect.objectContaining({ id: second.id })]);

    const result = await kernel.answer({
      sessionId: started.sessionId,
      cardId: first.id,
      rating: 3,
      reviewedAt: NOW,
      repairGate: {
        state: 'clean',
        reason: 'kernel-contract',
        createdAt: NOW,
        cardId: first.id,
      },
    });

    expect(result.current?.id).toBe(second.id);
    expect(result.counters).toMatchObject({ remaining: 1, total: 1, source: 'worker-session' });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).toHaveBeenCalledOnce();
  });

  it('skips from kernel session state without committing review feedback', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const started = await kernel.startSession({ queueType: QueueType.RetrievalPractice });
    const skipped = kernel.skip({
      sessionId: started.sessionId,
      cardId: first.id,
    });

    expect(skipped.current?.id).toBe(second.id);
    expect(skipped.counters).toMatchObject({ remaining: 2, total: 2, source: 'worker-session' });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('fails closed when kernel session authority is unavailable', async () => {
    const first = createCard('card-1');
    const { kernel, readRows, reviewFeedback } = createKernel([first]);

    await expect(kernel.answer({
      sessionId: 'missing-session',
      cardId: first.id,
      rating: 3,
      repairGate: {
        state: 'clean',
        reason: 'kernel-contract',
        createdAt: NOW,
        cardId: first.id,
      },
    })).rejects.toThrow('WORKER_REVIEW_SESSION_UNAVAILABLE: missing-session');

    expect(readRows).not.toHaveBeenCalled();
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('restores answered current card from kernel-owned undo journal evidence', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const started = await kernel.startSession({ queueType: QueueType.RetrievalPractice });
    const answered = await kernel.answer({
      sessionId: started.sessionId,
      cardId: first.id,
      rating: 3,
      reviewedAt: NOW,
      repairGate: {
        state: 'clean',
        reason: 'kernel-contract',
        createdAt: NOW,
        cardId: first.id,
      },
    });
    expect(answered.current?.id).toBe(second.id);
    expect(answered.undoToken).toBeTruthy();

    const undone = kernel.undo({
      sessionId: started.sessionId,
      undoToken: answered.undoToken,
    });

    expect(undone.restoredCardId).toBe(first.id);
    expect(undone.replayedCardId).toBe(first.id);
    expect(undone.current?.id).toBe(first.id);
    expect(undone.lookaheadCards).toEqual([expect.objectContaining({ id: second.id })]);
    expect(undone.counters).toMatchObject({ remaining: 2, source: 'worker-session' });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).toHaveBeenCalledOnce();
  });

  it('restores skipped current card from kernel-owned undo journal evidence', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const started = await kernel.startSession({ queueType: QueueType.RetrievalPractice });
    const skipped = kernel.skip({
      sessionId: started.sessionId,
      cardId: first.id,
    });
    expect(skipped.current?.id).toBe(second.id);
    expect(skipped.undoToken).toBeTruthy();

    const undone = kernel.undo({
      sessionId: started.sessionId,
      undoToken: skipped.undoToken,
    });

    expect(undone.restoredCardId).toBe(first.id);
    expect(undone.current?.id).toBe(first.id);
    expect(undone.lookaheadCards).toEqual([expect.objectContaining({ id: second.id })]);
    expect(undone.counters).toMatchObject({ remaining: 2, source: 'worker-session' });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('fails closed when kernel undo journal has no matching evidence', async () => {
    const first = createCard('card-1');
    const { kernel } = createKernel([first]);

    const started = await kernel.startSession({ queueType: QueueType.RetrievalPractice });

    expect(() => kernel.undo({ sessionId: started.sessionId })).toThrow(
      `WORKER_REVIEW_SESSION_UNDO_UNAVAILABLE: ${started.sessionId}`,
    );
  });
});
