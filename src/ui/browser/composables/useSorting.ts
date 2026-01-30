/**
 * 排序逻辑 composable
 * 处理 AG-Grid 列排序和随机排序
 */
import { ref, computed, nextTick, type Ref } from 'vue';
import type { GridApi } from 'ag-grid-community';
import { SORT_FIELD_CONFIGS } from '../constants';

export interface UseSortingOptions {
  gridApi: Ref<GridApi | null>;
  filteredCards: Ref<any[]>;
  currentSortModel: Ref<any[]>;
  getQueueById: (id: string) => any;
  activeQueueId: Ref<string | null>;
  loadData: () => Promise<void>;
  t: (key: string, fallback: string) => string;
  pushMsg: (msg: string, duration?: number) => Promise<void>;
  pushErrMsg: (msg: string, duration?: number) => Promise<void>;
}

export function useSorting(options: UseSortingOptions) {
  const {
    gridApi,
    filteredCards,
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
      const rows: any[] = [];
      for (let i = 0; i < rowCount; i++) {
        const node = gridApi.value.getDisplayedRowAtIndex?.(i);
        if (node?.data) rows.push(node.data);
      }

      // Fisher-Yates 洗牌算法
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }

      // 清除所有排序状态
      gridApi.value.applyColumnState?.({
        state: [],
        defaultState: { sort: null },
      });

      hasRandomSort.value = true;

      // 使用 AG-Grid setGridOption API
      gridApi.value.setGridOption?.('rowData', []);
      filteredCards.value = [];

      nextTick(() => {
        if (gridApi.value) {
          gridApi.value.setGridOption?.('rowData', rows);
          filteredCards.value = rows;
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
    const sortArray = Array.from(currentSortModel.value || []);

    let hasSort = sortArray.length > 0;
    if (!hasSort && gridApi.value) {
      try {
        if (typeof gridApi.value.isDestroyed === 'function' && gridApi.value.isDestroyed()) {
          hasSort = false;
        } else {
          const columnState = gridApi.value.getColumnState?.() || [];
          hasSort = columnState.some((col: any) => col.sort && col.sort !== 'undefined');
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

    const q = getQueueById(qid);
    if (!q) {
      await pushErrMsg(t('queueNotFound', '队列未找到'));
      return;
    }
    if (typeof q.reorder !== 'function') {
      await pushErrMsg(t('queueNotSupportReorder', '当前队列不支持重排'));
      return;
    }
    if (!gridApi.value) {
      await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
      return;
    }

    const currentItems = q.getAllItems?.() || [];
    const currentItemsByBlockId = new Map(
      currentItems.map((item: any) => [String(item.blockID || ''), item] as const)
    );

    const orderedCards: any[] = [];
    const count = Number(gridApi.value.getDisplayedRowCount?.() ?? 0);
    for (let i = 0; i < count; i++) {
      const node = gridApi.value.getDisplayedRowAtIndex?.(i);
      const card = node?.data;
      if (card) orderedCards.push(card);
    }

    if (!orderedCards.length) {
      await pushErrMsg(t('noCards', '没有卡片'));
      return;
    }

    const queueItems: any[] = [];
    for (const card of orderedCards) {
      const blockId = String(card.blockId || '');
      const item = currentItemsByBlockId.get(blockId);
      if (item) queueItems.push(item);
    }

    try {
      console.log('[useSorting] Applying sort to queue:', { queueId: qid, queueItemsCount: queueItems.length });
      const ok = await Promise.resolve(q.reorder(queueItems));
      console.log('[useSorting] Queue reorder result:', { ok });

      if (!ok) {
        await pushErrMsg(t('sortApplyFailed', '应用排序失败'));
        return;
      }
      await pushMsg(t('sortApplied', '队列已按当前排序重新排列'));
      hasRandomSort.value = false;
      await loadData();
    } catch (err: any) {
      console.error('[useSorting] apply sort to queue failed:', err);
      await pushErrMsg(err?.message || t('sortApplyFailed', '应用排序失败'));
    }
  }

  // 构建排序子菜单
  function buildSortSubmenu(onSort: (colId: string, dir: 'asc' | 'desc') => void): any[] {
    const sortMenu: any[] = [];

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
      label: '随机排序',
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
