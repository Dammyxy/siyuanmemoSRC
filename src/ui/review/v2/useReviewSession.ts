import { onMounted, onUnmounted, ref } from 'vue';
import type { IQueueStrategy, QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { AdapterContext, IAdapter, ReviewSessionHook, ReviewUIState } from './types';
import { createEmptyReviewUIState } from './types';

export function useReviewSession<TItem>(
  queue: IQueueStrategy<TItem>,
  adapter: IAdapter<TItem>,
): ReviewSessionHook {
  const state = ref<ReviewUIState>(createEmptyReviewUIState());
  const currentItem = ref<TItem | null>(null);
  const now = Date.now();
  const context = ref<AdapterContext>({ showAnswer: false, session: { startTime: now, resumed: false } });

  const mergeAux = (base: ReviewUIState, aux: Partial<ReviewUIState>): ReviewUIState => {
    const merged: ReviewUIState = { ...base, ...aux } as any;
    if (aux.header) {
      merged.header = {
        ...base.header,
        ...aux.header,
        stats: { ...base.header.stats, ...(aux.header as any).stats },
        breadcrumbs: (aux.header as any).breadcrumbs ?? base.header.breadcrumbs,
        // 🔧 修复：只有当 aux.header.toolbar 存在且是数组时才覆盖，否则保留 base 的 toolbar
        toolbar: Array.isArray((aux.header as any).toolbar) ? (aux.header as any).toolbar : base.header.toolbar,
      };
    }
    if (aux.content) {
      merged.content = { ...base.content, ...aux.content } as any;
    }
    if (aux.actions) {
      merged.actions = {
        ...base.actions,
        ...aux.actions,
        grades: (aux.actions as any).grades ?? base.actions.grades,
        menu: (aux.actions as any).menu ?? base.actions.menu,
      };
    }
    if (aux.meta) {
      merged.meta = { ...base.meta, ...aux.meta } as any;
    }
    return merged;
  };

  let updateSeq = 0;
  const updateState = async (): Promise<void> => {
    const seq = ++updateSeq;
    const mainState = await adapter.toUIState(queue as any, currentItem.value, context.value);
    console.log('[useReviewSession] updateState - mainState.header.toolbar:', {
      hasHeader: !!mainState.header,
      hasToolbar: !!mainState.header?.toolbar,
      toolbarLength: mainState.header?.toolbar?.length,
      toolbar: mainState.header?.toolbar,
    });
    if (seq !== updateSeq) return;
    state.value = mainState;

    if (adapter.fetchAuxiliaryData) {
      adapter.fetchAuxiliaryData(currentItem.value)
        .then((aux) => {
          if (seq !== updateSeq) return;
          console.log('[useReviewSession] merging aux data:', {
            hasAuxHeader: !!aux.header,
            hasAuxToolbar: !!(aux.header as any)?.toolbar,
            auxToolbar: (aux.header as any)?.toolbar,
          });
          state.value = mergeAux(state.value, aux);
        })
        .catch(() => {});
    }
  };

  const reveal = (): void => {
    if (context.value.showAnswer) return;
    context.value.showAnswer = true;
    void updateState();
  };

  const grade = async (rating: number): Promise<void> => {
    try {
      const feedback: QueueFeedback = { action: 'rate', rating: Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4 };
      await queue.onFeedback(currentItem.value, feedback);
      currentItem.value = await queue.next();

      // 处理队列耗尽：如果 next() 返回 null，显示完成界面
      if (currentItem.value === null) {
        console.log('[useReviewSession] 队列已耗尽，会话完成');
        // 设置为空内容类型，让适配器处理完成状态
      }

      context.value.showAnswer = false;
      await updateState();
    } catch (error) {
      console.error('[ReviewSession] 加载下一张卡片失败:', error);
      // 发生错误时也设置为 null，触发错误/完成界面
      currentItem.value = null;
      await updateState();
    }
  };

  const skip = async (): Promise<void> => {
    try {
      await queue.onFeedback(currentItem.value, { action: 'skip' });
      currentItem.value = await queue.next();

      // 处理队列耗尽：如果 next() 返回 null，显示完成界面
      if (currentItem.value === null) {
        console.log('[useReviewSession] 队列已耗尽，会话完成');
      }

      context.value.showAnswer = false;
      await updateState();
    } catch (error) {
      console.error('[ReviewSession] 跳过卡片失败:', error);
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

      // 处理队列耗尽：如果 next() 返回 null，显示完成界面
      if (currentItem.value === null) {
        console.log('[useReviewSession] 队列已耗尽，会话完成');
      }

      await updateState();
    } catch (error) {
      console.error('[ReviewSession] 执行命令失败:', error);
      currentItem.value = null;
      await updateState();
    }
  };

  const mounted = (): void => {
    void (async () => {
      context.value.session = {
        startTime: Date.now(),
        resumed: false,
        initialTotal: typeof (queue as any)?.getStats === 'function'
          ? await (queue as any).getStats().then((s: any) => Math.max(0, Number(s?.size) || 0)).catch(() => undefined)
          : undefined,
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

  // 🆕 暴露 getQueueStrategy 方法，用于访问底层队列策略（神经漫游功能需要）
  const getQueueStrategy = (): IQueueStrategy<TItem> => {
    return queue;
  };

  /**
   * 🆕 直接加载指定 blockId 的卡片（路径导航专用）
   *
   * 用于历史节点跳转场景：不调用 queue.next()，直接从队列中获取指定卡片并更新 UI。
   * 这样可以在不改变队列状态的情况下"跳转"到历史路径中的某个节点。
   *
   * @param blockId 块 ID
   */
  const loadCardByBlockId = async (blockId: string): Promise<void> => {
    try {
      // 🔧 修复：尝试从队列获取当前路径项的完整数据，而非创建空壳临时对象
      const underlyingQueue = (queue as any)?.getUnderlyingQueue?.()?.neuralQueue;

      if (underlyingQueue?.getCurrentPathItem) {
        const realItem = await underlyingQueue.getCurrentPathItem();
        if (realItem) {
          currentItem.value = realItem;

          // 🆕 根据卡片类型设置初始状态
          // - flashcard（闪卡）: 显示【显示答案】（showAnswer = false）
          // - topic（主题块）: 直接显示【下一张】（showAnswer = true）
          const neuralContext = (realItem as any)?.meta?.neuralContext;
          const blockType = neuralContext?.blockType;
          const isFlashcard = neuralContext?.isFlashcard;

          // 优先使用 isFlashcard 判断，fallback 到 blockType
          const shouldShowAnswer = isFlashcard === false || blockType === 'topic';
          context.value.showAnswer = shouldShowAnswer;

          await updateState();
          console.log(`[useReviewSession] Loaded real card data for blockId: ${blockId}, blockType: ${blockType}, isFlashcard: ${isFlashcard}, showAnswer: ${context.value.showAnswer}`);
          return;
        }
      }

      // 降级：如果无法获取真实数据，使用临时项（可能导致部分功能受限）
      console.warn(`[useReviewSession] Fallback to temp item for blockId: ${blockId}`);
      const tempItem = {
        cardID: blockId,
        blockID: blockId,
        deckID: 'neural-roaming',
        priority: 0,
        meta: {},
      } as any;

      currentItem.value = tempItem;
      context.value.showAnswer = false; // 降级情况默认为 item
      await updateState();

      console.log(`[useReviewSession] Loaded card by blockId: ${blockId}`);
    } catch (error) {
      console.error('[useReviewSession] Failed to load card by blockId:', error);
    }
  };

  return {
    state,
    context,
    reveal,
    grade,
    skip,
    executeCommand,
    getQueueStrategy, // 🆕 添加到返回对象
    loadCardByBlockId, // 🆕 路径导航专用方法
    onMounted: mounted,
    onUnmounted: unmounted
  };
}
