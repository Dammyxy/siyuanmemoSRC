import { ref } from 'vue';
import type { ColumnState, GridApi, CellContextMenuEvent, RowSelectionOptions } from 'ag-grid-community';
import type { SortModel } from '@/application/interfaces/ICardDataSource';
import { BrowserCard } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useGridInteractions');

type GridReadyParams = {
  api: GridApi;
};

type GridSortParams = {
  api?: GridApi | null;
};

type GridRowEvent = {
  data?: BrowserCard;
  event?: MouseEvent;
};

type TabApplicationServiceLike = {
  openDocumentTab: (params: { docId: string }) => Promise<void> | void;
};

export interface GridInteractionsOptions {
  tabApplicationService?: TabApplicationServiceLike;  // ✅ Phase 9: 使用 TabApplicationService
  i18n?: Record<string, string>;
}

export function useGridInteractions(props: GridInteractionsOptions) {
  // Grid 状态
  const gridApi = ref<GridApi | null>(null);
  const selectedRows = ref<BrowserCard[]>([]);
  const currentSortModel = ref<SortModel[]>([]);
  const hasRandomSort = ref(false);  // 标记是否进行了随机排序

  // AG Grid 选择配置 (v35+ 新 API)
  const rowSelection = ref<RowSelectionOptions>({
    mode: 'multiRow',
    checkboxes: true,       // AG-Grid v35+：启用复选框（显示在第一列）
    headerCheckbox: true,   // AG-Grid v35+：启用表头全选复选框
    enableClickSelection: false,
  });

  // Grid 事件处理
  const onGridReady = (params: GridReadyParams) => {
    gridApi.value = params.api;
  };

  const onDisplayedColumnsChanged = (_params: GridSortParams) => {
    logger.info('[SiYuanMemo][CardBrowser] Displayed columns changed');
  };

  const onSortChanged = (params: GridSortParams) => {
    currentSortModel.value = (params.api?.getSortModel?.() ?? []) as SortModel[];
    const sortArray = [...currentSortModel.value];

    // 如果有列排序状态，清除随机排序标志
    if (sortArray.length > 0) {
      hasRandomSort.value = false;
    }

    // 检查排序是否真的改变了
    const api = params.api || gridApi.value;
    logger.info('[SiYuanMemo][CardBrowser] onSortChanged:', {
      sortModel: currentSortModel.value,
      sortModelLength: currentSortModel.value.length,
      sortModelArray: sortArray,
      hasGetSortModel: typeof api?.getSortModel === 'function',
      hasGetDisplayedRowCount: typeof api?.getDisplayedRowCount === 'function',
      hasGetColumnState: typeof api?.getColumnState === 'function',
      columnState: (api?.getColumnState?.() ?? []).filter((column: ColumnState) => column.colId === 'priority'),
    });

    // 强制刷新 NO 列以更新行号（使用 colId）
    if (api) {
      api.refreshCells?.({ force: true, columns: ['noColumn'] });
    }
  };

  const onSelectionChanged = () => {
    if (gridApi.value) {
      selectedRows.value = gridApi.value.getSelectedRows() as BrowserCard[];
    }
  };

  // 行点击事件
  const onRowClicked = (event: GridRowEvent, onPreviewSelect?: (card: BrowserCard) => void) => {
    const mouseEvent = event.event;
    const isMultiSelect = mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey;

    // 多选模式：不改变预览
    if (isMultiSelect) {
      return;
    }

    // 单选模式
    if (onPreviewSelect && event.data) {
      onPreviewSelect(event.data);
    }
  };

  // 行双击事件
  const onRowDoubleClicked = async (event: GridRowEvent) => {
    const blockId = event.data?.blockId;
    if (!blockId) {
      logger.warn('[SiYuanMemo][CardBrowser] No blockId found in row data:', event.data);
      return;
    }

    // ✅ Phase 9: 优先使用 TabApplicationService（DDD 架构）
    if (props.tabApplicationService) {
      await Promise.resolve(props.tabApplicationService.openDocumentTab({ docId: blockId }));
      return;
    }
    logger.warn('[SiYuanMemo][CardBrowser] Tab service unavailable, cannot open document:', blockId);
  };

  // 右键菜单事件
  const onCellContextMenu = (event: CellContextMenuEvent, onShowContextMenu?: (event: CellContextMenuEvent) => void) => {
    event.event?.preventDefault();
    if (onShowContextMenu) {
      onShowContextMenu(event);
    }
  };

  // 排序相关方法
  const applySort = (colId: string, sortDirection: 'asc' | 'desc', api: GridApi | null) => {
    if (!api) {
      logger.error('[SiYuanMemo][CardBrowser] Grid API not ready');
      return;
    }

    logger.info('[SiYuanMemo][CardBrowser] Applying sort:', { colId, sortDirection });

    try {
      api.applyColumnState({
        state: [
          {
            colId,
            sort: sortDirection,
          },
        ],
        defaultState: { sort: null }, // 清除其他列的排序
      });

      logger.info('[SiYuanMemo][CardBrowser] Sort applied successfully');
    } catch (err) {
      logger.error('[SiYuanMemo][CardBrowser] Apply sort failed:', err);
    }
  };

  // 随机排序
  const applyRandomSort = (api: GridApi | null) => {
    if (!api) {
      logger.error('[SiYuanMemo][CardBrowser] Grid API not ready for random sort');
      return;
    }

    try {
      // 获取当前显示的所有行数据
      const rowCount = api.getDisplayedRowCount?.() ?? 0;
      if (rowCount === 0) {
        logger.warn('[SiYuanMemo][CardBrowser] No rows to shuffle');
        return;
      }

      logger.info('[SiYuanMemo][CardBrowser] Shuffling', rowCount, 'rows');

      // 收集所有行数据
      const rows: BrowserCard[] = [];
      for (let i = 0; i < rowCount; i++) {
        const node = api.getDisplayedRowAtIndex?.(i);
        const row = node?.data as BrowserCard | undefined;
        if (row) {
          rows.push(row);
        }
      }

      // Fisher-Yates 洗牌算法
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }

      // 清除所有排序状态
      api.applyColumnState({
        state: [],
        defaultState: { sort: null },
      });

      // 使用 AG-Grid v28+ 的 setGridOption API
      api.setGridOption?.('rowData', []);

      // 在下一个 tick 设置新数据
      setTimeout(() => {
        api.setGridOption?.('rowData', rows);
        logger.info('[SiYuanMemo][CardBrowser] Shuffle completed via setGridOption');
      }, 0);
    } catch (err) {
      logger.error('[SiYuanMemo][CardBrowser] Random sort failed:', err);
    }
  };

  // 返回网格交互相关的方法和状态
  return {
    gridApi,
    selectedRows,
    currentSortModel,
    hasRandomSort,
    rowSelection,
    onGridReady,
    onDisplayedColumnsChanged,
    onSortChanged,
    onSelectionChanged,
    onRowClicked,
    onRowDoubleClicked,
    onCellContextMenu,
    applySort,
    applyRandomSort,
  };
}
