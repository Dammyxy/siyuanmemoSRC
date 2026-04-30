import { ref } from 'vue';
import type { CardFilter } from '@/types/unified-data-source';

type ReviewFilterLogger = {
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type ReviewFilterGroupQueueLike = {
  setFilter?: (filter: CardFilter) => Promise<void> | void;
  getFilter?: () => CardFilter;
  rebuild?: () => Promise<void> | void;
};

export type ReviewFilterRuntimeOptions = {
  t: (key: string, fallback: string) => string;
  showMessage: (message: string, timeout?: number, type?: 'info' | 'error' | 'warning') => void;
  logger?: ReviewFilterLogger;
  getFilterGroupQueue: () => ReviewFilterGroupQueueLike | null;
  reload: () => Promise<void>;
};

export function createReviewFilterRuntime(options: ReviewFilterRuntimeOptions) {
  const dialogOpen = ref(false);
  const appliedFilter = ref<CardFilter | null>(null);

  function syncFromQueue(): void {
    const filterQueue = options.getFilterGroupQueue();
    if (!filterQueue || typeof filterQueue.getFilter !== 'function') {
      appliedFilter.value = null;
      return;
    }

    try {
      const nextFilter = filterQueue.getFilter();
      appliedFilter.value = nextFilter ? { ...nextFilter } : null;
    } catch (error) {
      options.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to read filter-group filter:', error);
      appliedFilter.value = null;
    }
  }

  async function applyAndReload(filter: CardFilter): Promise<void> {
    const filterQueue = options.getFilterGroupQueue();
    if (!filterQueue) {
      options.showMessage(options.t('filterQueueUnavailable', '筛选复习队列不可用'), 3000, 'error');
      return;
    }

    try {
      await filterQueue.setFilter?.(filter);
      await filterQueue.rebuild?.();
      appliedFilter.value = Object.keys(filter).length > 0 ? { ...filter } : null;
      dialogOpen.value = false;
      await options.reload();
    } catch (error) {
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to apply review filter:', error);
      options.showMessage(options.t('applyFilterFailed', '应用筛选失败'), 3000, 'error');
    }
  }

  async function handleApply(filter: CardFilter): Promise<void> {
    await applyAndReload(filter);
  }

  async function handleClear(): Promise<void> {
    await applyAndReload({});
  }

  async function handleRebuild(): Promise<void> {
    const filterQueue = options.getFilterGroupQueue();
    if (!filterQueue) {
      options.showMessage(options.t('filterQueueUnavailable', '筛选复习队列不可用'), 3000, 'error');
      return;
    }

    try {
      await filterQueue.rebuild?.();
      syncFromQueue();
      await options.reload();
    } catch (error) {
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to rebuild filter-group queue:', error);
      options.showMessage(options.t('rebuildFailed', '重建失败'), 3000, 'error');
    }
  }

  function openDialog(): void {
    syncFromQueue();
    dialogOpen.value = true;
  }

  return {
    dialogOpen,
    appliedFilter,
    syncFromQueue,
    applyAndReload,
    handleApply,
    handleClear,
    handleRebuild,
    openDialog,
  };
}
