import { onMounted, onUnmounted, ref } from 'vue';
import type { IQueueStrategy, QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { QueueItem } from '@/core/queue/types';
import type { AdapterContext, IAdapter, ReviewSessionHook, ReviewUIState } from './types';
import { createEmptyReviewUIState } from './types';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
import type { InitialReviewSessionState } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useReviewSession');

type RatingValue = 1 | 2 | 3 | 4;

type ItemIdLike = {
  id?: unknown;
  cardID?: unknown;
  cardId?: unknown;
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

export function useReviewSession<TItem extends QueueItem>(
  queue: IQueueStrategy<TItem>,
  adapter: IAdapter<TItem>,
  options?: {
    onReview?: (cardId: string, rating: number) => void;
    initialSessionState?: InitialReviewSessionState;
  }
): ReviewSessionHook {
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

  const updateState = async (reason: SessionUpdateReason): Promise<void> => {
    const seq = ++updateSeq;
    const mainState = await adapter.toUIState(queue, currentItem.value, context.value);
    if (seq !== updateSeq) return;
    state.value = withSessionMeta(mainState);

    if (reason !== 'reveal' && adapter.fetchAuxiliaryData) {
      adapter.fetchAuxiliaryData(currentItem.value, queue, context.value)
        .then((aux) => {
          if (seq !== updateSeq) return;
          state.value = withSessionMeta(mergeAux(state.value, aux));
        })
        .catch((error) => {
          logger.warn('Failed to fetch auxiliary data:', error);
        });
    }
  };

  const reveal = (): void => {
    if (context.value.showAnswer) return;
    context.value.showAnswer = true;
    void updateState('reveal');
  };

  const grade = async (rating: number): Promise<void> => {
    try {
      const normalized = toRatingValue(rating);
      const feedback: QueueFeedback = { action: 'rate', rating: normalized };

      if (options?.onReview && currentItem.value) {
        const cardId = extractCardId(currentItem.value);
        if (cardId) {
          options.onReview(cardId, normalized);
        }
      }

      await queue.onFeedback(currentItem.value, feedback);
      pushReviewHistory(context.value, {
        action: 'rate',
        answeredDelta: 1,
        correctDelta: normalized >= 3 ? 1 : 0,
      });
      const nextItem = await queue.next();

      currentItem.value = nextItem;
      context.value.showAnswer = false;
      await updateState('grade');
    } catch (error) {
      logger.error('Failed to load next card:', error);
      currentItem.value = null;
      await updateState('grade');
    }
  };

  const skip = async (): Promise<void> => {
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
      logger.error('Failed to skip card:', error);
      currentItem.value = null;
      await updateState('skip');
    }
  };

  const executeCommand = async (cmdId: string): Promise<void> => {
    try {
      const id = String(cmdId || '');
      if (!id) return;

      await queue.onFeedback(currentItem.value, { action: 'custom', customActionId: id });
      pushReviewHistory(context.value, {
        action: 'custom',
        answeredDelta: 0,
        correctDelta: 0,
      });
      currentItem.value = await queue.next();
      await updateState('custom');
    } catch (error) {
      logger.error('Failed to execute command:', error);
      currentItem.value = null;
      await updateState('custom');
    }
  };

  const back = async (): Promise<void> => {
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
  };

  const mounted = (): void => {
    void (async () => {
      const initialTotal = await queue
        .getCounterSnapshot?.()
        .then((snapshot) => Math.max(0, Number(snapshot?.total ?? snapshot?.remaining) || 0))
        .catch(async () => queue
          .getStats?.()
          .then((stats) => Math.max(0, Number(stats?.size) || 0))
          .catch(() => undefined));

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

      currentItem.value = await queue.next();
      await updateState('mount');
    })();
  };

  const unmounted = (): void => {
    (queue as unknown as { cleanup?: () => void }).cleanup?.();
    adapter.cleanup?.();
  };

  onMounted(mounted);
  onUnmounted(unmounted);

  const getQueueStrategy = (): IQueueStrategy<TItem> => queue;

  const reload = async (): Promise<void> => {
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
  };

  const refreshCurrentItem = async (item: unknown): Promise<void> => {
    currentItem.value = (item as TItem | null) ?? null;
    await updateState('refresh-current');
  };

  const loadCardByBlockId = async (blockId: string): Promise<void> => {
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

      currentItem.value = realItem;
      context.value.showAnswer = shouldShowAnswerForNeuralItem(realItem);
      await updateState('load-by-block');

      logger.debug(
        `Loaded card by blockId: ${blockId}, showAnswer: ${context.value.showAnswer}`
      );
    } catch (error) {
      logger.error('Failed to load card by blockId:', error);
    }
  };

  return {
    state,
    context,
    reveal,
    grade,
    skip,
    back,
    executeCommand,
    reload,
    refreshCurrentItem,
    getQueueStrategy,
    loadCardByBlockId,
    onMounted: mounted,
    onUnmounted: unmounted,
  };
}
