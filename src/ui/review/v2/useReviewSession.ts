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
    const feedback: QueueFeedback = { action: 'rate', rating: Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4 };
    await queue.onFeedback(currentItem.value, feedback);
    currentItem.value = await queue.next();
    context.value.showAnswer = false;
    await updateState();
  };

  const skip = async (): Promise<void> => {
    await queue.onFeedback(currentItem.value, { action: 'skip' });
    currentItem.value = await queue.next();
    context.value.showAnswer = false;
    await updateState();
  };

  const executeCommand = async (cmdId: string): Promise<void> => {
    const id = String(cmdId || '');
    if (!id) return;
    await queue.onFeedback(currentItem.value, { action: 'custom', customActionId: id });
    currentItem.value = await queue.next();
    await updateState();
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

  return { 
    state, 
    context, 
    reveal, 
    grade, 
    skip, 
    executeCommand, 
    getQueueStrategy, // 🆕 添加到返回对象
    onMounted: mounted, 
    onUnmounted: unmounted 
  };
}
