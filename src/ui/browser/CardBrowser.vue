<template>
  <div class="card-browser" :class="[
    `card-browser--${mode}`,
    showPreview ? 'card-browser--preview-open' : ''
  ]">
    <!-- 主区域：工具栏 + 表格 -->
    <div class="card-browser__main">
      <div v-if="viewMode === 'hierarchy'" class="card-browser__hierarchy">
        <BrowserHierarchy
          :cards="allCards"
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
            @click="showBatchMenu"
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
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-balham.css'; // Fix: 引入主题 CSS 以修复复选框样式
import type { GridApi, ColDef, CellContextMenuEvent } from 'ag-grid-community';
import { type RowSelectionOptions } from 'ag-grid-community';
import { openTab, Menu, Protyle, type App } from 'siyuan';
import { pushErrMsg, pushMsg } from '@/core/siyuan/api';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import { loadCards, loadQueueCards, parseQuery, batchReschedule, batchReset, batchSuspend } from './browserService';
import { type BrowserCard, CardState } from './types';
import type { ICardDataSource } from './datasource/types';
import { FinalDrillDataSource } from './datasource/FinalDrillDataSource';
import { DeckDataSource } from './datasource/DeckDataSource';
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
const allCards = ref<BrowserCard[]>([]);
const queueCards = ref<BrowserCard[]>([]);
const currentDataSource = ref<ICardDataSource | null>(null);
const currentPreset = ref('all');
const selectedRows = ref<BrowserCard[]>([]);
const gridApi = ref<GridApi | null>(null);
const searchQuery = ref('');
const viewMode = ref<'flat' | 'hierarchy'>('flat');
const activeQueueId = ref<string | null>(null);
const activeDocId = ref<string | null>(null);
const queueCounts = ref<Record<string, number>>({});

function redrawGridRows(rows?: BrowserCard[]) {
  const api = gridApi.value;
  if (!api) return;
  if (!rows || rows.length === 0) {
    api.redrawRows();
    return;
  }
  const set = new Set(rows);
  const idSet = new Set(rows.map(r => r?.id).filter(Boolean));
  const nodes: any[] = [];
  api.forEachNode((node: any) => {
    const data = node?.data;
    if (!data) return;
    if (set.has(data) || (data?.id && idSet.has(data.id))) nodes.push(node);
  });
  if (nodes.length > 0) {
    api.redrawRows({ rowNodes: nodes });
  } else {
    api.redrawRows();
  }
}

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
    headerCheckboxSelection: true,
    checkboxSelection: true,
    headerName: 'Sel',
    width: 50,
    pinned: 'left',
    suppressSizeToFit: true,
    lockPosition: true,
  },
  // No - 行号
  {
    headerName: 'No',
    width: 50,
    sortable: true,
    valueGetter: (params: any) => params.node?.rowIndex != null ? params.node.rowIndex + 1 : '',
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
    valueFormatter: (params) => `${params.value ?? 50}%`,
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

const defaultColDef: ColDef = {
  resizable: true,
  sortable: false,
};

// 筛选后的卡片
const activeCards = computed(() => {
  if (activeQueueId.value) return queueCards.value;
  if (activeDocId.value) return allCards.value.filter((c) => c.rootId === activeDocId.value);
  return allCards.value;
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
  const parsed = parseQuery(searchQuery.value || '');
  return activeCards.value.filter((c) => matchesParsed(c, parsed));
});

// 加载数据 - 使用 browserService (riff API)
async function loadData() {
  loading.value = true;
  try {
    currentDataSource.value = new DeckDataSource(props.plugin, { preset: currentPreset.value, currentDocId: props.currentDocId });
    allCards.value = await currentDataSource.value.fetchRows();
    await refreshQueueCounts();
  } catch (err) {
    console.error('[CardBrowser] Load data error:', err);
    allCards.value = [];
  } finally {
    loading.value = false;
  }
}

// 搜索处理
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function handleSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {}, 150);
}

// AG Grid 选择配置 (v35+)
const rowSelection = ref<RowSelectionOptions>({
  mode: 'multiRow',
  checkboxes: false, // 使用列定义中的 checkbox
  headerCheckbox: false,
  enableClickSelection: false, // 点击行不选择，只点击 checkbox 选择（可选，根据需求）
});

// Grid 事件
function onGridReady(params: any) {
  gridApi.value = params.api;
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

// 右键菜单
function onCellContextMenu(event: CellContextMenuEvent) {
  event.event?.preventDefault();
  
  const rowData = event.data as BrowserCard;
  const menu = new Menu('card-browser-context');

  const selected = selectedRows.value?.length ? selectedRows.value : [rowData];
  const queueItems = selected.map((c) => ({
    cardID: c.fsrsCardId || c.id || c.blockId,
    blockID: c.blockId,
    deckID: c.deckId,
    priority: typeof c.priority === 'number' ? c.priority : 50,
  }));

  if (!activeQueueId.value) {
    menu.addItem({
      icon: 'iconList',
      label: t('addToQueue', 'Add to Queue (加入队列) >'),
      submenu: [
        {
          icon: 'iconFlag',
          label: t('queueDeliberate', 'Deliberate Practice (刻意练习)'),
          click: async () => {
            try {
              const q = (props.plugin as any)?.finalDrillQueue;
              if (!q?.addItems) {
                await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
                return;
              }
              const added = await q.addItems(queueItems);
              if (String(process.env.DEV_MODE) === 'true') {
                console.log('[CardBrowser] add to final-drill', { added, queueItems });
              }
              if (added > 0) {
                await pushMsg((props.i18n?.deliberateAdded || '已加入 {n} 张闪卡到刻意队列').replace('{n}', String(added)));
              } else {
                await pushMsg(props.i18n?.queueNoAdded || '没有新增闪卡（可能已在队列中）');
              }
              await refreshQueueCounts();
            } catch (err) {
              console.error('[CardBrowser] add to final-drill failed:', err);
              await pushErrMsg(t('loadFailed', 'Failed to load'));
            }
          },
        },
        {
          icon: 'iconRefresh',
          label: t('queueNeural', 'Neural Wandering (神经漫游)'),
          click: async () => {
            try {
              const q = props.plugin?.neuralQueue;
              if (!q?.addItems) {
                await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
                return;
              }
              const added = await q.addItems(queueItems);
              if (String(process.env.DEV_MODE) === 'true') {
                console.log('[CardBrowser] add to neural-wandering', { added, queueItems });
              }
              if (added > 0) {
                await pushMsg((props.i18n?.queueAdded || '已加入 {n} 张闪卡到队列练习').replace('{n}', String(added)));
              } else {
                await pushMsg(props.i18n?.queueNoAdded || '没有新增闪卡（可能已在队列中）');
              }
              await refreshQueueCounts();
            } catch (err) {
              console.error('[CardBrowser] add to neural failed:', err);
              await pushErrMsg(t('loadFailed', 'Failed to load'));
            }
          },
        },
        {
          icon: 'iconList',
          label: t('queueFilterGroup', 'Filter Group (筛选复习)'),
          click: async () => {
            try {
              const q = props.plugin?.filterGroupQueue;
              if (!q?.addItems) {
                await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
                return;
              }
              const added = await q.addItems(queueItems);
              if (String(process.env.DEV_MODE) === 'true') {
                console.log('[CardBrowser] add to filter-group', { added, queueItems });
              }
              if (added > 0) {
                await pushMsg((props.i18n?.filterGroupAdded || '已加入 {n} 张闪卡到分组队列').replace('{n}', String(added)));
              } else {
                await pushMsg(props.i18n?.queueNoAdded || '没有新增闪卡（可能已在队列中）');
              }
              await refreshQueueCounts();
            } catch (err) {
              console.error('[CardBrowser] add to filter-group failed:', err);
              await pushErrMsg(t('loadFailed', 'Failed to load'));
            }
          },
        },
      ],
    });
    menu.addSeparator();
  } else {
    menu.addItem({
      icon: 'iconTrashcan',
      label: t('removeFromQueue', 'Remove from Queue (从队列移除)'),
      click: async () => {
        try {
          if (activeQueueId.value === 'final-drill' && currentDataSource.value?.id === 'final-drill') {
            const removeSet = new Set(selected.map((r: any) => String(r?.fsrsCardId || r?.id || r?.blockId || '')).filter(Boolean));
            queueCards.value = queueCards.value.filter((c: any) => !removeSet.has(String(c?.fsrsCardId || c?.id || c?.blockId || '')));
            selectedRows.value = [];
            await currentDataSource.value.performAction('remove-from-queue', selected as any);
            redrawGridRows();
            await refreshQueueCounts();
            await pushMsg((props.i18n?.msg_removed || '已移除 {n} 张闪卡').replace('{n}', String(removeSet.size)));
            return;
          }
          const q = getQueueById(activeQueueId.value!);
          if (!q) {
            await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
            return;
          }
          let removed = 0;
          if (q?.removeItems) {
            removed = await q.removeItems(queueItems);
          } else {
            for (const it of queueItems) {
              const ok = await q?.removeItem?.(it);
              if (ok) removed++;
            }
          }
          if (String(process.env.DEV_MODE) === 'true') {
            console.log('[CardBrowser] remove from queue', { queueId: activeQueueId.value, removed, queueItems });
          }
          if (removed > 0) {
            await pushMsg((props.i18n?.msg_removed || '已移除 {n} 张闪卡').replace('{n}', String(removed)));
          } else {
            await pushMsg(props.i18n?.msg_no_removable || '未找到可取消的闪卡');
          }
          const removeSet = new Set(queueItems.map((x) => x.cardID));
          queueCards.value = queueCards.value.filter((c) => !removeSet.has((c.fsrsCardId || c.id || c.blockId) as any));
          await refreshQueueCounts();
        } catch (err) {
          console.error('[CardBrowser] remove from queue failed:', err);
          await pushErrMsg(t('loadFailed', 'Failed to load'));
        }
      },
    });
    if (activeQueueId.value === 'final-drill') {
      menu.addItem({
        icon: 'iconMark',
        label: t('setQueuePriority', 'Set Queue Priority (设置队列优先级)'),
        click: async () => {
          const p = await openNumberDialog({
            title: t('setQueuePriority', '设置队列优先级'),
            label: t('priorityLabel', '优先级'),
            description: t('priorityHint', '0-100，越小越优先'),
            defaultValue: 50,
            min: 0,
            max: 100,
            step: 1,
            integer: true,
          });
          if (p == null) return;
          if (currentDataSource.value?.id === 'final-drill') {
            await currentDataSource.value.performAction('set-priority', selected as any, { priority: p });
            redrawGridRows(selected as any);
            await pushMsg(t('priorityUpdated', '已更新队列优先级'));
            return;
          }
          const q = (props.plugin as any)?.finalDrillQueue;
          if (!q?.setPriority) {
            await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
            return;
          }
          let changed = 0;
          for (const r of selected as any[]) {
            r.priority = p;
          }
          for (const it of queueItems) {
            const ok = await q.setPriority(String((it as any).cardID), p);
            if (ok) changed++;
          }
          if (changed > 0) {
            await pushMsg(t('priorityUpdated', '已更新队列优先级'));
            redrawGridRows(selected as any);
          } else {
            await pushMsg(t('priorityNoChange', '未找到可更新的队列项'));
          }
        },
      });
      menu.addItem({
        icon: 'iconSort',
        label: t('autoSortQueue', 'Auto-Sort Queue (按优先级重排队列)'),
        click: async () => {
          if (currentDataSource.value?.id === 'final-drill') {
            await currentDataSource.value.performAction('auto-sort', selected as any);
            reorderFinalDrillRows();
            redrawGridRows();
            await pushMsg(t('queueSorted', '已按优先级重排队列'));
            return;
          }
          const q = (props.plugin as any)?.finalDrillQueue;
          if (!q?.sort) {
            await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
            return;
          }
          await q.sort();
          await pushMsg(t('queueSorted', '已按优先级重排队列'));
          if (activeQueueId.value) {
            reorderFinalDrillRows();
            redrawGridRows();
          }
        },
      });
    }
    menu.addSeparator();
  }
  
  menu.addItem({
    icon: 'iconCalendar',
    label: t('postpone', 'Postpone'),
    click: () => handlePostpone(selected),
  });
  menu.addItem({
    icon: 'iconCalendar',
    label: t('advance', 'Advance (Spread)'),
    click: () => handleAdvance(selected),
  });
  
  menu.addItem({
    icon: 'iconRefresh',
    label: t('resetCard', 'Reset'),
    click: () => handleReset(selected),
  });
  
  menu.addItem({
    icon: 'iconPause',
    label: t('suspend', 'Suspend'),
    click: () => handleSuspend(selected),
  });
  
  menu.addSeparator();
  
  menu.addItem({
    icon: 'iconOpen',
    label: t('openInTab', 'Open'),
    click: () => {
      if (props.app && rowData.blockId) {
        openTab({
          app: props.app,
          doc: { id: rowData.blockId },
        });
      }
    },
  });
  
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
    reorderFinalDrillRows();
    redrawGridRows();
  } else {
    await refreshQueueCounts();
  }
}

function reorderFinalDrillRows() {
  const q = (props.plugin as any)?.finalDrillQueue;
  const items = q?.getAllItems?.() || [];
  if (!Array.isArray(items) || items.length === 0) return;
  const map = new Map<string, any>();
  for (const r of queueCards.value) {
    const id = String((r as any)?.fsrsCardId || '');
    if (id) map.set(id, r);
  }
  const ordered: any[] = [];
  for (const it of items) {
    const id = String(it?.cardID || '');
    if (!id) continue;
    const row = map.get(id);
    if (row) ordered.push(row);
  }
  if (ordered.length > 0) {
    queueCards.value = ordered;
  }
}

// 批量菜单
function showBatchMenu() {
  const menu = new Menu('card-browser-batch');
  
  menu.addItem({
    icon: 'iconCalendar',
    label: t('postpone', 'Postpone'),
    click: () => handlePostpone(selectedRows.value),
  });
  menu.addItem({
    icon: 'iconCalendar',
    label: t('advance', 'Advance'),
    click: () => handleAdvance(selectedRows.value),
  });
  
  menu.addItem({
    icon: 'iconRefresh',
    label: t('resetCard', 'Reset Cards'),
    click: () => handleReset(selectedRows.value),
  });
  
  menu.addItem({
    icon: 'iconPause',
    label: t('suspend', 'Suspend'),
    click: () => handleSuspend(selectedRows.value),
  });
  
  menu.open({ x: 0, y: 0, isLeft: true });
}

// 操作处理
async function handlePostpone(targetCards: BrowserCard[]) {
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
  if (days == null || days <= 0) return;
  const ds = currentDataSource.value?.id === 'deck'
    ? currentDataSource.value
    : new DeckDataSource(props.plugin, { preset: currentPreset.value, currentDocId: props.currentDocId });
  if (ds) {
    await ds.performAction('postpone', targetCards as any, { days });
  } else {
    await batchReschedule(targetCards, 'relative', days);
  }
  redrawGridRows(targetCards as any);
  await pushMsg(t('actionSuccess', '操作成功'));
}

async function handleAdvance(targetCards: BrowserCard[]) {
  const maxDays = await openNumberDialog({
    title: t('advance', '提前复习'),
    label: t('maxDaysLabel', '最大天数'),
    description: t('advanceHint', 'Randomly disperse review dates within 1..N days (Spread)'),
    defaultValue: 30,
    min: 1,
    max: 365,
    step: 1,
    integer: true,
  });
  if (maxDays == null || maxDays <= 0) return;
  const ds = currentDataSource.value?.id === 'deck'
    ? currentDataSource.value
    : new DeckDataSource(props.plugin, { preset: currentPreset.value, currentDocId: props.currentDocId });
  if (!ds) return;
  await ds.performAction('advance', targetCards as any, { maxDays });
  redrawGridRows(targetCards as any);
  await pushMsg(t('actionSuccess', '操作成功'));
}

async function handleReset(targetCards: BrowserCard[]) {
  const ok = await confirmDialog({
    title: t('resetCard', 'Reset'),
    content: t('confirmReset', `确定要重置 ${targetCards.length} 张卡片吗？`),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  });
  if (!ok) return;
  
  const blockIds = targetCards.map(c => c.blockId);
  await batchReset(blockIds);
  await refreshData();
}

async function handleSuspend(targetCards: BrowserCard[]) {
  const blockIds = targetCards.map(c => c.blockId);
  await batchSuspend(blockIds, true);
  await refreshData();
}

// 刷新数据
async function refreshData() {
  selectedRows.value = [];
  previewCard.value = null;
  activeQueueId.value = null;
  activeDocId.value = null;
  queueCards.value = [];
  await loadData();
}

// 切换预设
function handlePresetChange() {
  refreshData();
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
      void plugin.openRetrievalPracticeDialog?.();
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
      void plugin.openNeuralReviewDialog?.();
    },
  });

  menu.addItem({
    icon: 'iconBug',
    label: t('practiceLeech', '难点攻坚'),
    click: () => {
      void plugin.openLeechPracticeDialog?.();
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
  if (id === 'final-drill') return (props.plugin as any)?.finalDrillQueue;
  if (id === 'neural-wandering') return props.plugin?.neuralQueue;
  if (id === 'filter-group') return props.plugin?.filterGroupQueue;
  return null;
}

async function refreshQueueCounts() {
  const finalDrill = (props.plugin as any)?.finalDrillQueue?.size?.() ?? ((props.plugin as any)?.finalDrillQueue?.getAllItems?.()?.length ?? 0);
  const neural = props.plugin?.neuralQueue?.size?.() ?? (props.plugin?.neuralQueue?.getAllItems?.()?.length ?? 0);
  const filterGroup = props.plugin?.filterGroupQueue?.size?.() ?? (props.plugin?.filterGroupQueue?.getAllItems?.()?.length ?? 0);
  queueCounts.value = {
    'final-drill': Number(finalDrill) || 0,
    'neural-wandering': Number(neural) || 0,
    'filter-group': Number(filterGroup) || 0,
  };
}

async function handleSelectQueue(queueId: string) {
  activeQueueId.value = queueId;
  activeDocId.value = null;
  selectedRows.value = [];
  previewCard.value = null;
  if (queueId === 'final-drill') {
    if (!props.plugin) {
      await pushErrMsg(t('initFailed', 'FSRS 插件初始化失败，请打开控制台查看错误'));
      return;
    }
    const ds = new FinalDrillDataSource(props.plugin);
    currentDataSource.value = ds;
    queueCards.value = await ds.fetchRows();
  } else {
    currentDataSource.value = null;
    const q = getQueueById(queueId);
    const items = q?.getAllItems?.() || [];
    const ids = (items || []).map((it: any) => it?.blockID).filter(Boolean);
    queueCards.value = await loadQueueCards(ids);
  }
  await refreshQueueCounts();
}

function handleSelectDoc(docId: string) {
  activeDocId.value = docId;
  activeQueueId.value = null;
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
