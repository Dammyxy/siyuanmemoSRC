<template>
  <div class="card-browser" :class="[
    `card-browser--${mode}`,
    showPreview ? 'card-browser--preview-open' : ''
  ]">
    <!-- 主区域：工具栏 + 表格 -->
    <div class="card-browser__main">
      <div v-if="viewMode === 'hierarchy'" class="card-browser__hierarchy">
        <BrowserHierarchy
          :cards="rows"
          :queues="{ active: activeQueueId || '', counts: queueCounts }"
          :i18n="props.i18n"
          @selectQueue="handleSelectQueue"
          @selectDoc="handleSelectDoc"
          @filterDoc="handleFilterDoc"
        />
      </div>

      <div class="card-browser__content">
      <!-- 顶部工具栏 -->
      <div class="card-browser__toolbar">
        <div class="toolbar__left">
          <!-- 搜索框 -->
          <div class="b3-form__icon toolbar__search">
            <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
            <input 
              type="text" 
              class="b3-text-field b3-form__icon-input"
              v-model="searchQuery" 
              :placeholder="t('searchPlaceholderAdvanced', '搜索：tag:xxx deck:xxx state:new/review doc:xxx 或关键字')"
              @input="handleSearchInput"
            />
          </div>
          
          <!-- 筛选器 -->
          <select v-model="currentPreset" class="b3-select" @change="handlePresetChange">
            <option value="all">{{ t('allCards', 'All') }}</option>
            <option value="due">{{ t('dueToday', 'Due Today') }}</option>
            <option value="overdue">{{ t('overdue', 'Overdue') }}</option>
            <option value="leech">{{ t('leech', 'Leech') }}</option>
            <option value="new">{{ t('new', 'New') }}</option>
          </select>
        </div>
        
        <div class="toolbar__center">
          <span class="toolbar__count">{{ filteredCards.length }} {{ t('cards', '张卡片') }}</span>
        </div>
        
        <div class="toolbar__right">
          <button
            class="b3-button b3-button--outline"
            @click.stop.prevent="openPracticeMenu"
            :disabled="!props.plugin"
            :title="t('startPractice', '开始练习')"
          >
            <svg><use xlink:href="#iconPlay"></use></svg>
            {{ t('startPractice', '开始练习') }}
          </button>

          <button
            v-if="activeQueueId === 'final-drill'"
            class="b3-button b3-button--outline"
            @click="autoSortFinalDrillQueue"
            :disabled="!props.plugin"
            :title="t('autoSortQueue', '按优先级重排队列')"
          >
            <svg><use xlink:href="#iconSort"></use></svg>
            {{ t('autoSortQueue', '按优先级重排队列') }}
          </button>

          <button
            v-if="canApplySortToQueue"
            class="b3-button b3-button--outline"
            @click="handleApplySortToQueue"
            :disabled="!props.plugin"
            :title="t('applySortToQueue', '应用排序到队列')"
          >
            <svg><use xlink:href="#iconSort"></use></svg>
            {{ t('applySortToQueue', '应用排序到队列') }}
          </button>

          <button
            class="b3-button b3-button--outline"
            @click="toggleViewMode"
            :title="viewMode === 'flat' ? t('hierarchyView', 'Hierarchy View') : t('flatView', 'Flat View')"
          >
            <svg><use :xlink:href="viewMode === 'flat' ? '#iconFiles' : '#iconList'"></use></svg>
          </button>

          <!-- 刷新按钮 -->
          <button class="b3-button b3-button--outline" @click="refreshData" :disabled="loading">
            <svg><use xlink:href="#iconRefresh"></use></svg>
          </button>
          
          <!-- 批量编辑按钮 -->
          <button 
            v-if="selectedRows.length > 0"
            class="b3-button b3-button--outline" 
            @click="showBatchMenu($event)"
          >
            <svg><use xlink:href="#iconEdit"></use></svg>
            ({{ selectedRows.length }})
          </button>
          
          <!-- 预览切换按钮 -->
          <button 
            class="b3-button b3-button--outline" 
            :class="{ 'b3-button--text': showPreview }"
            @click="showPreview = !showPreview"
            :title="t('togglePreview', '切换预览')"
          >
            <svg><use xlink:href="#iconPreview"></use></svg>
          </button>
          
          <!-- 转换为 Tab 按钮 -->
          <button 
            v-if="mode === 'dialog'"
            class="b3-button b3-button--outline" 
            @click="convertToTab"
            :title="t('openInTab', '在 Tab 中打开')"
          >
            <svg><use xlink:href="#iconLayoutRight"></use></svg>
          </button>
        </div>
      </div>
      
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
          @column-everything-changed="onColumnEverythingChanged"
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
    <div 
      v-if="showPreview" 
      class="card-browser__preview" 
      :style="previewStyle"
    >
      <div v-if="previewCard" class="preview__content">
        <div class="preview__header">
          <span class="preview__title">{{ t('preview', '预览') }}</span>
          <div class="preview__actions">
            <!-- 锁定/解锁按钮 -->
            <button 
              class="b3-button b3-button--outline" 
              :class="{ 'preview__lock--active': isPreviewLocked }"
              @click="togglePreviewLock" 
              :title="isPreviewLocked ? t('unlockPreview', '双击内容区也可解锁') : t('lockPreview', '锁定编辑')"
            >
              <svg><use :xlink:href="isPreviewLocked ? '#iconLock' : '#iconUnlock'"></use></svg>
            </button>
            <button class="b3-button b3-button--outline" @click="jumpToBlock" :title="t('jumpToBlock', '跳转')">
              <svg><use xlink:href="#iconOpen"></use></svg>
            </button>
          </div>
        </div>
        
        <!-- 卡片路径面包屑 (垂直层级) -->
        <div class="preview__breadcrumb" v-if="breadcrumbs.length > 0">
          <div 
            v-for="(item, index) in breadcrumbs" 
            :key="item.id"
            class="breadcrumb__item"
            :style="{ paddingLeft: `${index * 16 + 8}px` }"
            @click="loadPreviewContent(item.id)"
          >
            <span class="breadcrumb__text">
              <svg class="breadcrumb__icon"><use :xlink:href="item.type === 'NodeDocument' ? '#iconFile' : '#iconALIGN'"></use></svg>
              {{ item.name || '...' }}
            </span>
          </div>
        </div>

        <div class="preview__body" ref="previewBodyRef" @dblclick="handlePreviewDoubleClick">
          <!-- Protyle 渲染区域 -->
        </div>
      </div>
      <div v-else class="preview__empty">
        <span>{{ t('clickToPreview', '点击卡片查看详情') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue';
import { AgGridVue } from 'ag-grid-vue3';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
// AG Grid v35+ 使用 Theming API，无需引入 CSS 主题文件
// 自定义主题通过 CSS 变量实现（见 style 部分）
import type { GridApi, ColDef, CellContextMenuEvent } from 'ag-grid-community';
import { type RowSelectionOptions } from 'ag-grid-community';
import { openTab, Menu, Protyle, type App } from 'siyuan';
import { pushErrMsg, pushMsg } from '@/core/siyuan/api';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import { parseQuery } from './browserService';
import { type BrowserCard, CardState } from './types';
import type { ICardDataSource } from './datasource/types';
import { FinalDrillDataSource } from './datasource/FinalDrillDataSource';
import { FilterGroupDataSource } from './datasource/FilterGroupDataSource';
import { ExtractionDataSource } from './datasource/ExtractionDataSource';
import { DeckDataSource } from './datasource/DeckDataSource';
import { QueryDataSource } from './datasource/QueryDataSource';
import { BlockIdsDataSource } from './datasource/BlockIdsDataSource';
import ActionParamsDialog from './ActionParamsDialog.vue';
import BrowserHierarchy from './BrowserHierarchy.vue';

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
const currentDataSource = ref<ICardDataSource | null>(null);
const currentPreset = ref('all');
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
const previewBodyRef = ref<HTMLElement | null>(null);
let currentProtyle: Protyle | null = null;
const breadcrumbs = ref<IBreadcrumbItem[]>([]); // 面包屑数据

// 面包屑接口
interface IBreadcrumbItem {
  id: string;
  name: string;
  type: string;
  subType: string;
  children: [];
}

// 预览锁定状态
const isPreviewLocked = ref(true);

// 切换锁定状态
function togglePreviewLock() {
  isPreviewLocked.value = !isPreviewLocked.value;
  updateProtyleReadonly();
}

// 双击解锁
function handlePreviewDoubleClick() {
  if (isPreviewLocked.value) {
    isPreviewLocked.value = false;
    updateProtyleReadonly();
  }
}

// 更新 Protyle 只读状态
function updateProtyleReadonly() {
  if (currentProtyle && currentProtyle.protyle) { // Check if protyle instance exists
     if (isPreviewLocked.value) {
        // 思源 Protyle 没有公开的 readonly 属性切换方法，通常重新渲染或利用 disable() 方法
        // 这里假设 disable() 可以禁用编辑
        if (typeof (currentProtyle as any).disable === 'function') {
            (currentProtyle as any).disable();
        }
     } else {
        if (typeof (currentProtyle as any).enable === 'function') {
            (currentProtyle as any).enable();
        }
     }
  }
}



// 获取面包屑数据
async function fetchBreadcrumbs(blockId: string) {
  breadcrumbs.value = [];
  if (!props.app) return;
  
  try {
    const response = await fetch('/api/block/getBlockBreadcrumb', {
      method: 'POST',
      body: JSON.stringify({ id: blockId }),
    });
    const data = await response.json();
    if (data.code === 0 && data.data) {
      breadcrumbs.value = data.data;
    }
  } catch (err) {
    console.error('[CardBrowser] Fetch breadcrumbs error:', err);
  }
}

// 拖拽调整状态
const isResizing = ref(false);
const previewSize = ref(mode.value === 'dialog' ? 500 : 300); // Increased default width
const MIN_PREVIEW_SIZE = 150;
const MAX_PREVIEW_SIZE = 800; // Increased max width

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

// 状态颜色
const STATE_COLORS: Record<string, string> = {
  'New': 'var(--b3-card-info-color)',
  'Learning': 'var(--b3-card-warning-color)',
  'Review': 'var(--b3-card-success-color)',
};

// 列定义 - SuperMemo 风格
const columnDefs = ref<ColDef[]>([
  // Sel - 选择
  {
    headerName: 'Sel',
    width: 50,
    pinned: 'left',
    suppressSizeToFit: true,
    lockPosition: true,
    // AG Grid v35+：复选框通过 rowSelection 配置，不需要在列定义中设置
  },
  // No - 行号
  {
    colId: 'noColumn',
    headerName: 'No',
    width: 50,
    sortable: false,
    valueGetter: (params: any) => {
      if (params.node?.rowIndex != null) return params.node.rowIndex + 1;
      return '';
    },
  },
  // Title - 标题
  { 
    field: 'content', 
    headerName: 'Title', 
    flex: 1,
    minWidth: 100,
    suppressSizeToFit: false,
    tooltipField: 'fullContent',
  },
  // Prior - 优先级
  { 
    field: 'priority', 
    headerName: 'Prior', 
    width: 55,
    sortable: true,
    valueFormatter: (params) => `${params.value || 50}%`,
  },
  // Intrv - 间隔
  { 
    field: 'interval', 
    headerName: 'Intrv', 
    width: 55,
    sortable: true,
    valueFormatter: (params) => params.value > 0 ? `${params.value}d` : '-',
  },
  // LastRep - 上次复习
  { 
    field: 'lastReviewFormatted', 
    headerName: 'LastRep', 
    width: 110,
    sortable: true,
  },
  // NextRep - 下次复习
  { 
    field: 'dueFormatted', 
    headerName: 'NextRep', 
    width: 110,
    sortable: true,
  },
  // Reps - 复习次数
  { 
    field: 'reps', 
    headerName: 'Reps', 
    width: 50,
    sortable: true,
  },
  // Laps - 遗忘次数
  { 
    field: 'lapses', 
    headerName: 'Laps', 
    width: 50,
    sortable: true,
  },
  // Type - 状态
  { 
    field: 'stateLabel', 
    headerName: 'Type', 
    width: 65,
    cellStyle: (params) => ({
      color: STATE_COLORS[params.data.state] || '',
      fontWeight: 500,
    }),
  },
  // FirstRep - 首次复习
  { 
    field: 'firstReviewFormatted', 
    headerName: 'FirstRep', 
    width: 110,
  },
  // Dif - 难度
  { 
    field: 'difficulty', 
    headerName: 'Dif', 
    width: 50,
    sortable: true,
    valueFormatter: (params) => `${((params.value || 0) * 100).toFixed(0)}%`,
  },
  // FI - 遗忘指数 (retrievability)
  { 
    field: 'retrievability', 
    headerName: 'FI', 
    width: 45,
    sortable: true,
    valueFormatter: (params) => `${((params.value || 0) * 100).toFixed(0)}%`,
  },
  // AF - A-Factor (stability)
  { 
    field: 'stability', 
    headerName: 'AF', 
    width: 50,
    sortable: true,
    valueFormatter: (params) => params.value?.toFixed(1) || '-',
  },
]);

// 判断是否为队列模式（队列模式启用客户端排序，Deck 模式禁用）
const isQueueMode = computed(() => {
  const qid = String(activeQueueId.value || '');
  return qid === 'final-drill' || qid === 'extraction' || qid === 'filter-group' || qid === 'neural';
});

// 始终启用 sortable，通过 canApplySortToQueue 控制按钮显示
const defaultColDef: ColDef = {
  resizable: true,
  sortable: true,
};

function extractSqlStmt(input: string): string | null {
  const raw = String(input || '');
  const idx = raw.toLowerCase().indexOf('sql:');
  if (idx !== 0) return null;
  return raw.slice(4).trim();
}

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

// 筛选后的卡片
const scopedRows = computed(() => {
  if (activeDocId.value === '__lost__') return rows.value.filter((c) => !String((c as any)?.rootId || ''));
  if (activeDocId.value) return rows.value.filter((c) => c.rootId === activeDocId.value);
  return rows.value;
});

function matchesParsed(card: BrowserCard, parsed: ReturnType<typeof parseQuery>) {
  if (parsed.decks.length && !parsed.decks.includes(card.deckId)) return false;
  if (parsed.states.length && !parsed.states.includes(card.state as CardState)) return false;
  if (parsed.docs.length && (!card.rootId || !parsed.docs.includes(card.rootId))) return false;
  if (parsed.tags.length) {
    const tags = card.tags || [];
    for (const t of parsed.tags) {
      if (!tags.includes(t)) return false;
    }
  }
  if (parsed.text) {
    const q = parsed.text.toLowerCase();
    const hay = (card.fullContent || card.content || '').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const filteredCards = computed(() => {
  if (extractSqlStmt(searchQuery.value) != null) return scopedRows.value;
  const parsed = parseQuery(searchQuery.value || '');
  return scopedRows.value.filter((c) => matchesParsed(c, parsed));
});

// 加载数据 - 使用 browserService (riff API)
async function loadData() {
  loading.value = true;
  try {
    selectedRows.value = [];
    previewCard.value = null;

    const sqlStmt = extractSqlStmt(searchQuery.value);
    if (sqlStmt != null) {
      const ok = await ensureSqlModeConfirmed();
      if (!ok) return;
      activeQueueId.value = null;
      activeDocId.value = null;
      currentDataSource.value = new QueryDataSource(sqlStmt);
    } else if (activeQueueId.value === 'final-drill') {
      currentDataSource.value = new FinalDrillDataSource(props.plugin);
    } else if (activeQueueId.value === 'extraction') {
      currentDataSource.value = new ExtractionDataSource(props.plugin);
    } else if (activeQueueId.value === 'filter-group') {
      currentDataSource.value = new FilterGroupDataSource(props.plugin);
    } else if (activeQueueId.value) {
      const q = getQueueById(activeQueueId.value);
      const items = q?.getAllItems?.() || [];
      const ids = (items || []).map((it: any) => String(it?.blockID || it?.blockId || '')).filter(Boolean);
      currentDataSource.value = new BlockIdsDataSource({ id: activeQueueId.value, label: activeQueueId.value, blockIds: ids });
    } else {
      currentDataSource.value = new DeckDataSource(props.plugin, { preset: currentPreset.value, currentDocId: props.currentDocId });
    }

    if (!currentDataSource.value) {
      rows.value = [];
      return;
    }

    const { rows: fetchedRows } = await currentDataSource.value.fetchRows({ sortModel: [], filterModel: {} });
    rows.value = fetchedRows;
    await refreshQueueCounts();
  } catch (err) {
    console.error('[CardBrowser] Load data error:', err);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

// 搜索处理
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSqlStmt: string | null = null;
function handleSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const current = extractSqlStmt(searchQuery.value);
    if (current !== lastSqlStmt) {
      lastSqlStmt = current;
      void loadData();
    }
  }, 150);
}

// AG Grid 选择配置 (v35+)
const rowSelection = ref<RowSelectionOptions>({
  mode: 'multiRow',
  checkboxes: true,      // AG Grid v35+：启用复选框
  headerCheckbox: true,  // AG Grid v35+：启用表头复选框
  enableClickSelection: false, // 点击行不选择，只点击 checkbox 选择
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

function onColumnEverythingChanged(params: any) {
  console.log('[CardBrowser] Column everything changed');
}

function onSortChanged(params: any) {
  currentSortModel.value = params?.api?.getSortModel?.() || [];
  const sortArray = Array.from(currentSortModel.value || []);

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
  
  // 单选模式
  previewCard.value = event.data;
  
  // 1. 获取该卡片的面包屑路径（锁定直至点击下一张卡片）
  fetchBreadcrumbs(event.data.blockId);
  
  // 2. 加载预览内容
  nextTick(() => {
    loadPreviewContent(event.data.blockId);
  });
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

// 加载预览内容 - 使用 Protyle 渲染
async function loadPreviewContent(blockId: string) {
  if (!previewBodyRef.value || !props.app) return;
  
  // 清理之前的 Protyle
  if (currentProtyle) {
    currentProtyle.destroy();
    currentProtyle = null;
  }
  
  // 清空容器
  previewBodyRef.value.innerHTML = '';
  
  try {
    // 创建新的 Protyle 实例 - wysiwyg 模式
    // 注意：如果遇到 Illegal invocation 错误，通常是第三方插件（如 sy-plugin-enhance）代理冲突导致，并非本插件代码问题。
    currentProtyle = new Protyle(props.app, previewBodyRef.value, {
      blockId: blockId,
      mode: 'wysiwyg',
      render: {
        background: false,
        title: false,
        gutter: true,
        breadcrumb: false, // 禁用原生面包屑，使用自定义垂直面包屑
        breadcrumbDocName: false,
      },
      after: (protyle: any) => {
        // 初始化时应用锁定状态
        if (isPreviewLocked.value) {
            protyle.disable();
        }
      }
    });

  } catch (err) {
    console.error('[CardBrowser] Protyle load error:', err);
    previewBodyRef.value.innerHTML = `<div class="preview-error">加载失败</div>`;
  }
}

// ... (unchanged)

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
    const newSize = Math.min(MAX_PREVIEW_SIZE, Math.max(MIN_PREVIEW_SIZE, startSize + delta));
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
  const ctx = builder ? await builder(targetCards) : undefined;
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

const canApplySortToQueue = computed(() => {
  const qid = String(activeQueueId.value || '');
  const sortArray = Array.from(currentSortModel.value || []);

  // 使用 gridApi 获取列状态来检测是否有排序
  let hasSort = sortArray.length > 0;
  if (!hasSort && gridApi.value) {
    try {
      const columnState = gridApi.value.getColumnState?.() || [];
      hasSort = columnState.some((col: any) => col.sort && col.sort !== 'undefined');
    } catch (e) {
      // Ignore errors
    }
  }

  console.log('[CardBrowser] canApplySortToQueue check:', {
    queueId: qid,
    isValidQueue: qid === 'extraction' || qid === 'final-drill' || qid === 'filter-group',
    hasSortModel: hasSort,
    sortModel: sortArray,
    sortModelLength: sortArray.length,
    result: (qid === 'extraction' || qid === 'final-drill' || qid === 'filter-group') && hasSort
  });

  if (!qid) return false;
  if (qid !== 'extraction' && qid !== 'final-drill' && qid !== 'filter-group') return false;
  if (!hasSort) return false;
  return true;
});

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

  // 首先从队列中获取当前所有项
  const currentItems = q.getAllItems?.() || [];
  const currentItemsByBlockId = new Map(
    currentItems.map((item: any) => [String(item.blockID || ''), item] as const)
  );

  const orderedCards: BrowserCard[] = [];
  const count = Number(gridApi.value.getDisplayedRowCount?.() ?? 0);
  for (let i = 0; i < count; i++) {
    const node = gridApi.value.getDisplayedRowAtIndex?.(i);
    const card = node?.data as BrowserCard | undefined;
    if (!card) continue;
    orderedCards.push(card);
  }
  if (!orderedCards.length) {
    await pushErrMsg(t('noCards', '没有卡片'));
    return;
  }

  // 使用 blockID 从队列中获取实际的项（避免使用过时的浏览器数据）
  const queueItems: any[] = [];
  const missingBlockIds: string[] = [];

  for (const card of orderedCards) {
    const blockId = String(card.blockId || '');
    const item = currentItemsByBlockId.get(blockId);
    if (item) {
      queueItems.push(item);
    } else {
      missingBlockIds.push(blockId);
    }
  }

  // 调试：打印卡片 ID 映射详情
  console.log('[CardBrowser] Card ID mapping details:', {
    orderedCardsCount: orderedCards.length,
    currentItemsCount: currentItems.length,
    matchedItemsCount: queueItems.length,
    missingBlockIds,
    allCardIDs: orderedCards.map((c) => ({
      fsrsCardId: c.fsrsCardId,
      id: c.id,
      blockId: c.blockId,
      deckId: c.deckId,
    })),
    allQueueItemIDs: queueItems.map((qi) => ({
      cardID: qi.cardID,
      blockID: qi.blockID,
      deckID: qi.deckID,
    })),
  });

  try {
    console.log('[CardBrowser] Applying sort to queue:', {
      queueId: qid,
      queueItemsCount: queueItems.length,
      hasReorder: typeof q.reorder === 'function',
    });

    const ok = await Promise.resolve(q.reorder(queueItems));
    console.log('[CardBrowser] Queue reorder result:', { ok });

    if (!ok) {
      await pushErrMsg(t('sortApplyFailed', '应用排序失败'));
      return;
    }
    await pushMsg(t('sortApplied', '队列已按当前排序重新排列'));
    await loadData();
  } catch (err: any) {
    console.error('[CardBrowser] apply sort to queue failed:', err);
    await pushErrMsg(err?.message || t('sortApplyFailed', '应用排序失败'));
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
async function refreshData() {
  selectedRows.value = [];
  previewCard.value = null;
  await loadData();
}

// 切换预设
function handlePresetChange() {
  activeQueueId.value = null;
  activeDocId.value = null;
  void refreshData();
}

// 清理
onBeforeUnmount(() => {
  if (currentProtyle) {
    currentProtyle.destroy();
    currentProtyle = null;
  }
});

// 初始化
onMounted(() => {
  try {
    const stored = localStorage.getItem('fsrs-card-browser:viewMode');
    if (stored === 'flat' || stored === 'hierarchy') {
      viewMode.value = stored;
    }
  } catch {}
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
      void plugin.openDeliberatePracticeDialog?.();
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
  if (id === 'extraction') return (props.plugin as any)?.extractionQueue;
  if (id === 'final-drill') return (props.plugin as any)?.finalDrillQueue;
  if (id === 'neural-roam') return props.plugin?.neuralQueue;
  if (id === 'filter-group') return props.plugin?.filterGroupQueue;
  return null;
}

async function refreshQueueCounts() {
  const extraction = (props.plugin as any)?.extractionQueue?.size?.() ?? ((props.plugin as any)?.extractionQueue?.getAllItems?.()?.length ?? 0);
  const finalDrill = (props.plugin as any)?.finalDrillQueue?.size?.() ?? ((props.plugin as any)?.finalDrillQueue?.getAllItems?.()?.length ?? 0);
  const neural = props.plugin?.neuralQueue?.size?.() ?? (props.plugin?.neuralQueue?.getAllItems?.()?.length ?? 0);
  const filterGroup = props.plugin?.filterGroupQueue?.size?.() ?? (props.plugin?.filterGroupQueue?.getAllItems?.()?.length ?? 0);
  queueCounts.value = {
    extraction: Number(extraction) || 0,
    'final-drill': Number(finalDrill) || 0,
    'neural-roam': Number(neural) || 0,
    'filter-group': Number(filterGroup) || 0,
  };
}

async function handleSelectQueue(queueId: string) {
  activeQueueId.value = queueId;
  activeDocId.value = null;
  await loadData();
}

function handleSelectDoc(docId: string) {
  const id = String(docId || '');
  if (id === '__all__') {
    currentPreset.value = 'all';
    searchQuery.value = '';
    activeDocId.value = null;
    activeQueueId.value = null;
    void loadData();
    return;
  }
  activeQueueId.value = null;
  activeDocId.value = id;
  void loadData();
}

function handleFilterDoc(docId: string) {
  activeDocId.value = docId;
  activeQueueId.value = null;
  searchQuery.value = `doc:${docId}`;
}
</script>

<style scoped>
/* 布局 - Dialog 模式（水平，预览在右） */
.card-browser--dialog {
  display: flex;
  flex-direction: row;
  height: 100%;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
}

/* 布局 - Tab/Dock 模式（垂直，预览在下） */
.card-browser--tab,
.card-browser--dock {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
}

.card-browser__main {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.card-browser__hierarchy {
  width: 260px;
  min-width: 220px;
  max-width: 360px;
  height: 100%;
  overflow: hidden;
}

.card-browser__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.card-browser__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.toolbar__left,
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar__center {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.toolbar__search {
  width: 160px;
}

.toolbar__search .b3-text-field {
  width: 100%;
}

.card-browser__loading,
.card-browser__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--b3-theme-on-surface-light);
}

.card-browser__empty div {
  font-size: 48px;
}

.card-browser__grid {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 拖拽分隔条 - Dialog 模式（垂直线） */
.card-browser--dialog .card-browser__resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
}

.card-browser--dialog .card-browser__resizer:hover,
.card-browser--dialog .card-browser__resizer--dragging {
  background: var(--b3-theme-primary);
}

/* 拖拽分隔条 - Tab/Dock 模式（水平线） */
.card-browser--tab .card-browser__resizer,
.card-browser--dock .card-browser__resizer {
  height: 4px;
  cursor: row-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
}

.card-browser--tab .card-browser__resizer:hover,
.card-browser--tab .card-browser__resizer--dragging,
.card-browser--dock .card-browser__resizer:hover,
.card-browser--dock .card-browser__resizer--dragging {
  background: var(--b3-theme-primary);
}

/* 预览面板 */
.card-browser__preview {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.card-browser--tab .card-browser__preview,
.card-browser--dock .card-browser__preview {
  border-left: none;
  border-top: 1px solid var(--b3-border-color);
}

.preview__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
}

.preview__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
}

.preview__body {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.preview__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--b3-theme-on-surface-light);
  font-size: 13px;
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
  --ag-row-height: 32px;
  --ag-header-height: 36px;
  --ag-font-size: 12px;
  --ag-cell-horizontal-padding: 8px;
  --ag-header-column-resize-handle-color: var(--b3-theme-primary);
  --ag-header-column-resize-handle-width: 2px;
  --ag-checkbox-checked-color: var(--b3-theme-primary);
  --ag-checkbox-unchecked-color: var(--b3-theme-on-surface-light);
  --ag-checkbox-background-color: transparent;
  
  font-family: inherit;
}

/* 根容器 - 防止白屏 */
.card-browser-grid :deep(.ag-root-wrapper) {
  background: var(--b3-theme-background) !important;
  border: none;
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
  font-weight: 600;
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

/* 垂直面包屑样式 */
.preview__breadcrumb {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  margin-bottom: 0;
  /* 移除背景色和边框，使其融入背景 */
  background: transparent;
}

.breadcrumb__item {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--b3-theme-on-surface); /* 默认文字颜色，非蓝色 */
  line-height: 1.6;
  position: relative;
  border-radius: 4px;
}

.breadcrumb__item:hover {
  text-decoration: underline;
  color: var(--b3-theme-primary); /* 悬浮时变蓝 */
  background-color: var(--b3-list-hover); /* 悬浮时添加轻微背景 */
}

.breadcrumb__text {
  display: flex;
  align-items: center;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--b3-font-family);
  opacity: 0.86;
  flex: 1;
  min-width: 0;
}

.breadcrumb__icon {
  width: 12px;
  height: 12px;
  margin-right: 6px;
  opacity: 0.6;
  fill: var(--b3-theme-on-surface);
}
</style>
