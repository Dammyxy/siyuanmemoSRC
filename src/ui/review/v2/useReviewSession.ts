import { onMounted, onUnmounted, ref } from 'vue';
import type { IQueueStrategy, QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { AdapterContext, IAdapter, ReviewSessionHook, ReviewUIState } from './types';
import { createEmptyReviewUIState } from './types';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return Boolean((el as any).isContentEditable);
}

export function useReviewSession<TItem>(
  queue: IQueueStrategy<TItem>,
  adapter: IAdapter<TItem>,
): ReviewSessionHook {
  const state = ref<ReviewUIState>(createEmptyReviewUIState());
  const currentItem = ref<TItem | null>(null);
  const context = ref<AdapterContext>({ showAnswer: false });

  const mergeAux = (base: ReviewUIState, aux: Partial<ReviewUIState>): ReviewUIState => {
    const merged: ReviewUIState = { ...base, ...aux } as any;
    if (aux.header) {
      merged.header = {
        ...base.header,
        ...aux.header,
        stats: { ...base.header.stats, ...(aux.header as any).stats },
        breadcrumbs: (aux.header as any).breadcrumbs ?? base.header.breadcrumbs,
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
        toolbar: (aux.actions as any).toolbar ?? base.actions.toolbar,
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
    if (seq !== updateSeq) return;
    state.value = mainState;

    if (adapter.fetchAuxiliaryData) {
      adapter.fetchAuxiliaryData(currentItem.value)
        .then((aux) => {
          if (seq !== updateSeq) return;
          state.value = mergeAux(state.value, aux);
        })
        .catch(() => {});
    }
  };

  const reveal = (): void => {
    if (!state.value.actions.showAnswer) return;
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

  const handleKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    if (isTypingTarget(e.target)) return;

    const key = e.key;
    if ((key === ' ' || key === 'Enter') && state.value.actions.showAnswer) {
      e.preventDefault();
      reveal();
      return;
    }

    if (key === '1' || key === '2' || key === '3' || key === '4') {
      if (state.value.actions.showAnswer) return;
      e.preventDefault();
      void grade(Number(key));
      return;
    }

    if (key === 's' || key === 'S') {
      e.preventDefault();
      void skip();
    }
  };

  const mounted = (): void => {
    window.addEventListener('keydown', handleKeydown, { capture: true });
    void (async () => {
      currentItem.value = await queue.next();
      await updateState();
    })();
  };

  const unmounted = (): void => {
    window.removeEventListener('keydown', handleKeydown, { capture: true } as any);
    adapter.cleanup?.();
  };

  onMounted(mounted);
  onUnmounted(unmounted);

  return { state, reveal, grade, skip, executeCommand, onMounted: mounted, onUnmounted: unmounted };
}

