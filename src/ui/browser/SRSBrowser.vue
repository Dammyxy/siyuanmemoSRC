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
        :queue-type="currentQueueType"
        :applied-filter="appliedFilter"
        :active-queue-id="activeQueueId"
        @exitFocus="handleExitFocus"
        @openPracticeMenu="openPracticeMenu"
        @applySortToQueue="handleApplySortToQueue"
        @toggleViewMode="toggleViewMode"
        @forceRefresh="forceRefreshData"
        @migrateTopicItem="migrateTopicItem"
        @showPerformanceReport="showPerformanceReport"
        @convertToTab="convertToTab"
        @openFilterDialog="showFilterDialog = true"
        @openSpreadDialog="handleOpenSpreadDialog"
        @rebuildQueue="handleRebuildQueue"
      />

      <!-- 🆕 同步状态指示器（仅在 advanced 模式显示） -->
      <SyncStatusIndicator
        v-if="showSyncIndicator"
        :hybridSyncService="hybridSyncService"
        :i18n="props.i18n"
        @sync="handleSyncComplete"
      />

      <!-- 检测状态提示（已禁用） -->
      <!-- <div
        v-if="cardTypeDetection.isDetecting"
        class="card-browser__detection-status"
      >
        🔍 正在识别卡片类型... ({{ cardTypeDetection.unidentifiedCount }})
      </div> -->

      <!-- 加载状态 -->
      <div v-if="loading" class="card-browser__loading">
        <div class="fn__loading"></div>
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="filteredCards.length === 0" class="card-browser__empty">
        <div>📭</div>
        <span>{{ t('noCards', 'No cards') }}</span>
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
          :animateRows="false"
          :suppressCellFocus="true"
          :suppressRowHoverHighlight="false"
          :rowBuffer="10"
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

    <!-- 🆕 过滤对话框 (filter-group-queue-ui) -->
    <div v-if="showFilterDialog" class="filter-dialog-overlay" @click.self="showFilterDialog = false">
      <div class="filter-dialog-container">
        <FilterDialog
          :is-open="showFilterDialog"
          :initial-filter="appliedFilter"
          :i18n="i18n"
          @apply="handleApplyFilter"
          @cancel="showFilterDialog = false"
          @clear="handleClearFilter"
          @rebuild="handleRebuildQueue"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onBeforeUnmount, watch } from 'vue';
import { AgGridVue } from 'ag-grid-vue3';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
// AG Grid v35+ 使用 Theming API，无需引入 CSS 主题文件
// 自定义主题通过 CSS 变量实现（见 SRSBrowser.scss）
import './SRSBrowser.scss';
import type {
  GridApi,
  ColDef,
  CellContextMenuEvent,
  ColumnState,
  DisplayedColumnsChangedEvent,
  GridReadyEvent,
  RowClickedEvent,
  RowDoubleClickedEvent,
  RowSelectionOptions,
  SortChangedEvent,
} from 'ag-grid-community';
import { openTab, Menu, Protyle, type App } from 'siyuan';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import {
  parseQuery,
  loadQueueCardsSimple,
  setGlobalBrowserContext,
  clearGlobalBrowserContext,
  invalidateCardCache,
  getCacheStats,
  subscribeCacheUpdate,
  pushBrowserErrMsg,
  pushBrowserMsg,
} from './browserService';
import { PerformanceMonitor } from '@/utils/performance';
import { type BrowserCard, CardState } from './types';
import { migrateExistingCards, checkMigrationNeeded } from '@/scripts/migrateToTopicItem';
import type { ICardDataSource, SortModel } from './datasource/types';
import { FinalDrillDataSource } from './datasource/FinalDrillDataSource';
import { FilterGroupDataSource } from './datasource/FilterGroupDataSource';
import { RetrievalDataSource } from './datasource/RetrievalDataSource';
// DeckDataSource 现在通过 BrowserApplicationService.createDataSource() 创建，不需要直接导入
import { QueryDataSource } from './datasource/QueryDataSource';
import { BlockIdsDataSource } from './datasource/BlockIdsDataSource';
import { adjustTime } from './datasource/MenuActions';  // 🆕 导入 adjustTime
import ActionParamsDialog from './ActionParamsDialog.vue';
import BrowserHierarchy from './BrowserHierarchy.vue';
import BrowserPreview from './BrowserPreview.vue';
import BrowserToolbar from './BrowserToolbar.vue';
import FilterDialog from './dialogs/FilterDialog.vue';
import PostponeDialog from './dialogs/PostponeDialog.vue';
import AdvanceDialog from './dialogs/AdvanceDialog.vue';
import SpreadDialog from './dialogs/SpreadDialog.vue';
import RescheduleResultDialog from './dialogs/RescheduleResultDialog.vue';
import SyncStatusIndicator from '../components/SyncStatusIndicator.vue';  // 🆕 导入同步状态指示器
import { useCardTypeDetection } from './composables/useCardTypeDetection';
import { ConfigManager } from '@/core/scheduler/ConfigManager';
import type { RescheduleStoragePort } from '@/core/scheduler/ports';
// ✅ 导入配置模块
import { createColumnDefs } from './config';
import type { CardFilter, IReviewQueue, IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { filterService } from './services/FilterService';
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
import { useQueueBridge, EMPTY_QUEUE_COUNTS } from './composables/useQueueBridge';
import { useIncrementalGridUpdates } from './composables/useIncrementalGridUpdates';
import { useBrowserAdapterSync } from './composables/useBrowserAdapterSync';
import { createLogger } from '@/utils/logger';
import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { IPluginFacade } from '@/application/interfaces/IPluginFacade';
import type { CardTypeMarkerStoragePort } from '@/core/storage/ports';
import type { SortField, SortOrder } from '@/core/card/domain/services/CardSortService';
import type { FSRSCard } from '@/types/card';
import type { WsSyncEvent } from '@/application/services/XiuyuanSyncService.types';

// 注册 AG-Grid 模块
ModuleRegistry.registerModules([AllCommunityModule]);
const logger = createLogger('SRSBrowser');

// Props
type BrowserStoragePort = CardTypeMarkerStoragePort &
  RescheduleStoragePort & {
    getSettings?: () => { riffIntegration?: unknown } | undefined;
  };

type BrowserPluginContext = {
  getBrowserService?: () => IBrowserApplicationService | null;
  getStorage?: () => BrowserStoragePort | null;
  getUnifiedDataSourceManager?: () => IUnifiedDataSourceManagerFacade | null;
  getHybridSyncService?: () => unknown;
  getDialogManager?: () => unknown;
};

type BrowserPluginPort = IPluginFacade & {
  getContext?: () => BrowserPluginContext | null;
};

type BrowserTabManagerPort = {
  openDocumentTab: (blockId: string) => void;
};

type BrowserTabApplicationServicePort = {
  openDocumentTab: (params: { docId: string }) => Promise<void> | void;
};

const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: 'dialog' | 'tab' | 'dock';
  plugin?: BrowserPluginPort;
  browserService?: IBrowserApplicationService;  // ✅ DDD 架构：浏览器应用服务
  tabManager?: BrowserTabManagerPort;      // ⚠️ 已废弃，使用 tabApplicationService
  tabApplicationService?: BrowserTabApplicationServicePort;  // ✅ Phase 9: Tab 应用服务
}>();

const mode = computed(() => props.mode || 'dialog');

const pluginContext = computed(() => props.plugin?.getContext?.() || null);

const browserAppServiceRef = computed(
  () => props.browserService || pluginContext.value?.getBrowserService?.()
);
const pluginStorage = computed(() => pluginContext.value?.getStorage?.());
const pluginUnifiedDataSourceManager = computed(
  () => browserAppServiceRef.value?.getUnifiedDataSourceManager?.() || pluginContext.value?.getUnifiedDataSourceManager?.()
);
const browserSiyuanApi = computed(() => browserAppServiceRef.value?.getSiyuanApi?.());
const {
  getQueueById: resolveQueueById,
  refreshQueueCounts: refreshQueueCountsBridge,
  setFilterGroupFilter: setFilterGroupFilterBridge,
  rebuildFilterGroupQueue: rebuildFilterGroupQueueBridge,
} = useQueueBridge({
  browserService: browserAppServiceRef,
});

// 🆕 同步状态指示器相关
const hybridSyncService = computed(() => pluginContext.value?.getHybridSyncService?.());
const showSyncIndicator = computed(() => {
  const storage = pluginStorage.value;
  if (!storage) return false;
  
  // ✅ 简单模式已移除，只要有 riffIntegration 配置且 hybridSyncService 存在就显示
  const riffConfig = storage.getSettings?.()?.riffIntegration;
  return !!riffConfig && !!hybridSyncService.value;
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'convertToTab'): void;
}>();

// State
const loading = ref(false);
const rows = ref<BrowserCard[]>([]);
const allRows = ref<BrowserCard[]>([]);  // ✅ 所有卡片的完整数据（不受筛选影响，用于【全部】区统计）
const currentDataSource = ref<ICardDataSource | null>(null);
const currentPreset = ref<PresetFilter>('all');
const currentCardType = ref<CardTypeFilter>('all');  // ✅ 卡片类型筛选
const selectedRows = ref<BrowserCard[]>([]);
const gridApi = ref<GridApi | null>(null);
const currentSortModel = ref<SortModel[]>([]);
// ✅ 排序字段和顺序（用于 browserService.getBrowserCards）
const currentSortField = ref<SortField>('due');
const currentSortOrder = ref<SortOrder>('asc');
const searchQuery = ref('');
const viewMode = ref<'flat' | 'hierarchy'>('hierarchy');  // ✅ 默认使用层级视图
const activeQueueId = ref<string | null>(null);
const activeDocId = ref<string | null>(null);
const queueCounts = ref<Record<string, number>>({ ...EMPTY_QUEUE_COUNTS });

// 🆕 过滤条件状态 (filter-group-queue-ui)
const appliedFilter = ref<CardFilter | null>(null);
const showFilterDialog = ref(false);

// ✅ 检测触发标志（防止同一个 loading 周期内重复触发）
let detectionTriggered = false;

// 预览状态
const showPreview = ref(true);
const previewCard = ref<BrowserCard | null>(null);

// 拖拽调整状态
const isResizing = ref(false);

// ✅ 智能计算预览区初始大小
const calculateInitialPreviewSize = (): number => {
  if (mode.value !== 'dialog') {
    return DEFAULT_PREVIEW_SIZE.tab;
  }
  
  // 获取对话框容器宽度（如果可用）
  const dialogWidth = window.innerWidth;
  
  // ✅ 预览区适中大小，平衡表格和预览的需求
  // 用户可以通过拖拽调整预览区宽度
  if (dialogWidth < 1024) {
    // 小屏幕：预览区 280px
    return 280;
  } else if (dialogWidth < 1440) {
    // 中等屏幕：预览区 320px
    return 320;
  } else if (dialogWidth < 1920) {
    // 大屏幕：预览区 360px
    return 360;
  } else {
    // 超大屏幕：预览区 400px
    return 400;
  }
};

const previewSize = ref(calculateInitialPreviewSize());

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

async function pushMsg(msg: string, duration?: number, level?: 'error'): Promise<void> {
  if (level === 'error') {
    await pushBrowserErrMsg(msg, duration);
    return;
  }
  await pushBrowserMsg(msg, duration);
}

async function pushErrMsg(msg: string, duration?: number): Promise<void> {
  await pushBrowserErrMsg(msg, duration);
}

const isDevMode = String(process.env.DEV_MODE) === 'true';

// ✅ 使用导入的配置
const columnDefs = ref<ColDef[]>(createColumnDefs(t));

// 判断是否为队列模式（队列模式启用客户端排序，Deck 模式禁用）
const isQueueMode = computed(() => {
  const qid = String(activeQueueId.value || '');
  return qid === 'final-drill'
    || qid === 'retrieval'
    || qid === 'filter-group'
    || qid === 'neural-roam'
    || qid === 'neural'
    || qid === 'incremental-learning';
});

// 🆕 当前队列类型 (filter-group-queue-ui)
const currentQueueType = computed(() => {
  const qid = String(activeQueueId.value || '');
  if (isDevMode) {
    logger.info('[SiYuanMemo][SRSBrowser] currentQueueType computed:', {
      activeQueueId: activeQueueId.value,
      qid,
    });
  }
  if (qid === 'filter-group') return 'filter-group';
  if (qid === 'final-drill') return 'final-drill';
  if (qid === 'retrieval') return 'retrieval-practice';
  if (qid === 'incremental-learning') return 'incremental-learning';
  if (qid === 'neural-roam' || qid === 'neural') return 'neural-roam';
  return '';
});

// 始终启用 sortable，通过 canApplySortToQueue 控制按钮显示
const defaultColDef: ColDef = {
  resizable: true,
  sortable: true,
  // suppressMenu 在新版 AG Grid 中已移除，不再需要
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
  // 处理丢失闪卡
  if (activeDocId.value === '__lost__') {
    return rows.value.filter((c) => !String(c.rootId || ''));
  }
  
  // ✅ 处理文档筛选（队列模式和非队列模式都适用）
  if (activeDocId.value) {
    return rows.value.filter((c) => c.rootId === activeDocId.value);
  }
  
  return rows.value;
});

// ✅ 四重筛选：计算聚焦的文档 ID 列表（基于 rowsForFocus，不包含文档筛选）
const focusedDocIds = computed(() => {
  // 如果没有标记聚焦，返回 null（显示所有文档）
  if (!shouldFocusDocList.value) {
    if (isDevMode) {
      logger.info('[SiYuanMemo][SRSBrowser] 🔍 focusedDocIds: shouldFocusDocList is false, returning null');
    }
    return null;
  }

  // 提取 rowsForFocus 中所有的文档 ID（仅应用队列/搜索/preset 筛选，不包含文档筛选）
  const docs = new Set<string>();
  for (const card of rowsForFocus.value) {
    if (card.rootId) {
      docs.add(card.rootId);
    }
  }
  
  const result = docs.size > 0 ? Array.from(docs) : null;
  
  if (isDevMode) {
    // ✅ 详细日志：显示所有卡片的 rootId（用于调试）
    const allRootIds = rowsForFocus.value.map(c => ({ blockId: c.blockId, rootId: c.rootId }));
    const rootIdCounts = new Map<string, number>();
    for (const card of rowsForFocus.value) {
      if (card.rootId) {
        rootIdCounts.set(card.rootId, (rootIdCounts.get(card.rootId) || 0) + 1);
      }
    }

    logger.info('[SiYuanMemo][SRSBrowser] 🔍 focusedDocIds computed:', {
      shouldFocusDocList: shouldFocusDocList.value,
      rowsForFocusCount: rowsForFocus.value.length,
      cardsWithRootId: rowsForFocus.value.filter(c => c.rootId).length,
      allRootIds,
      rootIdCounts: Object.fromEntries(rootIdCounts),
      uniqueDocIds: result,
      uniqueDocIdsExpanded: result ? [...result] : null,
      docsCount: docs.size,
    });
  }
  
  // ✅ 警告日志：当所有卡片都缺少 rootId 时输出警告
  if (result === null && rowsForFocus.value.length > 0) {
    logger.warn('[SiYuanMemo][SRSBrowser] ⚠️ All cards missing rootId, cannot focus documents');
  }
  
  return result;
});

// ✅ 全局统计（【全部】区使用）- 基于所有卡片，不受筛选影响
const globalStats = computed(() => {
  const allCards = allRows.value || [];
  return {
    total: allCards.length,
    lost: allCards.filter(c => !String(c.rootId || '')).length,
  };
});

const parsedSearchQuery = computed(() => {
  const query = searchQuery.value || '';
  if (extractSqlStatement(query) != null) return null;
  return parseQuery(query);
});

const filteredCards = computed(() => {
  const parsed = parsedSearchQuery.value;
  if (!parsed) return scopedRows.value;
  return scopedRows.value.filter((c) => matchesParsedQuery(c, parsed));
});

// 加载数据 - 强制使用统一数据源架构
let loadDataAbortController: AbortController | null = null;

async function loadData(forceRefresh = false) {
  // 取消之前的加载请求
  if (loadDataAbortController) {
    loadDataAbortController.abort();
    logger.info('[SiYuanMemo][SRSBrowser] Previous loadData() aborted');
  }
  
  // 创建新的 AbortController
  loadDataAbortController = new AbortController();
  const currentController = loadDataAbortController;
  
  loading.value = true;
  hasRandomSort.value = false;  // ✅ 重新加载数据时清除随机排序标志
  try {
    // 检查是否已被取消
    if (currentController.signal.aborted) {
      logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted before execution');
      return;
    }
    
    selectedRows.value = [];
    previewCard.value = null;

    // ========================================================================
    // 队列模式：使用数据源工厂创建数据源（支持 cardType 筛选）
    // ========================================================================
    if (activeQueueId.value) {
      logger.info('[SiYuanMemo][SRSBrowser] 🔍 Using data source for queue:', activeQueueId.value);
      logger.info('[SiYuanMemo][SRSBrowser] 🔍 Current cardType filter:', currentCardType.value);
      
      // 使用数据源工厂创建数据源（支持 cardType 筛选）
      // ✅ 不传递 docId，在 UI 层通过 scopedRows 筛选
      const options = {
        docId: null,  // ❌ 不传递 docId，避免数据源层筛选
        preset: currentPreset.value,
        queryText: searchQuery.value,
        cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
      };
      
      // ✅ 优先使用 browserService 获取 UnifiedDataSourceManager
      const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
      
      if (!unifiedDataSourceManager) {
        logger.error('[SiYuanMemo][SRSBrowser] UnifiedDataSourceManager not available');
        rows.value = [];
        rowsForFocus.value = [];
        return;
      }
      
      currentDataSource.value = createQueueDataSource(
        activeQueueId.value,
        unifiedDataSourceManager,
        options,
        props.plugin  // 🆕 传递 plugin 参数以访问 ApplicationContext
      );
      
      if (!currentDataSource.value) {
        logger.error('[SiYuanMemo][SRSBrowser] Failed to create data source for queue:', activeQueueId.value);
        rows.value = [];
        rowsForFocus.value = [];
        return;
      }
      
      // 执行数据加载
      await executeFetchRows(forceRefresh);
      
      // 检查是否已被取消
      if (currentController.signal.aborted) {
        logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted after executeFetchRows (queue mode)');
        return;
      }
      
      // 更新全量统计数据（懒加载：后台加载，不阻塞 UI）
      if (allRows.value.length === 0 && props.browserService) {
        void props.browserService.getBrowserCards({
          preset: 'all',
          forceRefresh,
          pageSize: 10000,
        }).then((result) => { 
          allRows.value = result.cards; 
        }).catch((err: unknown) => {
          logger.error('[SiYuanMemo][SRSBrowser] Failed to load allRows:', err);
        });
      }
      
      // ❌ 移除：避免重复调用（观察者回调中会调用）
      // await refreshQueueCounts();
      return;
    }

    // ========================================================================
    // 非队列模式：SQL 查询或全部卡片
    // ========================================================================
    const sqlStmt = extractSqlStatement(searchQuery.value);
    if (sqlStmt != null) {
      const ok = await ensureSqlModeConfirmed();
      if (!ok) return;
      // ✅ SQL 模式独立运行，清除其他筛选状态
      activeQueueId.value = null;
      activeDocId.value = null;
      shouldFocusDocList.value = false;  // SQL 模式不聚焦
      currentDataSource.value = createQueryDataSource(sqlStmt);
      
      // 执行数据加载
      await executeFetchRows(forceRefresh);
    } else {
      // ✅ 全部卡片模式：使用 browserService（完全 DDD 化）
      logger.info('[SiYuanMemo][SRSBrowser] 🆕 Using browserService for non-queue mode');
      
      if (!props.browserService) {
        logger.error('[SiYuanMemo][SRSBrowser] ❌ browserService is required!');
        pushErrMsg('浏览器服务未初始化');
        rows.value = [];
        rowsForFocus.value = [];
        allRows.value = [];
        return;
      }
      
      try {
        logger.info('[SiYuanMemo][SRSBrowser] 🔍 Calling browserService.getBrowserCards with:', {
          preset: currentPreset.value,
          searchText: searchQuery.value,
          cardTypes: currentCardType.value !== 'all' ? [currentCardType.value.replace('-only', '')] : undefined,
          currentCardTypeRaw: currentCardType.value,
          // docId: activeDocId.value,  // ❌ 不传递 docId，在 UI 层通过 scopedRows 筛选
          sortBy: currentSortField.value,
          sortOrder: currentSortOrder.value,
        });
        
        const result = await props.browserService.getBrowserCards({
          preset: currentPreset.value,
          searchText: searchQuery.value,
          cardTypes: currentCardType.value !== 'all' ? [currentCardType.value.replace('-only', '')] : undefined,
          // docId: activeDocId.value || undefined,  // ❌ 不传递 docId
          sortBy: currentSortField.value,
          sortOrder: currentSortOrder.value,
          forceRefresh,
          pageSize: 10000,  // 获取所有卡片
        });
        
        logger.info('[SiYuanMemo][SRSBrowser] ✅ Loaded cards via browserService:', {
          count: result.cards.length,
          total: result.total,
          stats: result.stats,
        });
        
        rows.value = result.cards;
        allRows.value = result.cards;  // 全量数据
        rowsForFocus.value = result.cards;
        
        // ✅ 使用 BrowserApplicationService 的工厂方法创建数据源
        // 符合 DDD 架构：UI 层不直接 new 对象，而是通过应用服务的工厂方法
        if (props.browserService) {
          currentDataSource.value = props.browserService.createDataSource({
            type: 'deck',
            preset: currentPreset.value,
            queryText: searchQuery.value,
            cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
            plugin: props.plugin,
          });
        } else {
          currentDataSource.value = null;
        }
      } catch (error) {
        logger.error('[SiYuanMemo][SRSBrowser] ❌ Failed to load cards via browserService:', error);
        rows.value = [];
        rowsForFocus.value = [];
        allRows.value = [];
      }
    }

    // 检查是否已被取消
    if (currentController.signal.aborted) {
      logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted after executeFetchRows (non-queue mode)');
      return;
    }

    // ❌ 移除：避免重复调用（观察者回调中会调用）
    // await refreshQueueCounts();
  } catch (err) {
    logger.error('[SiYuanMemo][CardBrowser] Load data error:', err);
    rows.value = [];
  } finally {
    // 只有当前 controller 没有被取消时才设置 loading = false
    if (!currentController.signal.aborted) {
      loading.value = false;
      
      // ✅ 初始加载完成后刷新队列统计
      // 注意：观察者回调中的更新不会走到这里，避免重复调用
      void refreshQueueCounts();
    }
    
    // 清理 controller
    if (loadDataAbortController === currentController) {
      loadDataAbortController = null;
    }
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

  // ✅ 更新全量统计数据（使用 browserService）
  if (props.browserService) {
    allRows.value = await PerformanceMonitor.measure('loadAllCards', async () => {
      try {
        const result = await props.browserService.getBrowserCards({
          preset: 'all',
          forceRefresh,
          pageSize: 10000,
        });
        return result.cards;
      } catch (err) {
        logger.error('[SiYuanMemo][SRSBrowser] Failed to load allRows:', err);
        return [];
      }
    });
  } else {
    logger.error('[SiYuanMemo][SRSBrowser] browserService is required for loadAllCards');
    allRows.value = [];
  }

  // ✅ 四重筛选：如果开启了聚焦，额外获取不包含文档筛选的数据
  if (shouldFocusDocList.value) {
    const focusOptions = {
      preset: currentPreset.value,
      queryText: searchQuery.value,
      cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
    };

    // ✅ 优先使用 browserService 获取 UnifiedDataSourceManager
    const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
    
    if (!unifiedDataSourceManager) {
      logger.warn('[SiYuanMemo][SRSBrowser] UnifiedDataSourceManager not available for focus data');
      rowsForFocus.value = fetchedRows;
      return;
    }

    const dataSourceForFocus = createFocusDataSource(
      activeQueueId.value,
      unifiedDataSourceManager,
      focusOptions,
      () => getQueueById(activeQueueId.value)?.getAllItems?.() || [],
      props.plugin  // 🆕 传递 plugin 参数以访问 ApplicationContext
    );

    if (dataSourceForFocus) {
      const { rows: focusRows } = await PerformanceMonitor.measure('fetchRowsFocus', () => 
        dataSourceForFocus!.fetchRows({ sortModel: [], filterModel: {} })
      );
      rowsForFocus.value = focusRows;

      if (isDevMode) {
        // 🔍 调试：显示所有卡片的 rootId
        logger.info('[SiYuanMemo][SRSBrowser] 🔍 rowsForFocus after fetch:', {
          count: focusRows.length,
          allRootIds: focusRows.map(c => ({ blockId: c.blockId, rootId: c.rootId })),
        });
      }
    }
  } else {
    rowsForFocus.value = fetchedRows;

    if (isDevMode) {
      // 🔍 调试：显示所有卡片的 rootId
      logger.info('[SiYuanMemo][SRSBrowser] 🔍 rowsForFocus (using fetchedRows):', {
        count: fetchedRows.length,
        allRootIds: fetchedRows.map(c => ({ blockId: c.blockId, rootId: c.rootId })),
      });
    }
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

// 监听 searchQuery 变化
watch(searchQuery, () => {
  handleSearchInput();
  // 🆕 更新全局上下文（DDD 化）
  const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
  if (unifiedDataSourceManager) {
    setGlobalBrowserContext(unifiedDataSourceManager, searchQuery.value, browserSiyuanApi.value);
  }
});

// 监听 preset 和 cardType 变化
watch(currentPreset, () => {
  void refreshData();
});

watch(currentCardType, () => {
  void refreshData(true);  // cardType 需要强制刷新缓存
});

// ✅ 自动检测未识别的卡片（加载完成后）- 已禁用
/*
watch(() => loading.value, async (isLoading) => {
  // 重置标志（loading 开始时重置，结束时使用）
  if (isLoading) {
    detectionTriggered = false;
  }

  if (!isLoading && !detectionTriggered && !cardTypeDetection.isDetecting.value && cardTypeDetection.unidentifiedCount.value > 0) {
    detectionTriggered = true; // 标记已触发

    logger.info('[SiYuanMemo][SRSBrowser] 🔄 Auto-detecting unidentified cards...');

    // 获取未识别的卡片列表（检测前）
    const unidentified = cardTypeDetection.getUnidentifiedCards();
    const blockIds = unidentified.map(c => c.blockId);

    // 二次确认：检查是否真的有卡片需要检测
    if (blockIds.length === 0) {
      logger.info('[SiYuanMemo][SRSBrowser] No cards to detect (race condition detected)');
      return;
    }

    // 执行检测
    await cardTypeDetection.detect();

    // 重新获取这些卡片的属性（同步更新 rows.value）
    const updatedCards = await loadQueueCardsSimple(blockIds);
    const updatedMap = new Map(updatedCards.map(c => [c.blockId, c]));

    // 更新 rows.value 中对应的卡片
    for (const card of rows.value) {
      const updated = updatedMap.get(card.blockId);
      if (updated) {
        Object.assign(card, updated);
      }
    }

    // 刷新单元格显示
    if (gridApi.value) {
      gridApi.value.refreshCells();
    }
  }
});
*/

// AG Grid 选择配置 (v35+ 新 API)
const rowSelection = ref<RowSelectionOptions>({
  mode: 'multiRow',
  checkboxes: true,       // ✅ AG-Grid v35+：启用复选框（显示在第一列）
  headerCheckbox: true,   // ✅ AG-Grid v35+：启用表头全选复选框
  enableClickSelection: false,
});

// 🆕 AG-Grid 性能优化配置
const gridOptions = {
  animateRows: false,  // 禁用行动画，提升性能
  suppressCellFocus: true,  // 禁用单元格焦点，减少重绘
  suppressRowHoverHighlight: false,  // 保留悬停高亮
  enableCellTextSelection: true,  // 保留文本选择
  rowBuffer: 10,  // 缓冲 10 行（默认值）
};

// Grid 事件
function onGridReady(params: GridReadyEvent<BrowserCard>) {
  gridApi.value = params.api;
  // 使用 gridApi.value 获取列信息（使用 nextTick 确保初始化完成）
  nextTick(() => {
    if (gridApi.value) {
      const columns = gridApi.value.getColumns?.();
      logger.info('[SiYuanMemo][CardBrowser] AG-Grid ready, columns:', columns?.map((c) => ({
        colId: c.getColId(),
        sortable: c.isSortable(),
      })));
    }
  });
}

function onDisplayedColumnsChanged(_params: DisplayedColumnsChangedEvent<BrowserCard>) {
  logger.info('[SiYuanMemo][CardBrowser] Displayed columns changed');
}

function onSortChanged(params: SortChangedEvent<BrowserCard>) {
  currentSortModel.value = (params.api?.getSortModel?.() ?? []) as SortModel[];
  const sortArray = [...currentSortModel.value];

  // ✅ 更新 currentSortField 和 currentSortOrder（用于 browserService.getBrowserCards）
  if (sortArray.length > 0) {
    const firstSort = sortArray[0];
    currentSortField.value = firstSort.colId || 'due';
    currentSortOrder.value = firstSort.sort || 'asc';
    hasRandomSort.value = false;
  } else {
    // 没有排序时，使用默认值
    currentSortField.value = 'due';
    currentSortOrder.value = 'asc';
  }

  // 检查排序是否真的改变了
  const api = params?.api || gridApi.value;
  logger.info('[SiYuanMemo][CardBrowser] onSortChanged:', {
    sortModel: currentSortModel.value,
    sortModelLength: currentSortModel.value?.length,
    sortModelArray: sortArray,
    currentSortField: currentSortField.value,
    currentSortOrder: currentSortOrder.value,
    activeQueueId: activeQueueId.value,
    canApply: canApplySortToQueue.value,
    // 调试：检查 API 方法
    hasGetSortModel: typeof api?.getSortModel === 'function',
    hasGetDisplayedRowCount: typeof api?.getDisplayedRowCount === 'function',
    hasGetColumnState: typeof api?.getColumnState === 'function',
    // 尝试获取当前排序状态（只显示 priority 列）
    columnState: (api?.getColumnState?.() ?? []).filter((c: ColumnState) => c.colId === 'priority'),
  });

  // 强制刷新 NO 列以更新行号（使用 colId）
  if (api) {
    api.refreshCells?.({ force: true, columns: ['noColumn'] });
  }
}

function onSelectionChanged() {
  if (gridApi.value) {
    selectedRows.value = gridApi.value.getSelectedRows() as BrowserCard[];
  }
}


function onRowClicked(event: RowClickedEvent<BrowserCard>) {
  const mouseEvent = event.event as MouseEvent;
  const isMultiSelect = mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey;
  
  // 多选模式：不改变预览
  if (isMultiSelect) {
    return;
  }
  
  // 单选模式 - 设置预览卡片（BrowserPreview 组件内部处理加载）
  previewCard.value = event.data;
}

async function onRowDoubleClicked(event: RowDoubleClickedEvent<BrowserCard>) {
  const blockId = event.data?.blockId;
  if (!blockId) {
    logger.warn('[SiYuanMemo][CardBrowser] No blockId found in row data:', event.data);
    return;
  }
  
  if (props.tabApplicationService) {
    await Promise.resolve(props.tabApplicationService.openDocumentTab({ docId: blockId }));
  } else if (props.tabManager) {
    props.tabManager.openDocumentTab(blockId);
  } else {
    await pushErrMsg(t('envNotInit', 'Environment not initialized, cannot open tab'));
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

type BrowserMenuItem = {
  icon?: string;
  label?: string;
  type?: 'separator';
  click?: () => void;
  submenu?: BrowserMenuItem[];
};

type ActionParams = Record<string, unknown>;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
}

type ActionParamBuilder = (targetCards: BrowserCard[]) => Promise<ActionParams | null>;

const ACTION_PARAM_BUILDERS: Record<string, ActionParamBuilder> = {
  postpone: async (cards) => {
    // 使用新的 PostponeDialog
    return new Promise((resolve) => {
      const configManager = new ConfigManager(pluginStorage.value!);
      const dlg = createVueDialog({
        title: t('postpone', 'Postpone'),
        component: PostponeDialog,
        props: {
          count: cards.length,
          configManager,
          i18n: props.i18n,
        },
        events: {
          confirm: async (config) => {
            dlg.destroy();
            resolve({ config });
          },
          cancel: () => {
            dlg.destroy();
            resolve(null);
          },
        },
        width: '800px',  // 🆕 增大默认宽度
        height: '85vh',  // 🆕 增大默认高度
        responsive: true,  // 🆕 启用响应式
      });
    });
  },
  advance: async (cards) => {
    // 使用新的 AdvanceDialog
    return new Promise((resolve) => {
      const configManager = new ConfigManager(pluginStorage.value!);
      const dlg = createVueDialog({
        title: t('advance', 'Advance'),
        component: AdvanceDialog,
        props: {
          count: cards.length,
          configManager,
          i18n: props.i18n,
        },
        events: {
          confirm: async (config) => {
            dlg.destroy();
            resolve({ config });
          },
          cancel: () => {
            dlg.destroy();
            resolve(null);
          },
        },
        width: '800px',  // 🆕 增大默认宽度
        height: '85vh',  // 🆕 增大默认高度
        responsive: true,  // 🆕 启用响应式
      });
    });
  },
  spread: async (cards) => {
    // 使用新的 SpreadDialog
    return new Promise((resolve) => {
      const configManager = new ConfigManager(pluginStorage.value!);
      const dlg = createVueDialog({
        title: t('spread', 'Spread Workload'),
        component: SpreadDialog,
        props: {
          count: cards.length,
          configManager,
          allCards: allRows.value,  // 🆕 传入已加载的卡片数据，避免触发缓存更新回调
          i18n: props.i18n,
        },
        events: {
          confirm: async (config) => {
            dlg.destroy();
            resolve({ config });
          },
          cancel: () => {
            dlg.destroy();
            resolve(null);
          },
        },
        width: '700px',
        height: '80vh',
      });
    });
  },
  'set-priority': async (cards) => {
    const row = cards?.[0];
    const p = await openNumberDialog({
      title: t('setPriority', 'Set Priority'),
      label: t('priorityLabel', 'Priority'),
      description: t('priorityHint', '0-100, smaller = higher priority'),
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
    const q = getQueueById('final-drill');
    let len = 0;
    if (typeof q?.getSize === 'function') {
      len = Number(await q.getSize()) || 0;
    } else if (typeof q?.getAllCards === 'function') {
      const cards = await q.getAllCards();
      len = Array.isArray(cards) ? cards.length : 0;
    }
    const pos = await openNumberDialog({
      title: t('insertAt', 'Insert At Position'),
      label: t('positionLabel', 'Position'),
      description: t('insertAtHint', 'Enter 1~{max}, 1 means insert at top')
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
    'remove-from-current-queue': { key: 'removeFromQueue', fallback: 'Remove from Queue' },
    'delete-card': { key: 'deleteCard', fallback: '取消闪卡' },
    'add-to-queue': { key: 'addToQueueMenu', fallback: '加入队列' },
    'add-to-retrieval-queue': { key: 'addToRetrievalQueue', fallback: '提取练习' },
    'add-to-incremental-queue': { key: 'addToIncrementalQueue', fallback: '渐进学习' },
    'add-to-final-drill-queue': { key: 'addToFinalDrillQueue', fallback: '刻意练习' },
    'add-to-filter-group-queue': { key: 'addToFilterGroupQueue', fallback: '筛选复习' },
    'add-to-neural-roam-queue': { key: 'addToNeuralRoamQueue', fallback: '神经漫游' },
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
  logger.debug('handleAction called:', {
    actionId,
    count: targetCards?.length || 0,
    blockIds: targetCards?.map(c => c.blockId),
  });
  
  if (!targetCards?.length) {
    logger.debug('handleAction skipped: no selected cards');
    return;
  }

  if (actionId === 'open') {
    const blockId = String(anchorRow?.blockId || targetCards[0]?.blockId || '');
    if (blockId) {
      if (props.tabApplicationService) {
        await Promise.resolve(props.tabApplicationService.openDocumentTab({ docId: blockId }));
      } else if (props.tabManager) {
        props.tabManager.openDocumentTab(blockId);
      } else {
        await pushErrMsg(t('envNotInit', 'Environment not initialized, cannot open tab'));
      }
      return;
    }
    await pushErrMsg(t('envNotInit', 'Environment not initialized, cannot open tab'));
    return;
  }

  const ds = currentDataSource.value;
  logger.debug('current data source:', ds?.constructor?.name);
  
  if (!ds) {
    logger.debug('handleAction skipped: data source is not available');
    return;
  }

  if (actionId === 'reset') {
    const ok = await confirmDialog({
      title: t('resetCard', 'Reset'),
      content: t('confirmReset', `Are you sure you want to reset ${targetCards.length} cards?`),
      confirmText: t('confirm', 'Confirm'),
      cancelText: t('cancel', 'Cancel'),
    });
    if (!ok) return;
  }

  // 🆕 删除卡片确认
  if (actionId === 'delete-card') {
    const ok = await confirmDialog({
      title: t('deleteCard', 'Remove Flashcard'),
      content: t('confirmDelete', `Are you sure you want to remove ${targetCards.length} flashcards? This action cannot be undone.`),
      confirmText: t('confirm', 'Confirm'),
      cancelText: t('cancel', 'Cancel'),
    });
    if (!ok) return;
  }

  const builder = ACTION_PARAM_BUILDERS[actionId];
  logger.debug('action param builder exists:', Boolean(builder));
  
  const ctx = builder ? await builder(targetCards) : { refresh: () => void loadData() };
  if (builder && ctx == null) {
    logger.debug('action canceled by builder');
    return;
  }

  try {
    const res = await ds.performAction(actionId, targetCards, ctx);
    logger.debug('performAction result:', { actionId, res });
    const result =
      typeof res === 'object' && res !== null
        ? (res as { updated?: unknown; skipped?: unknown })
        : undefined;
    const updated = Number(
      typeof result?.updated === 'number'
        ? result.updated
        : Array.isArray(result?.updated)
        ? result.updated.length
        : 0
    );
    const skipped = Number(
      typeof result?.skipped === 'number'
        ? result.skipped
        : Array.isArray(result?.skipped)
        ? result.skipped.length
        : 0
    );
    if (updated <= 0 && skipped > 0) {
      await pushErrMsg(t('batchNoEffect', 'No cards were updated (some cards may be unsynced)'));
      return;
    }
    if (skipped > 0) {
      await pushMsg(
        t('batchSummary', 'Updated {updated}, skipped {skipped}')
          .replace('{updated}', String(updated))
          .replace('{skipped}', String(skipped))
      );
    }

    if (
      actionId === 'remove-from-queue'
      || actionId === 'remove-from-current-queue'
      || actionId === 'dismiss'
      || actionId === 'delete-card'  // 🆕 删除卡片后刷新
      || actionId === 'insert-at'
      || actionId === 'auto-sort'
      || actionId === 'reset'
      || actionId === 'suspend'
      || actionId === 'postpone'  // 🆕 推迟后刷新
      || actionId === 'advance'   // 🆕 提前后刷新
    ) {
      // 🆕 删除卡片后强制清除缓存
      if (actionId === 'delete-card') {
        logger.debug('invalidate card cache after delete-card');
        invalidateCardCache();
      }
      
      // 🆕 推迟/提前后强制刷新以显示新的 due 日期
      const forceRefresh = actionId === 'delete-card' || actionId === 'postpone' || actionId === 'advance';
      await loadData(forceRefresh);
    } else {
      gridApi.value?.refreshCells({ force: true });
    }
    await refreshQueueCounts();
    await pushMsg(t('actionSuccess', 'Success'));
  } catch (err: unknown) {
    logger.error('action failed:', { actionId, err });
    await pushErrMsg(getErrorMessage(err, t('actionFailed', 'Action failed')));
  }
}

// 右键菜单
function onCellContextMenu(event: CellContextMenuEvent) {
  event.event?.preventDefault();
  
  const ds = currentDataSource.value;
  
  // ✅ 过滤掉 undefined/null 的 action
  const rawActions = ds?.getSupportedActions?.() || [];
  const actions = rawActions.filter(a => a && a.id);
  logger.debug('context menu actions:', {
    rawCount: rawActions.length,
    validCount: actions.length,
    dataSourceType: ds?.constructor?.name,
    dataSourceId: ds?.id,
  });
  
  const menu = new Menu('card-browser-context');
  const rowData = event.data as BrowserCard;
  const selected = selectedRows.value?.length ? selectedRows.value : [rowData];

  // ========== 添加排序菜单 ==========
  const sortMenu: BrowserMenuItem[] = [];

  // 添加每个排序字段的子菜单
  for (const field of SORT_FIELD_CONFIGS) {
    sortMenu.push({
      icon: field.icon || 'iconSort',
      label: t(field.i18nKey, field.label),
      submenu: [
        {
          icon: 'iconUp',
          label: t('sortAscending', 'Ascending'),
          click: () => {
            logger.debug('menu click sort asc:', field.colId);
            applySort(field.colId, 'asc');
          },
        },
        {
          icon: 'iconDown',
          label: t('sortDescending', 'Descending'),
          click: () => {
            logger.debug('menu click sort desc:', field.colId);
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
    label: t('sortRandom', 'Random Sort'),
    click: () => {
      logger.debug('menu click random sort');
      applyRandomSort();
    },
  });

  // 插入排序菜单
  menu.addItem({
    icon: 'iconSort',
    label: t('sortMenu', 'Sort'),
    submenu: sortMenu,
  });

  // 添加分隔线（排序菜单和现有操作之间）
  menu.addItem({ type: 'separator' });

  // ========== 卡片类型菜单（Topic/Item + 概念卡/描述符卡）==========
  const cardTypeMenu: BrowserMenuItem[] = [
    {
      icon: 'iconFile',
      label: t('markAsTopic', 'Mark as Topic'),
      click: () => void markCardsAsTopic(selected),
    },
    {
      icon: 'iconCheck',
      label: t('markAsItem', 'Mark as Item'),
      click: () => void markCardsAsItem(selected),
    },
    { type: 'separator' },  // 分隔线
    {
      icon: '🧠',
      label: t('markAsConcept', 'Mark as Concept Card'),
      click: () => void markCardsAsConcept(selected),
    },
    {
      icon: '🏷️',
      label: t('markAsDescriptor', 'Mark as Descriptor Card'),
      click: () => void markCardsAsDescriptor(selected),
    },
  ];

  menu.addItem({
    icon: 'iconHR',
    label: t('cardTypeMenu', 'Card Type'),
    submenu: cardTypeMenu,
  });

  // 添加分隔线（卡片类型菜单和现有操作之间）
  menu.addItem({ type: 'separator' });

  // ========== 原有的操作菜单 ==========
  logger.debug('rendering context actions:', actions.length);
  
  for (const action of actions) {
    // ✅ 跳过无效的 action
    if (!action || !action.id) {
      logger.warn('skip invalid action:', action);
      continue;
    }
    
    if (action.submenu && action.submenu.length > 0) {
      // ✅ 过滤掉无效的子菜单项
      const validSubmenu = action.submenu.filter(sub => sub && sub.id);
      
      const submenuItems = validSubmenu.map(sub => {
        return {
          icon: sub.icon || 'iconMore',
          label: getActionLabel({ id: sub.id, label: sub.label }),
          click: () => {
            logger.debug('submenu clicked:', { id: sub.id, label: sub.label });
            void handleAction(sub.id, selected, rowData);
          },
        };
      });
      
      menu.addItem({
        icon: action.icon || 'iconMore',
        label: getActionLabel({ id: action.id, label: action.label }),
        submenu: submenuItems,
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
  const q = getQueueById('final-drill');
  if (!q?.sort) {
    await pushErrMsg(t('initFailed', 'FSRS plugin initialization failed, please check console for errors'));
    return;
  }
  await q.sort();
  await pushMsg(t('queueSorted', 'Queue sorted by priority'));
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
      icon: action.icon || 'iconMore',
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
      logger.info(`[SiYuanMemo][CardBrowser] 缓存有效，${cacheStats.count} 张卡片，年龄 ${Math.round(cacheStats.age / 1000)}s`);
    } else {
      logger.info(`[SiYuanMemo][CardBrowser] 缓存无效或过期，将重新加载数据`);
    }
  }
  
  await loadData(forceRefresh);
}

const {
  handleCardUpdatedIncremental,
  handleCardDeletedIncremental,
  disposeIncrementalGridUpdates,
} = useIncrementalGridUpdates({
  gridApi,
  rows,
  rowsForFocus,
  allRows,
  loadData,
  refreshQueueCounts,
  loadQueueCardsSimple,
});

const {
  initBrowserAdapter,
  destroyBrowserAdapter,
} = useBrowserAdapterSync({
  manager: pluginUnifiedDataSourceManager,
  onCardUpdated: handleCardUpdatedIncremental,
  onCardDeleted: handleCardDeletedIncremental,
  onQueueChanged: () => {
    logger.info('[SiYuanMemo][SRSBrowser] Refreshing queue counts and data due to queue changes');
    void refreshQueueCounts();
    if (activeQueueId.value) {
      void refreshData(true);
    }
  },
  onModeSwitched: () => {
    logger.info('[SiYuanMemo][SRSBrowser] Reloading data due to mode switch');
    void loadData();
  },
});

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

// 强制刷新数据（清除缓存）
function forceRefreshData() {
  invalidateCardCache();
  void refreshData(true);
}

// 🆕 处理同步完成事件
function handleSyncComplete(type: 'incremental' | 'full') {
  logger.info('[SiYuanMemo][SRSBrowser] Sync completed:', type);
  // 同步完成后刷新数据
  forceRefreshData();
}

// 显示性能报告
function showPerformanceReport() {
  PerformanceMonitor.printReport();
  
  // 显示缓存统计
  const cacheStats = getCacheStats();
  logger.info('📊 缓存统计:', cacheStats);
  
  pushMsg('性能报告已输出到控制台', 2000);
}

// 清理
let unsubscribe: (() => void) | null = null;

onBeforeUnmount(() => {
  disposeIncrementalGridUpdates();
  destroyBrowserAdapter();

  // 🆕 清理全局浏览器上下文
  clearGlobalBrowserContext();
  logger.info('[SiYuanMemo][SRSBrowser] Global browser context cleared');
  
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

  // 🆕 初始化全局浏览器上下文（DDD 化）
  const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
  if (unifiedDataSourceManager) {
    setGlobalBrowserContext(unifiedDataSourceManager, searchQuery.value, browserSiyuanApi.value);
    logger.info('[SiYuanMemo][SRSBrowser] Global browser context initialized');
  } else {
    logger.warn('[SiYuanMemo][SRSBrowser] UnifiedDataSourceManager not available, global context not initialized');
  }

  // 🆕 初始化统一数据源适配器
  initBrowserAdapter();

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

  // 🆕 监听 HybridSyncService 的 WebSocket 同步事件
  const hybridService = hybridSyncService.value;
  if (hybridService) {
    // 监听 wsSync 事件（WebSocket 触发的同步完成）
    hybridService.on('wsSync', (event: WsSyncEvent) => {
      logger.info('[SiYuanMemo][SRSBrowser] Received wsSync event:', event);
      
      if (event.success) {
        logger.info('[SiYuanMemo][SRSBrowser] ⚡ Reloading data due to WebSocket sync...');
        // 同步成功，刷新数据
        void loadData(true); // 强制刷新缓存
      } else {
        logger.error('[SiYuanMemo][SRSBrowser] WebSocket sync failed:', event.error);
        // 同步失败，也尝试刷新数据（使用缓存）
        void loadData();
      }
    });
    
    logger.info('[SiYuanMemo][SRSBrowser] ✅ Subscribed to HybridSyncService wsSync events');
  }

  // 🆕 触发同步（如果启用）
  if (hybridService) {
    const storage = pluginStorage.value;
    const riffConfig = storage?.getSettings?.()?.riffIntegration;
    
    // 🔍 详细日志：诊断为什么自动同步没有触发
    logger.info('[SiYuanMemo][SRSBrowser] 🔍 Checking auto-sync configuration:', {
      hasHybridSyncService: !!hybridService,
      hasRiffConfig: !!riffConfig,
      mode: riffConfig?.mode,
      incrementalSyncEnabled: riffConfig?.incrementalSync?.enabled,
      fullSyncEnabled: riffConfig?.fullSync?.enabled,
      triggers: riffConfig?.incrementalSync?.triggers,
      hasBrowserOpenTrigger: riffConfig?.incrementalSync?.triggers?.includes('browser-open')
    });
    
    // 🔧 修复：mode 为 undefined 时默认为 advanced（简单模式已移除）
    const isAdvancedMode = !riffConfig?.mode || riffConfig.mode === 'advanced';
    
    // 🆕 优化：只在配置了 browser-open 触发器时才同步
    const shouldSyncOnBrowserOpen = riffConfig?.incrementalSync?.enabled && 
                                    riffConfig?.incrementalSync?.triggers?.includes('browser-open');
    
    if (isAdvancedMode && shouldSyncOnBrowserOpen) {
      logger.info('[SiYuanMemo][SRSBrowser] ✅ Triggering incremental sync on browser open...');
      
      // 使用立即执行的异步函数
      void (async () => {
        try {
          await hybridService.incrementalSync();
          logger.info('[SiYuanMemo][SRSBrowser] ✅ Incremental sync completed, reloading data...');
          // 同步完成后重新加载数据
          await loadData(true); // 强制刷新缓存
        } catch (err) {
          logger.error('[SiYuanMemo][SRSBrowser] ❌ Incremental sync failed:', err);
          // 同步失败也继续加载数据
          await loadData();
        }
      })();
      
      return; // 不再执行下面的 loadData()
    } else {
      logger.info('[SiYuanMemo][SRSBrowser] ⚠️ Auto-sync not triggered, loading data without sync', {
        isAdvancedMode,
        shouldSyncOnBrowserOpen,
        reason: !shouldSyncOnBrowserOpen ? 'browser-open trigger not configured' : 'not advanced mode'
      });
    }
  } else {
    logger.info('[SiYuanMemo][SRSBrowser] ⚠️ HybridSyncService not available');
  }

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

  const dialogManager = pluginContext.value?.getDialogManager?.();
  if (!dialogManager) return;

  const menu = new Menu('fsrs-browser-practice-menu');

  // 1. 提取练习
  menu.addItem({
    icon: 'iconRiffCard',
    label: t('practiceExtract', 'Retrieval Practice'),
    click: () => {
      void dialogManager.openReviewDialog?.();
    },
  });

  // 2. 渐进学习
  menu.addItem({
    icon: 'iconBook',
    label: t('incrementalLearning', 'Incremental Learning'),
    click: () => {
      void dialogManager.openIncrementalLearningDialog?.();
    },
  });

  // 3. 刻意练习
  menu.addItem({
    icon: 'iconFlag',
    label: t('practiceDeliberate', 'Deliberate Practice'),
    click: () => {
      void dialogManager.openFinalDrillDialog?.();
    },
  });

  // 4. 神经漫游
  menu.addItem({
    icon: 'iconRefresh',
    label: t('practiceNeural', 'Neural Roam'),
    click: () => {
      void dialogManager.openNeuralRoamDialog?.();
    },
  });

  // 5. 筛选复习
  menu.addItem({
    icon: 'iconList',
    label: t('practiceFilterGroup', 'Filtered Review'),
    click: () => {
      void dialogManager.openFilterGroupPracticeDialog?.();
    },
  });

  // 6. 难点攻坚（已隐藏）
  // menu.addItem({
  //   icon: 'iconBug',
  //   label: t('practiceLeech', '难点攻坚'),
  //   click: () => {
  //     void dialogManager.openLeechReviewDialog?.();
  //   },
  // });

  const target = (ev?.currentTarget || ev?.target) as HTMLElement | null;
  const rect = target?.getBoundingClientRect?.();
  const rawX = Number(ev?.clientX);
  const rawY = Number(ev?.clientY);
  const hasMousePoint = Number.isFinite(rawX) && Number.isFinite(rawY);
  const pos = rect
    ? { x: rect.left, y: rect.bottom }
    : hasMousePoint
      ? { x: rawX, y: rawY }
      : null;

  if (!pos) {
    logger.error('[SiYuanMemo][CardBrowser] openPracticeMenu failed: invalid pointer position');
    void pushErrMsg('打开练习菜单失败');
    return;
  }

  if (String(process.env.DEV_MODE) === 'true') {
    logger.info('[SiYuanMemo][CardBrowser] openPracticeMenu', { pos, hasDialogManager: Boolean(dialogManager) });
  }

  setTimeout(() => {
    try {
      menu.open({ x: pos.x, y: pos.y, isLeft: true });
    } catch (err) {
      logger.error('[SiYuanMemo][CardBrowser] openPracticeMenu failed:', err);
      void pushErrMsg('打开练习菜单失败');
    }
  }, 0);
}

function getQueueById(id: string) {
  const queue = resolveQueueById(id);
  if (queue) {
    if (isDevMode) {
      logger.info(`[SiYuanMemo][SRSBrowser] getQueueById: resolved queue ${id}`);
    }
    return queue;
  }
  logger.error(`[SiYuanMemo][SRSBrowser] browserService cannot resolve queue: ${id}`);
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
  markCardsAsConcept,
  markCardsAsDescriptor,
  migrateTopicItem,
  buildCardTypeSubmenu,
} = useCardActions({
  loading,
  loadData,
  refreshData,
  t,
  pushMsg: (msg, duration) => pushMsg(msg, duration),
  pushErrMsg: (msg, duration) => pushErrMsg(msg, duration),
  storage: pluginStorage.value,
});

// ✅ 类型检测
const cardTypeDetection = useCardTypeDetection(() => rows.value);

// ✅ 加载队列的所有卡片（不含筛选）
async function loadQueueAllCards(queueId: string): Promise<BrowserCard[]> {
  const queue = getQueueById(queueId);
  if (!queue) return [];

  const items: FSRSCard[] = await queue.getAllCards();
  if (isDevMode) {
    logger.info('[SiYuanMemo][SRSBrowser] loadQueueAllCards:', {
      queueId,
      itemsCount: items.length,
      items: items.map((it) => ({
        id: it.id,
        blockId: it.blockId,
        deckId: it.deckId,
      })),
    });
  }

  const blockIds = extractBlockIds(items);
  if (isDevMode) {
    logger.info('[SiYuanMemo][SRSBrowser] Extracted blockIds:', blockIds);
  }

  const cards = await loadQueueCardsSimple(blockIds);
  if (isDevMode) {
    logger.info('[SiYuanMemo][SRSBrowser] Loaded cards:', cards.length);
  }
  return cards;
}

async function refreshQueueCounts() {
  await refreshQueueCountsBridge(queueCounts);
}

async function handleSelectQueue(queueId: string) {
  logger.info('[SiYuanMemo][SRSBrowser] 🔍 handleSelectQueue called:', {
    queueId,
    beforeActiveDocId: activeDocId.value,
  });
  
  activeQueueId.value = queueId;
  // ✅ 五重筛选：点击队列时清除文档筛选，显示队列中的所有卡片
  activeDocId.value = null;  // ✅ 清除文档筛选
  // currentPreset.value → 保留 Preset
  // searchQuery.value → 保留搜索
  shouldFocusDocList.value = true;  // ✅ 选择队列后开启聚焦（文档区会自动聚焦到包含队列卡片的文档）
  
  // 🆕 根据队列类型自动调整卡片类型筛选
  if (queueId === 'neural' || queueId === 'neural-roam') {
    // 神经漫游队列：如果当前选择不是 concept-only 或 descriptor-only，默认设置为 concept-only
    if (currentCardType.value !== 'concept-only' && currentCardType.value !== 'descriptor-only') {
      currentCardType.value = 'concept-only';
    }
  } else if ((queueId === 'retrieval' || queueId === 'final-drill') && currentCardType.value === 'topic-only') {
    // 提取练习和最终训练队列：如果当前是 topic-only，切换到 all（因为这些队列不支持 topic-only）
    currentCardType.value = 'all';
  }
  // 其他情况保持当前选择
  
  logger.info('[SiYuanMemo][SRSBrowser] 🔍 After clearing activeDocId:', {
    activeDocId: activeDocId.value,
    shouldFocusDocList: shouldFocusDocList.value,
    currentCardType: currentCardType.value,
  });
  
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
  // ✅ 退出队列模式 = 点击【全部闪卡】
  handleSelectGlobal('__all__');
}

function handleSelectDoc(docId: string) {
  const id = String(docId || '');
  // ✅ 移除了 __all__ 的处理（已移至【全部】区）
  // ✅ 四重筛选：设置文档筛选，保留其他条件
  activeDocId.value = id;
  // ✅ 优化：点击文档筛选时不聚焦文档列表，保持显示所有文档，方便用户切换
  shouldFocusDocList.value = false;  // ✅ 明确关闭聚焦
  void loadData();
}

function handleFilterDoc(docId: string) {
  activeDocId.value = docId;
  // ✅ 四重筛选：保留队列筛选
  // activeQueueId.value → 保留队列
  // searchQuery.value 将在下方设置为 `doc:${docId}`
  searchQuery.value = `doc:${docId}`;
}

// 🆕 过滤处理方法 (filter-group-queue-ui)
/**
 * 应用过滤条件
 * @see filter-group-queue-ui 需求 6.1, 6.2, 6.3
 */
async function handleApplyFilter(filter: CardFilter) {
  logger.info('[SiYuanMemo][SRSBrowser] Applying filter:', filter);
  
  appliedFilter.value = filter;
  showFilterDialog.value = false;
  
  // 如果当前是 filter-group 队列，设置队列的过滤条件（DDD 化）
  if (activeQueueId.value === 'filter-group') {
    try {
      const applied = await setFilterGroupFilterBridge(filter);
      if (applied) {
        logger.info('[SiYuanMemo][SRSBrowser] Filter set on FilterGroupQueue');
      }
    } catch (error) {
      logger.error('[SiYuanMemo][SRSBrowser] Failed to set filter on queue:', error);
    }
  }
  
  // 刷新数据以应用过滤
  await refreshData(false, true);
}

/**
 * 清除过滤条件
 * @see filter-group-queue-ui 需求 7.1, 7.2
 */
async function handleClearFilter() {
  logger.info('[SiYuanMemo][SRSBrowser] Clearing filter');
  
  appliedFilter.value = null;
  showFilterDialog.value = false;
  
  // 如果当前是 filter-group 队列，清除队列的过滤条件（DDD 化）
  if (activeQueueId.value === 'filter-group') {
    try {
      const cleared = await setFilterGroupFilterBridge({});
      if (cleared) {
        logger.info('[SiYuanMemo][SRSBrowser] Filter cleared on FilterGroupQueue');
      }
    } catch (error) {
      logger.error('[SiYuanMemo][SRSBrowser] Failed to clear filter on queue:', error);
    }
  }
  
  // 刷新数据以移除过滤
  await refreshData(false, true);
}

/**
 * 重新加载筛选队列
 * 
 * 类似 Anki 的 Rebuild 功能：
 * - 使用当前保存的过滤条件重新加载卡片
 * - 清除临时黑名单
 * - 刷新数据显示
 */
async function handleRebuildQueue() {
  logger.info('[SiYuanMemo][SRSBrowser] Rebuilding filter queue');
  
  if (activeQueueId.value !== 'filter-group') {
    logger.warn('[SiYuanMemo][SRSBrowser] Rebuild only works for filter-group queue');
    return;
  }
  
  try {
    const rebuilt = await rebuildFilterGroupQueueBridge();
    if (rebuilt) {
      logger.info('[SiYuanMemo][SRSBrowser] Queue rebuilt successfully');
      
      // 刷新数据显示
      await refreshData(true); // 强制刷新缓存
    } else {
      logger.error('[SiYuanMemo][SRSBrowser] Queue does not support rebuild');
    }
  } catch (error) {
    logger.error('[SiYuanMemo][SRSBrowser] Failed to rebuild queue:', error);
    await pushMsg(t('rebuildFailed', 'Failed to reload'), 3000, 'error');
  }
}

/**
 * 打开分散对话框
 * 根据 SuperMemo 设计，Spread 操作自动收集卡片：
 * - 默认：收集所有 due <= now 的 Outstanding 卡片
 * - considerFutureRepetitions: 收集所有 due <= (now + collectingPeriod) 的卡片
 * 
 * @see supermemo-reschedule-operations 需求 8.2, 10.4
 */
async function handleOpenSpreadDialog() {
  logger.info('[SiYuanMemo][SRSBrowser] Opening Spread dialog');
  
  try {
    // 🆕 根据当前模式决定使用哪些卡片
    let cardsToSpread: BrowserCard[] = [];
    const isQueueMode = activeQueueId.value === 'retrieval' || activeQueueId.value === 'incremental-learning';
    
    if (isQueueMode) {
      // 队列模式：使用当前队列的卡片（到期 + 手动添加）
      logger.info('[SiYuanMemo][SRSBrowser] Queue mode - using queue cards:', activeQueueId.value);
      cardsToSpread = rows.value;  // rows.value 已经是当前队列的卡片
    } else {
      // 全部闪卡模式：使用所有卡片
      logger.info('[SiYuanMemo][SRSBrowser] All cards mode - using allRows');
      cardsToSpread = allRows.value;
    }
    
    logger.info('[SiYuanMemo][SRSBrowser] Cards to spread:', {
      mode: activeQueueId.value || 'all',
      total: cardsToSpread.length,
      sample: cardsToSpread.slice(0, 3).map(c => ({ blockId: c.blockId, due: c.due })),
    });
    
    // 检查是否有卡片
    if (cardsToSpread.length === 0) {
      await pushMsg(t('noCards', 'No cards'));
      return;
    }
    
    // 1. 收集所有 Outstanding 卡片（due <= now）用于初始显示
    const now = Date.now();
    const outstandingCards = cardsToSpread.filter(card => {
      const dueTime = card.due instanceof Date ? card.due.getTime() : card.due;
      return dueTime <= now;
    });
    
    logger.info('[SiYuanMemo][SRSBrowser] Collected outstanding cards:', {
      total: cardsToSpread.length,
      outstanding: outstandingCards.length,
    });
    
    // 2. 打开 SpreadDialog（即使没有到期卡片也允许打开，因为可以选择"考虑未来复习"模式）
    const configManager = new ConfigManager(pluginStorage.value!);
    const dlg = createVueDialog({
      title: t('spread', '分摊复习压力'),
      component: SpreadDialog,
      props: {
        count: outstandingCards.length,  // 初始显示到期卡片数量
        configManager,
        allCards: cardsToSpread,  // 🆕 传入当前模式的卡片数据
        queueMode: isQueueMode,  // 🆕 传入队列模式标志
        i18n: props.i18n,
      },
      events: {
        confirm: async (config) => {
          dlg.destroy();
          
          // 3. 执行 Spread 操作
          // 🆕 根据配置决定传入哪些卡片：
          // - considerFutureRepetitions = true: 传入所有卡片（SpreadEngine 会根据 collectingPeriod 筛选）
          // - considerFutureRepetitions = false: 传入所有卡片（SpreadEngine 会筛选出 due <= now 的卡片）
          // 因此，无论哪种模式，都应该传入所有卡片，让 SpreadEngine 根据配置筛选
          try {
            const result = await adjustTime(
              props.plugin,
              cardsToSpread,  // 🆕 使用当前模式的卡片
              'spread',
              { config }
            );
            
            // 4. 显示结果对话框
            if (result) {
              const resultDlg = createVueDialog({
                title: t('spreadResult', '分散结果'),
                component: RescheduleResultDialog,
                props: {
                  result: {
                    success: true,  // 🆕 添加 success 字段
                    updated: typeof result.updated === 'number' ? result.updated : (result.updated?.length || 0),
                    skipped: typeof result.skipped === 'number' ? result.skipped : (result.skipped?.length || 0),
                    averageCardsPerDay: result.averageCardsPerDay,
                  },
                  operationType: 'spread',  // 🆕 修正属性名
                },
                events: {
                  close: () => {
                    resultDlg.destroy();
                  },
                },
                width: '600px',  // 🆕 增大宽度
                height: '450px',  // 🆕 增大高度
                responsive: true,  // 🆕 启用响应式
              });
            }
            
            // 5. 刷新数据
            await refreshData(true);
            await pushMsg(t('spreadSuccess', '分散操作完成'));
          } catch (err: unknown) {
            logger.error('[SiYuanMemo][SRSBrowser] Spread operation failed:', err);
            await pushErrMsg(getErrorMessage(err, t('spreadFailed', '分散操作失败')));
          }
        },
        cancel: () => {
          dlg.destroy();
        },
      },
      width: '800px',  // 🆕 增大默认宽度
      height: '85vh',  // 🆕 增大默认高度
      responsive: true,  // 🆕 启用响应式
    });
  } catch (err: unknown) {
    logger.error('[SiYuanMemo][SRSBrowser] Failed to open Spread dialog:', err);
    await pushErrMsg(getErrorMessage(err, t('openDialogFailed', '打开对话框失败')));
  }
}
</script>
