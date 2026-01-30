<template>
  <div class="card-browser" :class="[
    `card-browser--${mode}`,
    showPreview ? 'card-browser--preview-open' : ''
  ]">
    <!-- 主区域：工具栏 + 表格 -->
    <div class="card-browser__main">
      <div v-if="viewMode === 'hierarchy'" class="card-browser__hierarchy">
        <BrowserHierarchy
          :cards="rowsForFocus"
          :queues="{ active: activeQueueId || '', counts: queueCounts }"
          :focusedDocIds="focusedDocIds"
          :globalStats="globalStats"
          :i18n="props.i18n"
          @selectQueue="handleSelectQueue"
          @selectDoc="handleSelectDoc"
          @filterDoc="handleFilterDoc"
          @selectGlobal="handleSelectGlobal"
        />
      </div>

      <div class="card-browser__content">
      <!-- 顶部工具栏 -->
      <BrowserToolbar
        :i18n="props.i18n"
        v-model:searchQuery="searchQuery"
        v-model:currentPreset="currentPreset"
        v-model:currentCardType="currentCardType"
        v-model:showPreview="showPreview"
        :cardCount="filteredCards.length"
        :showExitFocus="activeDocId === '__lost__' || shouldFocusDocList"
        :hasPlugin="!!props.plugin"
        :canApplySortToQueue="canApplySortToQueue"
        :viewMode="viewMode"
        :loading="loading"
        :mode="mode"
        @exitFocus="handleExitFocus"
        @openPracticeMenu="openPracticeMenu"
        @applySortToQueue="handleApplySortToQueue"
        @toggleViewMode="toggleViewMode"
        @forceRefresh="forceRefreshData"
        @migrateTopicItem="migrateTopicItem"
        @showPerformanceReport="showPerformanceReport"
        @convertToTab="convertToTab"
      />
      
      <!-- 加载状态 -->
      <div v-if="loading" class="card-browser__loading">
        <div class="fn__loading"></div>
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="filteredCards.length === 0" class="card-browser__empty">
        <div>📭</div>
        <span>{{ t('noCards', '没有卡片') }}</span>
      </div>
      
      <!-- AG-Grid 表格 -->
      <div v-else class="card-browser__grid">
        <ag-grid-vue
          class="ag-theme-balham card-browser-grid"
          style="width: 100%; height: 100%;"
          :columnDefs="columnDefs"
          :rowData="filteredCards"
          :defaultColDef="defaultColDef"
          :rowSelection="rowSelection"
          :enableCellTextSelection="true"
          @grid-ready="onGridReady"
          @sort-changed="onSortChanged"
          @displayed-columns-changed="onDisplayedColumnsChanged"
          @selection-changed="onSelectionChanged"
          @row-clicked="onRowClicked"
          @row-double-clicked="onRowDoubleClicked"
          @cell-context-menu="onCellContextMenu"
        />
      </div>
      </div>
    </div>
    
    <!-- 拖拽分隔条 -->
    <div 
      v-if="showPreview" 
      class="card-browser__resizer"
      :class="{ 'card-browser__resizer--dragging': isResizing }"
      @mousedown="startResize"
    ></div>
    
    <!-- 预览面板 -->
    <BrowserPreview
      v-if="showPreview"
      :app="props.app"
      :i18n="props.i18n"
      :card="previewCard"
      :mode="mode"
      :size="previewSize"
      @jump="jumpToBlock"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue';
import { AgGridVue } from 'ag-grid-vue3';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
// AG Grid v35+ 使用 Theming API，无需引入 CSS 主题文件
// 自定义主题通过 CSS 变量实现（见 SRSBrowser.scss）
import './SRSBrowser.scss';
import type { GridApi, ColDef, CellContextMenuEvent } from 'ag-grid-community';
import { type RowSelectionOptions } from 'ag-grid-community';
import { openTab, Menu, Protyle, type App } from 'siyuan';
import { pushErrMsg, pushMsg, setBlockAttrs } from '@/core/siyuan/api';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import { parseQuery, loadCards, loadQueueCards, invalidateCardCache, getCacheStats, subscribeCacheUpdate } from './browserService';
import { PerformanceMonitor } from '@/utils/performance';
import { type BrowserCard, CardState } from './types';
import { migrateExistingCards, checkMigrationNeeded } from '@/scripts/migrateToTopicItem';
import { ATTR_CARD_TYPE } from '@/core/siyuan/block';
import type { ICardDataSource } from './datasource/types';
import { FinalDrillDataSource } from './datasource/FinalDrillDataSource';
import { FilterGroupDataSource } from './datasource/FilterGroupDataSource';
import { RetrievalDataSource } from './datasource/RetrievalDataSource';
import { DeckDataSource } from './datasource/DeckDataSource';
import { QueryDataSource } from './datasource/QueryDataSource';
import { BlockIdsDataSource } from './datasource/BlockIdsDataSource';
import ActionParamsDialog from './ActionParamsDialog.vue';
import BrowserHierarchy from './BrowserHierarchy.vue';
import BrowserPreview from './BrowserPreview.vue';
import BrowserToolbar from './BrowserToolbar.vue';
// ✅ 导入配置模块
import { createColumnDefs } from './config';
import { 
  CARD_STATE_COLORS, 
  DEFAULT_PRIORITY, 
  SORT_FIELD_CONFIGS, 
  type SortFieldConfig,
  PREVIEW_SIZE_MIN,
  PREVIEW_SIZE_MAX,
  DEFAULT_PREVIEW_SIZE,
} from './constants';
// ✅ 导入工具函数
import { matchesParsedQuery, extractSqlStatement } from './utils/cardFilters';
import { extractBlockIds } from './utils/helpers';
import {
  createQueueDataSource,
  createBlockIdsDataSource,
  createDeckDataSource,
  createQueryDataSource,
  createFocusDataSource,
  type DataSourceOptionsWithDoc,
} from './utils/dataSourceFactory';
import { useSorting } from './composables/useSorting';
import { useCardActions } from './composables/useCardActions';

// 注册 AG-Grid 模块
ModuleRegistry.registerModules([AllCommunityModule]);

// Props
const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: 'dialog' | 'tab' | 'dock';
  plugin?: any;
}>();

const mode = computed(() => props.mode || 'dialog');

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'convertToTab'): void;
}>();

// State
const loading = ref(false);
const rows = ref<BrowserCard[]>([]);
const allRows = ref<BrowserCard[]>([]);  // ✅ 所有卡片的完整数据（不受筛选影响，用于【全部】区统计）
const currentDataSource = ref<ICardDataSource | null>(null);
const currentPreset = ref('all');
const currentCardType = ref<'all' | 'topic-only' | 'item-only'>('all');  // ✅ 卡片类型筛选
const selectedRows = ref<BrowserCard[]>([]);
const gridApi = ref<GridApi | null>(null);
const currentSortModel = ref<any[]>([]);
const searchQuery = ref('');
const viewMode = ref<'flat' | 'hierarchy'>('flat');
const activeQueueId = ref<string | null>(null);
const activeDocId = ref<string | null>(null);
const queueCounts = ref<Record<string, number>>({});

// 预览状态
const showPreview = ref(true);
const previewCard = ref<BrowserCard | null>(null);

// 拖拽调整状态
const isResizing = ref(false);
const previewSize = ref(mode.value === 'dialog' ? DEFAULT_PREVIEW_SIZE.dialog : DEFAULT_PREVIEW_SIZE.tab);

// 预览区域样式
const previewStyle = computed(() => {
  if (mode.value === 'dialog') {
    return { width: `${previewSize.value}px` };
  } else {
    return { height: `${previewSize.value}px` };
  }
});

// 国际化
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

// ✅ 使用导入的配置
const columnDefs = ref<ColDef[]>(createColumnDefs());

// 判断是否为队列模式（队列模式启用客户端排序，Deck 模式禁用）
const isQueueMode = computed(() => {
  const qid = String(activeQueueId.value || '');
  return qid === 'final-drill' || qid === 'retrieval' || qid === 'filter-group' || qid === 'neural' || qid === 'incremental-learning';
});

// 始终启用 sortable，通过 canApplySortToQueue 控制按钮显示
const defaultColDef: ColDef = {
  resizable: true,
  sortable: true,
};

const hasConfirmedSqlMode = ref(false);
async function ensureSqlModeConfirmed(): Promise<boolean> {
  if (hasConfirmedSqlMode.value) return true;
  const ok = await confirmDialog({
    title: t('sqlModeTitle', 'SQL 查询模式'),
    content: t('sqlModeWarning', 'SQL 查询为高级功能，拥有读取所有块信息的权限。请仅执行你信任的 SQL。是否继续？'),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  });
  if (ok) hasConfirmedSqlMode.value = true;
  return ok;
}

// ✅ 四重筛选：聚焦标记（控制文档列表是否聚焦）
const shouldFocusDocList = ref(false);

// ✅ 四重筛选：用于计算聚焦文档的卡片（不包含文档筛选）
const rowsForFocus = ref<BrowserCard[]>([]);

// 筛选后的卡片
const scopedRows = computed(() => {
  if (activeDocId.value === '__lost__') return rows.value.filter((c) => !String((c as any)?.rootId || ''));
  return rows.value;
});

// ✅ 四重筛选：计算聚焦的文档 ID 列表（基于 rowsForFocus，不包含文档筛选）
const focusedDocIds = computed(() => {
  // 如果没有标记聚焦，返回 null（显示所有文档）
  if (!shouldFocusDocList.value) {
    return null;
  }

  // 提取 rowsForFocus 中所有的文档 ID（仅应用队列/搜索/preset 筛选，不包含文档筛选）
  const docs = new Set<string>();
  for (const card of rowsForFocus.value) {
    if (card.rootId) {
      docs.add(card.rootId);
    }
  }
  return docs.size > 0 ? Array.from(docs) : null;
});

// ✅ 全局统计（【全部】区使用）- 基于所有卡片，不受筛选影响
const globalStats = computed(() => {
  const allCards = allRows.value || [];
  return {
    total: allCards.length,
    lost: allCards.filter(c => !String((c as any)?.rootId || '')).length,
  };
});

const filteredCards = computed(() => {
  if (extractSqlStatement(searchQuery.value) != null) return scopedRows.value;
  const parsed = parseQuery(searchQuery.value || '');
  return scopedRows.value.filter((c) => matchesParsedQuery(c, parsed));
});

// 加载数据 - 使用 browserService (riff API)
async function loadData(forceRefresh = false) {
  loading.value = true;
  hasRandomSort.value = false;  // ✅ 重新加载数据时清除随机排序标志
  try {
    selectedRows.value = [];
    previewCard.value = null;

    const sqlStmt = extractSqlStatement(searchQuery.value);
    if (sqlStmt != null) {
      const ok = await ensureSqlModeConfirmed();
      if (!ok) return;
      // ✅ SQL 模式独立运行，清除其他筛选状态（但不使用）
      activeQueueId.value = null;
      activeDocId.value = null;
      shouldFocusDocList.value = false;  // SQL 模式不聚焦
      currentDataSource.value = createQueryDataSource(sqlStmt);
    } else {
      // 筛选选项
      const options: DataSourceOptionsWithDoc = {
        docId: activeDocId.value,
        preset: currentPreset.value,
        queryText: searchQuery.value,
        cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
      };

      // 创建数据源
      if (activeQueueId.value && ['final-drill', 'retrieval', 'filter-group'].includes(activeQueueId.value)) {
        // 队列模式（五重筛选）
        currentDataSource.value = createQueueDataSource(activeQueueId.value, props.plugin, options);
      } else if (activeQueueId.value) {
        // 神经漫游队列（BlockIds）
        const q = getQueueById(activeQueueId.value);
        const items = q?.getAllItems?.() || [];
        const ids = extractBlockIds(items);
        currentDataSource.value = createBlockIdsDataSource(activeQueueId.value, ids, props.plugin);
      } else {
        // 全部卡片模式（五重筛选）
        currentDataSource.value = createDeckDataSource(props.plugin, options, props.currentDocId);
      }
    }

    if (!currentDataSource.value) {
      rows.value = [];
      rowsForFocus.value = [];
      return;
    }

    // 执行数据加载
    await executeFetchRows(forceRefresh);

    await refreshQueueCounts();
  } catch (err) {
    console.error('[CardBrowser] Load data error:', err);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

/**
 * 执行实际的行数据获取
 */
async function executeFetchRows(forceRefresh = false) {
  if (!currentDataSource.value) return;

  // ✅ 四重筛选：获取显示数据（可能包含文档筛选）
  const { rows: fetchedRows } = await PerformanceMonitor.measure('fetchRows', () => 
    currentDataSource.value!.fetchRows({ sortModel: [], filterModel: {} })
  );
  rows.value = fetchedRows;

  // ✅ 更新全量统计数据
  allRows.value = await PerformanceMonitor.measure('loadAllCards', () => 
    loadCards('all', undefined, '', forceRefresh)
  );

  // ✅ 四重筛选：如果开启了聚焦，额外获取不包含文档筛选的数据
  if (shouldFocusDocList.value) {
    const focusOptions = {
      preset: currentPreset.value,
      queryText: searchQuery.value,
      cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
    };

    const dataSourceForFocus = createFocusDataSource(
      activeQueueId.value,
      props.plugin,
      focusOptions,
      () => getQueueById(activeQueueId.value)?.getAllItems?.() || []
    );

    if (dataSourceForFocus) {
      const { rows: focusRows } = await PerformanceMonitor.measure('fetchRowsFocus', () => 
        dataSourceForFocus!.fetchRows({ sortModel: [], filterModel: {} })
      );
      rowsForFocus.value = focusRows;
    }
  } else {
    rowsForFocus.value = fetchedRows;
  }
}

// 搜索处理
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSqlStmt: string | null = null;
let lastSearchQuery: string = '';  // ✅ 记录上次搜索查询，支持普通搜索触发刷新
function handleSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const current = extractSqlStatement(searchQuery.value);
    // ✅ 修复：普通搜索也应该触发刷新（通过比较完整查询）
    const queryChanged = searchQuery.value !== lastSearchQuery;
    const sqlChanged = current !== lastSqlStmt;

    if (queryChanged || sqlChanged) {
      lastSqlStmt = current;
      lastSearchQuery = searchQuery.value;
      shouldFocusDocList.value = true;  // ✅ 搜索后开启聚焦
      void loadData();
    }
  }, 150);
}

// AG Grid 选择配置 (v35+ 新 API)
const rowSelection = ref<RowSelectionOptions>({
  mode: 'multiRow',
  checkboxes: true,       // ✅ AG-Grid v35+：启用复选框（显示在第一列）
  headerCheckbox: true,   // ✅ AG-Grid v35+：启用表头全选复选框
  enableClickSelection: false,
});

// Grid 事件
function onGridReady(params: any) {
  gridApi.value = params.api;
  // 使用 gridApi.value 获取列信息（使用 nextTick 确保初始化完成）
  nextTick(() => {
    if (gridApi.value) {
      const columns = gridApi.value.getColumns?.();
      console.log('[CardBrowser] AG-Grid ready, columns:', columns?.map((c: any) => ({
        colId: c.getColId(),
        sortable: c.isSortable(),
      })));
    }
  });
}

function onDisplayedColumnsChanged(params: any) {
  console.log('[CardBrowser] Displayed columns changed');
}

function onSortChanged(params: any) {
  currentSortModel.value = params?.api?.getSortModel?.() || [];
  const sortArray = Array.from(currentSortModel.value || []);

  // ✅ 如果有列排序状态，清除随机排序标志
  if (sortArray.length > 0) {
    hasRandomSort.value = false;
  }

  // 检查排序是否真的改变了
  const api = params?.api || gridApi.value;
  console.log('[CardBrowser] onSortChanged:', {
    sortModel: currentSortModel.value,
    sortModelLength: currentSortModel.value?.length,
    sortModelArray: sortArray,
    activeQueueId: activeQueueId.value,
    canApply: canApplySortToQueue.value,
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
}

function onSelectionChanged() {
  if (gridApi.value) {
    selectedRows.value = gridApi.value.getSelectedRows();
  }
}


function onRowClicked(event: any) {
  const mouseEvent = event.event as MouseEvent;
  const isMultiSelect = mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey;
  
  // 多选模式：不改变预览
  if (isMultiSelect) {
    return;
  }
  
  // 单选模式 - 设置预览卡片（BrowserPreview 组件内部处理加载）
  previewCard.value = event.data;
}

function onRowDoubleClicked(event: any) {
  const blockId = event.data?.blockId;
  if (!blockId) {
    console.warn('[CardBrowser] No blockId found in row data:', event.data);
    return;
  }
  if (props.app) {
    openTab({
      app: props.app,
      doc: { id: blockId },
    });
  }
}

// 拖拽分隔条逻辑
function startResize(e: MouseEvent) {
  e.preventDefault();
  isResizing.value = true;
  
  // 禁止文本选择
  document.body.style.userSelect = 'none';
  document.body.style.cursor = mode.value === 'dialog' ? 'col-resize' : 'row-resize';
  
  const startPos = mode.value === 'dialog' ? e.clientX : e.clientY;
  const startSize = previewSize.value;
  
  const onMouseMove = (moveEvent: MouseEvent) => {
    moveEvent.preventDefault();
    const currentPos = mode.value === 'dialog' ? moveEvent.clientX : moveEvent.clientY;
    // Dialog 模式：向左拖增大，Tab/Dock 模式：向上拖增大
    const delta = startPos - currentPos;
    const newSize = Math.min(PREVIEW_SIZE_MAX, Math.max(PREVIEW_SIZE_MIN, startSize + delta));
    previewSize.value = newSize;
  };
  
  const onMouseUp = () => {
    isResizing.value = false;
    // 恢复文本选择
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// 跳转到块
function jumpToBlock() {
  if (previewCard.value && props.app) {
    openTab({
      app: props.app,
      doc: { id: previewCard.value.blockId },
    });
  }
}

function openNumberDialog(options: {
  title: string;
  label: string;
  description?: string;
  unit?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
}): Promise<number | null> {
  return new Promise((resolve) => {
    const dlg = createVueDialog({
      title: options.title,
      component: ActionParamsDialog,
      props: {
        label: options.label,
        description: options.description,
        unit: options.unit,
        defaultValue: options.defaultValue,
        min: options.min,
        max: options.max,
        step: options.step,
        integer: options.integer,
        confirmText: t('confirm', '确认'),
        cancelText: t('cancel', '取消'),
      },
      events: {
        confirm: (value: number) => {
          dlg.destroy();
          resolve(value);
        },
        cancel: () => {
          dlg.destroy();
          resolve(null);
        },
      },
      width: '520px',
      height: '220px',
    });
  });
}

// 转换为 Tab 模式
function convertToTab() {
  emit('convertToTab');
}

type ActionParamBuilder = (targetCards: BrowserCard[]) => Promise<any | null>;

const ACTION_PARAM_BUILDERS: Record<string, ActionParamBuilder> = {
  postpone: async () => {
    const days = await openNumberDialog({
      title: t('postpone', '推迟'),
      label: t('daysLabel', '天数'),
      description: t('postponeHint', '将到期时间推迟 N 天'),
      defaultValue: 7,
      min: 1,
      max: 365,
      step: 1,
      integer: true,
    });
    if (days == null || days <= 0) return null;
    return { days };
  },
  advance: async () => {
    const maxDays = await openNumberDialog({
      title: t('advance', '提前复习'),
      label: t('maxDaysLabel', '最大天数'),
      description: t('advanceHint', 'NewDue = Today + Random(1..N)'),
      defaultValue: 30,
      min: 1,
      max: 365,
      step: 1,
      integer: true,
    });
    if (maxDays == null || maxDays <= 0) return null;
    return { maxDays };
  },
  spread: async (cards) => {
    const maxDays = await openNumberDialog({
      title: t('spread', '平摊复习'),
      label: t('maxDaysLabel', '最大天数'),
      description: t('spreadHint', '将 {n} 张卡片均匀分布在未来 N 天内')
        .replace('{n}', String(cards.length)),
      defaultValue: 7,
      min: 1,
      max: 365,
      step: 1,
      integer: true,
    });
    if (maxDays == null || maxDays <= 0) return null;
    return { maxDays };
  },
  'set-priority': async (cards) => {
    const row = cards?.[0] as any;
    const p = await openNumberDialog({
      title: t('setPriority', '设置优先级'),
      label: t('priorityLabel', '优先级'),
      description: t('priorityHint', '0-100，越小越优先'),
      defaultValue: typeof row?.priority === 'number' ? row.priority : 50,
      min: 0,
      max: 100,
      step: 1,
      integer: true,
    });
    if (p == null) return null;
    return { priority: p };
  },
  'insert-at': async () => {
    const q = (props.plugin as any)?.finalDrillQueue;
    const len = typeof q?.size === 'function'
      ? Number(q.size()) || 0
      : Array.isArray(q?.getAllItems?.()) ? q.getAllItems().length : 0;
    const pos = await openNumberDialog({
      title: t('insertAt', '插入到位置...'),
      label: t('positionLabel', '位置'),
      description: t('insertAtHint', '输入 1~{max}，1 表示插到队首')
        .replace('{max}', String(len + 1)),
      defaultValue: 1,
      min: 1,
      max: Math.max(1, len + 1),
      step: 1,
      integer: true,
    });
    if (pos == null) return null;
    const index = Math.max(0, Math.floor(Number(pos)) - 1);
    return { index };
  },
};

function getActionLabel(action: { id: string; label: string }): string {
  const map: Record<string, { key: string; fallback: string }> = {
    'review-subset': { key: 'reviewSubset', fallback: 'Review Subset' },
    open: { key: 'openInTab', fallback: 'Open' },
    postpone: { key: 'postpone', fallback: 'Postpone' },
    advance: { key: 'advance', fallback: 'Advance' },
    spread: { key: 'spread', fallback: 'Spread' },
    reset: { key: 'resetCard', fallback: 'Reset' },
    suspend: { key: 'suspend', fallback: 'Suspend' },
    'remove-from-queue': { key: 'removeFromQueue', fallback: 'Remove from Queue' },
    dismiss: { key: 'dismiss', fallback: 'Dismiss' },
    'insert-at': { key: 'insertAt', fallback: 'Insert at' },
    'set-priority': { key: 'setPriority', fallback: 'Set Priority' },
    'auto-sort': { key: 'autoSortQueue', fallback: 'Auto Sort' },
  };
  const m = map[action.id];
  if (!m) return action.label;
  return t(m.key, action.label || m.fallback);
}

async function handleAction(actionId: string, targetCards: BrowserCard[], anchorRow?: BrowserCard) {
  if (!targetCards?.length) return;

  if (actionId === 'open') {
    const blockId = String(anchorRow?.blockId || targetCards[0]?.blockId || '');
    if (props.app && blockId) {
      openTab({ app: props.app, doc: { id: blockId } });
      return;
    }
    await pushErrMsg(t('envNotInit', '当前环境未初始化，无法打开页签'));
    return;
  }

  const ds = currentDataSource.value;
  if (!ds) return;

  if (actionId === 'reset') {
    const ok = await confirmDialog({
      title: t('resetCard', 'Reset'),
      content: t('confirmReset', `确定要重置 ${targetCards.length} 张卡片吗？`),
      confirmText: t('confirm', '确认'),
      cancelText: t('cancel', '取消'),
    });
    if (!ok) return;
  }

  const builder = ACTION_PARAM_BUILDERS[actionId];
  const ctx = builder ? await builder(targetCards) : { refresh: () => void loadData() };
  if (builder && ctx == null) return;

  try {
    const res = await (ds.performAction(actionId, targetCards as any, ctx) as any);
    const updated = Number(res?.updated?.length || 0);
    const skipped = Number(res?.skipped?.length || 0);
    if (updated <= 0 && skipped > 0) {
      await pushErrMsg(t('batchNoEffect', '本次没有卡片被更新（可能存在未同步的新卡）'));
      return;
    }
    if (skipped > 0) {
      await pushMsg(
        t('batchSummary', '已更新 {updated} 张，跳过 {skipped} 张')
          .replace('{updated}', String(updated))
          .replace('{skipped}', String(skipped))
      );
    }

    if (
      actionId === 'remove-from-queue'
      || actionId === 'remove-from-current-queue'
      || actionId === 'dismiss'
      || actionId === 'insert-at'
      || actionId === 'auto-sort'
      || actionId === 'reset'
      || actionId === 'suspend'
    ) {
      await loadData();
    } else {
      gridApi.value?.refreshCells({ force: true });
    }
    await refreshQueueCounts();
    await pushMsg(t('actionSuccess', '操作成功'));
  } catch (err: any) {
    console.error('[CardBrowser] action failed:', { actionId, err });
    await pushErrMsg(err?.message || t('actionFailed', '操作失败'));
  }
}

// 右键菜单
function onCellContextMenu(event: CellContextMenuEvent) {
  event.event?.preventDefault();

  const ds = currentDataSource.value;
  const actions = ds?.getSupportedActions?.() || [];
  const menu = new Menu('card-browser-context');
  const rowData = event.data as BrowserCard;
  const selected = selectedRows.value?.length ? selectedRows.value : [rowData];

  // ========== 添加排序菜单 ==========
  const sortMenu: any[] = [];

  // 添加每个排序字段的子菜单
  for (const field of SORT_FIELD_CONFIGS) {
    sortMenu.push({
      icon: field.icon || 'iconSort',
      label: field.label,
      submenu: [
        {
          icon: 'iconUp',
          label: '升序',
          click: () => {
            console.log('[CardBrowser] Menu clicked: Sort by', field.colId, 'ASC');
            applySort(field.colId, 'asc');
          },
        },
        {
          icon: 'iconDown',
          label: '降序',
          click: () => {
            console.log('[CardBrowser] Menu clicked: Sort by', field.colId, 'DESC');
            applySort(field.colId, 'desc');
          },
        },
      ],
    });
  }

  // 添加分隔线
  sortMenu.push({ type: 'separator' });

  // 添加随机排序
  sortMenu.push({
    icon: 'iconRefresh',
    label: '随机排序',
    click: () => {
      console.log('[CardBrowser] Menu clicked: Random sort');
      applyRandomSort();
    },
  });

  // 插入排序菜单
  menu.addItem({
    icon: 'iconSort',
    label: '排序',
    submenu: sortMenu,
  });

  // 添加分隔线（排序菜单和现有操作之间）
  menu.addItem({ type: 'separator' });

  // ========== 卡片类型菜单（Topic/Item）==========
  const cardTypeMenu: any[] = [
    {
      icon: 'iconFile',
      label: '标记为 Topic',
      click: () => void markCardsAsTopic(selected),
    },
    {
      icon: 'iconCheck',
      label: '标记为 Item',
      click: () => void markCardsAsItem(selected),
    },
  ];

  menu.addItem({
    icon: 'iconHR',
    label: '卡片类型',
    submenu: cardTypeMenu,
  });

  // 添加分隔线（卡片类型菜单和现有操作之间）
  menu.addItem({ type: 'separator' });

  // ========== 原有的操作菜单 ==========
  for (const action of actions) {
    if (action.submenu && action.submenu.length > 0) {
      // 处理子菜单
      menu.addItem({
        icon: action.icon || 'iconMore',
        label: getActionLabel({ id: action.id, label: action.label }),
        submenu: action.submenu.map(sub => ({
          icon: sub.icon || 'iconMore',
          label: getActionLabel({ id: sub.id, label: sub.label }),
          click: () => void handleAction(sub.id, selected, rowData),
        })),
      });
    } else {
      // 处理普通菜单项
      menu.addItem({
        icon: action.icon || 'iconMore',
        label: getActionLabel({ id: action.id, label: action.label }),
        click: () => void handleAction(action.id, selected, rowData),
      });
    }
  }

  const mouseEvent = event.event as MouseEvent;
  menu.open({ x: mouseEvent.clientX, y: mouseEvent.clientY });
}

async function autoSortFinalDrillQueue() {
  const q = (props.plugin as any)?.finalDrillQueue;
  if (!q?.sort) {
    await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
    return;
  }
  await q.sort();
  await pushMsg(t('queueSorted', '已按优先级重排队列'));
  if (activeQueueId.value === 'final-drill') {
    await loadData();
  } else {
    await refreshQueueCounts();
  }
}

// 批量菜单
function showBatchMenu(event?: MouseEvent) {
  const menu = new Menu('card-browser-batch');

  const ds = currentDataSource.value;
  const actions = ds?.getSupportedActions?.() || [];
  const selected = selectedRows.value || [];
  const anchorRow = selected[0];

  for (const action of actions) {
    menu.addItem({
      icon: (action as any)?.icon || 'iconMore',
      label: getActionLabel({ id: action.id, label: action.label }),
      click: () => void handleAction(action.id, selected, anchorRow),
    });
  }
  
  const anchor = (event?.currentTarget || event?.target) as HTMLElement | null;
  const rect = anchor?.getBoundingClientRect?.();
  if (rect) {
    menu.open({ x: rect.left, y: rect.bottom, isLeft: true });
    return;
  }
  if (event) {
    menu.open({ x: event.clientX, y: event.clientY, isLeft: true });
    return;
  }
  menu.open({ x: 0, y: 0, isLeft: true });
}

// 刷新数据
async function refreshData(forceRefresh = false, preserveFocusState = false) {
  selectedRows.value = [];
  previewCard.value = null;

  // 只有在不保留聚焦状态时才开启聚焦
  if (!preserveFocusState) {
    shouldFocusDocList.value = true;  // ✅ 刷新数据时开启聚焦
  }
  
  // 性能提示：显示缓存状态
  if (!forceRefresh) {
    const cacheStats = getCacheStats();
    if (cacheStats.valid) {
      console.log(`[CardBrowser] 缓存有效，${cacheStats.count} 张卡片，年龄 ${Math.round(cacheStats.age / 1000)}s`);
    } else {
      console.log(`[CardBrowser] 缓存无效或过期，将重新加载数据`);
    }
  }
  
  await loadData(forceRefresh);
}

// 切换预设
function handlePresetChange() {
  // ✅ 四重筛选：不再清除其他筛选条件
  // activeQueueId.value → 保留队列
  // activeDocId.value → 保留文档
  // searchQuery.value → 保留搜索
  void refreshData();
}

// 切换卡片类型
function handleCardTypeChange() {
  // ✅ 五重筛选：不再清除其他筛选条件
  // activeQueueId.value → 保留队列
  // activeDocId.value → 保留文档
  // currentPreset.value → 保留预设
  // searchQuery.value → 保留搜索
  // ✅ 强制刷新缓存，因为 cardType 筛选在 loadCards() 中应用
  void refreshData(true);  // forceRefresh = true
}

// 显示性能报告
function showPerformanceReport() {
  PerformanceMonitor.printReport();
  
  // 显示缓存统计
  const cacheStats = getCacheStats();
  console.log('📊 缓存统计:', cacheStats);
  
  pushMsg('性能报告已输出到控制台', 2000);
}

// 清理
let unsubscribe: (() => void) | null = null;

onBeforeUnmount(() => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  // 注：Protyle 生命周期现在由 BrowserPreview 组件内部管理
});

// 初始化
onMounted(() => {
  try {
    const stored = localStorage.getItem('fsrs-card-browser:viewMode');
    if (stored === 'flat' || stored === 'hierarchy') {
      viewMode.value = stored;
    }
  } catch {}

  // 订阅增量更新
  unsubscribe = subscribeCacheUpdate((cards, isComplete) => {
    allRows.value = cards;
    
    // 如果是 Deck 模式，且不是正在加载状态（避免并发干扰），则增量更新显示行
    if (!activeQueueId.value && !loading.value) {
      if (isComplete || (cards.length > 0 && cards.length % 500 === 0)) {
        executeFetchRows(false);
      }
    }
  });

  loadData();
});

function toggleViewMode() {
  viewMode.value = viewMode.value === 'flat' ? 'hierarchy' : 'flat';
  try {
    localStorage.setItem('fsrs-card-browser:viewMode', viewMode.value);
  } catch {}
}

function openPracticeMenu(ev: MouseEvent) {
  try {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
  } catch {}

  const plugin = props.plugin as any;
  if (!plugin) return;

  const menu = new Menu('fsrs-browser-practice-menu');

  menu.addItem({
    icon: 'iconRiffCard',
    label: t('practiceExtract', '提取练习'),
    click: () => {
      void plugin.openReviewDialog?.();
    },
  });

  menu.addItem({
    icon: 'iconFlag',
    label: t('practiceDeliberate', '刻意练习'),
    click: () => {
      void plugin.openFinalDrillDialog?.();
    },
  });

  menu.addItem({
    icon: 'iconList',
    label: t('practiceFilterGroup', '筛选复习'),
    click: () => {
      void plugin.openFilterGroupPracticeDialog?.();
    },
  });

  menu.addItem({
    icon: 'iconRefresh',
    label: t('practiceNeural', '神经漫游'),
    click: () => {
      void (plugin as any).openNeuralRoamDialog?.();
    },
  });

  menu.addItem({
    icon: 'iconBug',
    label: t('practiceLeech', '难点攻坚'),
    click: () => {
      void plugin.openLeechReviewDialog?.();
    },
  });

  const fallback = () => {
    const x = (window?.innerWidth || 0) / 2;
    const y = (window?.innerHeight || 0) / 2;
    return { x, y };
  };

  const target = (ev?.currentTarget || ev?.target) as HTMLElement | null;
  const rect = target?.getBoundingClientRect?.();
  const pos = rect
    ? { x: rect.left, y: rect.bottom }
    : (() => {
        const rawX = Number((ev as any)?.clientX);
        const rawY = Number((ev as any)?.clientY);
        if (Number.isFinite(rawX) && Number.isFinite(rawY) && (rawX !== 0 || rawY !== 0)) {
          return { x: rawX, y: rawY };
        }
        return fallback();
      })();

  if (String(process.env.DEV_MODE) === 'true') {
    console.log('[CardBrowser] openPracticeMenu', { pos, hasPlugin: Boolean(plugin) });
  }

  setTimeout(() => {
    try {
      menu.open({ x: pos.x, y: pos.y, isLeft: true });
    } catch (err) {
      console.error('[CardBrowser] openPracticeMenu failed:', err);
      void pushErrMsg('打开练习菜单失败');
    }
  }, 0);
}

function getQueueById(id: string) {
  if (id === 'retrieval') return (props.plugin as any)?.retrievalQueue;
  if (id === 'final-drill') return (props.plugin as any)?.finalDrillQueue;
  if (id === 'neural-roam') return props.plugin?.neuralQueue;
  if (id === 'filter-group') return props.plugin?.filterGroupQueue;
  if (id === 'incremental-learning') return (props.plugin as any)?.incrementalQueue;
  return null;
}

// ========== Composables 初始化 ==========
const {
  hasRandomSort,
  applySort,
  applyRandomSort,
  canApplySortToQueue,
  handleApplySortToQueue,
  buildSortSubmenu,
} = useSorting({
  gridApi,
  currentSortModel,
  getQueueById,
  activeQueueId,
  loadData,
  t,
  pushMsg: (msg, duration) => pushMsg(msg, duration),
  pushErrMsg: (msg, duration) => pushErrMsg(msg, duration),
});

const {
  markCardsAsTopic,
  markCardsAsItem,
  migrateTopicItem,
  buildCardTypeSubmenu,
} = useCardActions({
  loading,
  loadData,
  refreshData,
  t,
  pushMsg: (msg, duration) => pushMsg(msg, duration),
  pushErrMsg: (msg, duration) => pushErrMsg(msg, duration),
});

// ✅ 加载队列的所有卡片（不含筛选）
async function loadQueueAllCards(queueId: string): Promise<BrowserCard[]> {
  const queue = getQueueById(queueId);
  if (!queue) return [];

  const items = queue?.getAllItems?.() || [];
  console.log('[SRSBrowser] loadQueueAllCards:', {
    queueId,
    itemsCount: items.length,
    items: items.map((it: any) => ({
      cardID: it.cardID,
      blockID: it.blockID,
      deckID: it.deckID,
    })),
  });

  const blockIds = extractBlockIds(items);
  console.log('[SRSBrowser] Extracted blockIds:', blockIds);

  const cards = await loadQueueCards(blockIds);
  console.log('[SRSBrowser] Loaded cards:', cards.length);
  return cards;
}

async function refreshQueueCounts() {
  const retrieval = (props.plugin as any)?.retrievalQueue?.size?.() ?? ((props.plugin as any)?.retrievalQueue?.getAllItems?.()?.length ?? 0);
  const finalDrill = (props.plugin as any)?.finalDrillQueue?.size?.() ?? ((props.plugin as any)?.finalDrillQueue?.getAllItems?.()?.length ?? 0);
  const neural = props.plugin?.neuralQueue?.size?.() ?? (props.plugin?.neuralQueue?.getAllItems?.()?.length ?? 0);
  const filterGroup = props.plugin?.filterGroupQueue?.size?.() ?? (props.plugin?.filterGroupQueue?.getAllItems?.()?.length ?? 0);
  const incremental = (props.plugin as any)?.incrementalQueue?.getAllItems?.()?.length ?? 0;
  queueCounts.value = {
    retrieval: Number(retrieval) || 0,
    'final-drill': Number(finalDrill) || 0,
    'neural-roam': Number(neural) || 0,
    'filter-group': Number(filterGroup) || 0,
    'incremental-learning': Number(incremental) || 0,
  };
}

async function handleSelectQueue(queueId: string) {
  activeQueueId.value = queueId;
  // ✅ 四重筛选：不再清除文档筛选
  // activeDocId.value → 保留文档
  // currentPreset.value → 保留 Preset
  // searchQuery.value → 保留搜索
  shouldFocusDocList.value = true;  // ✅ 选择队列后开启聚焦
  await loadData();
}

function handleSelectGlobal(type: '__all__' | '__lost__') {
  // ✅ 点击【全部】区的项，完全重置到初始状态
  activeQueueId.value = null;  // ✅ 清除队列筛选

  // ✅ 根据类型设置 activeDocId
  if (type === '__lost__') {
    activeDocId.value = '__lost__';  // ✅ 丢失闪卡
  } else {
    activeDocId.value = null;           // ✅ 全部闪卡
  }

  currentPreset.value = 'all'; // ✅ 清除 preset 筛选
  currentCardType.value = 'all'; // ✅ 清除卡片类型筛选
  searchQuery.value = '';      // ✅ 清除搜索筛选
  shouldFocusDocList.value = false;  // ✅ 关闭聚焦
  void loadData();
}

function handleExitFocus() {
  // ✅ 退出聚焦模式 = 点击【全部闪卡】
  handleSelectGlobal('__all__');
}

function handleSelectDoc(docId: string) {
  const id = String(docId || '');
  // ✅ 移除了 __all__ 的处理（已移至【全部】区）
  // ✅ 四重筛选：设置文档筛选，保留其他条件
  activeDocId.value = id;
  // ✅ 点击文档开启聚焦（显示退出聚焦按钮）
  shouldFocusDocList.value = true;
  void loadData();
}

function handleFilterDoc(docId: string) {
  activeDocId.value = docId;
  // ✅ 四重筛选：保留队列筛选
  // activeQueueId.value → 保留队列
  // searchQuery.value 将在下方设置为 `doc:${docId}`
  searchQuery.value = `doc:${docId}`;
}
</script>
