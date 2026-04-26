import { ref, type Ref } from 'vue';
import {
  isQueueItemUnavailableError,
  type IQueueStrategy,
  type QueueFeedback,
} from '@/core/queue/abstraction/Strategy';
import type { QueueItem } from '@/core/queue/types';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
import type { InitialReviewSessionState } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import type { AdapterContext, IAdapter, RefreshCurrentItemOptions, ReviewUIState } from './types';
import { createEmptyReviewUIState } from './types';

const logger = createLogger('ReviewSessionController');

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

type SessionUpdateReason =
  | 'mount'
  | 'reveal'
  | 'grade'
  | 'skip'
  | 'custom'
  | 'back'
  | 'reload'
  | 'refresh-current'
  | 'load-by-block';

type ReviewActionErrorReason = Extract<SessionUpdateReason, 'grade' | 'skip' | 'custom'>;

export interface ReviewSessionActionError<TItem extends QueueItem = QueueItem> {
  reason: ReviewActionErrorReason;
  message: string;
  error: unknown;
  item: TItem | null;
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
  back: () => Promise<void>;
  executeCommand: (cmdId: string) => Promise<void>;
  reload: () => Promise<void>;
  refreshCurrentItem: (item: unknown, options?: RefreshCurrentItemOptions) => Promise<void>;
  getQueueStrategy: () => IQueueStrategy<TItem>;
  loadCardByBlockId: (blockId: string) => Promise<void>;
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
  context.session = session;
  return session;
}

function pushReviewHistory(context: AdapterContext, entry: SessionHistoryEntry): void {
  const session = ensureSessionState(context);
  session.reviewHistory = [...(session.reviewHistory || []), entry];
  session.answeredCount = Math.max(0, (session.answeredCount || 0) + entry.answeredDelta);
  session.correctCount = Math.max(0, (session.correctCount || 0) + entry.correctDelta);
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
    },
  });

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

  const updateState = async (reason: SessionUpdateReason): Promise<void> => {
    const seq = ++updateSeq;
    const mainState = await adapter.toUIState(queue, currentItem.value, context.value);
    if (seq !== updateSeq || disposed) {
      return;
    }
    state.value = withSessionMeta(mainState);
    notifySubscribers();

    if (reason !== 'reveal' && adapter.fetchAuxiliaryData) {
      adapter.fetchAuxiliaryData(currentItem.value, queue, context.value)
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
    await updateState(reason);
  };

  const keepCurrentItemAfterActionError = async (reason: ReviewActionErrorReason, message: string, error: unknown): Promise<void> => {
    logger.error(message, error);
    try {
      options?.onActionError?.({
        reason,
        message,
        error,
        item: currentItem.value,
      });
    } catch (listenerError) {
      logger.warn('Review action error listener failed:', listenerError);
    }
    await updateState(reason);
  };

  const grade = async (rating: number): Promise<void> => runSerialized(async () => {
    try {
      const normalized = toRatingValue(rating);
      const feedback: QueueFeedback = { action: 'rate', rating: normalized };
      const reviewedItem = currentItem.value;

      await queue.onFeedback(reviewedItem, feedback);
      if (options?.onReview && reviewedItem) {
        const cardId = extractCardId(reviewedItem);
        if (cardId) {
          options.onReview(cardId, normalized);
        }
      }

      if (options?.onReviewDetailed && reviewedItem) {
        const cardId = extractCardId(reviewedItem);
        if (cardId) {
          await options.onReviewDetailed({
            cardId,
            rating: normalized,
            item: reviewedItem,
          });
        }
      }
      pushReviewHistory(context.value, {
        action: 'rate',
        answeredDelta: 1,
        correctDelta: normalized >= 3 ? 1 : 0,
      });
      currentItem.value = await queue.next();
      context.value.showAnswer = false;
      await updateState('grade');
    } catch (error) {
      if (isQueueItemUnavailableError(error)) {
        await advancePastUnavailableItem('grade', error);
        return;
      }

      await keepCurrentItemAfterActionError('grade', 'Failed to process review feedback:', error);
    }
  });

  const skip = async (): Promise<void> => runSerialized(async () => {
    try {
      await queue.onFeedback(currentItem.value, { action: 'skip' });
      pushReviewHistory(context.value, {
        action: 'skip',
        answeredDelta: 0,
        correctDelta: 0,
      });
      currentItem.value = await queue.next();
      context.value.showAnswer = false;
      await updateState('skip');
    } catch (error) {
      if (isQueueItemUnavailableError(error)) {
        await advancePastUnavailableItem('skip', error);
        return;
      }

      await keepCurrentItemAfterActionError('skip', 'Failed to skip card:', error);
    }
  });

  const executeCommand = async (cmdId: string): Promise<void> => runSerialized(async () => {
    try {
      const id = String(cmdId || '');
      if (!id) {
        return;
      }

      await queue.onFeedback(currentItem.value, { action: 'custom', customActionId: id });
      pushReviewHistory(context.value, {
        action: 'custom',
        answeredDelta: 0,
        correctDelta: 0,
      });
      currentItem.value = await queue.next();
      await updateState('custom');
    } catch (error) {
      if (isQueueItemUnavailableError(error)) {
        await advancePastUnavailableItem('custom', error);
        return;
      }

      await keepCurrentItemAfterActionError('custom', 'Failed to execute command:', error);
    }
  });

  const back = async (): Promise<void> => runSerialized(async () => {
    if (!getCanBack()) {
      return;
    }

    try {
      if (typeof queue.goBack !== 'function') {
        return;
      }

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
      logger.error('Failed to go back:', error);
      await updateState('back');
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
    try {
      const loader = resolveNeuralPathLoader(queue);
      if (!loader) {
        logger.warn(`Queue does not support path node loading: ${blockId}`);
        return;
      }

      const realItem = await loader.getPathItemByNodeId(blockId);
      if (!realItem) {
        logger.warn(`Node not found: ${blockId}`);
        return;
      }

      currentItem.value = await hydrateDisplayItem(queue, realItem);
      context.value.showAnswer = shouldShowAnswerForNeuralItem(realItem);
      await updateState('load-by-block');

      logger.debug(`Loaded card by blockId: ${blockId}, showAnswer: ${context.value.showAnswer}`);
    } catch (error) {
      logger.error('Failed to load card by blockId:', error);
    }
  });

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
    back,
    executeCommand,
    reload,
    refreshCurrentItem,
    getQueueStrategy: () => queue,
    loadCardByBlockId,
    getSnapshot,
    subscribe,
    subscribeDispose,
    isDisposed,
    dispose,
  };
}
