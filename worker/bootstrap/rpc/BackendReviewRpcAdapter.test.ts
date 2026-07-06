import { describe, expect, it, vi } from 'vitest';
import { BACKEND_RPC_VERSION, type BackendReviewFeedbackRequest } from '../../../packages/contracts/src/backend-rpc';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import { WorkerReviewSessionRuntime } from '../../review/WorkerReviewSessionRuntime';
import { BackendReviewRpcRuntime, type BackendReviewRpcDatabase } from './BackendReviewRpcAdapter';
import { BackendRpcDispatcher } from './BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry, BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS } from './BackendRpcRegistry';

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

function createDatabase(reviewFeedback: BackendReviewRpcDatabase['reviewFeedback']): BackendReviewRpcDatabase {
  return {
    reviewFeedback,
    invalidateReviewFeedbackMainDbFastSkip: vi.fn(),
    mergeExternalDatabaseIfChanged: vi.fn(async () => undefined),
    markReviewFeedbackOwnPersistedMainDbClean: vi.fn(),
    getReviewFeedbackJournalStore: vi.fn(() => null),
    listReviewEventsForTruthBackfill: vi.fn(async () => []),
    patchReviewTruthBackfillProjectionRefs: vi.fn(async () => undefined),
    countReviewEventsPendingTruthBackfill: vi.fn(async () => 0),
    updateSourceExistence: vi.fn(),
  };
}

describe('BackendReviewRpcAdapter worker session methods', () => {
  it('dispatches review.session.feedback through worker session state and returns next card without projection reread', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const readRows = vi.fn(() => [
      {
        queueType: QueueType.RetrievalPractice,
        rowId: first.id,
        cardId: first.id,
        blockId: first.blockId,
        deckId: null,
        membershipReason: 'due',
        dueAt: first.due,
        dueBucket: 'review',
        priorityScore: first.priority,
        sortKey: `000000001:${first.id}`,
        queueIndexHint: 1,
        policyHash: 'retrieval-policy',
        sourceGeneration: 7,
        payload: {},
        updatedAt: NOW,
      },
      {
        queueType: QueueType.RetrievalPractice,
        rowId: second.id,
        cardId: second.id,
        blockId: second.blockId,
        deckId: null,
        membershipReason: 'due',
        dueAt: second.due,
        dueBucket: 'review',
        priorityScore: second.priority,
        sortKey: `000000002:${second.id}`,
        queueIndexHint: 2,
        policyHash: 'retrieval-policy',
        sourceGeneration: 7,
        payload: {},
        updatedAt: NOW,
      },
    ]);
    const reviewFeedback = vi.fn(async (request: BackendReviewFeedbackRequest) => ({
      cardId: request.cardId,
      committed: true,
      reviewedAt: request.reviewedAt ?? NOW,
      queueType: request.queueType ?? QueueType.RetrievalPractice,
      updatedCard: { ...first, reps: first.reps + 1 },
      idempotencyKey: request.idempotencyKey ?? null,
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
      feedbackRuntime: { reviewFeedback },
    });
    const review = new BackendReviewRpcRuntime({
      database: createDatabase(reviewFeedback),
      sessionRuntime,
    });
    const dispatcher = new BackendRpcDispatcher(createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS));

    const started = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 1,
      method: 'review.session.start',
      params: {
        sessionId: 'session-a',
        queueType: QueueType.RetrievalPractice,
      },
    }, { review });

    expect(started.result).toMatchObject({
      sessionId: 'session-a',
      current: expect.objectContaining({ id: first.id }),
      lookaheadCards: [expect.objectContaining({ id: second.id })],
      counters: expect.objectContaining({ remaining: 2, source: 'worker-session' }),
    });
    expect(readRows).toHaveBeenCalledOnce();

    const feedback = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 2,
      method: 'review.session.feedback',
      params: {
        sessionId: 'session-a',
        cardId: first.id,
        rating: 3,
        reviewedAt: NOW,
        idempotencyKey: 'session-feedback-1',
        repairGate: {
          state: 'clean',
          reason: 'test-clean-gate',
          createdAt: NOW,
          cardId: first.id,
        },
      },
    }, { review });

    expect(feedback.result).toMatchObject({
      answeredCardId: first.id,
      current: expect.objectContaining({ id: second.id }),
      lookaheadCards: [],
      counters: expect.objectContaining({ remaining: 1, source: 'worker-session' }),
      feedback: expect.objectContaining({ committed: true }),
    });
    expect(readRows).toHaveBeenCalledOnce();
    expect(reviewFeedback).toHaveBeenCalledWith(expect.objectContaining({
      cardId: first.id,
      sessionId: 'session-a',
      idempotencyKey: 'session-feedback-1',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    }));
  });

  it('fails closed when review.session methods have no worker session runtime', async () => {
    const review = new BackendReviewRpcRuntime({
      database: createDatabase(vi.fn()),
      sessionRuntime: null,
    });
    const dispatcher = new BackendRpcDispatcher(createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS));

    const response = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 1,
      method: 'review.session.start',
      params: { sessionId: 'session-a', queueType: QueueType.RetrievalPractice },
    }, { review });

    expect(response.error).toMatchObject({
      code: 'BACKEND_UNAVAILABLE',
      message: 'BACKEND_UNAVAILABLE: worker Review session runtime unavailable',
    });
  });

  it('dispatches review.session.skip through worker session state', async () => {
    const first = createCard('card-1');
    const second = createCard('card-2', 1_000);
    const cardsById = new Map([first, second].map((card) => [card.id, card] as const));
    const readRows = vi.fn(() => [
      {
        queueType: QueueType.RetrievalPractice,
        rowId: first.id,
        cardId: first.id,
        blockId: first.blockId,
        deckId: null,
        membershipReason: 'due',
        dueAt: first.due,
        dueBucket: 'review',
        priorityScore: first.priority,
        sortKey: `000000001:${first.id}`,
        queueIndexHint: 1,
        policyHash: 'retrieval-policy',
        sourceGeneration: 7,
        payload: {},
        updatedAt: NOW,
      },
      {
        queueType: QueueType.RetrievalPractice,
        rowId: second.id,
        cardId: second.id,
        blockId: second.blockId,
        deckId: null,
        membershipReason: 'due',
        dueAt: second.due,
        dueBucket: 'review',
        priorityScore: second.priority,
        sortKey: `000000002:${second.id}`,
        queueIndexHint: 2,
        policyHash: 'retrieval-policy',
        sourceGeneration: 7,
        payload: {},
        updatedAt: NOW,
      },
    ]);
    const reviewFeedback = vi.fn(async (request: BackendReviewFeedbackRequest) => ({
      cardId: request.cardId,
      committed: true,
      reviewedAt: request.reviewedAt ?? NOW,
      queueType: request.queueType ?? QueueType.RetrievalPractice,
      updatedCard: null,
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
      feedbackRuntime: { reviewFeedback },
    });
    const review = new BackendReviewRpcRuntime({
      database: createDatabase(reviewFeedback),
      sessionRuntime,
    });
    const dispatcher = new BackendRpcDispatcher(createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS));

    await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 1,
      method: 'review.session.start',
      params: {
        sessionId: 'session-a',
        queueType: QueueType.RetrievalPractice,
      },
    }, { review });
    const skipped = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 2,
      method: 'review.session.skip',
      params: {
        sessionId: 'session-a',
        cardId: first.id,
      },
    }, { review });

    expect(skipped.result).toMatchObject({
      skippedCardId: first.id,
      current: expect.objectContaining({ id: second.id }),
      counters: expect.objectContaining({ remaining: 2, total: 2, source: 'worker-session' }),
    });
    expect(reviewFeedback).not.toHaveBeenCalled();
    expect(readRows).toHaveBeenCalledOnce();
  });
});
