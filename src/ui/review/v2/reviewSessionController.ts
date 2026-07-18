import { ref, type Ref } from 'vue';
import {
  isQueueItemUnavailableError,
  type IQueueStrategy,
  type QueueFeedback,
  type QueueFeedbackResult,
} from '@/core/queue/abstraction/Strategy';
import type { QueueItem } from '@/core/queue/types';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
import type { InitialReviewSessionState } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import {
  measureRuntimePerformance,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
import type {
  AdapterContext,
  IAdapter,
  ReviewAdvanceWithoutFeedbackOptions,
  RefreshCurrentItemOptions,
  ReviewAdvanceReason,
  ReviewUIState,
} from './types';
import { createEmptyReviewUIState } from './types';

const logger = createLogger('ReviewSessionController');
const REVIEW_GRADE_PHASE_SLOW_MS = 500;
let reviewCommitIdentityCounter = 0;

type RatingValue = 1 | 2 | 3 | 4;

type ItemIdLike = {
  id?: unknown;
  cardID?: unknown;
  cardId?: unknown;
  blockID?: unknown;
  blockId?: unknown;
};

type ItemMetaLike = {
  meta?: unknown;
};

type NeuralContextLike = {
  blockType?: unknown;
  isFlashcard?: unknown;
};

type UnderlyingQueueBridge = {
  getUnderlyingQueue: () => unknown;
};

type SessionResettableQueue = {
  resetSessionState?: () => void;
};

type SessionHistoryEntry = NonNullable<NonNullable<AdapterContext['session']>['reviewHistory']>[number];

type NeuralPathLoader<TItem> = {
  getPathItemByNodeId: (blockId: string) => Promise<TItem | null>;
};

function isFeedbackAdvanceResult<TItem extends QueueItem>(
  result: QueueFeedbackResult<TItem> | void,
): result is QueueFeedbackResult<TItem> {
  return Boolean(result && result.status === 'advanced');
}

export type ReviewSessionUpdateReason =
  | 'mount'
  | 'reveal'
  | 'grade'
  | 'skip'
  | 'no-score-removal'
  | 'custom'
  | 'back'
  | 'reload'
  | 'refresh-current'
  | 'load-by-block';

type SessionUpdateReason = ReviewSessionUpdateReason;

type ReviewActionErrorReason = Extract<SessionUpdateReason, 'grade' | 'skip' | 'custom'>;

export type ReviewSessionRetryAction =
  | { type: 'grade'; rating: RatingValue }
  | { type: 'skip' }
  | { type: 'custom'; commandId: string };

export interface ReviewSessionActionError<TItem extends QueueItem = QueueItem> {
  reason: ReviewActionErrorReason;
  message: string;
  error: unknown;
  item: TItem | null;
  action?: ReviewSessionRetryAction;
}

export interface ReviewSessionControllerSnapshot<TItem extends QueueItem = QueueItem> {
  state: ReviewUIState;
  context: AdapterContext;
  currentItem: TItem | null;
  attachedSurfaceIds: string[];
  started: boolean;
  disposed: boolean;
}

export interface ReviewSessionController<TItem extends QueueItem = QueueItem> {
  readonly state: Ref<ReviewUIState>;
  readonly context: Ref<AdapterContext>;
  attachSurface: (surfaceId: string) => void;
  detachSurface: (surfaceId: string) => void;
  reveal: () => void;
  grade: (rating: number) => Promise<void>;
  skip: () => Promise<void>;
  advanceWithoutFeedback: (options?: ReviewAdvanceWithoutFeedbackOptions) => Promise<void>;
  back: () => Promise<void>;
  executeCommand: (cmdId: string) => Promise<void>;
  reload: () => Promise<void>;
  refreshCurrentItem: (item: unknown, options?: RefreshCurrentItemOptions) => Promise<void>;
  getQueueStrategy: () => IQueueStrategy<TItem>;
  loadCardByBlockId: (blockId: string) => Promise<void>;
  renderItemPreview: (item: unknown, previewContext: AdapterContext) => Promise<ReviewUIState>;
  getSnapshot: () => ReviewSessionControllerSnapshot<TItem>;
  subscribe: (listener: (snapshot: ReviewSessionControllerSnapshot<TItem>) => void) => () => void;
  subscribeDispose: (listener: () => void) => () => void;
  isDisposed: () => boolean;
  dispose: () => void;
}

export interface CreateReviewSessionControllerOptions<TItem extends QueueItem = QueueItem> {
  onReview?: (cardId: string, rating: number) => void;
  onReviewDetailed?: (payload: { cardId: string; rating: number; item: TItem | null }) => void | Promise<void>;
  onActionError?: (payload: ReviewSessionActionError<TItem>) => void;
  initialSessionState?: InitialReviewSessionState;
  initialCurrentItem?: TItem | null;
  initialShowAnswer?: boolean;
  prepareStateBeforeCommit?: (
    state: ReviewUIState,
    reason: ReviewSessionUpdateReason,
  ) => Promise<ReviewUIState>;
  onQueueCompleted?: (input: { reason: Extract<ReviewSessionUpdateReason, 'grade' | 'skip' | 'custom'> }) => void | Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRatingValue(rating: number): RatingValue {
  return Math.max(1, Math.min(4, Math.floor(rating))) as RatingValue;
}

function extractCardId(item: unknown): string {
  if (!isRecord(item)) {
    return '';
  }

  const shaped = item as ItemIdLike;
  const raw = shaped.cardID ?? shaped.cardId ?? shaped.id;
  return raw == null ? '' : String(raw);
}

function createReviewCommitIdempotencyKey(cardId: string, rating: RatingValue): string {
  reviewCommitIdentityCounter += 1;
  const normalizedCardId = String(cardId || 'unknown-card').replace(/[^a-zA-Z0-9_.:-]/g, '_');
  return [
    'review-commit',
    normalizedCardId,
    rating,
    Date.now().toString(36),
    reviewCommitIdentityCounter.toString(36),
  ].join(':');
}

async function measureReviewPhase<TResult>(
  phase: string,
  cardId: string,
  task: () => Promise<TResult>,
): Promise<TResult> {
  const startedAt = Date.now();
  try {
    return await measureRuntimePerformance('review', `grade.${phase}`, task, { cardId });
  } finally {
    const durationMs = Date.now() - startedAt;
    if (durationMs >= REVIEW_GRADE_PHASE_SLOW_MS) {
      logger.info('[ReviewSessionController] slow review grade phase', {
        phase,
        cardId,
        durationMs,
      });
    }
  }
}

function extractBlockId(item: unknown): string {
  if (!isRecord(item)) {
    return '';
  }

  const shaped = item as ItemIdLike;
  const raw = shaped.blockID ?? shaped.blockId;
  return raw == null ? '' : String(raw);
}

function collectExpectedRefreshIds(options?: RefreshCurrentItemOptions): string[] {
  return [
    String(options?.expectedCurrentCardId || '').trim(),
    String(options?.expectedCurrentBlockId || '').trim(),
  ].filter((value) => value.length > 0);
}

function matchesRefreshExpectation(item: unknown, options?: RefreshCurrentItemOptions): boolean {
  const expectedIds = collectExpectedRefreshIds(options);
  if (expectedIds.length === 0) {
    return true;
  }

  const currentIds = new Set([
    String(extractCardId(item) || '').trim(),
    String(extractBlockId(item) || '').trim(),
  ].filter((value) => value.length > 0));

  if (currentIds.size === 0) {
    return false;
  }

  return expectedIds.some((id) => currentIds.has(id));
}

function extractNeuralContext(item: unknown): NeuralContextLike | null {
  if (!isRecord(item)) {
    return null;
  }

  const metaValue = (item as ItemMetaLike).meta;
  if (!isRecord(metaValue)) {
    return null;
  }

  const neuralContext = metaValue.neuralContext;
  if (!isRecord(neuralContext)) {
    return null;
  }

  return neuralContext as NeuralContextLike;
}

function shouldShowAnswerForNeuralItem(item: unknown): boolean {
  const neuralContext = extractNeuralContext(item);
  if (!neuralContext) {
    return false;
  }

  const blockType = String(neuralContext.blockType ?? '');
  const isFlashcard = neuralContext.isFlashcard;
  return isFlashcard === false || blockType === 'topic';
}

function resolveNeuralPathLoader<TItem extends QueueItem>(queue: IQueueStrategy<TItem>): NeuralPathLoader<TItem> | null {
  const queueCandidate = queue as unknown;
  if (!isRecord(queueCandidate)) {
    return null;
  }

  const bridge = queueCandidate as Partial<UnderlyingQueueBridge>;
  if (typeof bridge.getUnderlyingQueue !== 'function') {
    return null;
  }

  const underlying = bridge.getUnderlyingQueue();
  if (!isNeuralRoamSessionQueue(underlying)) {
    return null;
  }

  return {
    getPathItemByNodeId: underlying.getPathItemByNodeId.bind(underlying),
  };
}

async function hydrateDisplayItem<TItem extends QueueItem>(
  queue: IQueueStrategy<TItem>,
  item: TItem | null,
): Promise<TItem | null> {
  if (!item || typeof queue.hydrateCurrentItem !== 'function') {
    return item;
  }

  return await queue.hydrateCurrentItem(item);
}

function ensureSessionState(context: AdapterContext, initialTotal?: number): NonNullable<AdapterContext['session']> {
  const session = context.session ?? {
    startTime: Date.now(),
    resumed: false,
  };

  session.startTime = Number.isFinite(session.startTime) ? session.startTime : Date.now();
  session.resumed = session.resumed === true;
  session.initialTotal = initialTotal ?? session.initialTotal;
  session.answeredCount = Math.max(0, Number(session.answeredCount) || 0);
  session.correctCount = Math.max(0, Number(session.correctCount) || 0);
  session.baselineVersion = Math.max(0, Number(session.baselineVersion) || 0);
  session.reviewHistory = Array.isArray(session.reviewHistory) ? session.reviewHistory : [];
  session.blockedSkippedCount = Math.max(0, Number(session.blockedSkippedCount) || 0);
  session.blockedSkippedCards = Array.isArray(session.blockedSkippedCards) ? session.blockedSkippedCards : [];
  session.midSessionInsertedCount = Math.max(0, Number(session.midSessionInsertedCount) || 0);
  session.midSessionInsertedCards = Array.isArray(session.midSessionInsertedCards) ? session.midSessionInsertedCards : [];
  context.session = session;
  return session;
}

function pushReviewHistory(context: AdapterContext, entry: SessionHistoryEntry): void {
  const session = ensureSessionState(context);
  session.reviewHistory = [...(session.reviewHistory || []), entry];
  session.answeredCount = Math.max(0, (session.answeredCount || 0) + entry.answeredDelta);
  session.correctCount = Math.max(0, (session.correctCount || 0) + entry.correctDelta);
}

function pushNoScoreRemovalDiagnostic(
  context: AdapterContext,
  options?: ReviewAdvanceWithoutFeedbackOptions,
): void {
  const shouldDecrementTotal = options?.decrementTotal === true;
  if (shouldDecrementTotal) {
    const session = ensureSessionState(context);
    session.initialTotal = Math.max(0, (Number(session.initialTotal) || 0) - 1);
  }

  const diagnostic = options?.diagnostic;
  if (!diagnostic) {
    return;
  }

  const session = ensureSessionState(context);
  const nextDiagnostic = {
    ...diagnostic,
    occurredAt: Number.isFinite(diagnostic.occurredAt) ? diagnostic.occurredAt : Date.now(),
  };
  session.blockedSkippedCards = [
    ...(Array.isArray(session.blockedSkippedCards) ? session.blockedSkippedCards : []),
    nextDiagnostic,
  ];
  session.blockedSkippedCount = Math.max(0, Number(session.blockedSkippedCount) || 0) + 1;
}

function rollbackReviewHistory(context: AdapterContext): void {
  const session = ensureSessionState(context);
  const history = Array.isArray(session.reviewHistory) ? [...session.reviewHistory] : [];
  const lastEntry = history.pop();
  session.reviewHistory = history;

  if (!lastEntry) {
    return;
  }

  session.answeredCount = Math.max(0, (session.answeredCount || 0) - lastEntry.answeredDelta);
  session.correctCount = Math.max(0, (session.correctCount || 0) - lastEntry.correctDelta);
}

function mergeAux(base: ReviewUIState, aux: Partial<ReviewUIState>): ReviewUIState {
  const headerAux = aux.header;
  const contentAux = aux.content;
  const actionsAux = aux.actions;
  const metaAux = aux.meta;

  const header = headerAux
    ? {
        ...base.header,
        ...headerAux,
        stats: {
          ...base.header.stats,
          ...(headerAux.stats ?? {}),
        },
        breadcrumbs: headerAux.breadcrumbs ?? base.header.breadcrumbs,
        toolbar: Array.isArray(headerAux.toolbar) ? headerAux.toolbar : base.header.toolbar,
      }
    : base.header;

  const content = contentAux
    ? {
        ...base.content,
        ...contentAux,
      }
    : base.content;

  const actions = actionsAux
    ? {
        ...base.actions,
        ...actionsAux,
        grades: actionsAux.grades ?? base.actions.grades,
        menu: actionsAux.menu ?? base.actions.menu,
      }
    : base.actions;

  const meta = metaAux
    ? {
        ...base.meta,
        ...metaAux,
      }
    : base.meta;

  return {
    ...base,
    ...aux,
    header,
    content,
    actions,
    meta,
    overlay: aux.overlay === undefined ? base.overlay : aux.overlay,
  };
}

function mergePreparedPresentation(
  current: ReviewUIState,
  prepared: ReviewUIState,
): ReviewUIState {
  if (current.content.id !== prepared.content.id || !prepared.content.prepared) {
    return current;
  }

  return {
    ...current,
    content: {
      ...current.content,
      prepared: prepared.content.prepared,
    },
  };
}

export function createReviewSessionController<TItem extends QueueItem>(
  queue: IQueueStrategy<TItem>,
  adapter: IAdapter<TItem>,
  options?: CreateReviewSessionControllerOptions<TItem>,
): ReviewSessionController<TItem> {
  const state = ref<ReviewUIState>(createEmptyReviewUIState());
  const currentItem = ref<TItem | null>(null);
  const now = Date.now();
  const context = ref<AdapterContext>({
    showAnswer: false,
    session: {
      startTime: now,
      resumed: false,
      answeredCount: 0,
      correctCount: 0,
      baselineVersion: 0,
      reviewHistory: [],
    },
  });

  let updateSeq = 0;
  let started = false;
  let disposed = false;
  let startPromise: Promise<void> | null = null;
  let serializedAction: Promise<void> = Promise.resolve();
  let queueCompletionNotified = false;
  let latestCommitStatus: ReviewUIState['meta']['commitStatus'];
  const pendingCommitKeys = new Map<string, string>();
  const attachedSurfaceIds = new Set<string>();
  const subscribers = new Set<(snapshot: ReviewSessionControllerSnapshot<TItem>) => void>();
  const disposeSubscribers = new Set<() => void>();

  const getCanBack = (): boolean => {
    if (typeof queue.canGoBack === 'function') {
      try {
        return queue.canGoBack();
      } catch (error) {
        logger.warn('Failed to read queue.canGoBack:', error);
      }
    }
    return false;
  };

  const withSessionMeta = (uiState: ReviewUIState): ReviewUIState => ({
    ...uiState,
    meta: {
      ...uiState.meta,
      canBack: getCanBack(),
      ...(latestCommitStatus ? { commitStatus: latestCommitStatus } : {}),
    },
  });

  const setCommitStatus = (commitStatus: NonNullable<ReviewUIState['meta']['commitStatus']>): void => {
    if (disposed) {
      return;
    }
    latestCommitStatus = commitStatus;
    state.value = withSessionMeta({
      ...state.value,
      meta: {
        ...state.value.meta,
        commitStatus,
      },
    });
    notifySubscribers();
  };

  const watchPendingCommit = (
    commit: Promise<unknown> | undefined,
    input: {
      cardId: string;
      idempotencyKey: string;
      rating: RatingValue;
    },
  ): void => {
    if (!commit) {
      return;
    }
    commit
      .then(() => {
        setCommitStatus({
          state: 'commit-applied',
          cardId: input.cardId,
          idempotencyKey: input.idempotencyKey,
          rating: input.rating,
          updatedAt: Date.now(),
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setCommitStatus({
          state: 'commit-failed',
          cardId: input.cardId,
          idempotencyKey: input.idempotencyKey,
          rating: input.rating,
          updatedAt: Date.now(),
          message,
          diagnostics: ['repair-required'],
          retry: {
            kind: 'retry-same-commit',
            idempotencyKey: input.idempotencyKey,
          },
          repair: {
            kind: 'explicit-repair-required',
            reason: 'async-review-commit-failed',
          },
        });
      });
  };

  const markAdvancePending = (reason: ReviewAdvanceReason): void => {
    if (disposed) {
      return;
    }
    state.value = withSessionMeta({
      ...state.value,
      meta: {
        ...state.value.meta,
        advancePending: {
          active: true,
          reason,
          startedAt: Date.now(),
        },
      },
    });
    notifySubscribers();
  };

  const clearAdvancePending = (): void => {
    if (!state.value.meta.advancePending) {
      return;
    }
    const { advancePending: _advancePending, ...meta } = state.value.meta;
    void _advancePending;
    state.value = withSessionMeta({
      ...state.value,
      meta,
    });
    notifySubscribers();
  };

  const getSnapshot = (): ReviewSessionControllerSnapshot<TItem> => ({
    state: state.value,
    context: context.value,
    currentItem: currentItem.value,
    attachedSurfaceIds: Array.from(attachedSurfaceIds.values()),
    started,
    disposed,
  });

  const notifySubscribers = (): void => {
    const snapshot = getSnapshot();
    for (const subscriber of Array.from(subscribers)) {
      try {
        subscriber(snapshot);
      } catch (error) {
        logger.warn('Review session subscriber failed:', error);
      }
    }
  };

  const notifyDisposeSubscribers = (): void => {
    for (const subscriber of Array.from(disposeSubscribers)) {
      try {
        subscriber();
      } catch (error) {
        logger.warn('Review session dispose subscriber failed:', error);
      }
    }
  };

  const maybeNotifyQueueCompleted = (reason: SessionUpdateReason): void => {
    if (currentItem.value) {
      queueCompletionNotified = false;
      return;
    }
    if (reason !== 'grade' && reason !== 'skip' && reason !== 'custom') {
      return;
    }
    if (queueCompletionNotified) {
      return;
    }
    queueCompletionNotified = true;
    try {
      void options?.onQueueCompleted?.({ reason });
    } catch (error) {
      logger.warn('Review queue completion listener failed:', error);
    }
  };

  const updateState = async (
    reason: SessionUpdateReason,
    updateOptions?: { skipPrepare?: boolean },
  ): Promise<void> => {
    const seq = ++updateSeq;
    const mainState = await measureRuntimePerformance(
      'review',
      'state.to-ui-state',
      () => adapter.toUIState(queue, currentItem.value, context.value),
      { reason, owner: 'session-queue' },
    );
    if (seq !== updateSeq || disposed) {
      return;
    }
    let nextState = withSessionMeta(mainState);
    measureRuntimePerformance('review', 'state.commit-notify', () => {
      state.value = nextState;
      notifySubscribers();
    }, { reason, owner: 'session-queue' });
    maybeNotifyQueueCompleted(reason);

    if (!updateOptions?.skipPrepare && reason !== 'reveal' && options?.prepareStateBeforeCommit) {
      measureRuntimePerformance(
        'review',
        'state.prepare-presentation-async',
        () => options.prepareStateBeforeCommit!(nextState, reason),
        { reason, owner: 'unattributed-ui' },
      )
        .then((preparedState) => {
          if (seq !== updateSeq || disposed) {
            return;
          }
          state.value = withSessionMeta(mergePreparedPresentation(state.value, preparedState));
          notifySubscribers();
        })
        .catch((error) => {
          logger.warn('Review presentation prepare failed after base state commit:', {
            reason,
            cardId: nextState.content.card?.id,
            blockId: nextState.content.id,
            owner: 'unattributed-ui',
            error,
          });
        });
    }

    if (reason !== 'reveal' && adapter.fetchAuxiliaryData) {
      measureRuntimePerformance(
        'review',
        'state.fetch-auxiliary-data',
        () => adapter.fetchAuxiliaryData!(currentItem.value, queue, context.value),
        { reason, owner: 'session-queue' },
      )
        .then((aux) => {
          if (seq !== updateSeq || disposed) {
            return;
          }
          state.value = withSessionMeta(mergeAux(state.value, aux));
          notifySubscribers();
        })
        .catch((error) => {
          logger.warn('Failed to fetch auxiliary data:', error);
        });
    }
  };

  const ensureStarted = async (): Promise<void> => {
    if (disposed || started) {
      return;
    }

    if (startPromise) {
      await startPromise;
      return;
    }

    startPromise = (async () => {
      try {
        const initialTotal = await queue
          .getCounterSnapshot?.()
          .then((snapshot) => Math.max(0, Number(snapshot?.total ?? snapshot?.remaining) || 0))
          .catch(async () => queue
            .getStats?.()
            .then((stats) => Math.max(0, Number(stats?.size) || 0))
            .catch(() => undefined));

        if (disposed) {
          return;
        }

        adapter.resetSessionState?.();
        context.value.session = {
          startTime: Date.now(),
          resumed: false,
          initialTotal: Math.max(0, Number(options?.initialSessionState?.initialTotal) || Number(initialTotal) || 0),
          answeredCount: Math.max(0, Number(options?.initialSessionState?.answeredCount) || 0),
          correctCount: Math.max(0, Number(options?.initialSessionState?.correctCount) || 0),
          baselineVersion: 0,
          reviewHistory: [],
          blockedSkippedCount: 0,
          blockedSkippedCards: [],
          midSessionInsertedCount: 0,
          midSessionInsertedCards: [],
        };

        if (options?.initialCurrentItem) {
          currentItem.value = await hydrateDisplayItem(queue, options.initialCurrentItem);
          context.value.showAnswer = options.initialShowAnswer === true;
          started = true;
          await updateState('mount');
          notifySubscribers();
          return;
        }

        currentItem.value = await queue.next();
        if (disposed) {
          return;
        }
        context.value.showAnswer = options?.initialShowAnswer === true;
        started = true;
        await updateState('mount');
        notifySubscribers();
      } catch (error) {
        logger.error('Failed to mount review session controller:', error);
        if (disposed) {
          return;
        }
        currentItem.value = null;
        context.value.showAnswer = false;
        started = true;
        await updateState('mount');
        notifySubscribers();
      }
    })().finally(() => {
      startPromise = null;
    });

    await startPromise;
  };

  const runSerialized = async <TResult>(task: () => Promise<TResult>): Promise<TResult> => {
    const execute = async (): Promise<TResult> => {
      await ensureStarted();
      if (disposed) {
        return undefined as TResult;
      }
      return task();
    };

    const pending = serializedAction.then(execute, execute);
    serializedAction = pending.then(() => undefined, () => undefined);
    return pending;
  };

  const reveal = (): void => {
    void runSerialized(async () => {
      if (context.value.showAnswer) {
        return;
      }
      context.value.showAnswer = true;
      await updateState('reveal');
    });
  };

  const advancePastUnavailableItem = async (reason: SessionUpdateReason, error: unknown): Promise<void> => {
    logger.warn('Skipped unavailable review item and advanced to next card:', error);
    try {
      currentItem.value = await queue.next();
    } catch (nextError) {
      logger.error('Failed to advance after unavailable review item:', nextError);
      currentItem.value = null;
    }
    context.value.showAnswer = false;
    await updateState(reason, { skipPrepare: true });
  };

  const keepCurrentItemAfterActionError = async (
    reason: ReviewActionErrorReason,
    message: string,
    error: unknown,
    action?: ReviewSessionRetryAction,
  ): Promise<void> => {
    logger.error(message, error);
    try {
      options?.onActionError?.({
        reason,
        message,
        error,
        item: currentItem.value,
        action,
      });
    } catch (listenerError) {
      logger.warn('Review action error listener failed:', listenerError);
    }
    await updateState(reason, { skipPrepare: true });
  };

  const scheduleReviewDetailedHandler = (
    payload: { cardId: string; rating: number; item: TItem | null },
  ): void => {
    if (!options?.onReviewDetailed) {
      return;
    }
    const startedAt = Date.now();
    let detailResult: void | Promise<void>;
    try {
      detailResult = options.onReviewDetailed(payload);
    } catch (error) {
      logger.warn('[ReviewSessionController] Review detail handler failed after next card commit:', {
        cardId: payload.cardId,
        rating: payload.rating,
        error,
      });
      return;
    }
    void Promise.resolve(detailResult)
      .then(() => {
        const durationMs = Date.now() - startedAt;
        if (durationMs >= REVIEW_GRADE_PHASE_SLOW_MS) {
          logger.info('[ReviewSessionController] slow review detail handler', {
            cardId: payload.cardId,
            rating: payload.rating,
            durationMs,
          });
        }
      })
      .catch((error) => {
        logger.warn('[ReviewSessionController] Review detail handler failed after next card commit:', {
          cardId: payload.cardId,
          rating: payload.rating,
          error,
        });
      });
  };

  const grade = async (rating: number): Promise<void> => runSerialized(async () => {
    const previousItem = currentItem.value;
    const previousShowAnswer = context.value.showAnswer;
    const normalized = toRatingValue(rating);
    const finishGradeSpan = startRuntimePerformanceSpan('review', 'grade.total', {
      rating: normalized,
    });
    let pushedHistory = false;
    let reviewedCardId = '';
    let status = 'started';
    try {
      markAdvancePending('grade');
      const reviewedItem = currentItem.value;
      reviewedCardId = extractCardId(reviewedItem);
      const pendingKey = `grade:${reviewedCardId}:${normalized}`;
      const commitIdempotencyKey = pendingCommitKeys.get(pendingKey)
        ?? createReviewCommitIdempotencyKey(reviewedCardId, normalized);
      pendingCommitKeys.set(pendingKey, commitIdempotencyKey);
      const feedback: QueueFeedback = {
        action: 'rate',
        rating: normalized,
        commitIdempotencyKey,
      };

      const feedbackResult = await measureReviewPhase('feedback', reviewedCardId, () => queue.onFeedback(reviewedItem, feedback));
      pendingCommitKeys.delete(pendingKey);
      if (options?.onReview && reviewedItem) {
        if (reviewedCardId) {
          options.onReview(reviewedCardId, normalized);
        }
      }

      pushReviewHistory(context.value, {
        action: 'rate',
        answeredDelta: 1,
        correctDelta: normalized >= 3 ? 1 : 0,
      });
      pushedHistory = true;
      currentItem.value = isFeedbackAdvanceResult(feedbackResult)
        ? feedbackResult.nextItem
        : await measureReviewPhase('next', reviewedCardId, () => queue.next());
      if (isFeedbackAdvanceResult(feedbackResult) && feedbackResult.commitStatus === 'pending') {
        const idempotencyKey = String(feedbackResult.commitIdempotencyKey || commitIdempotencyKey);
        setCommitStatus({
          state: 'commit-pending',
          cardId: reviewedCardId,
          idempotencyKey,
          rating: normalized,
          updatedAt: Date.now(),
        });
        watchPendingCommit(feedbackResult.commit, {
          cardId: reviewedCardId,
          idempotencyKey,
          rating: normalized,
        });
      }
      context.value.showAnswer = false;
      await measureReviewPhase('update-state', reviewedCardId, () => updateState('grade'));
      status = 'graded';
      if (options?.onReviewDetailed && reviewedItem && reviewedCardId) {
        scheduleReviewDetailedHandler({
          cardId: reviewedCardId,
          rating: normalized,
          item: reviewedItem,
        });
      }
    } catch (error) {
      currentItem.value = previousItem;
      context.value.showAnswer = previousShowAnswer;
      if (pushedHistory) {
        rollbackReviewHistory(context.value);
      }
      if (isQueueItemUnavailableError(error)) {
        status = 'advanced-past-unavailable';
        await advancePastUnavailableItem('grade', error);
        return;
      }

      status = 'error';
      await keepCurrentItemAfterActionError('grade', 'Failed to process review feedback:', error, {
        type: 'grade',
        rating: normalized,
      });
    } finally {
      finishGradeSpan({
        cardId: reviewedCardId,
        status,
      }, {
        ok: status !== 'error',
        errorName: status === 'error' ? 'ReviewGradeError' : undefined,
      });
    }
  });

  const skip = async (): Promise<void> => runSerialized(async () => {
    const previousItem = currentItem.value;
    const previousShowAnswer = context.value.showAnswer;
    let pushedHistory = false;
    try {
      markAdvancePending('skip');
      await queue.onFeedback(currentItem.value, { action: 'skip' });
      pushReviewHistory(context.value, {
        action: 'skip',
        answeredDelta: 0,
        correctDelta: 0,
      });
      pushedHistory = true;
      currentItem.value = await queue.next();
      context.value.showAnswer = false;
      await updateState('skip');
    } catch (error) {
      currentItem.value = previousItem;
      context.value.showAnswer = previousShowAnswer;
      if (pushedHistory) {
        rollbackReviewHistory(context.value);
      }
      if (isQueueItemUnavailableError(error)) {
        await advancePastUnavailableItem('skip', error);
        return;
      }

      await keepCurrentItemAfterActionError('skip', 'Failed to skip card:', error, { type: 'skip' });
    }
  });

  const advanceWithoutFeedback = async (options?: ReviewAdvanceWithoutFeedbackOptions): Promise<void> => runSerialized(async () => {
    const previousItem = currentItem.value;
    const previousShowAnswer = context.value.showAnswer;
    try {
      markAdvancePending('no-score-removal');
      currentItem.value = await queue.next();
      pushNoScoreRemovalDiagnostic(context.value, options);
      context.value.showAnswer = false;
      await updateState('no-score-removal');
    } catch (error) {
      currentItem.value = previousItem;
      context.value.showAnswer = previousShowAnswer;
      if (isQueueItemUnavailableError(error)) {
        await advancePastUnavailableItem('no-score-removal', error);
        return;
      }

      logger.error('Failed to advance after no-score removal:', error);
      await updateState('no-score-removal', { skipPrepare: true });
    }
  });

  const executeCommand = async (cmdId: string): Promise<void> => runSerialized(async () => {
    const previousItem = currentItem.value;
    const previousShowAnswer = context.value.showAnswer;
    let pushedHistory = false;
    try {
      const id = String(cmdId || '');
      if (!id) {
        return;
      }

      if (id === 'learn-ahead' && typeof queue.learnAhead === 'function') {
        const startedLearnAhead = await queue.learnAhead();
        if (startedLearnAhead) {
          currentItem.value = await queue.next();
          context.value.showAnswer = false;
        }
        await updateState('custom');
        return;
      }

      markAdvancePending('custom');
      await queue.onFeedback(currentItem.value, { action: 'custom', customActionId: id });
      pushReviewHistory(context.value, {
        action: 'custom',
        answeredDelta: 0,
        correctDelta: 0,
      });
      pushedHistory = true;
      currentItem.value = await queue.next();
      context.value.showAnswer = false;
      await updateState('custom');
    } catch (error) {
      currentItem.value = previousItem;
      context.value.showAnswer = previousShowAnswer;
      if (pushedHistory) {
        rollbackReviewHistory(context.value);
      }
      if (isQueueItemUnavailableError(error)) {
        await advancePastUnavailableItem('custom', error);
        return;
      }

      await keepCurrentItemAfterActionError('custom', 'Failed to execute command:', error, {
        type: 'custom',
        commandId: String(cmdId || ''),
      });
    }
  });

  const back = async (): Promise<void> => runSerialized(async () => {
    if (!getCanBack()) {
      return;
    }

    const previousItem = currentItem.value;
    const previousShowAnswer = context.value.showAnswer;
    const previousSession = context.value.session
      ? {
          ...context.value.session,
          reviewHistory: [...(context.value.session.reviewHistory || [])],
        }
      : undefined;
    try {
      if (typeof queue.goBack !== 'function') {
        return;
      }

      markAdvancePending('back');
      const previous = await queue.goBack(currentItem.value);
      rollbackReviewHistory(context.value);

      if (!previous) {
        await updateState('back');
        return;
      }

      currentItem.value = previous;
      context.value.showAnswer = false;
      await updateState('back');
    } catch (error) {
      currentItem.value = previousItem;
      context.value.showAnswer = previousShowAnswer;
      if (previousSession) {
        context.value.session = previousSession;
      }
      logger.error('Failed to go back:', error);
      await updateState('back', { skipPrepare: true });
    }
  });

  const reload = async (): Promise<void> => runSerialized(async () => {
    try {
      const session = ensureSessionState(context.value);
      session.baselineVersion = (session.baselineVersion || 0) + 1;
      session.reviewHistory = [];
      adapter.resetSessionState?.();
      (queue as unknown as SessionResettableQueue).resetSessionState?.();
      currentItem.value = await queue.next();
      context.value.showAnswer = false;
      await updateState('reload');
    } catch (error) {
      logger.error('Failed to reload review session:', error);
      currentItem.value = null;
      context.value.showAnswer = false;
      await updateState('reload');
    }
  });

  const refreshCurrentItem = async (item: unknown, options?: RefreshCurrentItemOptions): Promise<void> => runSerialized(async () => {
    if (!matchesRefreshExpectation(currentItem.value, options)) {
      logger.debug('Skipped stale refreshCurrentItem after active card changed', {
        expectedIds: collectExpectedRefreshIds(options),
        activeCardId: extractCardId(currentItem.value),
        activeBlockId: extractBlockId(currentItem.value),
        incomingCardId: extractCardId(item),
        incomingBlockId: extractBlockId(item),
      });
      return;
    }

    currentItem.value = await hydrateDisplayItem(queue, (item as TItem | null) ?? null);
    await updateState('refresh-current');
  });

  const loadCardByBlockId = async (blockId: string): Promise<void> => runSerialized(async () => {
    const previousItem = currentItem.value;
    const previousShowAnswer = context.value.showAnswer;
    try {
      const loader = resolveNeuralPathLoader(queue);
      if (!loader) {
        logger.warn(`Queue does not support path node loading: ${blockId}`);
        return;
      }

      markAdvancePending('load-by-block');
      const realItem = await loader.getPathItemByNodeId(blockId);
      if (!realItem) {
        logger.warn(`Node not found: ${blockId}`);
        clearAdvancePending();
        return;
      }

      currentItem.value = await hydrateDisplayItem(queue, realItem);
      context.value.showAnswer = shouldShowAnswerForNeuralItem(realItem);
      await updateState('load-by-block');

      logger.debug(`Loaded card by blockId: ${blockId}, showAnswer: ${context.value.showAnswer}`);
    } catch (error) {
      currentItem.value = previousItem;
      context.value.showAnswer = previousShowAnswer;
      logger.error('Failed to load card by blockId:', error);
      await updateState('load-by-block', { skipPrepare: true });
    }
  });

  const renderItemPreview = async (
    item: unknown,
    previewContext: AdapterContext,
  ): Promise<ReviewUIState> => {
    const hydratedItem = await hydrateDisplayItem(queue, (item as TItem | null) ?? null);
    return withSessionMeta(await adapter.toUIState(queue, hydratedItem, previewContext));
  };

  const attachSurface = (surfaceId: string): void => {
    if (disposed) {
      return;
    }
    const normalizedSurfaceId = String(surfaceId || '').trim();
    if (!normalizedSurfaceId) {
      return;
    }
    attachedSurfaceIds.add(normalizedSurfaceId);
    notifySubscribers();
    void ensureStarted();
  };

  const detachSurface = (surfaceId: string): void => {
    if (disposed) {
      return;
    }
    const normalizedSurfaceId = String(surfaceId || '').trim();
    if (normalizedSurfaceId) {
      attachedSurfaceIds.delete(normalizedSurfaceId);
    }
    notifySubscribers();
    if (attachedSurfaceIds.size === 0) {
      dispose();
    }
  };

  const subscribe = (listener: (snapshot: ReviewSessionControllerSnapshot<TItem>) => void): (() => void) => {
    subscribers.add(listener);
    try {
      listener(getSnapshot());
    } catch (error) {
      logger.warn('Review session subscriber failed during initial delivery:', error);
    }
    return () => {
      subscribers.delete(listener);
    };
  };

  const subscribeDispose = (listener: () => void): (() => void) => {
    disposeSubscribers.add(listener);
    return () => {
      disposeSubscribers.delete(listener);
    };
  };

  const isDisposed = (): boolean => disposed;

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    attachedSurfaceIds.clear();
    updateSeq += 1;
    (queue as unknown as { cleanup?: () => void }).cleanup?.();
    adapter.cleanup?.();
    notifySubscribers();
    notifyDisposeSubscribers();
    subscribers.clear();
    disposeSubscribers.clear();
  };

  return {
    state,
    context,
    attachSurface,
    detachSurface,
    reveal,
    grade,
    skip,
    advanceWithoutFeedback,
    back,
    executeCommand,
    reload,
    refreshCurrentItem,
    getQueueStrategy: () => queue,
    loadCardByBlockId,
    renderItemPreview,
    getSnapshot,
    subscribe,
    subscribeDispose,
    isDisposed,
    dispose,
  };
}
