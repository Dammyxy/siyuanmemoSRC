import { ref, computed, nextTick } from 'vue';
import type { GridApi, ColDef, CellContextMenuEvent, RowSelectionOptions } from 'ag-grid-community';
import { BrowserCard } from '../types';

export interface GridInteractionsOptions {
  plugin?: any;
  i18n?: Record<string, string>;
}

export function useGridInteractions(props: GridInteractionsOptions) {
  // Grid 状态
  const gridApi = ref<GridApi | null>(null);
  const selectedRows = ref<BrowserCard[]>([]);
  const currentSortModel = ref<any[]>([]);
  const hasRandomSort = ref(false);  // 标记是否进行了随机排序

  // AG Grid 选择配置 (v35+ 新 API)
  const rowSelection = ref<RowSelectionOptions>({
    mode: 'multiRow',
    checkboxes: true,       // AG-Grid v35+：启用复选框（显示在第一列）
    headerCheckbox: true,   // AG-Grid v35+：启用表头全选复选框
    enableClickSelection: false,
  });

  // Grid 事件处理
  const onGridReady = (params: any) => {
    gridApi.value = params.api;
    // 使用 gridApi.value 获取列信息（使用 nextTick 确保初始化完成）
    // nextTick(() => {
    //   if (gridApi.value) {
    //     const columns = gridApi.value.getColumns?.();
    //     console.log('[SiYuanMemo][CardBrowser] AG-Grid ready, columns:', columns?.map((c: any) => ({
    //       colId: c.getColId(),
    //       sortable: c.isSortable(),
    //     })));
    //   }
    // });
  };

  const onDisplayedColumnsChanged = (params: any) => {
    console.log('[SiYuanMemo][CardBrowser] Displayed columns changed');
  };

  const onSortChanged = (params: any) => {
    currentSortModel.value = params?.api?.getSortModel?.() || [];
    const sortArray = Array.from(currentSortModel.value || []);

    // 如果有列排序状态，清除随机排序标志
    if (sortArray.length > 0) {
      hasRandomSort.value = false;
    }

    // 检查排序是否真的改变了
    const api = params?.api || gridApi.value;
    console.log('[SiYuanMemo][CardBrowser] onSortChanged:', {
      sortModel: currentSortModel.value,
      sortModelLength: currentSortModel.value?.length,
      sortModelArray: sortArray,
      // 调试：检查 API 方法
      hasGetSortModel: typeof api?.getSortModel === 'function',
      hasGetDisplayedRowCount: typeof api?.getDisplayedRowCount === 'function',
      hasGetColumnState: typeof api?.getColumnState === 'function',
      // 尝试获取当前排序状态（只显示 priority 列）
      columnState: api?.getColumnState?.()?.filter((c: any) => c.colId === 'priority') || [],
    });

    // 强制刷新 NO 列以更新行号（使用 colId）
    if (api) {
      api.refreshCells?.({ force: true, columns: ['noColumn'] });
    }
  };

  const onSelectionChanged = () => {
    if (gridApi.value) {
      selectedRows.value = gridApi.value.getSelectedRows();
    }
  };

  // 行点击事件
  const onRowClicked = (event: any, onPreviewSelect?: (card: BrowserCard) => void) => {
    const mouseEvent = event.event as MouseEvent;
    const isMultiSelect = mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey;
    
    // 多选模式：不改变预览
    if (isMultiSelect) {
      return;
    }
    
    // 单选模式
    if (onPreviewSelect) {
      onPreviewSelect(event.data);
    }
  };

  // 行双击事件
  const onRowDoubleClicked = (event: any) => {
    const blockId = event.data?.blockId;
    if (!blockId) {
      console.warn('[SiYuanMemo][CardBrowser] No blockId found in row data:', event.data);
      return;
    }
    if (props.plugin?.app) {
      (props.plugin.app as any).openTab({
        app: props.plugin.app,
        doc: { id: blockId },
      });
    }
  };

  // 右键菜单事件
  const onCellContextMenu = (event: CellContextMenuEvent, onShowContextMenu?: (event: CellContextMenuEvent) => void) => {
    event.event?.preventDefault();
    if (onShowContextMenu) {
      onShowContextMenu(event);
    }
  };

  // 排序相关方法
  const applySort = (colId: string, sortDirection: 'asc' | 'desc', gridApi: any) => {
    if (!gridApi) {
      console.error('[SiYuanMemo][CardBrowser] Grid API not ready');
      return;
    }

    console.log('[SiYuanMemo][CardBrowser] Applying sort:', { colId, sortDirection });

    try {
      // AG-Grid v35+ 直接使用 gridApi.applyColumnState
      gridApi.applyColumnState({
        state: [
          {
            colId: colId,
            sort: sortDirection,
          },
        ],
        defaultState: { sort: null }, // 清除其他列的排序
      });

      console.log('[SiYuanMemo][CardBrowser] Sort applied successfully');
    } catch (err) {
      console.error('[SiYuanMemo][CardBrowser] Apply sort failed:', err);
    }
  };

  // 随机排序
  const applyRandomSort = (gridApi: any) => {
    if (!gridApi) {
      console.error('[SiYuanMemo][CardBrowser] Grid API not ready for random sort');
      return;
    }

    try {
      // 获取当前显示的所有行数据
      const rowCount = gridApi.getDisplayedRowCount?.() ?? 0;
      if (rowCount === 0) {
        console.warn('[SiYuanMemo][CardBrowser] No rows to shuffle');
        return;
      }

      console.log('[SiYuanMemo][CardBrowser] Shuffling', rowCount, 'rows');

      // 收集所有行数据
      const rows: any[] = [];
      for (let i = 0; i < rowCount; i++) {
        const node = gridApi.getDisplayedRowAtIndex?.(i);
        if (node?.data) {
          rows.push(node.data);
        }
      }

      // Fisher-Yates 洗牌算法
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }

      // 清除所有排序状态
      gridApi.setColumnState?.({
        state: [],
        defaultState: { sort: null },
      });

      // 设置随机排序标志
      // 注意：需要通过某种方式更新 hasRandomSort 状态

      // 使用 AG-Grid v28+ 的 setGridOption API
      // 先清空数据，强制 AG-Grid 重新创建行模型
      gridApi.setGridOption?.('rowData', []);

      // 在下一个 tick 设置新数据
      setTimeout(() => {
        if (gridApi) {
          gridApi.setGridOption?.('rowData', rows);
          console.log('[SiYuanMemo][CardBrowser] Shuffle completed via setGridOption');
        }
      }, 0);
    } catch (err) {
      console.error('[SiYuanMemo][CardBrowser] Random sort failed:', err);
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