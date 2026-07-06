import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { isQueueItemUnavailableError, type QueueFeedbackResult } from '@/core/queue/abstraction/Strategy';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { QueueType, type DataChangeEvent, type IReviewQueue, type QueueReviewResult } from '@/types/unified-data-source';
import { CardType, type FSRSCard } from '@/types/card';
import type {
  BackendReviewFeedbackResult,
  BackendReviewSessionFeedbackResult,
  BackendReviewSessionSkipResult,
  BackendReviewSessionState,
} from '../../../packages/contracts/src/backend-rpc';

const unifiedQueueStrategyLoggerInfoMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: unifiedQueueStrategyLoggerInfoMock,
    warn: vi.fn(),
  }),
}));

const DAY_MS = 86_400_000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now + 60_000,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now - 86_400_000,
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

function expectAdvancedNext(
  result: QueueFeedbackResult<FSRSCard> | void,
  expectedId: string,
): FSRSCard {
  expect(result).toMatchObject({
    status: 'advanced',
    nextItem: expect.objectContaining({ id: expectedId }),
  });
  const nextItem = result && result.status === 'advanced' ? result.nextItem : null;
  expect(nextItem).not.toBeNull();
  return nextItem as FSRSCard;
}

function createWorkerSessionBackend(
  queueType: QueueType,
  cards: FSRSCard[],
): {
  reviewSessionStart: ReturnType<typeof vi.fn>;
  reviewSessionCurrent: ReturnType<typeof vi.fn>;
  reviewSessionFeedback: ReturnType<typeof vi.fn>;
  reviewSessionSkip: ReturnType<typeof vi.fn>;
} {
  const sessionId = `worker-session-${queueType}`;
  let remaining = cards.map((card) => ({ ...card }));
  let current: FSRSCard | null = null;
  let avoidOnceCardId: string | null = null;
  let avoidOnceBlockId: string | null = null;
  const normalize = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const selectNext = () => {
    if (remaining.length === 0) {
      avoidOnceCardId = null;
      avoidOnceBlockId = null;
      return null;
    }
    const index = (() => {
      if (!avoidOnceCardId && !avoidOnceBlockId) {
        return 0;
      }
      const differentBlockIndex = remaining.findIndex((card) => (
        (!avoidOnceCardId || normalize(card.id) !== avoidOnceCardId)
        && (!avoidOnceBlockId || normalize(card.blockId) !== avoidOnceBlockId)
      ));
      if (differentBlockIndex >= 0) {
        return differentBlockIndex;
      }
      const differentCardIndex = remaining.findIndex((card) => (
        !avoidOnceCardId || normalize(card.id) !== avoidOnceCardId
      ));
      return differentCardIndex >= 0 ? differentCardIndex : 0;
    })();
    const [selected] = remaining.splice(index, 1);
    avoidOnceCardId = null;
    avoidOnceBlockId = null;
    return selected ? { ...selected } : null;
  };
  const ensureCurrent = () => {
    if (!current) {
      current = selectNext();
    }
    return current;
  };
  const setAvoidOnce = (card: FSRSCard) => {
    avoidOnceCardId = normalize(card.id) || null;
    avoidOnceBlockId = normalize(card.blockId) || null;
  };
  const buildCounters = () => ({
    remaining: remaining.length + (current ? 1 : 0),
    due: remaining.length + (current ? 1 : 0),
    total: remaining.length + (current ? 1 : 0),
    source: 'worker-session' as const,
  });
  const buildState = (): BackendReviewSessionState => ({
    sessionId,
    queueType,
    current: ensureCurrent() ? { ...ensureCurrent()! } : null,
    lookaheadCards: remaining[0] ? [{ ...remaining[0] }] : [],
    counters: buildCounters(),
    projectionState: 'ready',
    projectionGeneration: 1,
    projectionPolicyHash: 'test-policy',
  });
  const buildFeedback = (
    cardId: string,
    rating: 1 | 2 | 3 | 4,
    idempotencyKey?: string | null,
  ): BackendReviewFeedbackResult => ({
    ok: true,
    cardId,
    rating,
    reviewedAt: Date.now(),
    idempotencyKey: idempotencyKey ?? `worker-feedback-${cardId}`,
    durable: true,
    queueImpact: {
      version: 1,
      entries: [],
      affectedQueues: [],
      hotPatchable: true,
      refreshRequired: false,
    },
    projectionAction: null,
    projectionImpactEntry: null,
    truthFlush: {
      status: 'pending',
      reason: 'test-worker-session',
    },
  } as unknown as BackendReviewFeedbackResult);
  return {
    reviewSessionStart: vi.fn(async () => buildState()),
    reviewSessionCurrent: vi.fn(async () => buildState()),
    reviewSessionFeedback: vi.fn(async (request: {
      cardId: string;
      rating: 1 | 2 | 3 | 4;
      idempotencyKey?: string | null;
    }): Promise<BackendReviewSessionFeedbackResult> => {
      const answeredCard = ensureCurrent();
      if (!answeredCard || answeredCard.id !== request.cardId) {
        throw new Error(`WORKER_REVIEW_SESSION_CURRENT_MISMATCH: ${sessionId}`);
      }
      remaining = remaining.filter((card) => card.id !== request.cardId);
      setAvoidOnce(answeredCard);
      if (request.rating < 3) {
        remaining.push({ ...answeredCard });
      }
      current = selectNext();
      return {
        ...buildState(),
        answeredCardId: request.cardId,
        feedback: buildFeedback(request.cardId, request.rating, request.idempotencyKey),
      };
    }),
    reviewSessionSkip: vi.fn(async (request: {
      cardId: string;
    }): Promise<BackendReviewSessionSkipResult> => {
      const skippedCard = ensureCurrent();
      if (!skippedCard || skippedCard.id !== request.cardId) {
        throw new Error(`WORKER_REVIEW_SESSION_CURRENT_MISMATCH: ${sessionId}`);
      }
      remaining = remaining.filter((card) => card.id !== request.cardId);
      setAvoidOnce(skippedCard);
      remaining.push({ ...skippedCard });
      current = selectNext();
      return {
        ...buildState(),
        skippedCardId: request.cardId,
      };
    }),
  };
}

function withWorkerSessionBackend(queueType: QueueType, cards: FSRSCard[]) {
  const workerSessionBackend = createWorkerSessionBackend(queueType, cards);
  return {
    workerSessionBackend,
    resolvePluginContext: vi.fn(() => ({
      getSrsBackendClient: () => workerSessionBackend,
    })),
  };
}

function createQueueStub(
  queueType: QueueType,
  cards: FSRSCard[],
  options?: {
    handleReview?: (
      cardId: string,
      rating: number,
      liveCards: FSRSCard[],
    ) => Promise<Partial<QueueReviewResult> | void>;
    createRollbackSnapshot?: (liveCards: FSRSCard[]) => Promise<unknown>;
    restoreRollbackSnapshot?: (snapshot: unknown, liveCards: FSRSCard[]) => Promise<void>;
  }
): IReviewQueue & {
  createRollbackSnapshot?: () => Promise<unknown>;
  restoreRollbackSnapshot?: (snapshot: unknown) => Promise<void>;
} {
  const liveCards = cards.map((card) => ({ ...card }));
  const resolveLiveCardBySnapshotId = (id: string): FSRSCard | undefined => {
    return liveCards.find((card) => card.id === id || card.riffCardId === id || card.blockId === id);
  };
  const buildSnapshot = () => ({
    version: 1,
    remaining: liveCards.length,
    due: liveCards.length,
    total: liveCards.length,
    buckets: {
      all: liveCards.length,
      item: liveCards.length,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'hot' as const,
  });

  return {
    name: `Queue-${queueType}`,
    type: queueType,
    getType: () => queueType,
    getCards: vi.fn(async () => liveCards.map((card) => ({ ...card }))),
    getSnapshotRows: vi.fn(async () => liveCards.map((card, index) => buildQueueSnapshotRow(card, {
      queueIndex: index + 1,
    }))),
    getCardsBySnapshotIds: vi.fn(async (ids: string[]) => ids
      .map(resolveLiveCardBySnapshotId)
      .filter((card): card is FSRSCard => Boolean(card))
      .map((card) => ({ ...card }))),
    getAllCards: vi.fn(async () => liveCards.map((card) => ({ ...card }))),
    getNextCard: vi.fn(async () => liveCards[0] ?? null),
    addCard: vi.fn(async () => {}),
    removeCard: vi.fn(async () => {}),
    updateCard: vi.fn(async () => {}),
    handleReview: vi.fn(async (cardId: string, rating: number) => {
      const defaultResult: QueueReviewResult = {
        updatedCard: liveCards.find((card) => card.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: false,
        requiresCurrentViewReorder: false,
        counterSnapshot: buildSnapshot(),
        version: 1,
      };
      if (options?.handleReview) {
        const partial = await options.handleReview(cardId, rating, liveCards);
        return {
          ...defaultResult,
          ...partial,
          counterSnapshot: buildSnapshot(),
          version: 1,
        };
      }
      const index = liveCards.findIndex((card) => card.id === cardId);
      if (index >= 0 && rating >= 3) {
        liveCards.splice(index, 1);
      }
      return {
        updatedCard: liveCards.find((card) => card.id === cardId) ?? null,
        removedFromQueue: rating >= 3,
        remainsInQueue: rating < 3,
        queueChanged: rating >= 3,
        requiresCurrentViewReorder: false,
        counterSnapshot: buildSnapshot(),
        version: 1,
      };
    }),
    skip: vi.fn(async () => {}),
    getStats: vi.fn(async () => ({
      total: liveCards.length,
      due: liveCards.length,
      new: 0,
      learning: 0,
      reviewed: 0,
    })),
    getUIConfig: vi.fn(() => ({
      displayName: String(queueType),
      buttons: [],
      showSkipButton: true,
      showProgressBar: true,
    })),
    isDynamic: vi.fn(() => true),
    refresh: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    getSize: vi.fn(async () => cards.length),
    isEmpty: vi.fn(async () => cards.length === 0),
    sort: vi.fn(async () => {}),
    filter: vi.fn(async () => cards),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    notifyObservers: vi.fn(),
    reorder: vi.fn(async () => true),
    clearCustomOrder: vi.fn(),
    insertAt: vi.fn(async () => {}),
    getRemainingSize: vi.fn(async () => liveCards.length),
    getCounterSnapshot: vi.fn(async () => buildSnapshot()),
    createRollbackSnapshot: options?.createRollbackSnapshot
      ? () => options.createRollbackSnapshot!(liveCards)
      : undefined,
    restoreRollbackSnapshot: options?.restoreRollbackSnapshot
      ? (snapshot: unknown) => options.restoreRollbackSnapshot!(snapshot, liveCards)
      : undefined,
  };
}

function createFilterGroupLoopFixture(
  cards: FSRSCard[],
  options?: {
    handleReview?: (
      cardId: string,
      rating: number,
      liveCards: FSRSCard[],
    ) => Promise<Partial<QueueReviewResult> | void>;
  }
): {
  strategy: UnifiedQueueStrategy;
  queue: IReviewQueue;
} {
  let observer: { onDataChanged(event: DataChangeEvent): void } | null = null;
  const queue = createQueueStub(QueueType.FilterGroup, cards, {
    handleReview: async (cardId, rating, liveCards) => {
      observer?.onDataChanged({
        type: 'queue-changed',
        queueType: QueueType.FilterGroup,
        timestamp: Date.now(),
      });

      if (options?.handleReview) {
        return options.handleReview(cardId, rating, liveCards);
      }

      return {
        updatedCard: liveCards.find((card) => card.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: true,
        requiresCurrentViewReorder: false,
      };
    },
  });
  const manager = {
    getQueue: vi.fn((type: QueueType) => {
      if (type === QueueType.FinalDrill) {
        return createQueueStub(QueueType.FinalDrill, []);
      }
      return queue;
    }),
    getCard: vi.fn(async (cardId: string) => {
      const card = cards.find((candidate) => candidate.id === cardId);
      if (!card) {
        throw new Error('card not found');
      }
      return { ...card };
    }),
    getCards: vi.fn(async () => []),
    updateCard: vi.fn(async () => {}),
    registerObserver: vi.fn((nextObserver) => {
      observer = nextObserver;
    }),
    unregisterObserver: vi.fn(),
  };
  const eventBus = { subscribe: vi.fn() };

  return {
    queue,
    strategy: new UnifiedQueueStrategy(
      QueueType.FilterGroup,
      manager as never,
      eventBus as never,
      null
    ),
  };
}

describe('UnifiedQueueStrategy performance and rollback behavior', () => {
  beforeEach(() => {
    unifiedQueueStrategyLoggerInfoMock.mockClear();
  });

  it('loads review cards from projection rows when a queue is projection-backed', async () => {
    const cardA = createCard({ id: 'card-a', blockId: 'block-a' });
    const cardB = createCard({ id: 'card-b', blockId: 'block-b' });
    const queue = createQueueStub(QueueType.FilterGroup, [cardA, cardB]);
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    const projectionRows = [
      buildQueueSnapshotRow(cardB, { queueIndex: 1 }),
      buildQueueSnapshotRow(cardA, { queueIndex: 2 }),
    ];
    (queue.getSnapshotRows as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(projectionRows);
    (queue.getCardsBySnapshotIds as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([cardB, cardA]);
    const manager = {
      getQueue: vi.fn(() => queue),
      getQueueProjectionRolloutDiagnostics: vi.fn((queueType?: QueueType) => queueType === QueueType.FilterGroup ? [{
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }] : []),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(QueueType.FilterGroup, manager as never, eventBus as never, null);

    const next = await strategy.next();

    expect(next?.id).toBe('card-b');
    expect(queue.getSnapshotRows).toHaveBeenCalledTimes(1);
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalledWith(projectionRows.map((row) => row.id), true);
    expect(getCardsSpy).not.toHaveBeenCalled();
  });

  it('uses the session runtime instead of projection hydration for incremental-learning next', async () => {
    const staleMissingCard = createCard({ id: 'stale-card', blockId: 'missing-block' });
    const nextCard = createCard({ id: 'next-card', blockId: 'next-block' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [nextCard]);
    const staleRows = [
      buildQueueSnapshotRow(staleMissingCard, { queueIndex: 1 }),
      buildQueueSnapshotRow(nextCard, { queueIndex: 2 }),
    ];
    const refreshedRows = [
      buildQueueSnapshotRow(nextCard, { queueIndex: 1 }),
    ];
    (queue.getSnapshotRows as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (forceRefresh?: boolean) => (
      forceRefresh ? refreshedRows : staleRows
    ));
    (queue.getCardsBySnapshotIds as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (ids: string[]) => ids
      .filter((id) => id === refreshedRows[0].id || id === nextCard.id || id === nextCard.blockId)
      .map(() => ({ ...nextCard })));
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [nextCard]),
      getQueue: vi.fn((queueType?: QueueType) => (
        queueType === QueueType.FinalDrill
          ? createQueueStub(QueueType.FinalDrill, [])
          : queue
      )),
      getQueueProjectionRolloutDiagnostics: vi.fn((queueType?: QueueType) => queueType === QueueType.IncrementalLearning ? [{
        queueType: QueueType.IncrementalLearning,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }] : []),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(QueueType.IncrementalLearning, manager as never, eventBus as never, null);

    const next = await strategy.next();

    expect(next?.id).toBe(nextCard.id);
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
  });

  it('uses the session runtime instead of projection hydration for retrieval-practice answer-to-next', async () => {
    const firstCard = createCard({ id: 'retrieval-card-1', blockId: 'retrieval-block-1' });
    const secondCard = createCard({ id: 'retrieval-card-2', blockId: 'retrieval-block-2' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard]);
    (queue.getSnapshotRows as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('QUEUE_PROJECTION_NOT_READY: retrieval-practice projection refreshing'),
    );
    (queue.getCardsBySnapshotIds as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('QUEUE_PROJECTION_NOT_READY: retrieval-practice projection refreshing'),
    );
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, secondCard]),
      getQueue: vi.fn((queueType?: QueueType) => (
        queueType === QueueType.FinalDrill
          ? createQueueStub(QueueType.FinalDrill, [])
          : queue
      )),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(QueueType.RetrievalPractice, manager as never, eventBus as never, null);

    const first = await strategy.next();
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });

    expect(feedbackResult).toMatchObject({
      status: 'advanced',
      nextItem: expect.objectContaining({ id: secondCard.id }),
    });
    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
  });

  it('fails closed instead of falling back to renderer projection authority when worker answer is unavailable', async () => {
    const firstCard = createCard({ id: 'worker-owned-card-1', blockId: 'worker-owned-block-1' });
    const secondCard = createCard({ id: 'worker-owned-card-2', blockId: 'worker-owned-block-2' });
    const projectionFallbackCard = createCard({ id: 'projection-fallback-card', blockId: 'projection-fallback-block' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, projectionFallbackCard]);
    const projectionRows = [
      buildQueueSnapshotRow(projectionFallbackCard, { queueIndex: 1 }),
    ];
    (queue.getSnapshotRows as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(projectionRows);
    (queue.getCardsBySnapshotIds as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ ...projectionFallbackCard }]);
    const workerSessionBackend = createWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]);
    workerSessionBackend.reviewSessionFeedback.mockRejectedValueOnce(
      new Error('WORKER_REVIEW_SESSION_UNAVAILABLE: kernel stopped'),
    );
    const manager = {
      workerSessionBackend,
      resolvePluginContext: vi.fn(() => ({
        getSrsBackendClient: () => workerSessionBackend,
      })),
      getQueue: vi.fn((queueType?: QueueType) => (
        queueType === QueueType.FinalDrill
          ? createQueueStub(QueueType.FinalDrill, [])
          : queue
      )),
      getCard: vi.fn(async (cardId: string) => ({ ...(cardId === firstCard.id ? firstCard : secondCard) })),
      getCards: vi.fn(async () => [{ ...projectionFallbackCard }]),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(QueueType.RetrievalPractice, manager as never, eventBus as never, null);

    const first = await strategy.next();
    await expect(strategy.onFeedback(first, { action: 'rate', rating: 4 })).rejects.toThrow(
      'REVIEW_SESSION_RUNTIME_UNAVAILABLE: WORKER_REVIEW_SESSION_UNAVAILABLE: kernel stopped',
    );

    expect(queue.handleReview).not.toHaveBeenCalled();
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
    expect(manager.getCards).not.toHaveBeenCalled();
    expect(strategy.serializeSessionSnapshot().currentItem?.id).toBe(firstCard.id);
  });

  it('logs copyable frontend feedback timing layers for runtime-backed rating', async () => {
    vi.useFakeTimers();
    try {
      const firstCard = createCard({ id: 'timing-card-1', blockId: 'timing-block-1' });
      const secondCard = createCard({ id: 'timing-card-2', blockId: 'timing-block-2' });
      const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard]);
      const workerSessionBackend = createWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]);
      const cdfLiveRelationReviewOpenRefresher = {
        refreshCdfLiveRelationOnOpen: vi.fn(async () => {
          await vi.advanceTimersByTimeAsync(620);
          return {};
        }),
      };
      workerSessionBackend.reviewSessionFeedback.mockImplementation(async (request: {
        cardId: string;
        rating: 1 | 2 | 3 | 4;
        idempotencyKey?: string | null;
      }) => {
        await vi.advanceTimersByTimeAsync(610);
        return {
          sessionId: 'worker-session-retrieval-practice',
          queueType: QueueType.RetrievalPractice,
          current: { ...secondCard },
          lookaheadCards: [],
          counters: {
            remaining: 1,
            due: 1,
            total: 1,
            source: 'worker-session' as const,
          },
          projectionState: 'ready',
          projectionGeneration: 1,
          projectionPolicyHash: 'test-policy',
          answeredCardId: request.cardId,
          feedback: {
            ok: true,
            cardId: request.cardId,
            rating: request.rating,
            reviewedAt: Date.now(),
            idempotencyKey: request.idempotencyKey ?? 'timing-feedback',
            durable: true,
            queueImpact: {
              version: 1,
              entries: [],
              affectedQueues: [],
              hotPatchable: true,
              refreshRequired: false,
            },
            projectionAction: null,
            projectionImpactEntry: null,
            truthFlush: {
              status: 'pending',
              reason: 'timing-test',
            },
          },
        };
      });
      const manager = {
        workerSessionBackend,
        resolvePluginContext: vi.fn(() => ({
          getSrsBackendClient: () => workerSessionBackend,
        })),
        getQueue: vi.fn((queueType?: QueueType) => (
          queueType === QueueType.FinalDrill
            ? createQueueStub(QueueType.FinalDrill, [])
            : queue
        )),
        getCard: vi.fn(async (cardId: string) => {
          await vi.advanceTimersByTimeAsync(620);
          return { ...(cardId === firstCard.id ? firstCard : secondCard) };
        }),
        getCards: vi.fn(async () => []),
        updateCard: vi.fn(async () => {}),
      };
      const eventBus = { subscribe: vi.fn() };
      const strategy = new UnifiedQueueStrategy(
        QueueType.RetrievalPractice,
        manager as never,
        eventBus as never,
        null,
        cdfLiveRelationReviewOpenRefresher as never,
      );

      const first = await strategy.next();
      unifiedQueueStrategyLoggerInfoMock.mockClear();

      const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });

      expectAdvancedNext(feedbackResult, secondCard.id);
      expect(unifiedQueueStrategyLoggerInfoMock).toHaveBeenCalledWith(
        expect.stringContaining('slow review feedback frontend summary card=timing-card-1'),
        expect.objectContaining({
          step: 'frontend-feedback-summary',
          topFrontendStepSummary: expect.arrayContaining([
            expect.stringContaining('session-runtime-answer'),
            expect.stringContaining('sync-cursor-from-runtime'),
            expect.stringContaining('consume-advance.prepare-selected-review-card'),
            expect.stringContaining('consume-advance.reuse-cdf-preparation-evidence'),
          ]),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses fresh CDF preparation evidence when the same runtime-backed card is prepared again', async () => {
    const firstCard = createCard({ id: 'prepared-card-1', blockId: 'prepared-block-1' });
    const secondCard = createCard({ id: 'prepared-card-2', blockId: 'prepared-block-2' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard]);
    const workerSessionBackend = createWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]);
    const cdfLiveRelationReviewOpenRefresher = {
      refreshCdfLiveRelationOnOpen: vi.fn(async (card: FSRSCard | string) => {
        const resolved = typeof card === 'string'
          ? [firstCard, secondCard].find((candidate) => candidate.id === card)!
          : card;
        return {
          updatedCard: {
            ...resolved,
            meta: {
              ...resolved.meta,
              liveRelationStatus: 'active-live',
            },
          },
        };
      }),
    };
    const manager = {
      workerSessionBackend,
      resolvePluginContext: vi.fn(() => ({
        getSrsBackendClient: () => workerSessionBackend,
      })),
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async (cardId: string) => ({ ...(cardId === firstCard.id ? firstCard : secondCard) })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null,
      cdfLiveRelationReviewOpenRefresher as never,
    );

    const first = await strategy.next();
    expect(first).toMatchObject({ id: firstCard.id });

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expectAdvancedNext(feedbackResult, secondCard.id);
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(2);

    const currentAgain = await strategy.next();

    expect(currentAgain).toMatchObject({ id: secondCard.id });
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(2);
  });

  it('primes the next runtime-backed CDF card before feedback consumes it', async () => {
    const firstCard = createCard({ id: 'primed-card-1', blockId: 'primed-block-1' });
    const secondCard = createCard({ id: 'primed-card-2', blockId: 'primed-block-2' });
    const thirdCard = createCard({ id: 'primed-card-3', blockId: 'primed-block-3' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard, thirdCard]);
    const workerSessionBackend = createWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard, thirdCard]);
    const cdfLiveRelationReviewOpenRefresher = {
      refreshCdfLiveRelationOnOpen: vi.fn(async (card: FSRSCard | string) => {
        const resolved = typeof card === 'string'
          ? [firstCard, secondCard, thirdCard].find((candidate) => candidate.id === card)!
          : card;
        return {
          updatedCard: {
            ...resolved,
            meta: {
              ...resolved.meta,
              liveRelationStatus: 'active-live',
            },
          },
        };
      }),
    };
    const manager = {
      workerSessionBackend,
      resolvePluginContext: vi.fn(() => ({
        getSrsBackendClient: () => workerSessionBackend,
      })),
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async (cardId: string) => (
        { ...[firstCard, secondCard, thirdCard].find((candidate) => candidate.id === cardId)! }
      )),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null,
      cdfLiveRelationReviewOpenRefresher as never,
    );

    const first = await strategy.next();
    expect(first).toMatchObject({ id: firstCard.id });
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(2);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });

    const second = expectAdvancedNext(feedbackResult, secondCard.id);
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(3);
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: firstCard.id }),
    );
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: secondCard.id }),
    );
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ id: thirdCard.id }),
    );

    strategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.RetrievalPractice,
      timestamp: Date.now(),
    });

    const secondFeedbackResult = await strategy.onFeedback(second, { action: 'rate', rating: 4 });

    expectAdvancedNext(secondFeedbackResult, thirdCard.id);
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(3);
  });

  it('keeps next-card CDF prime evidence when a current-card update arrives after feedback', async () => {
    const firstCard = createCard({ id: 'current-update-prime-card-1', blockId: 'current-update-prime-block-1' });
    const secondCard = createCard({ id: 'current-update-prime-card-2', blockId: 'current-update-prime-block-2' });
    const thirdCard = createCard({ id: 'current-update-prime-card-3', blockId: 'current-update-prime-block-3' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard, thirdCard]);
    const workerSessionBackend = createWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard, thirdCard]);
    const cdfLiveRelationReviewOpenRefresher = {
      refreshCdfLiveRelationOnOpen: vi.fn(async (card: FSRSCard | string) => {
        const resolved = typeof card === 'string'
          ? [firstCard, secondCard, thirdCard].find((candidate) => candidate.id === card)!
          : card;
        return {
          updatedCard: {
            ...resolved,
            meta: {
              ...resolved.meta,
              liveRelationStatus: 'active-live',
            },
          },
        };
      }),
    };
    const manager = {
      workerSessionBackend,
      resolvePluginContext: vi.fn(() => ({
        getSrsBackendClient: () => workerSessionBackend,
      })),
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async (cardId: string) => (
        { ...[firstCard, secondCard, thirdCard].find((candidate) => candidate.id === cardId)! }
      )),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null,
      cdfLiveRelationReviewOpenRefresher as never,
    );

    const first = await strategy.next();
    const firstFeedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const second = expectAdvancedNext(firstFeedbackResult, secondCard.id);
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(3);

    strategy.onDataChanged({
      type: 'card-updated',
      cardIds: [secondCard.id],
      blockIds: [secondCard.blockId],
      timestamp: Date.now(),
    });

    const secondFeedbackResult = await strategy.onFeedback(second, { action: 'rate', rating: 4 });

    expectAdvancedNext(secondFeedbackResult, thirdCard.id);
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(3);
  });

  it('refreshes CDF preparation again when the prepared card signature changes', async () => {
    const firstCard = createCard({ id: 'stale-prepared-card-1', blockId: 'stale-prepared-block-1' });
    const secondCard = createCard({
      id: 'stale-prepared-card-2',
      blockId: 'stale-prepared-block-2',
      meta: { liveRelationStatus: 'active-live' },
    });
    const changedSecondCard = createCard({
      ...secondCard,
      updatedAt: secondCard.updatedAt + 1,
      meta: { liveRelationStatus: 'stale-live' },
    });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard]);
    const workerSessionBackend = createWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]);
    const cdfLiveRelationReviewOpenRefresher = {
      refreshCdfLiveRelationOnOpen: vi.fn(async (card: FSRSCard | string) => {
        const resolved = typeof card === 'string'
          ? [firstCard, secondCard, changedSecondCard].find((candidate) => candidate.id === card)!
          : card;
        return { updatedCard: { ...resolved } };
      }),
    };
    const manager = {
      workerSessionBackend,
      resolvePluginContext: vi.fn(() => ({
        getSrsBackendClient: () => workerSessionBackend,
      })),
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async (cardId: string) => (
        { ...(cardId === firstCard.id ? firstCard : changedSecondCard) }
      )),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null,
      cdfLiveRelationReviewOpenRefresher as never,
    );

    const first = await strategy.next();
    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expectAdvancedNext(feedbackResult, secondCard.id);
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(2);

    strategy.restoreSessionSnapshot({
      version: 1,
      queueType: QueueType.RetrievalPractice,
      currentItem: changedSecondCard,
      cachedCards: [changedSecondCard],
      currentIndex: 0,
      lastCounterSnapshot: null,
    });
    const currentAgain = await strategy.next();

    expect(currentAgain).toMatchObject({ id: changedSecondCard.id });
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(3);
  });

  it('replays cached CDF duplicate preparation evidence as an unavailable current card', async () => {
    const firstCard = createCard({ id: 'duplicate-prepared-card-1', blockId: 'duplicate-prepared-block-1' });
    const duplicateCard = createCard({ id: 'duplicate-prepared-card-2', blockId: 'duplicate-prepared-block-2' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, duplicateCard]);
    const workerSessionBackend = createWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, duplicateCard]);
    const cdfLiveRelationReviewOpenRefresher = {
      refreshCdfLiveRelationOnOpen: vi.fn(async (card: FSRSCard | string) => {
        const resolved = typeof card === 'string'
          ? [firstCard, duplicateCard].find((candidate) => candidate.id === card)!
          : card;
        if (resolved.id === duplicateCard.id) {
          return {
            currentReviewDuplicateOutcome: {
              kind: 'current-noncanonical-exits' as const,
              cardId: duplicateCard.id,
              relationKey: 'duplicate-relation',
              canonicalCardId: 'canonical-card',
            },
          };
        }
        return {};
      }),
    };
    const manager = {
      workerSessionBackend,
      resolvePluginContext: vi.fn(() => ({
        getSrsBackendClient: () => workerSessionBackend,
      })),
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async (cardId: string) => ({ ...(cardId === firstCard.id ? firstCard : duplicateCard) })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null,
      cdfLiveRelationReviewOpenRefresher as never,
    );

    const first = await strategy.next();
    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });

    expect(feedbackResult).toMatchObject({ status: 'advanced', nextItem: null });
    expect(cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen).toHaveBeenCalledTimes(2);
  });

  it('does not rebuild a runtime-backed session for counter refresh failure or generic card-updated events', async () => {
    const first = createCard({ id: 'runtime-card-1', blockId: 'runtime-block-1' });
    const second = createCard({ id: 'runtime-card-2', blockId: 'runtime-block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [first, second]);
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    (queue.getCounterSnapshot as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('QUEUE_COUNT_UNAVAILABLE: projection counter refresh failed'),
    );
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [first, second]),
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async (cardId: string) => ({ ...(cardId === first.id ? first : second) })),
      getCards: vi.fn(async () => []),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: QueueType.IncrementalLearning,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }]),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(QueueType.IncrementalLearning, manager as never, eventBus as never, null);

    await expect(strategy.next()).resolves.toMatchObject({ id: first.id });
    await expect(strategy.getCounterSnapshot()).resolves.toMatchObject({ remaining: 2 });

    strategy.onDataChanged({
      type: 'card-updated',
      cardIds: [first.id],
      timestamp: Date.now(),
    });

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4, commitIdempotencyKey: 'no-rebuild' });
    expectAdvancedNext(feedbackResult, second.id);

    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(queue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
  });

  it('uses the session runtime for initial stats when projection counter refresh is still stale', async () => {
    const first = createCard({ id: 'runtime-stats-card-1', blockId: 'runtime-stats-block-1' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [first]);
    (queue.getCounterSnapshot as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('QUEUE_PROJECTION_NOT_READY: counter snapshot for incremental-learning requires backend projection but projection is still refreshing'),
    );
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [first]),
      getQueue: vi.fn(() => queue),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: QueueType.IncrementalLearning,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }]),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(QueueType.IncrementalLearning, manager as never, eventBus as never, null);

    await expect(strategy.getStats()).resolves.toMatchObject({
      size: 1,
      label: '1 due',
      extra: '1 total',
    });
    expect(queue.getCards).not.toHaveBeenCalled();
    expect(queue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
  });

  it('recomputes nextDues for the same card id when scheduling fields change', async () => {
    const card = createCard({ id: 'cache-card', blockId: 'cache-block' });
    const changedCard = createCard({
      ...card,
      due: card.due + 30 * DAY_MS,
      stability: 30,
      scheduledDays: 30,
      elapsedDays: 30,
      reps: card.reps + 1,
    });
    const queue = createQueueStub(QueueType.RetrievalPractice, [card]);
    const manager = {
      getQueue: vi.fn(() => queue),
      getCard: vi.fn()
        .mockResolvedValueOnce({ ...card })
        .mockResolvedValue({ ...changedCard }),
      getCards: vi.fn(async () => [{ ...changedCard }]),
    };
    const eventBus = { subscribe: vi.fn() };
    const preview = vi.fn((previewCard: FSRSCard) => new Map([
      [1, { ...previewCard, due: Date.now() + 10 * 60_000 }],
      [2, { ...previewCard, due: Date.now() + previewCard.scheduledDays * DAY_MS }],
      [3, { ...previewCard, due: Date.now() + (previewCard.scheduledDays + 1) * DAY_MS }],
      [4, { ...previewCard, due: Date.now() + (previewCard.scheduledDays + 2) * DAY_MS }],
    ]));

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      { preview } as never
    );

    await strategy.hydrateCurrentItem(card);
    await strategy.hydrateCurrentItem(changedCard);

    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('recomputes stale nextDues carried by restored review-session snapshots', async () => {
    const card = createCard({
      id: 'snapshot-nextdues-card',
      blockId: 'snapshot-nextdues-block',
      stability: 30,
      scheduledDays: 30,
      elapsedDays: 30,
    }) as FSRSCard & { nextDues?: Partial<Record<1 | 2 | 3 | 4, string>> };
    card.nextDues = {
      1: '10 min',
      2: '2 d',
      3: '3 d',
      4: '4 d',
    };
    const queue = createQueueStub(QueueType.RetrievalPractice, [card]);
    const manager = {
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async () => ({ ...card })),
      getCards: vi.fn(async () => [{ ...card }]),
    };
    const eventBus = { subscribe: vi.fn() };
    const preview = vi.fn((previewCard: FSRSCard) => new Map([
      [1, { ...previewCard, due: Date.now() + 10 * 60_000 }],
      [2, { ...previewCard, due: Date.now() + previewCard.scheduledDays * DAY_MS }],
      [3, { ...previewCard, due: Date.now() + (previewCard.scheduledDays + 1) * DAY_MS }],
      [4, { ...previewCard, due: Date.now() + (previewCard.scheduledDays + 2) * DAY_MS }],
    ]));

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      { preview } as never
    );

    const hydrated = await strategy.hydrateCurrentItem(card);

    expect(preview).toHaveBeenCalledTimes(1);
    expect(hydrated?.nextDues).toMatchObject({
      1: '10 min',
      2: '30 d',
      3: '31 d',
      4: '32 d',
    });
  });

  it('anchors nextDues preview for manual future cards and caches by memoryStateAsOf', async () => {
    const now = Date.now();
    const originalDue = now + 30 * DAY_MS;
    const card = createCard({
      id: 'manual-future-preview-card',
      blockId: 'manual-future-preview-block',
      due: originalDue,
      lastReview: originalDue - 30 * DAY_MS,
      stability: 30,
      scheduledDays: 30,
      elapsedDays: 30,
    });
    const queue = createQueueStub(QueueType.RetrievalPractice, [card]);
    const getReviewSchedulingContext = vi.fn(() => ({
      memoryStateAsOf: originalDue,
      reason: 'manual-early-review',
    }));
    queue.getReviewSchedulingContext = getReviewSchedulingContext;
    const manager = {
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async () => ({ ...card })),
      getCards: vi.fn(async () => [{ ...card }]),
    };
    const eventBus = { subscribe: vi.fn() };
    const preview = vi.fn((previewCard: FSRSCard, options?: { reviewTime?: number | Date; memoryStateAsOf?: number | Date }) => {
      const anchor = Number(options?.reviewTime ?? Date.now());
      return new Map([
        [1, { ...previewCard, due: anchor + 10 * 60_000 }],
        [2, { ...previewCard, due: anchor + previewCard.scheduledDays * DAY_MS }],
        [3, { ...previewCard, due: anchor + (previewCard.scheduledDays + 5) * DAY_MS }],
        [4, { ...previewCard, due: anchor + (previewCard.scheduledDays + 10) * DAY_MS }],
      ]);
    });

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      { preview } as never
    );

    const hydrated = await strategy.hydrateCurrentItem(card);

    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id }),
      { memoryStateAsOf: originalDue }
    );
    expect(hydrated?.nextDues).toMatchObject({
      1: '10 min',
      2: '30 d',
      3: '35 d',
      4: '40 d',
    });

    getReviewSchedulingContext.mockReturnValue({
      memoryStateAsOf: originalDue + DAY_MS,
      reason: 'manual-early-review',
    });

    await strategy.hydrateCurrentItem(card);

    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('reuses cached cards for getStats-next-getStats and avoids duplicate getCards', async () => {
    const card = createCard();
    const queue = createQueueStub(QueueType.RetrievalPractice, [card]);
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [card]),
      getQueue: vi.fn(() => queue),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    await strategy.getStats();
    await strategy.next();
    await strategy.getStats();

    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    expect(getCardsSpy).not.toHaveBeenCalled();
  });

  it('keeps a single getCards reload on onFeedback-next-getStats path', async () => {
    const card = createCard();
    const queue = createQueueStub(QueueType.RetrievalPractice, [card], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [card]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...card })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    await strategy.next();
    await strategy.getStats();

    expect(getCardsSpy).toHaveBeenCalledTimes(0);
  });

  it('hot-patches projection queueImpact frontier rows without a full queue reload', async () => {
    const firstCard = createCard({ id: 'card-1', blockId: 'block-1', priority: 10 });
    const secondCard = createCard({ id: 'card-2', blockId: 'block-2', priority: 20 });
    const frontierCard = createCard({ id: 'card-3', blockId: 'block-3', priority: 30 });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const projectionImpactEntry = {
          queueType: QueueType.RetrievalPractice,
          policyHash: 'policy-a',
          generation: 2,
          currentGeneration: 2,
          requestedGeneration: 1,
          hotPatchable: true,
          refreshRequired: false,
          reason: 'review-feedback',
          removedRowIds: ['card-1'],
          insertedRows: [{
            rowId: 'card-3',
            cardId: 'card-3',
            queueIndexHint: 2,
            sortKey: '000000002:card-3',
          }],
          updatedRows: [{
            rowId: 'card-2',
            cardId: 'card-2',
            queueIndexHint: 1,
            sortKey: '000000001:card-2',
          }],
          reorderHints: [],
          counterGeneration: 2,
          counters: {
            version: 2,
            remaining: 2,
            due: 2,
            total: 2,
            buckets: {
              all: 2,
              item: 2,
              descriptor: 0,
              topic: 0,
              concept: 0,
            },
            source: 'reconciled',
          },
        };
        const removedIndex = liveCards.findIndex((card) => card.id === cardId);
        if (removedIndex >= 0) {
          liveCards.splice(removedIndex, 1);
        }
        if (!liveCards.some((card) => card.id === frontierCard.id)) {
          liveCards.push({ ...frontierCard });
        }
        return {
          updatedCard: { ...firstCard, due: Date.now() + DAY_MS },
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: true,
          queueImpact: {
            hotPatchable: true,
            refreshRequired: false,
            affectedQueues: [projectionImpactEntry],
          },
          projectionAction: {
            status: 'patch-applied',
            queueType: QueueType.RetrievalPractice,
            generation: 2,
            policyHash: 'policy-a',
            reason: 'review-feedback',
          },
          projectionImpactEntry,
        } as Partial<QueueReviewResult>;
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard, frontierCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expectAdvancedNext(feedbackResult, 'card-2');
    const third = await strategy.next();

    expect(third?.id).toBe('card-2');
    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
  });

  it('hot-patches deferred projection queueImpact without a full queue reload', async () => {
    const firstCard = createCard({ id: 'leech-card-1', blockId: 'leech-block-1', priority: 10 });
    const secondCard = createCard({ id: 'leech-card-2', blockId: 'leech-block-2', priority: 20 });
    const queue = createQueueStub(QueueType.Leech, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const projectionImpactEntry = {
          queueType: QueueType.Leech,
          policyHash: 'policy-leech',
          generation: 2,
          currentGeneration: 2,
          requestedGeneration: 1,
          hotPatchable: true,
          refreshRequired: false,
          reason: 'review-feedback',
          removedRowIds: ['leech-card-1'],
          insertedRows: [],
          updatedRows: [{
            rowId: 'leech-card-2',
            cardId: 'leech-card-2',
            queueIndexHint: 1,
            sortKey: '000000001:leech-card-2',
          }],
          reorderHints: [],
          counterGeneration: 2,
          counters: {
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
            source: 'reconciled',
          },
        };
        const removedIndex = liveCards.findIndex((card) => card.id === cardId);
        if (removedIndex >= 0) {
          liveCards.splice(removedIndex, 1);
        }
        return {
          updatedCard: null,
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: true,
          queueImpact: {
            hotPatchable: true,
            refreshRequired: false,
            affectedQueues: [projectionImpactEntry],
          },
          projectionAction: {
            status: 'patch-applied',
            queueType: QueueType.Leech,
            generation: 2,
            policyHash: 'policy-leech',
            reason: 'review-feedback',
          },
          projectionImpactEntry,
        } as Partial<QueueReviewResult>;
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const strategy = new UnifiedQueueStrategy(
      QueueType.Leech,
      manager as never,
      { subscribe: vi.fn() } as never,
      null
    );

    const first = await strategy.next();
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const second = await strategy.next();

    expect(second?.id).toBe('leech-card-2');
    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalledWith(['leech-card-2']);
  });

  it('hot-patches incremental-learning projection queueImpact before falling back to requery reload', async () => {
    const firstCard = createCard({ id: 'incremental-card-1', blockId: 'incremental-block-1', priority: 10 });
    const secondCard = createCard({ id: 'incremental-card-2', blockId: 'incremental-block-2', priority: 20 });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const projectionImpactEntry = {
          queueType: QueueType.IncrementalLearning,
          policyHash: 'policy-incremental',
          generation: 2,
          currentGeneration: 2,
          requestedGeneration: 1,
          hotPatchable: true,
          refreshRequired: false,
          reason: 'review-feedback',
          removedRowIds: ['incremental-card-1'],
          insertedRows: [],
          updatedRows: [{
            rowId: 'incremental-card-2',
            cardId: 'incremental-card-2',
            blockId: 'incremental-block-2',
            queueIndexHint: 1,
            sortKey: '000000001:incremental-card-2',
          }],
          reorderHints: [],
          counterGeneration: 2,
          counters: {
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
            source: 'reconciled',
          },
        };
        const removedIndex = liveCards.findIndex((card) => card.id === cardId);
        if (removedIndex >= 0) {
          liveCards.splice(removedIndex, 1);
        }
        return {
          updatedCard: { ...firstCard, due: Date.now() + DAY_MS },
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: true,
          queueImpact: {
            hotPatchable: true,
            refreshRequired: false,
            affectedQueues: [projectionImpactEntry],
          },
          projectionAction: {
            status: 'patch-applied',
            queueType: QueueType.IncrementalLearning,
            generation: 2,
            policyHash: 'policy-incremental',
            reason: 'review-feedback',
          },
          projectionImpactEntry,
        } as Partial<QueueReviewResult>;
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, secondCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, []);
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: QueueType.IncrementalLearning,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
      }]),
    };
    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      { subscribe: vi.fn() } as never,
      null
    );

    const first = await strategy.next();
    const getSnapshotRowsSpy = queue.getSnapshotRows as unknown as ReturnType<typeof vi.fn>;
    getSnapshotRowsSpy.mockClear();

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });

    expectAdvancedNext(feedbackResult, 'incremental-card-2');
    expect(getSnapshotRowsSpy).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
  });

  it('uses projection counters for promoted neural-roam remaining size', async () => {
    const neuralCard = createCard({ id: 'neural-card-1', blockId: 'neural-block-1' });
    const queue = createQueueStub(QueueType.NeuralRoam, [neuralCard]);
    (queue.getSize as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(99);
    const manager = {
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async () => ({ ...neuralCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: QueueType.NeuralRoam,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
      }]),
    };
    const strategy = new UnifiedQueueStrategy(
      QueueType.NeuralRoam,
      manager as never,
      { subscribe: vi.fn() } as never,
      null
    );

    await expect(strategy.getRemainingSize()).resolves.toBe(1);
    expect(queue.getCounterSnapshot).toHaveBeenCalled();
    expect(queue.getSize).not.toHaveBeenCalled();
  });

  it('refreshes projection-backed queues when queueImpact requires a generation refresh', async () => {
    const firstCard = createCard({ id: 'card-refresh-1', xiuyuanID: 'xy-refresh-1', blockId: 'block-refresh-1', priority: 10 });
    const secondCard = createCard({ id: 'card-refresh-2', xiuyuanID: 'xy-refresh-2', blockId: 'block-refresh-2', priority: 20 });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const projectionImpactEntry = {
          queueType: QueueType.RetrievalPractice,
          policyHash: 'policy-a',
          generation: 3,
          currentGeneration: 3,
          requestedGeneration: 2,
          hotPatchable: false,
          refreshRequired: true,
          reason: 'generation-mismatch',
          removedRowIds: [],
          insertedRows: [],
          updatedRows: [],
          reorderHints: [],
          counterGeneration: 3,
        };
        const removedIndex = liveCards.findIndex((card) => card.id === cardId);
        if (removedIndex >= 0) {
          liveCards.splice(removedIndex, 1);
        }
        liveCards.push({ ...secondCard });
        return {
          updatedCard: { ...firstCard, due: Date.now() + DAY_MS },
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: true,
          queueImpact: {
            hotPatchable: false,
            refreshRequired: true,
            affectedQueues: [projectionImpactEntry],
          },
          projectionAction: {
            status: 'generation-mismatch',
            queueType: QueueType.RetrievalPractice,
            generation: 3,
            policyHash: 'policy-a',
            reason: 'generation-mismatch',
          },
          projectionImpactEntry,
        } as Partial<QueueReviewResult>;
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();

    const next = await strategy.next();

    expect(next).toBeNull();
    expect(getCardsSpy).not.toHaveBeenCalled();
  });

  it('keeps retrieval-practice Good/Easy cards out of the current session after late queue reloads', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    let observer: { onDataChanged(event: DataChangeEvent): void } | null = null;
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        observer?.onDataChanged({
          type: 'queue-changed',
          queueType: QueueType.RetrievalPractice,
          timestamp: Date.now(),
        });
        const current = liveCards.find((card) => card.id === cardId) ?? null;
        return {
          updatedCard: current ? { ...current, reps: current.reps + 1 } : null,
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: true,
          requiresCurrentViewReorder: false,
        };
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn((nextObserver) => {
        observer = nextObserver;
      }),
      unregisterObserver: vi.fn(),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    strategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.RetrievalPractice,
      timestamp: Date.now(),
    });

    const next = expectAdvancedNext(feedbackResult, secondCard.id);
    const counterSnapshot = await strategy.getCounterSnapshot();
    expect(counterSnapshot?.remaining).toBe(1);
    expect(counterSnapshot?.buckets.all).toBe(1);
  });

  it('keeps incremental-learning Good/Easy cards out of the current session after stale reloads', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const current = liveCards.find((card) => card.id === cardId) ?? null;
        return {
          updatedCard: current ? { ...current, reps: current.reps + 1, due: Date.now() + DAY_MS } : null,
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: false,
        };
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, secondCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });

    const next = expectAdvancedNext(feedbackResult, secondCard.id);

    const counterSnapshot = await strategy.getCounterSnapshot();
    expect(counterSnapshot?.remaining).toBe(1);
    expect(counterSnapshot?.total).toBe(1);
    expect(counterSnapshot?.buckets.all).toBe(1);

    await strategy.onFeedback(next, { action: 'rate', rating: 3 });
    await expect(strategy.next()).resolves.toBeNull();

    const finalCounterSnapshot = await strategy.getCounterSnapshot();
    expect(finalCounterSnapshot?.remaining).toBe(0);
    expect(finalCounterSnapshot?.total).toBe(0);
    expect(finalCounterSnapshot?.buckets.all).toBe(0);
  });

  it('suppresses runtime-backed incremental-learning self queue-changed events during feedback', async () => {
    const firstCard = createCard({ id: 'runtime-self-card-1', xiuyuanID: 'xy-1', blockId: 'runtime-self-block-1' });
    const secondCard = createCard({ id: 'runtime-self-card-2', xiuyuanID: 'xy-2', blockId: 'runtime-self-block-2' });
    let observer: { onDataChanged(event: DataChangeEvent): void } | null = null;
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        observer?.onDataChanged({
          type: 'queue-changed',
          queueType: QueueType.IncrementalLearning,
          timestamp: Date.now(),
        });
        const index = liveCards.findIndex((card) => card.id === cardId);
        if (index >= 0) {
          liveCards.splice(index, 1);
        }
        return {
          updatedCard: { ...firstCard, due: Date.now() + DAY_MS },
          removedFromQueue: true,
          remainsInQueue: false,
          queueChanged: true,
          requiresCurrentViewReorder: false,
        };
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, secondCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, []);
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn((nextObserver) => {
        observer = nextObserver;
      }),
      unregisterObserver: vi.fn(),
    };
    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      { subscribe: vi.fn() } as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 3 });

    expectAdvancedNext(feedbackResult, secondCard.id);
    expect(getCardsSpy).not.toHaveBeenCalled();
  });

  it('keeps retrieval-practice Good/Easy logical duplicates out of the current session after reloads', async () => {
    const firstCard = createCard({
      id: 'card-1',
      xiuyuanID: 'xy-1',
      blockId: 'block-shared',
      meta: { faceIndex: 0 },
    });
    const duplicateSameFace = createCard({
      id: 'card-1-canonical',
      xiuyuanID: 'xy-1',
      blockId: 'block-shared',
      meta: { faceIndex: 0 },
    });
    const sameBlockOtherFace = createCard({
      id: 'card-2',
      xiuyuanID: 'xy-1',
      blockId: 'block-shared',
      meta: { faceIndex: 1 },
    });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, sameBlockOtherFace], {
      handleReview: async (cardId, _rating, liveCards) => {
        const index = liveCards.findIndex((card) => card.id === cardId);
        if (index >= 0) {
          liveCards[index] = { ...duplicateSameFace };
        }
        return {
          updatedCard: { ...duplicateSameFace, reps: duplicateSameFace.reps + 1 },
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: true,
          requiresCurrentViewReorder: false,
        };
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, sameBlockOtherFace]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, sameBlockOtherFace].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    strategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.RetrievalPractice,
      timestamp: Date.now(),
    });

    expectAdvancedNext(feedbackResult, sameBlockOtherFace.id);
  });

  it('ignores frontend follower runtime when worker session backend is available', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, secondCard]);
    const worker = withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, secondCard]);
    const ensureWritable = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease');
    });
    const manager = {
      workerSessionBackend: worker.workerSessionBackend,
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, []);
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
      resolvePluginContext: vi.fn(() => ({
        getSrsBackendClient: () => worker.workerSessionBackend,
        getFrontendInstanceRuntime: () => ({
          getMode: () => 'follower',
          getInstanceId: () => 'follower-review-session-1',
          ensureWritable,
        }),
      })),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 3 });

    expectAdvancedNext(feedbackResult, secondCard.id);
    expect(ensureWritable).not.toHaveBeenCalled();
    expect(queue.handleReview).not.toHaveBeenCalled();
    expect(queue.skip).not.toHaveBeenCalled();
    expect((await strategy.getCounterSnapshot())?.remaining).toBe(1);
  });

  it('uses worker session backend instead of relayed writer runtime success', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard]);
    const worker = withWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]);
    const ensureWritable = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease');
    });
    const manager = {
      workerSessionBackend: worker.workerSessionBackend,
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, []);
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
      resolvePluginContext: vi.fn(() => ({
        getSrsBackendClient: () => worker.workerSessionBackend,
        getFrontendInstanceRuntime: () => ({
          getMode: () => 'follower',
          getInstanceId: () => 'follower-review-session-2',
          ensureWritable,
        }),
      })),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });

    expectAdvancedNext(feedbackResult, secondCard.id);
    expect(ensureWritable).not.toHaveBeenCalled();
    expect(queue.handleReview).not.toHaveBeenCalled();
    expect((await strategy.getCounterSnapshot())?.remaining).toBe(1);
  });

  it('keeps filter-group Good/Easy cards out of the current session despite self queue-changed events', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-shared' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-shared' });
    const { queue, strategy } = createFilterGroupLoopFixture([firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const current = liveCards.find((card) => card.id === cardId) ?? null;
        return {
          updatedCard: current ? { ...current, reps: current.reps + 1 } : null,
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: true,
          requiresCurrentViewReorder: false,
        };
      },
    });

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);
    const getCardsSpy = queue.getCards as unknown as ReturnType<typeof vi.fn>;
    getCardsSpy.mockClear();

    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);

    await strategy.onFeedback(next, { action: 'rate', rating: 3 });
    await expect(strategy.next()).resolves.toBeNull();

    const counterSnapshot = await strategy.getCounterSnapshot();
    expect(counterSnapshot?.remaining).toBe(0);
    expect(counterSnapshot?.total).toBe(0);
    expect(counterSnapshot?.buckets.all).toBe(0);
    expect(getCardsSpy).toHaveBeenCalledTimes(0);
  });

  it('rotates filter-group Again/Hard behind later cards while suppressing self queue-changed events', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const { strategy } = createFilterGroupLoopFixture([firstCard, secondCard]);

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    const next = await strategy.next();
    expect(next?.id).toBe(secondCard.id);

    const repeatLater = await strategy.next();
    expect(repeatLater?.id).toBe(firstCard.id);
  });

  it('clears filter-group session exclusions on full refresh queue changes', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const { strategy } = createFilterGroupLoopFixture([firstCard, secondCard]);

    const first = await strategy.next();
    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expect((await strategy.next())?.id).toBe(secondCard.id);

    strategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.FilterGroup,
      requiresFullRefresh: true,
      timestamp: Date.now(),
    });

    const afterFullRefresh = await strategy.next();
    expect(afterFullRefresh?.id).toBe(firstCard.id);
  });

  it('keeps self-triggered full refresh during feedback from breaking the current review turn', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    let observer: { onDataChanged(event: DataChangeEvent): void } | null = null;
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const projectionImpactEntry = {
          queueType: QueueType.RetrievalPractice,
          policyHash: 'policy-a',
          generation: 2,
          currentGeneration: 2,
          requestedGeneration: 1,
          hotPatchable: true,
          refreshRequired: false,
          reason: 'review-feedback',
          removedRowIds: ['card-1'],
          insertedRows: [],
          updatedRows: [{
            rowId: 'card-2',
            cardId: 'card-2',
            blockId: 'block-2',
            queueIndexHint: 1,
            sortKey: '000000001:card-2',
          }],
          reorderHints: [],
          counterGeneration: 2,
          counters: {
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
            source: 'reconciled',
          },
        };
        observer?.onDataChanged({
          type: 'queue-changed',
          queueType: QueueType.RetrievalPractice,
          requiresFullRefresh: true,
          timestamp: Date.now(),
        });
        const current = liveCards.find((card) => card.id === cardId) ?? null;
        return {
          updatedCard: current ? { ...current, reps: current.reps + 1 } : null,
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: true,
          requiresCurrentViewReorder: false,
          projectionAction: {
            status: 'patch-applied',
            queueType: QueueType.RetrievalPractice,
            generation: 2,
            policyHash: 'policy-a',
            reason: 'review-feedback',
          },
          projectionImpactEntry,
        };
      },
    });
    (queue.getCardsBySnapshotIds as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('QUEUE_PROJECTION_NOT_READY: snapshot rows for retrieval-practice requires backend projection but projection is still refreshing'),
    );
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]),
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, secondCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, []);
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        const card = [firstCard, secondCard].find((candidate) => candidate.id === cardId);
        if (!card) {
          throw new Error('card not found');
        }
        return { ...card };
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      registerObserver: vi.fn((nextObserver) => {
        observer = nextObserver;
      }),
      unregisterObserver: vi.fn(),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expectAdvancedNext(feedbackResult, secondCard.id);
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
    await expect(strategy.getCounterSnapshot()).resolves.toMatchObject({
      remaining: 1,
      total: 1,
    });
  });

  it('preserves filter-group session exclusions through review tab snapshots and reloads', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const { strategy } = createFilterGroupLoopFixture([firstCard, secondCard]);

    const first = await strategy.next();
    await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    const snapshot = strategy.serializeSessionSnapshot();
    expect(snapshot.sessionExcludedCardIds).toEqual([firstCard.id]);

    const { strategy: restoredStrategy } = createFilterGroupLoopFixture([firstCard, secondCard]);
    restoredStrategy.restoreSessionSnapshot(snapshot);
    restoredStrategy.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.FilterGroup,
      timestamp: Date.now(),
    });

    const next = await restoredStrategy.next();
    expect(next?.id).toBe(secondCard.id);
  });

  it('rotates low-rated card once when there are alternative cards', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const thirdCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-3' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard, thirdCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const current = liveCards.find((card) => card.id === cardId) ?? null;
        return {
          updatedCard: current,
          removedFromQueue: false,
          remainsInQueue: true,
          queueChanged: false,
          requiresCurrentViewReorder: false,
        };
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });

    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard, thirdCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    expectAdvancedNext(feedbackResult, secondCard.id);
  });

  it('keeps immediate repeat when low-rated card is the only candidate', async () => {
    const card = createCard();
    const queue = createQueueStub(QueueType.RetrievalPractice, [card], {
      handleReview: async (cardId, _rating, liveCards) => ({
        updatedCard: liveCards.find((candidate) => candidate.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: false,
        requiresCurrentViewReorder: false,
      }),
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [card]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...card })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(card.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    expectAdvancedNext(feedbackResult, card.id);
  });

  it('does not rotate cards on rating 3/4', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const secondCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [firstCard, secondCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [firstCard, secondCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expectAdvancedNext(feedbackResult, secondCard.id);
  });

  it('requeries incremental learning after low feedback and advances to a different card when available', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const sameBlockSibling = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard], {
      handleReview: async (cardId, _rating, liveCards) => ({
        updatedCard: liveCards.find((card) => card.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: true,
        requiresCurrentViewReorder: true,
      }),
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    expectAdvancedNext(feedbackResult, nextBlockCard.id);
  });

  it('requeries incremental learning after high feedback and avoids same-block sibling cards', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const sameBlockSibling = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 4 });
    expectAdvancedNext(feedbackResult, nextBlockCard.id);
  });

  it('allows immediate repeat in incremental learning when the deferred card is the only candidate', async () => {
    const card = createCard();
    const queue = createQueueStub(QueueType.IncrementalLearning, [card], {
      handleReview: async (cardId, _rating, liveCards) => ({
        updatedCard: liveCards.find((candidate) => candidate.id === cardId) ?? null,
        removedFromQueue: false,
        remainsInQueue: true,
        queueChanged: true,
        requiresCurrentViewReorder: true,
      }),
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [card]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...card })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(card.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    expectAdvancedNext(feedbackResult, card.id);
  });

  it('requeries incremental learning after skip and advances to the next available card', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const sameBlockSibling = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-2' });
    const liveCards = [{ ...firstCard }, { ...sameBlockSibling }, { ...nextBlockCard }];
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    (queue.getCards as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => liveCards.map((card) => ({ ...card })));
    (queue.getCounterSnapshot as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      version: 1,
      remaining: liveCards.length,
      due: liveCards.length,
      total: liveCards.length,
      buckets: {
        all: liveCards.length,
        item: liveCards.length,
        descriptor: 0,
        topic: 0,
        concept: 0,
      },
      source: 'hot',
    }));
    (queue.skip as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (cardId: string) => {
      const index = liveCards.findIndex((card) => card.id === cardId);
      if (index === -1) {
        return;
      }
      const [skipped] = liveCards.splice(index, 1);
      if (skipped) {
        liveCards.push(skipped);
      }
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(firstCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'skip' });
    expectAdvancedNext(feedbackResult, nextBlockCard.id);
  });

  it('does not let local incremental stale-card cleanup run under worker session authority', async () => {
    const staleCard = createCard({ id: 'card-stale', xiuyuanID: 'xy-stale', blockId: 'block-stale' });
    const nextCard = createCard({ id: 'card-next', xiuyuanID: 'xy-next', blockId: 'block-next' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [staleCard, nextCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const index = liveCards.findIndex((card) => card.id === cardId);
        if (index >= 0) {
          liveCards.splice(index, 1);
        }
        throw new Error(`获取卡片失败 (${cardId}): Card not found: ${cardId}`);
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [staleCard, nextCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...staleCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(staleCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 3 });

    expect(queue.handleReview).not.toHaveBeenCalled();
    expectAdvancedNext(feedbackResult, nextCard.id);
  });

  it('does not let renderer queue stale-card cleanup mask worker feedback success', async () => {
    const staleCard = createCard({ id: 'card-backend-missing', xiuyuanID: 'xy-stale', blockId: 'block-stale' });
    const nextCard = createCard({ id: 'card-next-after-backend-missing', xiuyuanID: 'xy-next', blockId: 'block-next' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [staleCard, nextCard], {
      handleReview: async (cardId, _rating, liveCards) => {
        const index = liveCards.findIndex((card) => card.id === cardId);
        if (index >= 0) {
          liveCards.splice(index, 1);
        }
        throw new Error(`INTERNAL_ERROR: review.feedback card not found: ${cardId}`);
      },
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [staleCard, nextCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...staleCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null,
    );

    const first = await strategy.next();
    expect(first?.id).toBe(staleCard.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 3 });

    expect(queue.handleReview).not.toHaveBeenCalled();
    expectAdvancedNext(feedbackResult, nextCard.id);
  });

  it('evicts a restored current item that no longer exists before showing review scheduling preview', async () => {
    const staleCard = createCard({ id: 'card-restored-missing', xiuyuanID: 'xy-stale', blockId: 'block-stale' });
    const nextCard = createCard({ id: 'card-after-restored-missing', xiuyuanID: 'xy-next', blockId: 'block-next' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [nextCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [nextCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async (cardId: string) => cardId === nextCard.id ? { ...nextCard } : null),
      getCards: vi.fn(async (filters?: { blockIds?: string[] }) => {
        const blockIds = new Set(filters?.blockIds ?? []);
        return blockIds.has(nextCard.blockId) ? [{ ...nextCard }] : [];
      }),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null,
    );

    const hydrated = await strategy.hydrateCurrentItem(staleCard);

    expect(hydrated?.id).toBe(nextCard.id);
    expect(hydrated?.id).not.toBe(staleCard.id);
    expect(strategy.serializeSessionSnapshot().currentItem?.id).toBe(nextCard.id);
  });

  it.each([
    QueueType.IncrementalLearning,
    QueueType.FilterGroup,
  ])('keeps worker session authority from using missing-block local snapshot reads for %s', async (queueType) => {
    const staleCard = createCard({
      id: `card-stale-${queueType}`,
      xiuyuanID: `xy-stale-${queueType}`,
      blockId: `block-stale-${queueType}`,
    });
    const nextCard = createCard({
      id: `card-next-${queueType}`,
      xiuyuanID: `xy-next-${queueType}`,
      blockId: `block-next-${queueType}`,
    });
    const queue = createQueueStub(queueType, [staleCard, nextCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...(queueType === QueueType.IncrementalLearning ? withWorkerSessionBackend(QueueType.IncrementalLearning, [staleCard, nextCard]) : {}),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => {
        throw new Error(`Block not found for current source ${staleCard.blockId}: ${staleCard.id}`);
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      queueType,
      manager as never,
      eventBus as never,
      null,
    );

    const first = await strategy.next();
    expect(first?.id).toBe(staleCard.id);

    if (queueType === QueueType.IncrementalLearning) {
      const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 3 });
      expect(queue.handleReview).not.toHaveBeenCalled();
      expectAdvancedNext(feedbackResult, nextCard.id);
    } else {
      let caught: unknown;
      try {
        await strategy.onFeedback(first, { action: 'rate', rating: 3 });
      } catch (error) {
        caught = error;
      }
      expect(isQueueItemUnavailableError(caught)).toBe(true);
      expect(queue.handleReview).not.toHaveBeenCalled();
    }
  });

  it('preserves generic snapshot failure for non-missing pre-review errors', async () => {
    const currentCard = createCard({ id: 'card-snapshot-generic', blockId: 'block-snapshot-generic' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [currentCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [currentCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => {
        throw new Error('sqlite busy during snapshot read');
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };
    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null,
    );

    const first = await strategy.next();
    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 3 });

    expect(feedbackResult).toMatchObject({
      status: 'advanced',
      nextItem: null,
    });
    expect(queue.handleReview).not.toHaveBeenCalled();
  });

  it('fails closed on worker session feedback failure without local queue rollback authority', async () => {
    const first = createCard({ id: 'card-first', blockId: 'block-first', priority: 10 });
    const second = createCard({ id: 'card-second', blockId: 'block-second', priority: 20 });
    const changedFirst = createCard({ ...first, due: first.due + DAY_MS, priority: 99 });
    const restoreCardSnapshotForFailedFeedback = vi.fn(async () => {});
    const queue = createQueueStub(QueueType.RetrievalPractice, [first, second], {
      createRollbackSnapshot: async (liveCards) => liveCards.map((card) => ({ ...card })),
      restoreRollbackSnapshot: async (snapshot, liveCards) => {
        liveCards.splice(0, liveCards.length, ...(snapshot as FSRSCard[]).map((card) => ({ ...card })));
      },
      handleReview: async (_cardId, _rating, liveCards) => {
        liveCards.splice(0, 1, changedFirst);
        throw new Error('mock persist failed');
      },
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [first, second]),
      getQueue: vi.fn(() => queue),
      getCard: vi.fn(async () => ({ ...first })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      restoreCardSnapshotForFailedFeedback,
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );
    const workerSessionBackend = manager.workerSessionBackend;
    workerSessionBackend.reviewSessionFeedback.mockRejectedValueOnce(new Error('WORKER_COMMIT_FAILED: mock persist failed'));

    const current = await strategy.next();
    await expect(strategy.onFeedback(current, { action: 'rate', rating: 3 })).rejects.toThrow('WORKER_COMMIT_FAILED: mock persist failed');

    expect(queue.handleReview).not.toHaveBeenCalled();
    expect(restoreCardSnapshotForFailedFeedback).not.toHaveBeenCalled();
    expect(strategy.canGoBack()).toBe(false);
  });

  it('keeps worker-owned current card when a deleted sibling shares the same block id', async () => {
    const currentCard = createCard({ id: 'card-current', xiuyuanID: 'xy-current', blockId: 'block-shared' });
    const deletedSibling = createCard({ id: 'card-deleted', xiuyuanID: 'xy-deleted', blockId: 'block-shared' });
    const otherCard = createCard({ id: 'card-other', xiuyuanID: 'xy-other', blockId: 'block-other' });
    const queue = createQueueStub(QueueType.RetrievalPractice, [currentCard, deletedSibling, otherCard]);
    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [currentCard, deletedSibling, otherCard]),
      getQueue: vi.fn(() => queue),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const current = await strategy.next();
    expect(current?.id).toBe(currentCard.id);

    strategy.onDataChanged({
      type: 'card-deleted',
      cardIds: [deletedSibling.id],
      blockIds: [deletedSibling.blockId],
      timestamp: Date.now(),
    });

    const snapshot = strategy.serializeSessionSnapshot();
    expect(snapshot.currentItem?.id).toBe(currentCard.id);
    expect(snapshot.cachedCards.map((card) => card.id)).toEqual([currentCard.id]);
  });

  it('ignores renderer snapshot avoid-once state when worker session owns incremental-learning advancement', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const sameBlockSibling = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-3', xiuyuanID: 'xy-3', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [sameBlockSibling, nextBlockCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, sameBlockSibling, nextBlockCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    strategy.restoreSessionSnapshot({
      version: 1,
      queueType: QueueType.IncrementalLearning,
      cacheValid: true,
      currentIndex: 0,
      cachedCards: [sameBlockSibling, nextBlockCard],
      currentItem: null,
      forwardBuffer: [],
      pendingRotateCardId: null,
      avoidOnceCardId: firstCard.id,
      avoidOnceBlockId: firstCard.blockId,
      deferOnceCardId: firstCard.id,
      lastCounterSnapshot: null,
    });

    const next = await strategy.next();
    expect(next?.id).toBe(firstCard.id);
  });

  it('ignores legacy renderer deferOnceCardId snapshots when worker session owns advancement', async () => {
    const firstCard = createCard({ id: 'card-1', xiuyuanID: 'xy-1', blockId: 'block-1' });
    const nextBlockCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    const queue = createQueueStub(QueueType.IncrementalLearning, [firstCard, nextBlockCard], {
      createRollbackSnapshot: async () => ({ ok: true }),
      restoreRollbackSnapshot: async () => {},
    });
    const manager = {
      ...withWorkerSessionBackend(QueueType.IncrementalLearning, [firstCard, nextBlockCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return createQueueStub(QueueType.FinalDrill, [], {
            createRollbackSnapshot: async () => ({ ok: true }),
            restoreRollbackSnapshot: async () => {},
          });
        }
        return queue;
      }),
      getCard: vi.fn(async () => ({ ...firstCard })),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.IncrementalLearning,
      manager as never,
      eventBus as never,
      null
    );

    strategy.restoreSessionSnapshot({
      version: 1,
      queueType: QueueType.IncrementalLearning,
      cacheValid: true,
      currentIndex: 0,
      cachedCards: [firstCard, nextBlockCard],
      currentItem: null,
      forwardBuffer: [],
      pendingRotateCardId: null,
      deferOnceCardId: firstCard.id,
      lastCounterSnapshot: null,
    });

    const next = await strategy.next();
    expect(next?.id).toBe(firstCard.id);
  });

  it('does not restore renderer queue snapshots when going back after worker-owned rating', async () => {
    const card = createCard();
    const nextCard = createCard({ id: 'card-2', xiuyuanID: 'xy-2', blockId: 'block-2' });
    let cardStore: FSRSCard = { ...card };
    const queueCards = [card, nextCard];

    const primaryRestore = vi.fn(async () => {});
    const finalRestore = vi.fn(async () => {});

    const primaryQueue = createQueueStub(QueueType.RetrievalPractice, queueCards, {
      handleReview: async (cardId: string, rating: number) => {
        if (cardId === card.id && rating === 2) {
          cardStore = { ...cardStore, due: Date.now() + 86_400_000, reps: cardStore.reps + 1 };
          return {
            updatedCard: cardStore,
            removedFromQueue: false,
            remainsInQueue: true,
            queueChanged: false,
            requiresCurrentViewReorder: false,
          };
        }
        return {};
      },
      createRollbackSnapshot: async () => ({ primary: true }),
      restoreRollbackSnapshot: primaryRestore,
    });
    const finalDrillQueue = createQueueStub(QueueType.FinalDrill, [], {
      createRollbackSnapshot: async () => ({ final: true }),
      restoreRollbackSnapshot: finalRestore,
    });

    const manager = {
      ...withWorkerSessionBackend(QueueType.RetrievalPractice, [card, nextCard]),
      getQueue: vi.fn((type: QueueType) => {
        if (type === QueueType.FinalDrill) {
          return finalDrillQueue;
        }
        return primaryQueue;
      }),
      getCard: vi.fn(async (cardId: string) => {
        if (cardId === card.id) {
          return { ...cardStore };
        }
        throw new Error('card not found');
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async (updatedCard: FSRSCard) => {
        cardStore = { ...updatedCard };
      }),
    };
    const eventBus = { subscribe: vi.fn() };

    const strategy = new UnifiedQueueStrategy(
      QueueType.RetrievalPractice,
      manager as never,
      eventBus as never,
      null
    );

    const first = await strategy.next();
    expect(first?.id).toBe(card.id);

    const feedbackResult = await strategy.onFeedback(first, { action: 'rate', rating: 2 });
    const current = expectAdvancedNext(feedbackResult, nextCard.id);

    const previous = await strategy.goBack(current);
    expect(previous).toBeNull();
    expect(primaryRestore).not.toHaveBeenCalled();
    expect(finalRestore).not.toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
  });
});
