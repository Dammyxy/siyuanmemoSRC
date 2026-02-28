<template>
  <div class="card-browser" :class="[
    `card-browser--${mode}`,
    isMobileMode ? 'card-browser--mobile' : '',
    showPreview ? 'card-browser--preview-open' : ''
  ]">
    <!-- Main area: toolbar + grid -->
    <div class="card-browser__main">
      <div v-if="viewMode === 'hierarchy'" class="card-browser__hierarchy">
        <BrowserHierarchy
          :cards="rowsForFocus"
          :queues="{ active: activeQueueId || '', counts: queueCounts }"
          :focusedDocIds="focusedDocIds"
          :globalStats="globalStats"
          :mobile-mode="isMobileMode"
          :i18n="props.i18n"
          @selectQueue="handleSelectQueue"
          @selectDoc="handleSelectDoc"
          @filterDoc="handleFilterDoc"
          @selectGlobal="handleSelectGlobal"
        />
      </div>

      <div class="card-browser__content">
      <!-- Top toolbar -->
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
        :mobile-mode="isMobileMode"
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

      <!-- Sync status indicator (advanced mode only) -->
      <SyncStatusIndicator
        v-if="showSyncIndicator"
        :hybridSyncService="hybridSyncService"
        :i18n="props.i18n"
        @sync="handleSyncComplete"
      />

      <NeuralSubviewTabs
        v-if="isNeuralRoamQueueActive"
        v-model="neuralSubview"
        :tabs="neuralSubviewTabs"
      />

      <!-- Detection status hint (disabled) -->
      <!-- <div
        v-if="cardTypeDetection.isDetecting"
        class="card-browser__detection-status"
      >
        Detecting card types... ({{ cardTypeDetection.unidentifiedCount }})
      </div> -->

      <!-- Loading state -->
      <div v-if="!showNeuralCustomSubview && loading" class="card-browser__loading">
        <div class="fn__loading"></div>
      </div>
      
      <!-- Empty state -->
      <div v-else-if="!showNeuralCustomSubview && filteredCards.length === 0" class="card-browser__empty">
        <div>📭</div>
        <span>{{ t('noCards', 'No cards') }}</span>
      </div>
      
      <!-- AG-Grid table -->
      <div v-else-if="!showNeuralCustomSubview" class="card-browser__grid">
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

      <div v-else class="card-browser__neural-subview">
        <NeuralFocusList
          v-if="neuralSubview === 'focus-blocks'"
          :i18n="props.i18n"
          :session-entries="neuralSessionFocusEntries"
          :pinned-entries="neuralPinnedFocusEntries"
          :current-node-id="neuralCurrentNodeId"
          @preview="handleNeuralPreview"
          @jump="handleNeuralJump"
          @toggle-pin="handleNeuralTogglePin"
        />
        <NeuralHistoryList
          v-else
          :i18n="props.i18n"
          :entries="neuralHistoryEntries"
          :current-session-id="neuralCurrentSessionId"
          :scope="neuralHistoryScope"
          @update:scope="handleNeuralHistoryScopeChange"
          @preview="handleNeuralPreview"
          @jump="handleNeuralJump"
        />
      </div>
      </div>
    </div>
    
    <!-- Drag resizer -->
    <div 
      v-if="showPreview && !isMobileMode" 
      class="card-browser__resizer"
      :class="{ 'card-browser__resizer--dragging': isResizing }"
      @mousedown="startResize"
    ></div>
    
    <!-- Preview panel -->
    <BrowserPreview
      v-if="showPreview"
      :app="props.app"
      :i18n="props.i18n"
      :card="previewCard"
      :mode="mode"
      :size="previewSize"
      @jump="jumpToBlock"
    />

    <!-- Filter dialog (filter-group-queue-ui) -->
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
// AG Grid v35+ uses Theming API; no CSS theme import needed
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
import { type BrowserCard, type CardTypeFilter, CardState } from './types';
import { migrateExistingCards, checkMigrationNeeded } from '@/scripts/migrateToTopicItem';
import type { ICardDataSource, SortModel } from './datasource/types';
import { FinalDrillDataSource } from './datasource/FinalDrillDataSource';
import { FilterGroupDataSource } from './datasource/FilterGroupDataSource';
import { RetrievalDataSource } from './datasource/RetrievalDataSource';
import { QueryDataSource } from './datasource/QueryDataSource';
import { BlockIdsDataSource } from './datasource/BlockIdsDataSource';
import { adjustTime } from './datasource/MenuActions';  // Import adjustTime
import ActionParamsDialog from './ActionParamsDialog.vue';
import BrowserHierarchy from './BrowserHierarchy.vue';
import BrowserPreview from './BrowserPreview.vue';
import BrowserToolbar from './BrowserToolbar.vue';
import NeuralFocusList from './neural/NeuralFocusList.vue';
import NeuralHistoryList from './neural/NeuralHistoryList.vue';
import NeuralSubviewTabs from './neural/NeuralSubviewTabs.vue';
import FilterDialog from './dialogs/FilterDialog.vue';
import PostponeDialog from './dialogs/PostponeDialog.vue';
import AdvanceDialog from './dialogs/AdvanceDialog.vue';
import SpreadDialog from './dialogs/SpreadDialog.vue';
import RescheduleResultDialog from './dialogs/RescheduleResultDialog.vue';
import SyncStatusIndicator from '../components/SyncStatusIndicator.vue';  // 🆕 导入同步状指示器
import { useCardTypeDetection } from './composables/useCardTypeDetection';
import { ConfigManager } from '@/core/scheduler/ConfigManager';
import type { RescheduleStoragePort } from '@/core/scheduler/ports';
import { createColumnDefs } from './config';
import type {
  BrowserCardTypeFilter,
  CardFilter,
  IReviewQueue,
  IUnifiedDataSourceManagerFacade,
  NeuralRoamHistoryEntry,
} from '@/types/unified-data-source';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
import { filterService } from './services/FilterService';
import type { HistoryScope, NeuralListEntry, NeuralSubview } from './neural/types';
import { 
  CARD_STATE_COLORS, 
  DEFAULT_PRIORITY, 
  SORT_FIELD_CONFIGS, 
  type SortFieldConfig,
  PREVIEW_SIZE_MIN,
  PREVIEW_SIZE_MAX,
  DEFAULT_PREVIEW_SIZE,
} from './constants';
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

// Register AG-Grid modules
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
  getTabApplicationService?: () => BrowserTabApplicationServicePort | null;
  getHybridSyncService?: () => unknown;
  getDialogManager?: () => unknown;
};

type BrowserPluginPort = IPluginFacade & {
  getContext?: () => BrowserPluginContext | null;
  isMobile?: boolean;
};

type BrowserTabApplicationServicePort = {
  openDocumentTab: (params: { docId: string }) => Promise<void> | void;
};

const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: 'dialog' | 'tab' | 'dock';
  mobileMode?: boolean;
  plugin?: BrowserPluginPort;
  browserService?: IBrowserApplicationService;
  tabApplicationService?: BrowserTabApplicationServicePort;
  initialQueueId?: string;
  initialNeuralSubview?: NeuralSubview;
}>();

const mode = computed(() => props.mode || 'dialog');
const isMobileMode = computed(() => {
  if (typeof props.mobileMode === 'boolean') {
    return props.mobileMode;
  }
  return props.plugin?.isMobile === true;
});

const pluginContext = computed(() => props.plugin?.getContext?.() || null);
const tabApplicationServiceRef = computed(
  () => props.tabApplicationService || pluginContext.value?.getTabApplicationService?.() || null
);

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

// 🆕 同步状指示器相关
const hybridSyncService = computed(() => pluginContext.value?.getHybridSyncService?.());
const showSyncIndicator = computed(() => {
  const storage = pluginStorage.value;
  if (!storage) return false;

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
const allRows = ref<BrowserCard[]>([]);
const currentDataSource = ref<ICardDataSource | null>(null);
const currentPreset = ref<PresetFilter>('all');
const currentCardType = ref<CardTypeFilter>('all');
const selectedRows = ref<BrowserCard[]>([]);
const gridApi = ref<GridApi | null>(null);
const currentSortModel = ref<SortModel[]>([]);
const currentSortField = ref<SortField>('due');
const currentSortOrder = ref<SortOrder>('asc');
const searchQuery = ref('');
const viewMode = ref<'flat' | 'hierarchy'>(isMobileMode.value ? 'flat' : 'hierarchy');
const activeQueueId = ref<string | null>(null);
const activeDocId = ref<string | null>(null);
const queueCounts = ref<Record<string, number>>({ ...EMPTY_QUEUE_COUNTS });
const neuralSubview = ref<NeuralSubview>('concept-cards');
const neuralHistoryScope = ref<HistoryScope>('all');
const neuralSessionFocusEntries = ref<NeuralListEntry[]>([]);
const neuralPinnedFocusEntries = ref<NeuralListEntry[]>([]);
const neuralHistoryEntries = ref<NeuralListEntry[]>([]);
const neuralCurrentNodeId = ref<string | null>(null);
const neuralCurrentSessionId = ref<string | null>(null);
let neuralPreviewRequestSeq = 0;

const appliedFilter = ref<CardFilter | null>(null);
const showFilterDialog = ref(false);

let detectionTriggered = false;

const showPreview = ref(!isMobileMode.value);
const previewCard = ref<BrowserCard | null>(null);

const isResizing = ref(false);

const calculateInitialPreviewSize = (): number => {
  if (isMobileMode.value) {
    return DEFAULT_PREVIEW_SIZE.tab;
  }

  if (mode.value !== 'dialog') {
    return DEFAULT_PREVIEW_SIZE.tab;
  }
  
  const dialogWidth = window.innerWidth;
  

  if (dialogWidth < 1024) {
    return 280;
  } else if (dialogWidth < 1440) {
    // 中等屏幕：预览区 320px
    return 320;
  } else if (dialogWidth < 1920) {
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

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function normalizeQueueId(value: string | null | undefined): string | null {
  const qid = String(value || '').trim();
  if (!qid) {
    return null;
  }
  if (qid === 'neural') {
    return 'neural-roam';
  }
  return qid;
}

async function openDocumentTabById(blockId: string): Promise<boolean> {
  const tabApplicationService = tabApplicationServiceRef.value;
  if (!tabApplicationService) {
    await pushErrMsg(t('envNotInit', 'Environment not initialized, cannot open tab'));
    return false;
  }
  await Promise.resolve(tabApplicationService.openDocumentTab({ docId: blockId }));
  return true;
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

const columnDefs = ref<ColDef[]>(createColumnDefs(t));

const isQueueMode = computed(() => {
  const qid = String(activeQueueId.value || '');
  return qid === 'final-drill'
    || qid === 'retrieval'
    || qid === 'filter-group'
    || qid === 'neural-roam'
    || qid === 'neural'
    || qid === 'incremental-learning';
});

// Current queue type (filter-group-queue-ui)
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

const isNeuralRoamQueueActive = computed(() => currentQueueType.value === 'neural-roam');
const showNeuralCustomSubview = computed(() =>
  isNeuralRoamQueueActive.value && neuralSubview.value !== 'concept-cards'
);
const neuralSubviewTabs = computed(() => ([
  { id: 'concept-cards' as const, label: t('conceptCards', 'Concept Cards') },
  { id: 'focus-blocks' as const, label: t('focusBlocks', 'Focus Blocks') },
  { id: 'roam-history' as const, label: t('roamHistory', 'Roam History') },
]));

// 始终启用 sortable，过 canApplySortToQueue 控制按钮显示
const defaultColDef: ColDef = {
  resizable: true,
  sortable: true,
};

const hasConfirmedSqlMode = ref(false);
async function ensureSqlModeConfirmed(): Promise<boolean> {
  if (hasConfirmedSqlMode.value) return true;
  const ok = await confirmDialog({
    title: t('sqlModeTitle', 'SQL 鏌ヨ妯″紡'),
    content: t('sqlModeWarning', 'SQL 鏌ヨ涓洪珮绾у姛鑳斤紝鎷ユ湁璇诲彇鎵€鏈夊潡淇℃伅鐨勬潈闄愩€傝浠呮墽琛屼綘淇′换鐨?SQL銆傛槸鍚︾户缁紵'),
    confirmText: t('confirm', '纭'),
    cancelText: t('cancel', '鍙栨秷'),
  });
  if (ok) hasConfirmedSqlMode.value = true;
  return ok;
}


const shouldFocusDocList = ref(false);


const rowsForFocus = ref<BrowserCard[]>([]);

const scopedRows = computed(() => {
  // 处理丢失闪卡
  if (activeDocId.value === '__lost__') {
    return rows.value.filter((c) => !String(c.rootId || ''));
  }
  
  if (activeDocId.value) {
    return rows.value.filter((c) => c.rootId === activeDocId.value);
  }
  
  return rows.value;
});

const focusedDocIds = computed(() => {

  if (!shouldFocusDocList.value) {
    if (isDevMode) {
      logger.info('[SiYuanMemo][SRSBrowser] 馃攳 focusedDocIds: shouldFocusDocList is false, returning null');
    }
    return null;
  }

  // 提取 rowsForFocus 中所有的文档 ID（仅应用队列/搜索/preset 筛，不包含文档筛选）
  const docs = new Set<string>();
  for (const card of rowsForFocus.value) {
    if (card.rootId) {
      docs.add(card.rootId);
    }
  }
  
  const result = docs.size > 0 ? Array.from(docs) : null;
  
  if (isDevMode) {

    const allRootIds = rowsForFocus.value.map(c => ({ blockId: c.blockId, rootId: c.rootId }));
    const rootIdCounts = new Map<string, number>();
    for (const card of rowsForFocus.value) {
      if (card.rootId) {
        rootIdCounts.set(card.rootId, (rootIdCounts.get(card.rootId) || 0) + 1);
      }
    }

    logger.info('[SiYuanMemo][SRSBrowser] 馃攳 focusedDocIds computed:', {
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
  
  if (result === null && rowsForFocus.value.length > 0) {
    logger.warn('[SiYuanMemo][SRSBrowser] 鈿狅笍 All cards missing rootId, cannot focus documents');
  }
  
  return result;
});

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


let loadDataAbortController: AbortController | null = null;

async function loadData(forceRefresh = false) {
  if (loadDataAbortController) {
    loadDataAbortController.abort();
    logger.info('[SiYuanMemo][SRSBrowser] Previous loadData() aborted');
  }
  
  // Create a new AbortController
  loadDataAbortController = new AbortController();
  const currentController = loadDataAbortController;
  
  loading.value = true;
  hasRandomSort.value = false;
  try {
    if (currentController.signal.aborted) {
      logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted before execution');
      return;
    }
    
    selectedRows.value = [];
    previewCard.value = null;

    // ========================================================================
    // 队列模式：使用数据源工厂创建数据源（支持 cardType 筛）
    // ========================================================================
    if (activeQueueId.value) {
      logger.info('[SiYuanMemo][SRSBrowser] 馃攳 Using data source for queue:', activeQueueId.value);
      logger.info('[SiYuanMemo][SRSBrowser] 馃攳 Current cardType filter:', currentCardType.value);
      

      const options = {
        docId: null,
        preset: currentPreset.value,
        queryText: searchQuery.value,
        cardType: currentCardType.value as BrowserCardTypeFilter,
      };
      
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
        props.plugin
      );
      
      if (!currentDataSource.value) {
        logger.error('[SiYuanMemo][SRSBrowser] Failed to create data source for queue:', activeQueueId.value);
        rows.value = [];
        rowsForFocus.value = [];
        return;
      }
      
      // 执行数据加载
      await executeFetchRows(forceRefresh);
      
      if (currentController.signal.aborted) {
        logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted after executeFetchRows (queue mode)');
        return;
      }
      
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
      

      // await refreshQueueCounts();
      if (currentQueueType.value === 'neural-roam') {
        await refreshNeuralSubviewData();
      } else {
        clearNeuralSubviewData();
      }
      return;
    }

    clearNeuralSubviewData();

    // ========================================================================
    // ========================================================================
    const sqlStmt = extractSqlStatement(searchQuery.value);
    if (sqlStmt != null) {
      const ok = await ensureSqlModeConfirmed();
      if (!ok) return;
      activeQueueId.value = null;
      activeDocId.value = null;
      shouldFocusDocList.value = false;
      currentDataSource.value = createQueryDataSource(sqlStmt);
      
      // 执行数据加载
      await executeFetchRows(forceRefresh);
    } else {
      logger.info('[SiYuanMemo][SRSBrowser] 馃啎 Using browserService for non-queue mode');
      
      if (!props.browserService) {
        logger.error('[SiYuanMemo][SRSBrowser] 鉂?browserService is required!');
        await pushErrMsg(t('envNotInit', 'Environment not initialized'));
        rows.value = [];
        rowsForFocus.value = [];
        allRows.value = [];
        return;
      }
      
      try {
        logger.info('[SiYuanMemo][SRSBrowser] 馃攳 Calling browserService.getBrowserCards with:', {
          preset: currentPreset.value,
          searchText: searchQuery.value,
          cardTypes: currentCardType.value !== 'all' ? [currentCardType.value.replace('-only', '')] : undefined,
          currentCardTypeRaw: currentCardType.value,
          sortBy: currentSortField.value,
          sortOrder: currentSortOrder.value,
        });
        
        const result = await props.browserService.getBrowserCards({
          preset: currentPreset.value,
          searchText: searchQuery.value,
          cardTypes: currentCardType.value !== 'all' ? [currentCardType.value.replace('-only', '')] : undefined,
          sortBy: currentSortField.value,
          sortOrder: currentSortOrder.value,
          forceRefresh,
          pageSize: 10000,
        });
        
        logger.info('[SiYuanMemo][SRSBrowser] 鉁?Loaded cards via browserService:', {
          count: result.cards.length,
          total: result.total,
          stats: result.stats,
        });
        
        rows.value = result.cards;
        allRows.value = result.cards;  // Full dataset
        rowsForFocus.value = result.cards;
        

        if (props.browserService) {
          currentDataSource.value = props.browserService.createDataSource({
            type: 'deck',
            preset: currentPreset.value,
            queryText: searchQuery.value,
            cardType: currentCardType.value as BrowserCardTypeFilter,
            plugin: props.plugin,
          });
        } else {
          currentDataSource.value = null;
        }
      } catch (error) {
        logger.error('[SiYuanMemo][SRSBrowser] 鉂?Failed to load cards via browserService:', error);
        rows.value = [];
        rowsForFocus.value = [];
        allRows.value = [];
      }
    }

    if (currentController.signal.aborted) {
      logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted after executeFetchRows (non-queue mode)');
      return;
    }


    // await refreshQueueCounts();
  } catch (err) {
    logger.error('[SiYuanMemo][CardBrowser] Load data error:', err);
    rows.value = [];
  } finally {
    if (!currentController.signal.aborted) {
      loading.value = false;
      
      // 注意：观察回调中的更新不会走到这里，避免重复调用
      void refreshQueueCounts();
    }
    
    // Clean up controller
    if (loadDataAbortController === currentController) {
      loadDataAbortController = null;
    }
  }
}

/**
 * 鎵ц瀹為檯鐨勮鏁版嵁鑾峰彇
 */
async function executeFetchRows(forceRefresh = false) {
  if (!currentDataSource.value) return;


  const { rows: fetchedRows } = await PerformanceMonitor.measure('fetchRows', () => 
    currentDataSource.value!.fetchRows({ sortModel: [], filterModel: {} })
  );
  rows.value = fetchedRows;

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


  if (shouldFocusDocList.value) {
    const focusOptions = {
      preset: currentPreset.value,
      queryText: searchQuery.value,
      cardType: currentCardType.value as BrowserCardTypeFilter,
    };

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
      props.plugin
    );

    if (dataSourceForFocus) {
      const { rows: focusRows } = await PerformanceMonitor.measure('fetchRowsFocus', () => 
        dataSourceForFocus!.fetchRows({ sortModel: [], filterModel: {} })
      );
      rowsForFocus.value = focusRows;

      if (isDevMode) {
        // Debug: show rootId of all cards
        logger.info('[SiYuanMemo][SRSBrowser] 馃攳 rowsForFocus after fetch:', {
          count: focusRows.length,
          allRootIds: focusRows.map(c => ({ blockId: c.blockId, rootId: c.rootId })),
        });
      }
    }
  } else {
    rowsForFocus.value = fetchedRows;

    if (isDevMode) {
      // Debug: show rootId of all cards
      logger.info('[SiYuanMemo][SRSBrowser] 馃攳 rowsForFocus (using fetchedRows):', {
        count: fetchedRows.length,
        allRootIds: fetchedRows.map(c => ({ blockId: c.blockId, rootId: c.rootId })),
      });
    }
  }
}

// Search handling
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSqlStmt: string | null = null;
let lastSearchQuery: string = '';
function handleSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const current = extractSqlStatement(searchQuery.value);
    const queryChanged = searchQuery.value !== lastSearchQuery;
    const sqlChanged = current !== lastSqlStmt;

    if (queryChanged || sqlChanged) {
      lastSqlStmt = current;
      lastSearchQuery = searchQuery.value;
      shouldFocusDocList.value = true;
      void loadData();
    }
  }, 150);
}

// Watch searchQuery changes
watch(searchQuery, () => {
  handleSearchInput();
  // Update global browser context (DDD)
  const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
  if (unifiedDataSourceManager) {
    setGlobalBrowserContext(unifiedDataSourceManager, searchQuery.value, browserSiyuanApi.value);
  }
});

watch(currentPreset, () => {
  void refreshData();
});

watch(currentCardType, () => {
  void refreshData(true);
});

watch([neuralSubview, neuralHistoryScope], () => {
  if (isNeuralRoamQueueActive.value) {
    void refreshNeuralSubviewData();
  }
});

/*
watch(() => loading.value, async (isLoading) => {

  if (isLoading) {
    detectionTriggered = false;
  }

  if (!isLoading && !detectionTriggered && !cardTypeDetection.isDetecting.value && cardTypeDetection.unidentifiedCount.value > 0) {
    detectionTriggered = true;

    logger.info('[SiYuanMemo][SRSBrowser] 馃攧 Auto-detecting unidentified cards...');

    const unidentified = cardTypeDetection.getUnidentifiedCards();
    const blockIds = unidentified.map(c => c.blockId);


    if (blockIds.length === 0) {
      logger.info('[SiYuanMemo][SRSBrowser] No cards to detect (race condition detected)');
      return;
    }

    await cardTypeDetection.detect();


    const updatedCards = await loadQueueCardsSimple(blockIds);
    const updatedMap = new Map(updatedCards.map(c => [c.blockId, c]));

    // 更新 rows.value 中对应的卡片
    for (const card of rows.value) {
      const updated = updatedMap.get(card.blockId);
      if (updated) {
        Object.assign(card, updated);
      }
    }

    if (gridApi.value) {
      gridApi.value.refreshCells();
    }
  }
});
*/

const rowSelection = ref<RowSelectionOptions>({
  mode: 'multiRow',
  checkboxes: true,
  headerCheckbox: true,
  enableClickSelection: false,
});

// AG-Grid performance settings
const gridOptions = {
  animateRows: false,  // Disable row animation for performance
  suppressCellFocus: true,  // Disable cell focus to reduce re-render
  suppressRowHoverHighlight: false,  // 保留悬停高亮
  enableCellTextSelection: true,  // Keep text selection enabled
  rowBuffer: 10,  // 缓冲 10 行（默认值）
};

// Grid events
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

  if (sortArray.length > 0) {
    const firstSort = sortArray[0];
    currentSortField.value = firstSort.colId || 'due';
    currentSortOrder.value = firstSort.sort || 'asc';
    hasRandomSort.value = false;
  } else {
    currentSortField.value = 'due';
    currentSortOrder.value = 'asc';
  }

  // Check whether sort actually changed
  const api = params?.api || gridApi.value;
  logger.info('[SiYuanMemo][CardBrowser] onSortChanged:', {
    sortModel: currentSortModel.value,
    sortModelLength: currentSortModel.value?.length,
    sortModelArray: sortArray,
    currentSortField: currentSortField.value,
    currentSortOrder: currentSortOrder.value,
    activeQueueId: activeQueueId.value,
    canApply: canApplySortToQueue.value,
    hasGetSortModel: typeof api?.getSortModel === 'function',
    hasGetDisplayedRowCount: typeof api?.getDisplayedRowCount === 'function',
    hasGetColumnState: typeof api?.getColumnState === 'function',
    columnState: (api?.getColumnState?.() ?? []).filter((c: ColumnState) => c.colId === 'priority'),
  });

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
  
  if (isMultiSelect) {
    return;
  }
  
  previewCard.value = event.data;
}

async function onRowDoubleClicked(event: RowDoubleClickedEvent<BrowserCard>) {
  const blockId = event.data?.blockId;
  if (!blockId) {
    logger.warn('[SiYuanMemo][CardBrowser] No blockId found in row data:', event.data);
    return;
  }
  
  await openDocumentTabById(blockId);
}

// Resizer drag logic
function startResize(e: MouseEvent) {
  if (isMobileMode.value) {
    return;
  }

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
    // Dialog mode drags left; Tab/Dock mode drags up
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

// Jump to block
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
        confirmText: t('confirm', '纭'),
        cancelText: t('cancel', '鍙栨秷'),
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
    // Use new PostponeDialog
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
        responsive: true,
      });
    });
  },
  advance: async (cards) => {
    // Use new AdvanceDialog
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
        responsive: true,
      });
    });
  },
  spread: async (cards) => {
    // Use new SpreadDialog
    return new Promise((resolve) => {
      const configManager = new ConfigManager(pluginStorage.value!);
      const dlg = createVueDialog({
        title: t('spread', 'Spread Workload'),
        component: SpreadDialog,
        props: {
          count: cards.length,
          configManager,
          allCards: allRows.value,
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
    'delete-card': { key: 'deleteCard', fallback: '鍙栨秷闂崱' },
    'add-to-queue': { key: 'addToQueueMenu', fallback: '鍔犲叆闃熷垪' },
    'add-to-retrieval-queue': { key: 'addToRetrievalQueue', fallback: '鎻愬彇缁冧範' },
    'add-to-incremental-queue': { key: 'addToIncrementalQueue', fallback: '娓愯繘瀛︿範' },
    'add-to-final-drill-queue': { key: 'addToFinalDrillQueue', fallback: '鍒绘剰缁冧範' },
    'add-to-filter-group-queue': { key: 'addToFilterGroupQueue', fallback: 'Filter Group Review' },
    'add-to-neural-roam-queue': { key: 'addToNeuralRoamQueue', fallback: '绁炵粡婕父' },
    dismiss: { key: 'dismiss', fallback: 'Dismiss' },
    'insert-at': { key: 'insertAt', fallback: 'Insert at' },
    'set-priority': { key: 'setPriority', fallback: 'Set Priority' },
    'auto-sort': { key: 'autoSortQueue', fallback: 'Auto Sort' },
  };
  const m = map[action.id];
  if (!m) return action.label;
  return t(m.key, action.label || m.fallback);
}

function getReviewSubsetAction() {
  return {
    id: 'review-subset',
    label: t('reviewSubset', 'Review Subset'),
    icon: 'iconPlay',
  };
}

function ensureReviewSubsetAction(actions: Array<{ id: string; label: string; icon?: string }>) {
  if (typeof props.plugin?.openSubsetReviewDialog !== 'function') {
    return actions;
  }

  if (actions.some((action) => action.id === 'review-subset')) {
    return actions;
  }

  return [getReviewSubsetAction(), ...actions];
}

function resolveSubsetBlockIds(cards: BrowserCard[]): string[] {
  return Array.from(
    new Set(
      (cards || [])
        .map((card) => String(card?.blockId || ''))
        .filter(Boolean)
    )
  );
}

function resolvePreferredSubsetCardId(cards: BrowserCard[], anchorRow?: BrowserCard): string {
  const preferredFromAnchor = String(anchorRow?.id || '').trim();
  if (preferredFromAnchor) {
    return preferredFromAnchor;
  }
  return String(cards?.[0]?.id || '').trim();
}

async function openSubsetReviewFromSelection(cards: BrowserCard[], anchorRow?: BrowserCard): Promise<void> {
  if (typeof props.plugin?.openSubsetReviewDialog !== 'function') {
    await pushErrMsg(t('initFailed', 'FSRS plugin initialization failed, please check console for errors'));
    return;
  }

  const blockIds = resolveSubsetBlockIds(cards);
  if (blockIds.length === 0) {
    await pushErrMsg(t('drillNoCards', 'No flashcards available in the current range'));
    return;
  }

  const preferredCardId = resolvePreferredSubsetCardId(cards, anchorRow);
  await Promise.resolve(
    props.plugin.openSubsetReviewDialog(blockIds, {
      preferredCardId: preferredCardId || undefined,
    })
  );
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
      await openDocumentTabById(blockId);
      return;
    }
    await pushErrMsg(t('envNotInit', 'Environment not initialized, cannot open tab'));
    return;
  }

  if (actionId === 'review-subset') {
    await openSubsetReviewFromSelection(targetCards, anchorRow);
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
      || actionId === 'delete-card'
      || actionId === 'insert-at'
      || actionId === 'auto-sort'
      || actionId === 'reset'
      || actionId === 'suspend'
      || actionId === 'postpone'
      || actionId === 'advance'
    ) {
      if (actionId === 'delete-card') {
        logger.debug('invalidate card cache after delete-card');
        invalidateCardCache();
      }
      
      // Force refresh after postpone/advance to show new due date
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

// Context menu
function onCellContextMenu(event: CellContextMenuEvent) {
  event.event?.preventDefault();
  
  const ds = currentDataSource.value;
  
  const rawActions = ds?.getSupportedActions?.() || [];
  const actions = ensureReviewSubsetAction(rawActions.filter(a => a && a.id));
  logger.debug('context menu actions:', {
    rawCount: rawActions.length,
    validCount: actions.length,
    dataSourceType: ds?.constructor?.name,
    dataSourceId: ds?.id,
  });
  
  const menu = new Menu('card-browser-context');
  const rowData = event.data as BrowserCard;
  const selected = selectedRows.value?.length ? selectedRows.value : [rowData];

  if (isNeuralRoamQueueActive.value && neuralSubview.value === 'concept-cards') {
    const neuralQueue = getNeuralRoamQueue();
    if (neuralQueue) {
      const pinnedIds = new Set(neuralPinnedFocusEntries.value.map((entry) => entry.nodeId));
      const selectedIds = selected.map((row) => String(row.blockId || '')).filter(Boolean);
      const allPinned = selectedIds.length > 0 && selectedIds.every((id) => pinnedIds.has(id));

      menu.addItem({
        icon: 'iconPin',
        label: allPinned ? t('unpinFocus', '取消置顶焦点') : t('pinFocus', '置顶焦点'),
        click: () => {
          void (async () => {
            for (const blockId of selectedIds) {
              await neuralQueue.setPinnedFocusBlock(blockId, !allPinned);
            }
            await refreshNeuralSubviewData();
          })();
        },
      });
      menu.addItem({ type: 'separator' });
    }
  }

  // ========== Add sort menu ==========
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

  sortMenu.push({ type: 'separator' });

  // Add random sort
  sortMenu.push({
    icon: 'iconRefresh',
    label: t('sortRandom', 'Random Sort'),
    click: () => {
      logger.debug('menu click random sort');
      applyRandomSort();
    },
  });

  // Insert sort menu
  menu.addItem({
    icon: 'iconSort',
    label: t('sortMenu', 'Sort'),
    submenu: sortMenu,
  });

  // Add separator between sort and existing actions
  menu.addItem({ type: 'separator' });

  const cardTypeMenu: BrowserMenuItem[] = buildCardTypeSubmenu(selected);

  menu.addItem({
    icon: 'iconHR',
    label: t('cardTypeMenu', 'Card Type'),
    submenu: cardTypeMenu,
  });

  // Add separator between card-type menu and existing actions
  menu.addItem({ type: 'separator' });

  logger.debug('rendering context actions:', actions.length);
  
  for (const action of actions) {
    if (!action || !action.id) {
      logger.warn('skip invalid action:', action);
      continue;
    }
    
    if (action.submenu && action.submenu.length > 0) {

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
      // 处理普菜单项
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

// Batch menu
function showBatchMenu(event?: MouseEvent) {
  const menu = new Menu('card-browser-batch');

  const ds = currentDataSource.value;
  const actions = ensureReviewSubsetAction((ds?.getSupportedActions?.() || []).filter(action => action && action.id));
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

// Refresh data
async function refreshData(forceRefresh = false, preserveFocusState = false) {
  selectedRows.value = [];
  previewCard.value = null;


  if (!preserveFocusState) {
    shouldFocusDocList.value = true;
  }
  

  if (!forceRefresh) {
    const cacheStats = getCacheStats();
    if (cacheStats.valid) {
      logger.info(
        `[SiYuanMemo][CardBrowser] Cache valid: ${cacheStats.count} cards, age ${Math.round(cacheStats.age / 1000)}s`
      );
    } else {
      logger.info('[SiYuanMemo][CardBrowser] Cache invalid or expired, reloading data');
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
    if (isNeuralRoamQueueActive.value) {
      void refreshNeuralSubviewData();
    }
  },
  onModeSwitched: () => {
    logger.info('[SiYuanMemo][SRSBrowser] Reloading data due to mode switch');
    void loadData();
  },
});

// 切换预设
function handlePresetChange() {
  void refreshData();
}

// Switch card type
function handleCardTypeChange() {
  void refreshData(true);  // forceRefresh = true
}

// Force refresh data (clear cache)
function forceRefreshData() {
  invalidateCardCache();
  void refreshData(true);
}

// 🆕 处理同步完成事件
function handleSyncComplete(type: 'incremental' | 'full') {
  logger.info('[SiYuanMemo][SRSBrowser] Sync completed:', type);
  forceRefreshData();
}

// Show performance report
function showPerformanceReport() {
  PerformanceMonitor.printReport();
  
  // 显示缓存统计
  const cacheStats = getCacheStats();
  logger.info('馃搳 缂撳瓨缁熻:', cacheStats);
  
  void pushMsg('Performance report printed to console', 2000);
}

// Cleanup
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
});

onMounted(() => {
  if (isMobileMode.value) {
    viewMode.value = 'flat';
    showPreview.value = false;
  } else {
    try {
      const stored = localStorage.getItem('fsrs-card-browser:viewMode');
      if (stored === 'flat' || stored === 'hierarchy') {
        viewMode.value = stored;
      }
    } catch {}
  }

  if (isMobileMode.value) {
    try {
      localStorage.removeItem('fsrs-card-browser:viewMode');
    } catch {}
  } else {
    try {
      localStorage.setItem('fsrs-card-browser:viewMode', viewMode.value);
    } catch {}
  }

  // 🆕 初始化全屢浏览器上下文（DDD 化）
  const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
  if (unifiedDataSourceManager) {
    setGlobalBrowserContext(unifiedDataSourceManager, searchQuery.value, browserSiyuanApi.value);
    logger.info('[SiYuanMemo][SRSBrowser] Global browser context initialized');
  } else {
    logger.warn('[SiYuanMemo][SRSBrowser] UnifiedDataSourceManager not available, global context not initialized');
  }

  initBrowserAdapter();

  // Subscribe to incremental updates
  unsubscribe = subscribeCacheUpdate((cards, isComplete) => {
    allRows.value = cards;
    

    if (!activeQueueId.value && !loading.value) {
      if (isComplete || (cards.length > 0 && cards.length % 500 === 0)) {
        executeFetchRows(false);
      }
    }
  });

  const hybridService = hybridSyncService.value;
  if (hybridService) {
    // Listen for wsSync events (WebSocket sync completion)
    hybridService.on('wsSync', (event: WsSyncEvent) => {
      logger.info('[SiYuanMemo][SRSBrowser] Received wsSync event:', event);
      
      if (event.success) {
        logger.info('[SiYuanMemo][SRSBrowser] 鈿?Reloading data due to WebSocket sync...');
        void loadData(true); // Force refresh cache
      } else {
        logger.error('[SiYuanMemo][SRSBrowser] WebSocket sync failed:', event.error);
        // 同步失败，也尝试刷新数据（使用缓存）
        void loadData();
      }
    });
    
    logger.info('[SiYuanMemo][SRSBrowser] 鉁?Subscribed to HybridSyncService wsSync events');
  }

  // 🆕 触发同步（如果启用）
  if (hybridService) {
    const storage = pluginStorage.value;
    const riffConfig = storage?.getSettings?.()?.riffIntegration;
    

    logger.info('[SiYuanMemo][SRSBrowser] 馃攳 Checking auto-sync configuration:', {
      hasHybridSyncService: !!hybridService,
      hasRiffConfig: !!riffConfig,
      mode: riffConfig?.mode,
      incrementalSyncEnabled: riffConfig?.incrementalSync?.enabled,
      fullSyncEnabled: riffConfig?.fullSync?.enabled,
      triggers: riffConfig?.incrementalSync?.triggers,
      hasBrowserOpenTrigger: riffConfig?.incrementalSync?.triggers?.includes('browser-open')
    });
    
    const isAdvancedMode = !riffConfig?.mode || riffConfig.mode === 'advanced';
    
    const shouldSyncOnBrowserOpen = riffConfig?.incrementalSync?.enabled && 
                                    riffConfig?.incrementalSync?.triggers?.includes('browser-open');
    
    if (isAdvancedMode && shouldSyncOnBrowserOpen) {
      logger.info('[SiYuanMemo][SRSBrowser] 鉁?Triggering incremental sync on browser open...');
      
      void (async () => {
        try {
          await hybridService.incrementalSync();
          logger.info('[SiYuanMemo][SRSBrowser] 鉁?Incremental sync completed, reloading data...');
          await applyInitialBrowserView(true);
        } catch (err) {
          logger.error('[SiYuanMemo][SRSBrowser] 鉂?Incremental sync failed:', err);
          await applyInitialBrowserView(false);
        }
      })();
      
      return;
    } else {
      logger.info('[SiYuanMemo][SRSBrowser] 鈿狅笍 Auto-sync not triggered, loading data without sync', {
        isAdvancedMode,
        shouldSyncOnBrowserOpen,
        reason: !shouldSyncOnBrowserOpen ? 'browser-open trigger not configured' : 'not advanced mode'
      });
    }
  } else {
    logger.info('[SiYuanMemo][SRSBrowser] 鈿狅笍 HybridSyncService not available');
  }

  void applyInitialBrowserView(false);
});

function toggleViewMode() {
  viewMode.value = viewMode.value === 'flat' ? 'hierarchy' : 'flat';
  if (isMobileMode.value) {
    return;
  }
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

  // 1. Retrieval practice
  menu.addItem({
    icon: 'iconRiffCard',
    label: t('practiceExtract', 'Retrieval Practice'),
    click: () => {
      void dialogManager.openReviewDialog?.();
    },
  });

  // 2. Incremental learning
  menu.addItem({
    icon: 'iconBook',
    label: t('incrementalLearning', 'Incremental Learning'),
    click: () => {
      void dialogManager.openIncrementalLearningDialog?.();
    },
  });

  // 3. Deliberate practice
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

  menu.addItem({
    icon: 'iconList',
    label: t('practiceFilterGroup', 'Filtered Review'),
    click: () => {
      void dialogManager.openFilterGroupPracticeDialog?.();
    },
  });

  // menu.addItem({
  //   icon: 'iconBug',
  //   label: t('practiceLeech', 'Leech review'),
  //   click: () => {
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
    void pushErrMsg('鎵撳紑缁冧範鑿滃崟澶辫触');
    return;
  }

  if (String(process.env.DEV_MODE) === 'true') {
    logger.info('[SiYuanMemo][CardBrowser] openPracticeMenu', { pos, hasDialogManager: Boolean(dialogManager) });
  }

  const safePos = (() => {
    const padding = 8;
    if (!isMobileMode.value) {
      return pos;
    }
    const estimatedMenuWidth = 220;
    return {
      x: Math.max(padding, Math.min(pos.x, window.innerWidth - estimatedMenuWidth - padding)),
      y: Math.max(padding, Math.min(pos.y, window.innerHeight - padding)),
    };
  })();

  setTimeout(() => {
    try {
      menu.open({ x: safePos.x, y: safePos.y, isLeft: !isMobileMode.value });
    } catch (err) {
      logger.error('[SiYuanMemo][CardBrowser] openPracticeMenu failed:', err);
      void pushErrMsg('鎵撳紑缁冧範鑿滃崟澶辫触');
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

function getNeuralRoamQueue() {
  const queue = getQueueById('neural-roam');
  if (!queue || !isNeuralRoamSessionQueue(queue)) {
    return null;
  }
  return queue;
}

function toNeuralListEntries(entries: NeuralRoamHistoryEntry[], pinnedIds = new Set<string>()): NeuralListEntry[] {
  return [...entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .map((entry) => ({
      ...entry,
      pinned: pinnedIds.has(entry.nodeId),
    }));
}

function clearNeuralSubviewData(): void {
  neuralSessionFocusEntries.value = [];
  neuralPinnedFocusEntries.value = [];
  neuralHistoryEntries.value = [];
  neuralCurrentNodeId.value = null;
  neuralCurrentSessionId.value = null;
}

async function refreshNeuralSubviewData(): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    clearNeuralSubviewData();
    return;
  }

  const pinned = neuralQueue.getPinnedFocusBlocks();
  const pinnedIds = new Set(pinned.map((entry) => entry.nodeId));
  neuralPinnedFocusEntries.value = toNeuralListEntries(pinned, pinnedIds);
  neuralSessionFocusEntries.value = toNeuralListEntries(neuralQueue.getSessionFocusStack(), pinnedIds);
  neuralHistoryEntries.value = toNeuralListEntries(neuralQueue.getHistorySnapshot(), pinnedIds);

  const navState = neuralQueue.getNavigationState();
  neuralCurrentNodeId.value = navState.currentNodeId;
  neuralCurrentSessionId.value = navState.sessionId;
}

async function handleNeuralPreview(nodeId: string): Promise<void> {
  const requestSeq = ++neuralPreviewRequestSeq;
  const cards = await loadQueueCardsSimple([nodeId]);
  if (requestSeq !== neuralPreviewRequestSeq) {
    return;
  }
  previewCard.value = cards[0] || null;
}

async function handleNeuralJump(nodeId: string): Promise<void> {
  await handleNeuralPreview(nodeId);

  const neuralQueue = getNeuralRoamQueue();
  const jumped = neuralQueue ? await neuralQueue.jumpToHistoryNode(nodeId) : false;
  await refreshNeuralSubviewData();

  const dialogManager = pluginContext.value?.getDialogManager?.();
  if (!dialogManager?.openNeuralRoamDialog) {
    return;
  }

  if (jumped) {
    await dialogManager.openNeuralRoamDialog();
    return;
  }

  await dialogManager.openNeuralRoamDialog({
    focusBlockId: nodeId,
    includeFocusAsFirst: true,
    resetHistory: false,
  });
}

async function handleNeuralTogglePin(nodeId: string, pinned: boolean): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }
  await neuralQueue.setPinnedFocusBlock(nodeId, pinned);
  await refreshNeuralSubviewData();
}

function handleNeuralHistoryScopeChange(scope: HistoryScope): void {
  neuralHistoryScope.value = scope;
}

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

const cardTypeDetection = useCardTypeDetection(() => rows.value);


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
  logger.info('[SiYuanMemo][SRSBrowser] 馃攳 handleSelectQueue called:', {
    queueId,
    beforeActiveDocId: activeDocId.value,
  });
  
  activeQueueId.value = queueId;
  activeDocId.value = null;
  shouldFocusDocList.value = true;
  

  if (queueId === 'neural' || queueId === 'neural-roam') {
    if (currentCardType.value !== 'concept-only') {
      currentCardType.value = 'concept-only';
    }
    neuralSubview.value = 'concept-cards';
    neuralHistoryScope.value = 'all';
  } else if ((queueId === 'retrieval' || queueId === 'final-drill') && currentCardType.value === 'topic-only') {
    currentCardType.value = 'all';
  }
  // Keep current selection for other queues
  
  logger.info('[SiYuanMemo][SRSBrowser] 馃攳 After clearing activeDocId:', {
    activeDocId: activeDocId.value,
    shouldFocusDocList: shouldFocusDocList.value,
    currentCardType: currentCardType.value,
  });
  
  await loadData();
}

async function applyInitialBrowserView(forceRefresh = false): Promise<void> {
  const initialQueueId = normalizeQueueId(props.initialQueueId);
  if (!initialQueueId) {
    await loadData(forceRefresh);
    return;
  }

  await handleSelectQueue(initialQueueId);

  if (forceRefresh) {
    await loadData(true);
  }

  if (initialQueueId === 'neural-roam') {
    const initialSubview = props.initialNeuralSubview;
    if (initialSubview === 'concept-cards' || initialSubview === 'focus-blocks' || initialSubview === 'roam-history') {
      neuralSubview.value = initialSubview;
      if (initialSubview !== 'concept-cards') {
        await refreshNeuralSubviewData();
      }
    }
  }
}

function handleSelectGlobal(type: '__all__' | '__lost__') {
  activeQueueId.value = null;
  clearNeuralSubviewData();

  if (type === '__lost__') {
    activeDocId.value = '__lost__';
  } else {
    activeDocId.value = null;
  }

  currentPreset.value = 'all';
  currentCardType.value = 'all';
  searchQuery.value = '';
  shouldFocusDocList.value = false;
  void loadData();
}

function handleExitFocus() {
  handleSelectGlobal('__all__');
}

function handleSelectDoc(docId: string) {
  const id = String(docId || '');

  activeDocId.value = id;

  shouldFocusDocList.value = false;
  void loadData();
}

function handleFilterDoc(docId: string) {
  activeDocId.value = docId;
  searchQuery.value = `doc:${docId}`;
}

// Filter handlers (filter-group-queue-ui)
/**
 * 搴旂敤杩囨护鏉′欢
 * @see filter-group-queue-ui requirements 6.1, 6.2, 6.3
 */
async function handleApplyFilter(filter: CardFilter) {
  logger.info('[SiYuanMemo][SRSBrowser] Applying filter:', filter);
  
  appliedFilter.value = filter;
  showFilterDialog.value = false;
  

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
  
  await refreshData(false, true);
}

/**
 * Clear filter conditions
 * @see filter-group-queue-ui requirements 7.1, 7.2
 */
async function handleClearFilter() {
  logger.info('[SiYuanMemo][SRSBrowser] Clearing filter');
  
  appliedFilter.value = null;
  showFilterDialog.value = false;
  

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
  
  await refreshData(false, true);
}

/**
 * Rebuild filtered queue
 * 
 * Similar to Anki Rebuild:
 * - Reload cards with current saved filter
 * - Clear temporary blacklist
 * - Refresh displayed data
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
      
      // Refresh displayed data
      await refreshData(true); // Force refresh cache
    } else {
      logger.error('[SiYuanMemo][SRSBrowser] Queue does not support rebuild');
    }
  } catch (error) {
    logger.error('[SiYuanMemo][SRSBrowser] Failed to rebuild queue:', error);
    await pushMsg(t('rebuildFailed', 'Failed to reload'), 3000, 'error');
  }
}

/**
 * Open spread dialog
 * Spread collects cards automatically (SuperMemo style):
 * - Default: collect Outstanding cards with due <= now
 * - considerFutureRepetitions: collect cards due <= now + collectingPeriod
 * 
 * @see supermemo-reschedule-operations requirements 8.2, 10.4
 */
async function handleOpenSpreadDialog() {
  logger.info('[SiYuanMemo][SRSBrowser] Opening Spread dialog');
  
  try {
    // 🆕 根据当前模式决定使用哪些卡片
    let cardsToSpread: BrowserCard[] = [];
    const isQueueMode = activeQueueId.value === 'retrieval' || activeQueueId.value === 'incremental-learning';
    
    if (isQueueMode) {

      logger.info('[SiYuanMemo][SRSBrowser] Queue mode - using queue cards:', activeQueueId.value);
      cardsToSpread = rows.value;  // rows.value 已经是当前队列的卡片
    } else {
      logger.info('[SiYuanMemo][SRSBrowser] All cards mode - using allRows');
      cardsToSpread = allRows.value;
    }
    
    logger.info('[SiYuanMemo][SRSBrowser] Cards to spread:', {
      mode: activeQueueId.value || 'all',
      total: cardsToSpread.length,
      sample: cardsToSpread.slice(0, 3).map(c => ({ blockId: c.blockId, due: c.due })),
    });
    
    // Check whether there are cards
    if (cardsToSpread.length === 0) {
      await pushMsg(t('noCards', 'No cards'));
      return;
    }
    
    const now = Date.now();
    const outstandingCards = cardsToSpread.filter(card => {
      const dueTime = card.due instanceof Date ? card.due.getTime() : card.due;
      return dueTime <= now;
    });
    
    logger.info('[SiYuanMemo][SRSBrowser] Collected outstanding cards:', {
      total: cardsToSpread.length,
      outstanding: outstandingCards.length,
    });
    

    const configManager = new ConfigManager(pluginStorage.value!);
    const dlg = createVueDialog({
      title: t('spread', '鍒嗘憡澶嶄範鍘嬪姏'),
      component: SpreadDialog,
      props: {
        count: outstandingCards.length,  // 初始显示到期卡片数量
        configManager,
        allCards: cardsToSpread,
        queueMode: isQueueMode,  // Pass queue-mode flag
        i18n: props.i18n,
      },
      events: {
        confirm: async (config) => {
          dlg.destroy();
          
          // 3. 执行 Spread 操作

          // - considerFutureRepetitions = false: pass all cards; SpreadEngine filters due <= now
          try {
            const effectiveConfig = {
              ...config,
              collectAllCards: isQueueMode,
            };

            const result = await adjustTime(
              props.plugin,
              cardsToSpread,
              'spread',
              { config: effectiveConfig }
            );
            
            if (result) {
              const resultDlg = createVueDialog({
                title: t('spreadResult', '鍒嗘暎缁撴灉'),
                component: RescheduleResultDialog,
                props: {
                  result: {
                    success: true,  // 🆕 添加 success 字段
                    updated: typeof result.updated === 'number' ? result.updated : (result.updated?.length || 0),
                    skipped: typeof result.skipped === 'number' ? result.skipped : (result.skipped?.length || 0),
                    averageCardsPerDay: result.averageCardsPerDay,
                  },
                  operationType: 'spread',  // 🆕 修正属名
                },
                events: {
                  close: () => {
                    resultDlg.destroy();
                  },
                },
                width: '600px',  // Increase dialog width
                height: '450px',  // Increase dialog height
                responsive: true,
              });
            }
            
            // 5. Refresh data
            await refreshData(true);
            await pushMsg(t('spreadSuccess', '鍒嗘暎鎿嶄綔瀹屾垚'));
          } catch (err: unknown) {
            logger.error('[SiYuanMemo][SRSBrowser] Spread operation failed:', err);
            await pushErrMsg(getErrorMessage(err, t('spreadFailed', '鍒嗘暎鎿嶄綔澶辫触')));
          }
        },
        cancel: () => {
          dlg.destroy();
        },
      },
      width: '800px',  // 🆕 增大默认宽度
      height: '85vh',  // 🆕 增大默认高度
      responsive: true,
    });
  } catch (err: unknown) {
    logger.error('[SiYuanMemo][SRSBrowser] Failed to open Spread dialog:', err);
    await pushErrMsg(getErrorMessage(err, t('openDialogFailed', 'Failed to open dialog')));
  }
}
</script>
