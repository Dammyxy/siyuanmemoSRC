import { describe, expect, it, vi } from 'vitest';
import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import {
  beginBackendWorkerTiming,
  endBackendWorkerRequest,
} from '../../bootstrap/ReviewFeedbackTimingScope';
import {
  InMemoryReviewTransactionUndoJournal,
  type ReviewTransactionUndoJournalEntry,
} from '../ReviewTransactionUndoJournal';
import { WorkerReviewSessionRuntime } from '../WorkerReviewSessionRuntime';

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

function createCompactUndoEntry(
  current: FSRSCard,
  queued: FSRSCard[],
  overrides: Partial<ReviewTransactionUndoJournalEntry> = {},
): ReviewTransactionUndoJournalEntry {
  return {
    schemaVersion: 2,
    transactionId: 'transaction-compact',
    undoToken: 'undo-compact',
    sessionId: 'session-compact',
    queueType: QueueType.RetrievalPractice,
    operation: 'answer',
    cardId: current.id,
    replayedCardId: current.id,
    originalReviewIdempotencyKey: 'review-compact',
    beforeCard: current,
    afterCard: { ...current, reps: current.reps + 1 },
    frontierBefore: {
      cardIds: queued.map((card) => card.id),
      currentCardId: current.id,
      currentBlockId: current.blockId,
      avoidOnceCardId: null,
      avoidOnceBlockId: null,
      projectionGeneration: 7,
      projectionPolicyHash: 'retrieval-policy',
    },
    frontierAfter: {
      cardIds: [],
      currentCardId: queued[0]?.id ?? null,
      currentBlockId: queued[0]?.blockId ?? null,
      avoidOnceCardId: current.id,
      avoidOnceBlockId: current.blockId,
      projectionGeneration: 7,
      projectionPolicyHash: 'retrieval-policy',
    },
    queueImpact: null,
    projectionGeneration: 7,
    projectionPolicyHash: 'retrieval-policy',
    recordedAt: NOW,
    status: 'open',
    undoneAt: null,
    ...overrides,
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
      ...ADMITTED_PROJECTION,
    });

    expect(started.current?.id).toBe(first.id);
    expect(started.counters).toMatchObject({ remaining: 2, source: 'worker-session' });
    expect(readRows).toHaveBeenCalledOnce();
    expect(runtime['deps'].queueProjection?.readGeneration).not.toHaveBeenCalled();

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

  it('fails closed when projection-backed review starts without admission identity', async () => {
    const readGeneration = vi.fn();
    const readRows = vi.fn();
    const runtime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: vi.fn(() => null),
      },
      queueProjection: {
        readGeneration,
        readRows,
      },
      feedbackRuntime: {
        reviewFeedback: vi.fn(),
      },
    });

    await expect(runtime.startSession({
      sessionId: 'session-without-admission',
      queueType: QueueType.RetrievalPractice,
    })).rejects.toThrow('REVIEW_ADMISSION_UNAVAILABLE');

    expect(readGeneration).not.toHaveBeenCalled();
    expect(readRows).not.toHaveBeenCalled();
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
      ...ADMITTED_PROJECTION,
    });
    const skipped = await runtime.skip({
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

  it('persists skip undo evidence as ordered identities without frontier card objects', async () => {
    const first = createCard('card-skip-1');
    const second = createCard('card-skip-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const appended: ReviewTransactionUndoJournalEntry[] = [];
    const runtime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: vi.fn((cardId: string) => cardsById.get(cardId) ?? null),
      },
      queueProjection: {
        readGeneration: vi.fn(),
        readRows: vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]),
      },
      feedbackRuntime: {
        reviewFeedback: vi.fn(),
      },
      undoJournal: {
        append: vi.fn(async (entry) => {
          appended.push(entry);
        }),
        consume: vi.fn(() => null),
      },
    });
    const started = await runtime.startSession({
      sessionId: 'session-compact-skip',
      queueType: QueueType.RetrievalPractice,
      ...ADMITTED_PROJECTION,
    });

    await runtime.skip({ sessionId: started.sessionId, cardId: first.id });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      schemaVersion: 2,
      operation: 'skip',
      frontierBefore: {
        cardIds: [second.id],
        currentCardId: first.id,
        currentBlockId: first.blockId,
      },
      frontierAfter: {
        cardIds: [first.id],
        currentCardId: second.id,
        currentBlockId: second.blockId,
      },
    });
    expect(appended[0].frontierBefore).not.toHaveProperty('cards');
    expect(appended[0].frontierAfter).not.toHaveProperty('current');
  });

  it('restores answer schedule and frontier from durable undo journal after runtime restart', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const readRows = vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]);
    const undoJournal = new InMemoryReviewTransactionUndoJournal();
    const repository = {
      getCard: vi.fn((cardId: string) => cardsById.get(cardId) ?? null),
      upsertCards: vi.fn((cards: FSRSCard[]) => {
        for (const card of cards) {
          cardsById.set(card.id, { ...card });
        }
      }),
    };
    const feedbackRuntime = {
      reviewFeedback: vi.fn(async (request) => {
        const updatedCard = { ...first, reps: first.reps + 1, due: NOW + 86_400_000, lastReview: NOW };
        cardsById.set(first.id, updatedCard);
        if (request.transactionUndoJournalEntry) {
          await undoJournal.append({
            ...request.transactionUndoJournalEntry,
            afterCard: updatedCard,
          });
        }
        return {
          cardId: first.id,
          committed: true,
          reviewedAt: NOW,
          queueType: QueueType.RetrievalPractice,
          updatedCard,
          idempotencyKey: 'feedback-key',
          queueImpact: {
            hotPatchable: false,
            refreshRequired: false,
            affectedQueues: [],
          },
        };
      }),
    };
    const createRuntime = () => new WorkerReviewSessionRuntime({
      repository,
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
      undoJournal,
    });

    const runtime = createRuntime();
    const started = await runtime.startSession({
      sessionId: 'session-restart',
      queueType: QueueType.RetrievalPractice,
      ...ADMITTED_PROJECTION,
    });
    const answered = await runtime.feedback({
      sessionId: started.sessionId,
      cardId: first.id,
      rating: 3,
      reviewedAt: NOW,
      idempotencyKey: 'feedback-key',
    });
    expect(cardsById.get(first.id)).toMatchObject({ reps: first.reps + 1, lastReview: NOW });

    repository.getCard.mockClear();
    const restarted = createRuntime();
    const undone = await restarted.undo({
      sessionId: started.sessionId,
      undoToken: answered.undoToken,
    });

    expect(undone).toMatchObject({
      restoredCardId: first.id,
      replayedCardId: first.id,
      current: expect.objectContaining({ id: first.id }),
      lookaheadCards: [expect.objectContaining({ id: second.id })],
      counters: expect.objectContaining({ remaining: 2, source: 'worker-session' }),
    });
    expect(cardsById.get(first.id)).toMatchObject({ reps: first.reps, lastReview: first.lastReview, due: first.due });
    expect(repository.upsertCards).toHaveBeenCalledWith([expect.objectContaining({ id: first.id, reps: first.reps })]);
    expect(repository.getCard.mock.calls.map(([cardId]) => cardId)).toEqual([second.id, first.id]);
  });

  it('fails closed without installing a partial restarted session when a frontier card is missing', async () => {
    const current = createCard('card-missing-current');
    const missing = createCard('card-missing-next', 1_000);
    const cardsById = new Map([[current.id, current]]);
    const runtime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: vi.fn((cardId: string) => cardsById.get(cardId) ?? null),
      },
      queueProjection: null,
      feedbackRuntime: { reviewFeedback: vi.fn() },
      undoJournal: {
        append: vi.fn(),
        consume: vi.fn(() => ({
          ...createCompactUndoEntry(current, [missing]),
          scheduleRestoreApplied: true,
        })),
      },
    });

    await expect(runtime.undo({
      sessionId: 'session-compact',
      undoToken: 'undo-compact',
    })).rejects.toThrow('WORKER_REVIEW_SESSION_UNDO_FRONTIER_INVALID: missing card card-missing-next');
    expect(() => runtime.getSessionState('session-compact'))
      .toThrow('WORKER_REVIEW_SESSION_UNAVAILABLE: session-compact');
  });

  it('fails closed when the hydrated current card block identity differs from the journal', async () => {
    const recorded = createCard('card-block-mismatch');
    const stored = { ...recorded, blockId: 'block-different' };
    const runtime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: vi.fn(() => stored),
      },
      queueProjection: null,
      feedbackRuntime: { reviewFeedback: vi.fn() },
      undoJournal: {
        append: vi.fn(),
        consume: vi.fn(() => ({
          ...createCompactUndoEntry(recorded, []),
          scheduleRestoreApplied: true,
        })),
      },
    });

    await expect(runtime.undo({
      sessionId: 'session-compact',
      undoToken: 'undo-compact',
    })).rejects.toThrow('WORKER_REVIEW_SESSION_UNDO_FRONTIER_INVALID: current block mismatch');
    expect(() => runtime.getSessionState('session-compact'))
      .toThrow('WORKER_REVIEW_SESSION_UNAVAILABLE: session-compact');
  });

  it('treats duplicate undo requests for the same durable token as idempotent', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const undoJournal = new InMemoryReviewTransactionUndoJournal();
    const repository = {
      getCard: vi.fn((cardId: string) => cardsById.get(cardId) ?? null),
      upsertCards: vi.fn((cards: FSRSCard[]) => {
        for (const card of cards) {
          cardsById.set(card.id, { ...card });
        }
      }),
    };
    const feedbackRuntime = {
      reviewFeedback: vi.fn(async (request) => {
        const updatedCard = { ...first, reps: first.reps + 1, due: NOW + 86_400_000, lastReview: NOW };
        cardsById.set(first.id, updatedCard);
        if (request.transactionUndoJournalEntry) {
          await undoJournal.append({
            ...request.transactionUndoJournalEntry,
            afterCard: updatedCard,
          });
        }
        return {
          cardId: first.id,
          committed: true,
          reviewedAt: NOW,
          queueType: QueueType.RetrievalPractice,
          updatedCard,
          idempotencyKey: 'feedback-key',
          queueImpact: {
            hotPatchable: false,
            refreshRequired: false,
            affectedQueues: [],
          },
        };
      }),
    };
    const runtime = new WorkerReviewSessionRuntime({
      repository,
      queueProjection: {
        readGeneration: vi.fn(() => ({
          queueType: QueueType.RetrievalPractice,
          policyHash: 'retrieval-policy',
          generation: 7,
          status: 'ready',
        })),
        readRows: vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]),
      },
      feedbackRuntime,
      undoJournal,
    });

    const started = await runtime.startSession({
      sessionId: 'session-duplicate-undo',
      queueType: QueueType.RetrievalPractice,
      ...ADMITTED_PROJECTION,
    });
    const answered = await runtime.feedback({
      sessionId: started.sessionId,
      cardId: first.id,
      rating: 3,
      reviewedAt: NOW,
      idempotencyKey: 'feedback-key',
    });

    const firstUndo = await runtime.undo({
      sessionId: started.sessionId,
      undoToken: answered.undoToken,
    });
    const secondUndo = await runtime.undo({
      sessionId: started.sessionId,
      undoToken: answered.undoToken,
    });

    expect(firstUndo).toMatchObject({
      restoredCardId: first.id,
      undoToken: answered.undoToken,
      counters: expect.objectContaining({ remaining: 2, source: 'worker-session' }),
    });
    expect(secondUndo).toMatchObject({
      restoredCardId: first.id,
      undoToken: answered.undoToken,
      counters: expect.objectContaining({ remaining: 2, source: 'worker-session' }),
    });
    expect(repository.upsertCards).toHaveBeenCalledTimes(1);
    expect(cardsById.get(first.id)).toMatchObject({ reps: first.reps, lastReview: first.lastReview, due: first.due });
  });

  it('fails closed instead of using in-memory rollback when durable undo journal evidence is missing', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const readRows = vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]);
    const undoJournal = new InMemoryReviewTransactionUndoJournal();
    const feedbackRuntime = {
      reviewFeedback: vi.fn(async () => ({
        cardId: first.id,
        committed: true,
        reviewedAt: NOW,
        queueType: QueueType.RetrievalPractice,
        updatedCard: { ...first, reps: first.reps + 1 },
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
        upsertCards: vi.fn(),
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
      undoJournal,
    });

    const started = await runtime.startSession({
      sessionId: 'session-missing-evidence',
      queueType: QueueType.RetrievalPractice,
      ...ADMITTED_PROJECTION,
    });
    await runtime.feedback({
      sessionId: started.sessionId,
      cardId: first.id,
      rating: 3,
      reviewedAt: NOW,
      idempotencyKey: 'feedback-key',
    });

    await expect(runtime.undo({
      sessionId: started.sessionId,
      undoToken: 'missing-durable-token',
    })).rejects.toThrow('WORKER_REVIEW_SESSION_UNDO_UNAVAILABLE: session-missing-evidence');
    expect(runtime.getSessionState(started.sessionId).current?.id).toBe(second.id);
  });

  it('passes answer undo evidence into feedback and avoids a separate session append', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const timing = beginBackendWorkerTiming('review.session.feedback', first.id, {
      queueType: QueueType.RetrievalPractice,
    });
    const undoJournal = {
      append: vi.fn(async () => undefined),
      consume: vi.fn(() => null),
    };
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
        readRows: vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]),
      },
      feedbackRuntime,
      undoJournal,
    });

    try {
      const started = await runtime.startSession({
        sessionId: 'session-slow-undo-journal',
        queueType: QueueType.RetrievalPractice,
        ...ADMITTED_PROJECTION,
      });

      await runtime.feedback({
        sessionId: started.sessionId,
        cardId: first.id,
        rating: 3,
        reviewedAt: NOW,
        idempotencyKey: 'feedback-key',
      });

      expect(undoJournal.append).not.toHaveBeenCalled();
      expect(feedbackRuntime.reviewFeedback).toHaveBeenCalledWith(expect.objectContaining({
        transactionUndoJournalEntry: expect.objectContaining({
          undoToken: expect.stringContaining('worker-review-session-undo:session-slow-undo-journal:'),
          operation: 'answer',
          cardId: first.id,
          beforeCard: expect.objectContaining({ id: first.id }),
          frontierBefore: expect.objectContaining({
            cardIds: [second.id],
            currentCardId: first.id,
            currentBlockId: first.blockId,
          }),
          frontierAfter: expect.objectContaining({
            cardIds: [],
            currentCardId: second.id,
            currentBlockId: second.blockId,
          }),
        }),
      }));
      expect(timing.innerSteps.some((step) => step.step === 'session-feedback-undo-journal-append')).toBe(false);
    } finally {
      endBackendWorkerRequest(timing);
    }
  });

  it('keeps a representative 113-card answer undo payload compact', async () => {
    const cards = Array.from({ length: 113 }, (_, index) => ({
      ...createCard(`card-budget-${String(index + 1).padStart(3, '0')}`, index * 1_000),
      meta: {
        representativeContent: 'x'.repeat(900),
      },
    }));
    const cardsById = new Map(cards.map((card) => [card.id, card] as const));
    let persistedEntry: ReviewTransactionUndoJournalEntry | null = null;
    const runtime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: vi.fn((cardId: string) => cardsById.get(cardId) ?? null),
      },
      queueProjection: {
        readGeneration: vi.fn(),
        readRows: vi.fn(() => cards.map(createProjectionRow)),
      },
      feedbackRuntime: {
        reviewFeedback: vi.fn(async (request) => {
          const updatedCard = { ...cards[0], reps: cards[0].reps + 1 };
          persistedEntry = request.transactionUndoJournalEntry
            ? { ...request.transactionUndoJournalEntry, afterCard: updatedCard }
            : null;
          return {
            cardId: cards[0].id,
            committed: true,
            reviewedAt: NOW,
            queueType: QueueType.RetrievalPractice,
            updatedCard,
            queueImpact: null,
          };
        }),
      },
      undoJournal: {
        append: vi.fn(),
        consume: vi.fn(() => null),
      },
    });
    const started = await runtime.startSession({
      sessionId: 'session-budget',
      queueType: QueueType.RetrievalPractice,
      ...ADMITTED_PROJECTION,
    });

    await runtime.feedback({
      sessionId: started.sessionId,
      cardId: cards[0].id,
      rating: 3,
      reviewedAt: NOW,
      idempotencyKey: 'review-budget',
    });

    expect(persistedEntry).toMatchObject({
      schemaVersion: 2,
      beforeCard: expect.objectContaining({ id: cards[0].id }),
      afterCard: expect.objectContaining({ id: cards[0].id }),
      frontierBefore: {
        cardIds: cards.slice(1).map((card) => card.id),
        currentCardId: cards[0].id,
      },
    });
    expect(persistedEntry?.frontierBefore).not.toHaveProperty('cards');
    expect(persistedEntry?.frontierAfter).not.toHaveProperty('current');
    expect(new TextEncoder().encode(JSON.stringify(persistedEntry)).byteLength).toBeLessThan(32 * 1024);
  });

  it('flushes sub-threshold session steps and unattributed gap when feedback total is slow', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const timing = beginBackendWorkerTiming('review.session.feedback', first.id, {
      queueType: QueueType.RetrievalPractice,
    });
    const undoJournal = {
      append: vi.fn(async () => undefined),
      consume: vi.fn(() => null),
    };
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
        readRows: vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]),
      },
      feedbackRuntime,
      undoJournal,
    });

    const started = await runtime.startSession({
      sessionId: 'session-slow-gap',
      queueType: QueueType.RetrievalPractice,
      ...ADMITTED_PROJECTION,
    });
    const dateNow = vi.spyOn(Date, 'now');
    const nowSequence = [
      1_000, 1_000, 1_000, 1_000, 1_050, 1_050, 1_050,
      1_050, 1_080, 1_600,
    ];
    dateNow.mockImplementation(() => nowSequence.shift() ?? 1_600);

    try {
      await runtime.feedback({
        sessionId: started.sessionId,
        cardId: first.id,
        rating: 3,
        reviewedAt: NOW,
        idempotencyKey: 'feedback-key',
      });

      expect(timing.innerSteps.map((step) => step.step)).toEqual([
        'session-feedback-preflight',
        'session-feedback-commit',
        'session-feedback-advance',
        'session-feedback-state',
        'session-feedback-unattributed-gap',
        'session-feedback-total',
      ]);
      expect(timing.innerSteps.find((step) => step.step === 'session-feedback-commit')?.durationMs).toBe(50);
      expect(timing.innerSteps.some((step) => step.step === 'session-feedback-undo-journal-append')).toBe(false);
      expect(timing.innerSteps.find((step) => step.step === 'session-feedback-unattributed-gap')).toEqual(
        expect.objectContaining({
          durationMs: 520,
          extra: expect.objectContaining({
            measuredSessionStepTotalMs: 80,
            totalSessionFeedbackMs: 600,
          }),
        }),
      );
      expect(timing.innerSteps.find((step) => step.step === 'session-feedback-total')).toEqual(
        expect.objectContaining({
          durationMs: 600,
          extra: expect.objectContaining({
            measuredSessionStepTotalMs: 80,
            unattributedGapMs: 520,
          }),
        }),
      );
    } finally {
      dateNow.mockRestore();
      endBackendWorkerRequest(timing);
    }
  });

  it('keeps fast feedback session timing quiet', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const timing = beginBackendWorkerTiming('review.session.feedback', first.id, {
      queueType: QueueType.RetrievalPractice,
    });
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
        readRows: vi.fn(() => [createProjectionRow(first, 1), createProjectionRow(second, 2)]),
      },
      feedbackRuntime,
    });

    const started = await runtime.startSession({
      sessionId: 'session-fast-feedback',
      queueType: QueueType.RetrievalPractice,
      ...ADMITTED_PROJECTION,
    });
    const dateNow = vi.spyOn(Date, 'now');
    const nowSequence = [
      1_000, 1_000, 1_000, 1_000, 1_020, 1_020, 1_020,
      1_020, 1_020, 1_020, 1_080,
    ];
    dateNow.mockImplementation(() => nowSequence.shift() ?? 1_080);

    try {
      await runtime.feedback({
        sessionId: started.sessionId,
        cardId: first.id,
        rating: 3,
        reviewedAt: NOW,
        idempotencyKey: 'feedback-key',
      });

      expect(timing.innerSteps).toEqual([]);
    } finally {
      dateNow.mockRestore();
      endBackendWorkerRequest(timing);
    }
  });
});
