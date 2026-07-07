import { describe, expect, it, vi } from 'vitest';
import type { QueueFeedback } from '@/core/queue/abstraction/Strategy';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  QueueType,
  type QueueCounterSnapshot,
} from '@/types/unified-data-source';
import {
  ReviewAnswerPipeline,
  type ReviewAnswerPipelineDependencies,
  type ReviewAnswerPipelineTimingContext,
} from '../ReviewAnswerPipeline';
import type {
  ReviewSessionQueueResult,
  ReviewSessionQueueRuntime,
} from '../ReviewSessionQueueRuntime';
import type { ReviewTransaction } from '../ReviewTransactionSafetyEnvelope';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'pipeline-card-1',
    xiuyuanID: 'pipeline-xy-1',
    blockId: 'pipeline-block-1',
    due: now - 60_000,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 60_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now - 60_000,
    ...overrides,
  };
}

function counter(remaining: number): QueueCounterSnapshot {
  return {
    version: 1,
    remaining,
    due: remaining,
    total: remaining,
    buckets: {
      all: remaining,
      item: remaining,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'hot',
  };
}

function runtime(result: ReviewSessionQueueResult): ReviewSessionQueueRuntime {
  return {
    next: vi.fn(async () => result.nextCard),
    answerAndAdvance: vi.fn(async () => result),
    rebuild: vi.fn(async () => undefined),
    getCounterSnapshot: vi.fn(() => result.counterSnapshot),
    getSessionCards: vi.fn(() => result.nextCard ? [result.nextCard] : []),
    undoLast: vi.fn(() => null),
  };
}

function createPipeline(overrides: Partial<ReviewAnswerPipelineDependencies> = {}) {
  const calls: string[] = [];
  const deps: ReviewAnswerPipelineDependencies = {
    queueType: QueueType.RetrievalPractice,
    captureTransaction: vi.fn(async () => ({ id: 'tx-1' }) as unknown as ReviewTransaction),
    withFeedbackMutation: vi.fn(async (_activeItem, _feedback, task) => task()),
    recordReviewHistory: vi.fn(),
    syncCursorFromRuntime: vi.fn(),
    setCounterSnapshot: vi.fn(),
    setPendingCounterSnapshot: vi.fn(),
    setPendingNextCard: vi.fn(),
    consumeAdvanceResult: vi.fn(async (nextCard) => nextCard),
    isUnavailableCurrentItemError: vi.fn(() => false),
    measureStep: vi.fn(async (step: string, _context: ReviewAnswerPipelineTimingContext, task) => {
      calls.push(step);
      return task();
    }),
    measureSyncStep: vi.fn((step: string, _context: ReviewAnswerPipelineTimingContext, task) => {
      calls.push(step);
      return task();
    }),
    ...overrides,
  };
  return {
    calls,
    deps,
    pipeline: new ReviewAnswerPipeline(deps),
  };
}

describe('ReviewAnswerPipeline', () => {
  it('returns a complete runtime-backed rating result behind one Interface', async () => {
    const activeItem = createCard({ id: 'answer-card-1', blockId: 'answer-block-1' });
    const nextCard = createCard({ id: 'answer-card-2', blockId: 'answer-block-2' });
    const commit = Promise.resolve();
    const result: ReviewSessionQueueResult = {
      status: 'advanced',
      nextCard,
      counterSnapshot: counter(1),
      affectedQueueTypes: [QueueType.RetrievalPractice],
      activeQueueCount: 1,
      countDelta: -1,
      queueImpact: {
        activeQueueType: QueueType.RetrievalPractice,
        affectedQueueTypes: [QueueType.RetrievalPractice],
        counterSnapshot: counter(1),
        activeQueueCount: 1,
        countDelta: -1,
        source: 'session-counter',
      },
      undoToken: 'undo-1',
      commitStatus: 'pending',
      commitIdempotencyKey: 'answer-key-1',
      commit,
    };
    const reviewRuntime = runtime(result);
    const transactionCaptured = vi.fn();
    const transactionPushed = vi.fn();
    const transactionCleared = vi.fn();
    const { calls, deps, pipeline } = createPipeline();
    const feedback: QueueFeedback = { action: 'rate', rating: 4, commitIdempotencyKey: 'answer-key-1' };

    const feedbackResult = await pipeline.answer({
      activeItem,
      feedback,
      runtime: reviewRuntime,
      runtimeOwnsMutationAuthority: false,
      frontendTimingSteps: [],
      onTransactionCaptured: transactionCaptured,
      onTransactionHistoryPushed: transactionPushed,
      onTransactionCleared: transactionCleared,
    });

    expect(feedbackResult).toMatchObject({
      status: 'advanced',
      nextItem: expect.objectContaining({ id: nextCard.id }),
      counterSnapshot: expect.objectContaining({ remaining: 1 }),
      affectedQueueTypes: [QueueType.RetrievalPractice],
      activeQueueCount: 1,
      countDelta: -1,
      commitStatus: 'pending',
      commitIdempotencyKey: 'answer-key-1',
    });
    expect(feedbackResult.commit).toBe(commit);
    expect(reviewRuntime.answerAndAdvance).toHaveBeenCalledWith({ card: activeItem, feedback });
    expect(deps.captureTransaction).toHaveBeenCalledWith(activeItem, feedback, { includeCardSnapshot: true });
    expect(deps.recordReviewHistory).toHaveBeenCalledWith(activeItem, expect.anything());
    expect(deps.syncCursorFromRuntime).toHaveBeenCalledTimes(1);
    expect(deps.setCounterSnapshot).toHaveBeenCalledWith(expect.objectContaining({ remaining: 1 }));
    expect(deps.setPendingCounterSnapshot).toHaveBeenCalledWith(expect.objectContaining({ remaining: 1 }));
    expect(deps.consumeAdvanceResult).toHaveBeenCalledWith(nextCard, expect.objectContaining({ activeItem, feedback }));
    expect(transactionCaptured).toHaveBeenCalledTimes(1);
    expect(transactionPushed).toHaveBeenCalledTimes(1);
    expect(transactionCleared).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'transaction-capture',
      'session-runtime-answer',
      'sync-cursor-from-runtime',
      'sync-counter-snapshot',
      'consume-advance',
    ]);
  });

  it('fails closed when the runtime reports unavailable', async () => {
    const activeItem = createCard({ id: 'unavailable-card-1', blockId: 'unavailable-block-1' });
    const feedback: QueueFeedback = { action: 'rate', rating: 4 };
    const reviewRuntime = runtime({
      status: 'unavailable',
      nextCard: activeItem,
      counterSnapshot: counter(2),
      undoToken: null,
      reason: 'WORKER_REVIEW_SESSION_UNAVAILABLE: kernel stopped',
    });
    const { deps, pipeline } = createPipeline();

    await expect(pipeline.answer({
      activeItem,
      feedback,
      runtime: reviewRuntime,
      runtimeOwnsMutationAuthority: true,
      frontendTimingSteps: [],
    })).rejects.toThrow('REVIEW_SESSION_RUNTIME_UNAVAILABLE: WORKER_REVIEW_SESSION_UNAVAILABLE: kernel stopped');

    expect(deps.captureTransaction).not.toHaveBeenCalled();
    expect(deps.consumeAdvanceResult).not.toHaveBeenCalled();
    expect(deps.setPendingNextCard).toHaveBeenCalledWith(activeItem);
  });

  it('fails closed when the runtime reports a current-card conflict', async () => {
    const activeItem = createCard({ id: 'conflict-card-1', blockId: 'conflict-block-1' });
    const feedback: QueueFeedback = { action: 'rate', rating: 3 };
    const reviewRuntime = runtime({
      status: 'conflict',
      nextCard: activeItem,
      counterSnapshot: counter(2),
      undoToken: null,
      reason: 'current-card-stale',
    });
    const { deps, pipeline } = createPipeline();

    await expect(pipeline.answer({
      activeItem,
      feedback,
      runtime: reviewRuntime,
      runtimeOwnsMutationAuthority: true,
      frontendTimingSteps: [],
    })).rejects.toThrow('REVIEW_SESSION_RUNTIME_CONFLICT: current-card-stale');

    expect(deps.captureTransaction).not.toHaveBeenCalled();
    expect(deps.consumeAdvanceResult).not.toHaveBeenCalled();
    expect(deps.setPendingNextCard).toHaveBeenCalledWith(activeItem);
  });
});
