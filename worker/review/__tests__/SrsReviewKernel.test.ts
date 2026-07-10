import { describe, expect, it, vi } from 'vitest';
import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import { WorkerReviewSessionRuntime } from '../WorkerReviewSessionRuntime';
import { WorkerSrsReviewKernel } from '../SrsReviewKernel';

const NOW = 1_779_300_000_000;
const ADMITTED_PROJECTION = {
  projectionPolicyHash: 'retrieval-policy',
  projectionGeneration: 7,
} as const;

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

function createKernel(cards: FSRSCard[], options: {
  reviewFeedbackError?: string;
} = {}) {
  const cardsById = new Map(cards.map((card) => [card.id, card] as const));
  const readRows = vi.fn(() => cards.map((card, index) => createProjectionRow(card, index + 1)));
  const reviewFeedback = vi.fn(async (request: {
    cardId: string;
    rating: 1 | 2 | 3 | 4;
    idempotencyKey?: string | null;
  }) => {
    if (options.reviewFeedbackError) {
      throw new Error(options.reviewFeedbackError);
    }
    return {
      cardId: request.cardId,
      committed: true,
      reviewedAt: NOW,
      queueType: QueueType.RetrievalPractice,
      updatedCard: { ...cardsById.get(request.cardId), reps: (cardsById.get(request.cardId)?.reps ?? 0) + 1 },
      idempotencyKey: request.idempotencyKey ?? `feedback-${request.cardId}`,
      duplicate: false,
      undoJournalPersisted: true,
      queueImpact: {
        hotPatchable: false,
        refreshRequired: false,
        affectedQueues: [],
      },
    };
  });
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
    kernel: new WorkerSrsReviewKernel(sessionRuntime),
    readRows,
    reviewFeedback,
  };
}

describe('SrsReviewKernel', () => {
  it('routes session start and current reads through the two-entry kernel interface', async () => {
    const first = createCard('card-1');
    const { kernel, readRows } = createKernel([first]);

    const started = await kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.RetrievalPractice,
        ...ADMITTED_PROJECTION,
      },
    });

    expect(started).toMatchObject({
      type: 'start',
      state: {
        current: { id: first.id },
        counters: { remaining: 1, source: 'worker-session' },
      },
    });

    const current = kernel.read({
      type: 'current',
      sessionId: started.state.sessionId,
    });

    expect(current).toMatchObject({
      type: 'current',
      state: {
        sessionId: started.state.sessionId,
        current: { id: first.id },
      },
    });
    expect(readRows).toHaveBeenCalledOnce();
  });

  it('returns one normalized receipt for an authoritative answer command', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const started = await kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.RetrievalPractice,
        ...ADMITTED_PROJECTION,
      },
    });
    const answered = await kernel.execute({
      type: 'answer',
      request: {
        sessionId: started.state.sessionId,
        cardId: first.id,
        rating: 3,
        reviewedAt: NOW,
        repairGate: {
          state: 'clean',
          reason: 'kernel-contract',
          createdAt: NOW,
          cardId: first.id,
        },
      },
    });

    expect(answered).toMatchObject({
      type: 'answer',
      state: {
        sessionId: started.state.sessionId,
        current: { id: second.id },
        lookaheadCards: [],
        counters: { remaining: 1, total: 1, source: 'worker-session' },
        projectionState: 'ready',
        projectionGeneration: ADMITTED_PROJECTION.projectionGeneration,
        projectionPolicyHash: ADMITTED_PROJECTION.projectionPolicyHash,
      },
      receipt: {
        answeredCardId: first.id,
        commit: {
          outcome: 'committed',
          updatedCard: { id: first.id, reps: first.reps + 1 },
          duplicate: false,
        },
        factIdentity: {
          kind: 'idempotency-key',
          idempotencyKey: `feedback-${first.id}`,
        },
        durability: {
          status: 'durable',
          evidence: 'worker-commit',
        },
        undo: {
          token: expect.any(String),
          evidence: 'transaction-journal',
        },
        queueImpact: {
          hotPatchable: false,
          refreshRequired: false,
          affectedQueues: [],
        },
        diagnostics: {
          authority: 'worker-review-session',
          projectionState: 'ready',
          storageSummaryAvailable: false,
        },
      },
    });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).toHaveBeenCalledOnce();
  });

  it('returns a typed invalid outcome before dispatching an invalid rating', async () => {
    const first = createCard('card-1');
    const { kernel, reviewFeedback } = createKernel([first]);
    const started = await kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.RetrievalPractice,
        ...ADMITTED_PROJECTION,
      },
    });

    const result = await kernel.execute({
      type: 'answer',
      request: {
        sessionId: started.state.sessionId,
        cardId: first.id,
        rating: 9 as 3,
        repairGate: {
          state: 'clean',
          reason: 'kernel-contract',
          createdAt: NOW,
          cardId: first.id,
        },
      },
    });

    expect(result).toMatchObject({
      type: 'failure',
      command: 'answer',
      error: {
        kind: 'invalid',
        code: 'INVALID_RATING',
      },
      diagnostics: {
        authority: 'worker-review-session',
      },
    });
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('returns typed conflicts for stale current and projection identities', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, reviewFeedback, readRows } = createKernel([first, second]);
    const staleProjection = await kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.RetrievalPractice,
        projectionGeneration: 7,
      },
    });
    expect(staleProjection).toMatchObject({
      type: 'failure',
      command: 'start',
      error: {
        kind: 'conflict',
        code: 'STALE_PROJECTION_IDENTITY',
      },
    });
    expect(readRows).not.toHaveBeenCalled();

    const started = await kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.RetrievalPractice,
        ...ADMITTED_PROJECTION,
      },
    });
    const staleCurrent = await kernel.execute({
      type: 'answer',
      request: {
        sessionId: started.state.sessionId,
        cardId: second.id,
        rating: 3,
        repairGate: {
          state: 'clean',
          reason: 'kernel-contract',
          createdAt: NOW,
          cardId: second.id,
        },
      },
    });
    expect(staleCurrent).toMatchObject({
      type: 'failure',
      command: 'answer',
      error: {
        kind: 'conflict',
        code: 'STALE_CURRENT_TARGET',
      },
      diagnostics: {
        sessionId: started.state.sessionId,
        cardId: second.id,
      },
    });
    const current = kernel.read({ type: 'current', sessionId: started.state.sessionId });
    expect(current).toMatchObject({ type: 'current', state: { current: { id: first.id } } });
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('returns a typed conflict for stale Review Admission repair evidence', async () => {
    const first = createCard('card-1');
    const { kernel, reviewFeedback } = createKernel([first]);
    const started = await kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.RetrievalPractice,
        ...ADMITTED_PROJECTION,
      },
    });

    const result = await kernel.execute({
      type: 'answer',
      request: {
        sessionId: started.state.sessionId,
        cardId: first.id,
        rating: 3,
        repairGate: {
          state: 'clean',
          reason: 'stale-admission',
          createdAt: 0,
          cardId: first.id,
        },
      },
    });

    expect(result).toMatchObject({
      type: 'failure',
      command: 'answer',
      error: {
        kind: 'conflict',
        code: 'STALE_REPAIR_GATE',
      },
    });
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('returns typed unsupported, not-found, unavailable, and idempotency conflict outcomes', async () => {
    const first = createCard('card-1');
    const unsupported = await createKernel([first]).kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.FinalDrill,
      },
    });
    expect(unsupported).toMatchObject({
      type: 'failure',
      error: { kind: 'unavailable', code: 'UNSUPPORTED_QUEUE_MODE' },
    });

    const missingSession = await createKernel([first]).kernel.execute({
      type: 'answer',
      request: {
        sessionId: 'missing-session',
        cardId: first.id,
        rating: 3,
        repairGate: {
          state: 'clean',
          reason: 'kernel-contract',
          createdAt: NOW,
          cardId: first.id,
        },
      },
    });
    expect(missingSession).toMatchObject({
      type: 'failure',
      error: { kind: 'not-found', code: 'REVIEW_TARGET_NOT_FOUND' },
    });

    for (const scenario of [
      {
        message: 'BACKEND_UNAVAILABLE: writer authority required',
        kind: 'unavailable',
        code: 'REVIEW_RUNTIME_UNAVAILABLE',
      },
      {
        message: 'review.feedback card not found: card-1',
        kind: 'not-found',
        code: 'REVIEW_TARGET_NOT_FOUND',
      },
      {
        message: 'INVALID_REQUEST: conflicting review commit idempotency key: duplicate-key',
        kind: 'conflict',
        code: 'IDEMPOTENCY_CONFLICT',
      },
    ] as const) {
      const { kernel } = createKernel([first], { reviewFeedbackError: scenario.message });
      const started = await kernel.execute({
        type: 'start',
        request: {
          queueType: QueueType.RetrievalPractice,
          ...ADMITTED_PROJECTION,
        },
      });
      const result = await kernel.execute({
        type: 'answer',
        request: {
          sessionId: started.state.sessionId,
          cardId: first.id,
          rating: 3,
          idempotencyKey: 'duplicate-key',
          repairGate: {
            state: 'clean',
            reason: 'kernel-contract',
            createdAt: NOW,
            cardId: first.id,
          },
        },
      });
      expect(result).toMatchObject({
        type: 'failure',
        error: {
          kind: scenario.kind,
          code: scenario.code,
        },
      });
    }
  });

  it('replays a compatible answer result without committing or advancing twice', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, reviewFeedback } = createKernel([first, second]);
    const started = await kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.RetrievalPractice,
        ...ADMITTED_PROJECTION,
      },
    });
    const command = {
      type: 'answer' as const,
      request: {
        sessionId: started.state.sessionId,
        cardId: first.id,
        rating: 3 as const,
        reviewedAt: NOW,
        idempotencyKey: 'kernel-answer-duplicate',
        repairGate: {
          state: 'clean' as const,
          reason: 'kernel-contract',
          createdAt: NOW,
          cardId: first.id,
        },
      },
    };

    const firstResult = await kernel.execute(command);
    const duplicateResult = await kernel.execute(command);

    expect(duplicateResult).toEqual(firstResult);
    expect(duplicateResult).toMatchObject({
      type: 'answer',
      state: {
        current: { id: second.id },
        counters: { remaining: 1, total: 1 },
      },
    });
    expect(reviewFeedback).toHaveBeenCalledOnce();
    expect(kernel.read({ type: 'current', sessionId: started.state.sessionId })).toMatchObject({
      type: 'current',
      state: {
        current: { id: second.id },
        counters: { remaining: 1, total: 1 },
      },
    });
  });

  it('rejects incompatible reuse of a committed answer idempotency key', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, reviewFeedback } = createKernel([first, second]);
    const started = await kernel.execute({
      type: 'start',
      request: {
        queueType: QueueType.RetrievalPractice,
        ...ADMITTED_PROJECTION,
      },
    });
    const request = {
      sessionId: started.state.sessionId,
      cardId: first.id,
      rating: 3 as const,
      idempotencyKey: 'kernel-answer-conflict',
      repairGate: {
        state: 'clean' as const,
        reason: 'kernel-contract',
        createdAt: NOW,
        cardId: first.id,
      },
    };

    expect(await kernel.execute({ type: 'answer', request })).toMatchObject({
      type: 'answer',
      receipt: {
        factIdentity: {
          kind: 'idempotency-key',
          idempotencyKey: request.idempotencyKey,
        },
      },
    });
    expect(await kernel.execute({
      type: 'answer',
      request: {
        ...request,
        rating: 4,
      },
    })).toMatchObject({
      type: 'failure',
      error: {
        kind: 'conflict',
        code: 'IDEMPOTENCY_CONFLICT',
      },
    });
    expect(reviewFeedback).toHaveBeenCalledOnce();
  });

  it('answers from kernel session state without rereading Browser projection rows', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const startedResult = await kernel.execute({
      type: 'start',
      request: { queueType: QueueType.RetrievalPractice, ...ADMITTED_PROJECTION },
    });
    expect(startedResult.type).toBe('start');
    if (startedResult.type !== 'start') throw new Error('expected start result');
    const started = startedResult.state;
    expect(started.current?.id).toBe(first.id);
    expect(kernel.read({ type: 'current', sessionId: started.sessionId })).toMatchObject({
      type: 'current',
      state: {
        counters: { remaining: 2, source: 'worker-session' },
        lookaheadCards: [expect.objectContaining({ id: second.id })],
      },
    });

    const result = await kernel.execute({
      type: 'answer',
      request: {
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
      },
    });

    expect(result).toMatchObject({
      type: 'answer',
      state: {
        current: { id: second.id },
        counters: { remaining: 1, total: 1, source: 'worker-session' },
      },
    });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).toHaveBeenCalledOnce();
  });

  it('skips from kernel session state without committing review feedback', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const startedResult = await kernel.execute({
      type: 'start',
      request: { queueType: QueueType.RetrievalPractice, ...ADMITTED_PROJECTION },
    });
    if (startedResult.type !== 'start') throw new Error('expected start result');
    const started = startedResult.state;
    const skipped = await kernel.execute({
      type: 'skip',
      request: {
        sessionId: started.sessionId,
        cardId: first.id,
      },
    });

    expect(skipped).toMatchObject({
      type: 'skip',
      state: {
        current: { id: second.id },
        counters: { remaining: 2, total: 2, source: 'worker-session' },
      },
    });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('fails closed when kernel session authority is unavailable', async () => {
    const first = createCard('card-1');
    const { kernel, readRows, reviewFeedback } = createKernel([first]);

    await expect(kernel.execute({
      type: 'answer',
      request: {
        sessionId: 'missing-session',
        cardId: first.id,
        rating: 3,
        repairGate: {
          state: 'clean',
          reason: 'kernel-contract',
          createdAt: NOW,
          cardId: first.id,
        },
      },
    })).resolves.toMatchObject({
      type: 'failure',
      error: {
        kind: 'not-found',
        code: 'REVIEW_TARGET_NOT_FOUND',
      },
    });

    expect(readRows).not.toHaveBeenCalled();
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('restores answered current card from kernel-owned undo journal evidence', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const startedResult = await kernel.execute({
      type: 'start',
      request: { queueType: QueueType.RetrievalPractice, ...ADMITTED_PROJECTION },
    });
    if (startedResult.type !== 'start') throw new Error('expected start result');
    const started = startedResult.state;
    const answered = await kernel.execute({
      type: 'answer',
      request: {
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
      },
    });
    if (answered.type !== 'answer') throw new Error('expected answer result');
    expect(answered.state.current?.id).toBe(second.id);
    expect(answered.receipt.undo.token).toBeTruthy();

    const undone = await kernel.execute({
      type: 'undo',
      request: {
        sessionId: started.sessionId,
        undoToken: answered.receipt.undo.token,
      },
    });

    expect(undone).toMatchObject({
      type: 'undo',
      state: {
        restoredCardId: first.id,
        replayedCardId: first.id,
        current: { id: first.id },
        lookaheadCards: [expect.objectContaining({ id: second.id })],
        counters: { remaining: 2, source: 'worker-session' },
      },
    });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).toHaveBeenCalledOnce();
  });

  it('restores skipped current card from kernel-owned undo journal evidence', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const { kernel, readRows, reviewFeedback } = createKernel([first, second]);

    const startedResult = await kernel.execute({
      type: 'start',
      request: { queueType: QueueType.RetrievalPractice, ...ADMITTED_PROJECTION },
    });
    if (startedResult.type !== 'start') throw new Error('expected start result');
    const started = startedResult.state;
    const skipped = await kernel.execute({
      type: 'skip',
      request: {
        sessionId: started.sessionId,
        cardId: first.id,
      },
    });
    if (skipped.type !== 'skip') throw new Error('expected skip result');
    expect(skipped.state.current?.id).toBe(second.id);
    expect(skipped.state.undoToken).toBeTruthy();

    const undone = await kernel.execute({
      type: 'undo',
      request: {
        sessionId: started.sessionId,
        undoToken: skipped.state.undoToken,
      },
    });

    expect(undone).toMatchObject({
      type: 'undo',
      state: {
        restoredCardId: first.id,
        current: { id: first.id },
        lookaheadCards: [expect.objectContaining({ id: second.id })],
        counters: { remaining: 2, source: 'worker-session' },
      },
    });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('fails closed when kernel undo journal has no matching evidence', async () => {
    const first = createCard('card-1');
    const { kernel } = createKernel([first]);

    const startedResult = await kernel.execute({
      type: 'start',
      request: { queueType: QueueType.RetrievalPractice, ...ADMITTED_PROJECTION },
    });
    if (startedResult.type !== 'start') throw new Error('expected start result');
    const started = startedResult.state;

    await expect(kernel.execute({
      type: 'undo',
      request: { sessionId: started.sessionId },
    })).resolves.toMatchObject({
      type: 'failure',
      error: {
        kind: 'unavailable',
        code: 'REVIEW_RUNTIME_UNAVAILABLE',
      },
    });
  });
});
