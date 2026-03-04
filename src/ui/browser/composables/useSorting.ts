import { ref, computed, type Ref } from 'vue';
import type { GridApi } from 'ag-grid-community';
import type { SortModel } from '@/application/interfaces/ICardDataSource';
import type { BrowserCard } from '../types';
import { SORT_FIELD_CONFIGS } from '../constants';
import { resolveEffectiveSortModel } from '../utils/sortModel';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useSorting');

type QueueLike = {
  reorder?: (cards: BrowserCard[]) => Promise<unknown> | unknown;
};

type BrowserMenuItem = {
  icon?: string;
  label?: string;
  click?: () => void;
  type?: 'separator';
  submenu?: BrowserMenuItem[];
};

export interface UseSortingOptions {
  gridApi: Ref<GridApi | null>;
  currentSortModel: Ref<SortModel[]>;
  getQueueById: (id: string) => QueueLike | null;
  activeQueueId: Ref<string | null>;
  loadData: () => Promise<void>;
  loadAllRowsForCurrentView: (sortModel: SortModel[]) => Promise<BrowserCard[]>;
  applyRandomSortRows: (rows: BrowserCard[] | null) => void | Promise<void>;
  t: (key: string, fallback: string) => string;
  pushMsg: (msg: string, duration?: number) => Promise<void>;
  pushErrMsg: (msg: string, duration?: number) => Promise<void>;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
}

function shuffleRows(rows: BrowserCard[]): BrowserCard[] {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function useSorting(options: UseSortingOptions) {
  const {
    gridApi,
    currentSortModel,
    getQueueById,
    activeQueueId,
    loadData,
    loadAllRowsForCurrentView,
    applyRandomSortRows,
    t,
    pushMsg,
    pushErrMsg,
  } = options;

  const hasRandomSort = ref(false);
  const randomSortedRows = ref<BrowserCard[] | null>(null);

  function clearRandomSortState(): void {
    hasRandomSort.value = false;
    randomSortedRows.value = null;
    void Promise.resolve(applyRandomSortRows(null));
  }

  function applySort(colId: string, sortDirection: 'asc' | 'desc') {
    if (!gridApi.value) {
      logger.error('[useSorting] Grid API not ready');
      return;
    }

    logger.info('[useSorting] Applying sort:', { colId, sortDirection });

    try {
      gridApi.value.applyColumnState({
        state: [{ colId, sort: sortDirection }],
        defaultState: { sort: null },
      });
      clearRandomSortState();
    } catch (err) {
      logger.error('[useSorting] Apply sort failed:', err);
    }
  }

  async function applyRandomSort(): Promise<void> {
    if (!gridApi.value) {
      logger.error('[useSorting] Grid API not ready for random sort');
      return;
    }

    try {
      const allRows = await loadAllRowsForCurrentView([]);
      if (!allRows.length) {
        logger.warn('[useSorting] No rows to shuffle');
        await pushErrMsg(t('noCards', 'No cards'));
        return;
      }

      const shuffled = shuffleRows(allRows);
      randomSortedRows.value = shuffled;
      hasRandomSort.value = true;

      // Random mode should not keep column sort state.
      gridApi.value.applyColumnState({
        state: [],
        defaultState: { sort: null },
      });

      await Promise.resolve(applyRandomSortRows(shuffled));
      logger.info('[useSorting] Random sort applied with full dataset', { count: shuffled.length });
    } catch (err) {
      logger.error('[useSorting] Random sort failed:', err);
      await pushErrMsg(getErrorMessage(err, t('sortApplyFailed', 'Apply sort failed')));
    }
  }

  const canApplySortToQueue = computed(() => {
    const qid = String(activeQueueId.value || '');
    const effectiveSortModel = resolveEffectiveSortModel({
      currentSortModel: currentSortModel.value || [],
      api: gridApi.value,
    });

    let hasSort = effectiveSortModel.length > 0;

    if (hasRandomSort.value) hasSort = true;

    const validQueues = ['retrieval', 'final-drill', 'filter-group', 'neural', 'incremental-learning'];
    if (!qid || !validQueues.includes(qid) || !hasSort) return false;
    return true;
  });

  async function handleApplySortToQueue() {
    const qid = String(activeQueueId.value || '');
    if (!qid) return;

    const queue = getQueueById(qid);
    if (!queue) {
      await pushErrMsg(t('queueNotFound', 'Queue not found'));
      return;
    }

    if (typeof queue.reorder !== 'function') {
      await pushErrMsg(t('queueNotSupportReorder', 'Current queue does not support reorder'));
      return;
    }

    const effectiveSortModel = resolveEffectiveSortModel({
      currentSortModel: currentSortModel.value || [],
      api: gridApi.value,
    });

    let orderedCards: BrowserCard[] = [];
    if (hasRandomSort.value && randomSortedRows.value?.length) {
      orderedCards = randomSortedRows.value;
    } else {
      if (effectiveSortModel.length === 0) {
        await pushErrMsg(t('sortRequired', 'Please apply a sort first'));
        return;
      }
      orderedCards = await loadAllRowsForCurrentView(effectiveSortModel);
    }

    if (!orderedCards.length) {
      await pushErrMsg(t('noCards', 'No cards'));
      return;
    }

    try {
      logger.info('[useSorting] Applying full-order sort to queue:', {
        queueId: qid,
        cardsCount: orderedCards.length,
        randomMode: hasRandomSort.value,
      });

      const ok = await Promise.resolve(queue.reorder(orderedCards));
      if (!ok) {
        await pushErrMsg(t('sortApplyFailed', 'Apply sort failed'));
        return;
      }

      await pushMsg(t('sortApplied', 'Queue reordered by current sort'));
      clearRandomSortState();
      await loadData();
    } catch (err: unknown) {
      logger.error('[useSorting] apply sort to queue failed:', err);
      await pushErrMsg(getErrorMessage(err, t('sortApplyFailed', 'Apply sort failed')));
    }
  }

  function buildSortSubmenu(onSort: (colId: string, dir: 'asc' | 'desc') => void): BrowserMenuItem[] {
    const sortMenu: BrowserMenuItem[] = [];

    for (const field of SORT_FIELD_CONFIGS) {
      sortMenu.push({
        icon: field.icon || 'iconSort',
        label: field.label,
        submenu: [
          {
            icon: 'iconUp',
            label: 'Ascending',
            click: () => onSort(field.colId, 'asc'),
          },
          {
            icon: 'iconDown',
            label: 'Descending',
            click: () => onSort(field.colId, 'desc'),
          },
        ],
      });
    }

    sortMenu.push({ type: 'separator' });
    sortMenu.push({
      icon: 'iconRefresh',
      label: t('sortRandom', 'Random Sort'),
      click: () => {
        void applyRandomSort();
      },
    });

    return sortMenu;
  }

  return {
    hasRandomSort,
    applySort,
    applyRandomSort,
    canApplySortToQueue,
    handleApplySortToQueue,
    buildSortSubmenu,
  };
}
