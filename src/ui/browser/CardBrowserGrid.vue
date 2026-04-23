<template>
  <div class="card-browser__grid">
    <ag-grid-vue
      class="ag-theme-balham card-browser-grid"
      style="width: 100%; height: 100%;"
      :columnDefs="columnDefs"
      :rowData="rowData"
      :defaultColDef="defaultColDef"
      :rowSelection="rowSelection"
      :enableCellTextSelection="true"
      :suppressRowVirtualisation="false"
      :rowBuffer="20"
      :rowClass="'ag-row-custom'"
      :suppressCellFocus="false"
      :pagination="false"
      :domLayout="'normal'"
      :animateRows="false"
      :suppressRowHoverHighlight="false"
      @grid-ready="onGridReady"
      @sort-changed="onSortChanged"
      @displayed-columns-changed="onDisplayedColumnsChanged"
      @selection-changed="onSelectionChanged"
      @row-clicked="onRowClicked"
      @row-double-clicked="onRowDoubleClicked"
      @cell-context-menu="onCellContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { AgGridVue } from 'ag-grid-vue3';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import type {
  ColDef,
  CellContextMenuEvent,
  RowSelectionOptions,
  GridReadyEvent,
  SortChangedEvent,
  DisplayedColumnsChangedEvent,
  RowClickedEvent,
  RowDoubleClickedEvent,
} from 'ag-grid-community';
import type { BrowserCard } from './types';
import { createColumnDefs } from './config';

// 注册 AG-Grid 模块
ModuleRegistry.registerModules([AllCommunityModule]);

// 定义 props
interface Props {
  rowData: BrowserCard[];
  columnDefs?: ColDef[];
  rowSelection?: RowSelectionOptions;
  defaultColDef?: ColDef;
  suppressRowVirtualisation?: boolean;
  rowBuffer?: number;
  rowClass?: string;
  suppressCellFocus?: boolean;
  pagination?: boolean;
  domLayout?: 'normal' | 'print' | 'forPrint';
  animateRows?: boolean;
  suppressRowHoverHighlight?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  columnDefs: () => createColumnDefs(),
  rowSelection: () => ({
    mode: 'multiRow',
    checkboxes: true,
    headerCheckbox: true,
    enableClickSelection: false,
  }),
  defaultColDef: () => ({
    resizable: true,
    sortable: true,
  }),
});

// 定义 emits
const emit = defineEmits<{
  (e: 'grid-ready', params: GridReadyEvent<BrowserCard>): void;
  (e: 'sort-changed', params: SortChangedEvent<BrowserCard>): void;
  (e: 'displayed-columns-changed', params: DisplayedColumnsChangedEvent<BrowserCard>): void;
  (e: 'selection-changed'): void;
  (e: 'row-clicked', event: RowClickedEvent<BrowserCard>): void;
  (e: 'row-double-clicked', event: RowDoubleClickedEvent<BrowserCard>): void;
  (e: 'cell-context-menu', event: CellContextMenuEvent): void;
}>();

// 事件处理函数
const onGridReady = (params: GridReadyEvent<BrowserCard>) => {
  emit('grid-ready', params);
};

const onSortChanged = (params: SortChangedEvent<BrowserCard>) => {
  emit('sort-changed', params);
};

const onDisplayedColumnsChanged = (params: DisplayedColumnsChangedEvent<BrowserCard>) => {
  emit('displayed-columns-changed', params);
};

const onSelectionChanged = () => {
  emit('selection-changed');
};

const onRowClicked = (event: RowClickedEvent<BrowserCard>) => {
  emit('row-clicked', event);
};

const onRowDoubleClicked = (event: RowDoubleClickedEvent<BrowserCard>) => {
  emit('row-double-clicked', event);
};

const onCellContextMenu = (event: CellContextMenuEvent) => {
  emit('cell-context-menu', event);
};
</script>

<style scoped>
.card-browser__grid {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* AG-Grid 思源主题完整适配 */
.card-browser-grid {
  --ag-background-color: var(--b3-theme-background);
  --ag-foreground-color: var(--b3-theme-on-background);
  --ag-border-color: var(--b3-border-color);
  --ag-header-background-color: var(--b3-theme-surface);
  --ag-header-foreground-color: var(--b3-theme-on-surface);
  --ag-odd-row-background-color: var(--b3-theme-background);
  --ag-even-row-background-color: var(--b3-theme-background);
  --ag-row-hover-color: var(--b3-list-hover);
  --ag-selected-row-background-color: rgba(var(--b3-theme-primary-rgb), 0.15);
  --ag-row-height: 30px;
  --ag-header-height: 34px;
  --ag-font-size: 12px;
  --ag-cell-horizontal-padding: 7px;
  --ag-header-column-resize-handle-color: var(--b3-theme-primary);
  --ag-header-column-resize-handle-width: 2px;
  --ag-checkbox-checked-color: var(--b3-theme-primary);
  --ag-checkbox-unchecked-color: var(--b3-theme-on-surface-light);
  --ag-checkbox-background-color: transparent;

  font-family: inherit;
  user-select: none; /* ✅ 禁止文本选择 */
}

/* 根容器 - 防止白屏 */
.card-browser-grid :deep(.ag-root-wrapper) {
  background: var(--b3-theme-background) !important;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
}

.card-browser-grid :deep(.ag-root),
.card-browser-grid :deep(.ag-body-viewport),
.card-browser-grid :deep(.ag-center-cols-viewport),
.card-browser-grid :deep(.ag-center-cols-container),
.card-browser-grid :deep(.ag-pinned-left-cols-container) {
  background: var(--b3-theme-background) !important;
}

/* 表头样式 */
.card-browser-grid :deep(.ag-header),
.card-browser-grid :deep(.ag-header-viewport),
.card-browser-grid :deep(.ag-pinned-left-header) {
  background: var(--b3-theme-surface) !important;
}

.card-browser-grid :deep(.ag-header-cell) {
  color: var(--b3-theme-on-surface);
  font-weight: 500;
  font-size: 11px;
  background: var(--b3-theme-surface) !important;
}

/* 行样式 */
.card-browser-grid :deep(.ag-row) {
  background: var(--b3-theme-background) !important;
  border-bottom: 1px solid var(--b3-border-color);
}

.card-browser-grid :deep(.ag-row:hover) {
  background: var(--b3-list-hover) !important;
}

.card-browser-grid :deep(.ag-row-selected) {
  background: rgba(var(--b3-theme-primary-rgb), 0.12) !important;
}

/* 单元格样式 */
.card-browser-grid :deep(.ag-cell) {
  line-height: 32px;
  color: var(--b3-theme-on-background);
  background: transparent !important;
}

/* 复选框样式 */
.card-browser-grid :deep(.ag-checkbox-input-wrapper) {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 2px solid var(--b3-theme-on-surface-light);
  background: transparent;
}

.card-browser-grid :deep(.ag-checkbox-input-wrapper.ag-checked) {
  background: var(--b3-theme-primary);
  border-color: var(--b3-theme-primary);
}

/* 分页器 */
.card-browser-grid :deep(.ag-paging-panel) {
  background: var(--b3-theme-surface);
  border-top: 1px solid var(--b3-border-color);
  height: 32px;
}
</style>
