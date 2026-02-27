import { onMounted, onUnmounted, ref } from 'vue';
import type { IQueueStrategy, QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { AdapterContext, IAdapter, ReviewSessionHook, ReviewUIState } from './types';
import { createEmptyReviewUIState } from './types';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
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

type UnderlyingQueueBridge<TItem> = {
  getUnderlyingQueue: () => unknown;
};

type SessionResettableQueue = {
  resetSessionState?: () => void;
};

type NeuralPathLoader<TItem> = {
  getPathItemByNodeId: (blockId: string) => Promise<TItem | null>;
};

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

function resolveNeuralPathLoader<TItem>(queue: IQueueStrategy<TItem>): NeuralPathLoader<TItem> | null {
  const queueCandidate = queue as unknown;
  if (!isRecord(queueCandidate)) {
    return null;
  }

  const bridge = queueCandidate as Partial<UnderlyingQueueBridge<TItem>>;
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

export function useReviewSession<TItem>(
  queue: IQueueStrategy<TItem>,
  adapter: IAdapter<TItem>,
  options?: {
    onReview?: (cardId: string, rating: number) => void;
  }
): ReviewSessionHook {
  const state = ref<ReviewUIState>(createEmptyReviewUIState());
  const currentItem = ref<TItem | null>(null);
  const now = Date.now();
  const context = ref<AdapterContext>({ showAnswer: false, session: { startTime: now, resumed: false } });

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

  const updateState = async (): Promise<void> => {
    const seq = ++updateSeq;
    const mainState = await adapter.toUIState(queue, currentItem.value, context.value);
    if (seq !== updateSeq) return;
    state.value = withSessionMeta(mainState);

    if (adapter.fetchAuxiliaryData) {
      adapter.fetchAuxiliaryData(currentItem.value)
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
    void updateState();
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
      const nextItem = await queue.next();

      currentItem.value = nextItem;
      context.value.showAnswer = false;
      await updateState();
    } catch (error) {
      logger.error('Failed to load next card:', error);
      currentItem.value = null;
      await updateState();
    }
  };

  const skip = async (): Promise<void> => {
    try {
      await queue.onFeedback(currentItem.value, { action: 'skip' });
      currentItem.value = await queue.next();
      context.value.showAnswer = false;
      await updateState();
    } catch (error) {
      logger.error('Failed to skip card:', error);
      currentItem.value = null;
      await updateState();
    }
  };

  const executeCommand = async (cmdId: string): Promise<void> => {
    try {
      const id = String(cmdId || '');
      if (!id) return;

      await queue.onFeedback(currentItem.value, { action: 'custom', customActionId: id });
      currentItem.value = await queue.next();
      await updateState();
    } catch (error) {
      logger.error('Failed to execute command:', error);
      currentItem.value = null;
      await updateState();
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

      if (!previous) {
        await updateState();
        return;
      }

      currentItem.value = previous;
      context.value.showAnswer = false;
      await updateState();
    } catch (error) {
      logger.error('Failed to go back:', error);
      await updateState();
    }
  };

  const mounted = (): void => {
    void (async () => {
      const initialTotal = await queue
        .getStats?.()
        .then((stats) => Math.max(0, Number(stats?.size) || 0))
        .catch(() => undefined);

      context.value.session = {
        startTime: Date.now(),
        resumed: false,
        initialTotal,
      };

      currentItem.value = await queue.next();
      await updateState();
    })();
  };

  const unmounted = (): void => {
    adapter.cleanup?.();
  };

  onMounted(mounted);
  onUnmounted(unmounted);

  const getQueueStrategy = (): IQueueStrategy<TItem> => queue;

  const reload = async (): Promise<void> => {
    try {
      (queue as unknown as SessionResettableQueue).resetSessionState?.();
      currentItem.value = await queue.next();
      context.value.showAnswer = false;
      await updateState();
    } catch (error) {
      logger.error('Failed to reload review session:', error);
      currentItem.value = null;
      context.value.showAnswer = false;
      await updateState();
    }
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
      await updateState();

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
    getQueueStrategy,
    loadCardByBlockId,
    onMounted: mounted,
    onUnmounted: unmounted,
  };
}
