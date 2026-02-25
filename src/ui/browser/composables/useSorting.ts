/**
 * 排序逻辑 composable
 * 处理 AG-Grid 列排序和随机排序
 */
import { ref, computed, nextTick, type Ref } from 'vue';
import type { ColumnState, GridApi } from 'ag-grid-community';
import type { SortModel } from '@/application/interfaces/ICardDataSource';
import type { BrowserCard } from '../types';
import { SORT_FIELD_CONFIGS } from '../constants';

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

export function useSorting(options: UseSortingOptions) {
  const {
    gridApi,
    currentSortModel,
    getQueueById,
    activeQueueId,
    loadData,
    t,
    pushMsg,
    pushErrMsg,
  } = options;

  // 随机排序标志
  const hasRandomSort = ref(false);

  // 应用列排序
  function applySort(colId: string, sortDirection: 'asc' | 'desc') {
    if (!gridApi.value) {
      console.error('[useSorting] Grid API not ready');
      return;
    }

    console.log('[useSorting] Applying sort:', { colId, sortDirection });

    try {
      gridApi.value.applyColumnState({
        state: [{ colId, sort: sortDirection }],
        defaultState: { sort: null },
      });
      hasRandomSort.value = false;
      console.log('[useSorting] Sort applied successfully');
    } catch (err) {
      console.error('[useSorting] Apply sort failed:', err);
    }
  }

  // 随机排序 (Fisher-Yates)
  function applyRandomSort() {
    if (!gridApi.value) {
      console.error('[useSorting] Grid API not ready for random sort');
      return;
    }

    try {
      const rowCount = gridApi.value.getDisplayedRowCount?.() ?? 0;
      if (rowCount === 0) {
        console.warn('[useSorting] No rows to shuffle');
        return;
      }

      console.log('[useSorting] Shuffling', rowCount, 'rows');

      // 收集所有行数据
      const rows: BrowserCard[] = [];
      for (let i = 0; i < rowCount; i++) {
        const node = gridApi.value.getDisplayedRowAtIndex?.(i);
        const row = node?.data as BrowserCard | undefined;
        if (row) rows.push(row);
      }

      // Fisher-Yates 洗牌算法
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }

      // 清除所有排序状态
      gridApi.value.applyColumnState({
        state: [],
        defaultState: { sort: null },
      });

      hasRandomSort.value = true;

      // 使用 AG-Grid setGridOption API
      gridApi.value.setGridOption?.('rowData', []);

      nextTick(() => {
        if (gridApi.value) {
          gridApi.value.setGridOption?.('rowData', rows);
          console.log('[useSorting] Shuffle completed via setGridOption');
        }
      });
    } catch (err) {
      console.error('[useSorting] Random sort failed:', err);
    }
  }

  // 是否可以应用排序到队列
  const canApplySortToQueue = computed(() => {
    const qid = String(activeQueueId.value || '');
    const sortArray = [...(currentSortModel.value || [])];

    let hasSort = sortArray.length > 0;
    if (!hasSort && gridApi.value) {
      try {
        if (typeof gridApi.value.isDestroyed === 'function' && gridApi.value.isDestroyed()) {
          hasSort = false;
        } else {
          const columnState = gridApi.value.getColumnState?.() || [];
          hasSort = columnState.some((col: ColumnState) => col.sort && col.sort !== 'undefined');
        }
      } catch {
        hasSort = false;
      }
    }

    if (hasRandomSort.value) hasSort = true;

    const validQueues = ['retrieval', 'final-drill', 'filter-group', 'neural', 'incremental-learning'];
    if (!qid || !validQueues.includes(qid) || !hasSort) return false;
    return true;
  });

  // 应用排序到队列
  async function handleApplySortToQueue() {
    const qid = String(activeQueueId.value || '');
    if (!qid) return;

    const queue = getQueueById(qid);
    if (!queue) {
      await pushErrMsg(t('queueNotFound', '队列未找到'));
      return;
    }

    // 检查队列是否支持 reorder 方法
    if (typeof queue.reorder !== 'function') {
      await pushErrMsg(t('queueNotSupportReorder', '当前队列不支持重排'));
      return;
    }

    if (!gridApi.value) {
      await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
      return;
    }

    // 获取浏览器中显示的卡片顺序
    const orderedCards: BrowserCard[] = [];
    const count = Number(gridApi.value.getDisplayedRowCount?.() ?? 0);
    for (let i = 0; i < count; i++) {
      const node = gridApi.value.getDisplayedRowAtIndex?.(i);
      const card = node?.data as BrowserCard | undefined;
      if (card) orderedCards.push(card);
    }

    if (!orderedCards.length) {
      await pushErrMsg(t('noCards', '没有卡片'));
      return;
    }

    try {
      console.log('[useSorting] Applying sort to queue:', { queueId: qid, cardsCount: orderedCards.length });

      const ok = await Promise.resolve(queue.reorder(orderedCards));
      console.log('[useSorting] Queue reorder result:', { ok });

      if (!ok) {
        await pushErrMsg(t('sortApplyFailed', '应用排序失败'));
        return;
      }

      await pushMsg(t('sortApplied', '队列已按当前排序重新排列'));
      hasRandomSort.value = false;
      await loadData();
    } catch (err: unknown) {
      console.error('[useSorting] apply sort to queue failed:', err);
      await pushErrMsg(getErrorMessage(err, t('sortApplyFailed', '应用排序失败')));
    }
  }

  // 构建排序子菜单
  function buildSortSubmenu(onSort: (colId: string, dir: 'asc' | 'desc') => void): BrowserMenuItem[] {
    const sortMenu: BrowserMenuItem[] = [];

    for (const field of SORT_FIELD_CONFIGS) {
      sortMenu.push({
        icon: field.icon || 'iconSort',
        label: field.label,
        submenu: [
          {
            icon: 'iconUp',
            label: '升序',
            click: () => onSort(field.colId, 'asc'),
          },
          {
            icon: 'iconDown',
            label: '降序',
            click: () => onSort(field.colId, 'desc'),
          },
        ],
      });
    }

    sortMenu.push({ type: 'separator' });
    sortMenu.push({
      icon: 'iconRefresh',
      label: t('sortRandom', '随机排序'),
      click: () => applyRandomSort(),
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
