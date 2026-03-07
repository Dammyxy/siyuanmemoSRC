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
        :cardCount="totalRowCount"
        :showExitFocus="shouldFocusDocList"
        :hasPlugin="!!props.plugin"
        :canApplySortToQueue="canApplySortToQueue"
        :viewMode="viewMode"
        :loading="loading"
        :mode="mode"
        :mobile-mode="isMobileMode"
        :queue-type="currentQueueType"
        :applied-filter="appliedFilter"
        :active-queue-id="activeQueueId"
        :active-doc-id="activeDocId"
        :selected-count="globalSelection.selectedCount.value"
        :selection-mode="globalSelection.mode.value"
        :can-select-all-matching="canSelectAllMatching"
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
        @selectAllMatching="handleSelectAllMatching"
        @clearSelection="handleClearSelection"
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
      <div v-if="!showNeuralCustomSubview && loading && !currentDataSource" class="card-browser__loading">
        <div class="fn__loading"></div>
      </div>
      
      <!-- Empty state -->
      <div
        v-else-if="!showNeuralCustomSubview && !loading && hasFirstDataBlockLoaded && totalRowCount === 0"
        class="card-browser__empty"
      >
        <div>📭</div>
        <span>{{ t('noCards', 'No cards') }}</span>
      </div>
      
      <!-- AG-Grid table -->
      <div v-else-if="!showNeuralCustomSubview" class="card-browser__grid">
        <ag-grid-vue
          class="ag-theme-balham card-browser-grid"
          style="width: 100%; height: 100%;"
          :columnDefs="columnDefs"
          rowModelType="infinite"
          :pagination="desktopPaginationEnabled"
          :paginationPageSize="desktopPageSize"
          :cacheBlockSize="gridCacheBlockSize"
          :maxBlocksInCache="gridMaxBlocksInCache"
          :infiniteInitialRowCount="gridCacheBlockSize"
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
          @pagination-changed="onPaginationChanged"
          @selection-changed="onSelectionChanged"
          @row-clicked="onRowClicked"
          @row-double-clicked="onRowDoubleClicked"
          @cell-context-menu="onCellContextMenu"
        />
      </div>

      <div
        v-else
        class="card-browser__neural-subview"
        :class="{ 'card-browser__neural-subview--roam-path': neuralSubview === 'roam-history' }"
      >
        <NeuralNavigationBar
          :i18n="props.i18n"
          :navigation-state="neuralNavigationState"
          @toggle-nav-mode="handleNeuralToggleNavigationMode"
          @return-bookmark="handleNeuralReturnToBookmark"
        />
        <NeuralHistoryList
          v-if="neuralSubview === 'roam-history'"
          :i18n="props.i18n"
          :entries="neuralHistoryEntries"
          :current-node-id="neuralCurrentNodeId"
          @preview="handleNeuralPreview"
          @jump="handleNeuralJump"
          @set-current-focus="handleNeuralSetCurrentFocus"
          @toggle-anchor="handleNeuralToggleAnchor"
          @clear-history="handleNeuralClearHistory"
        />
        <NeuralAnchorList
          v-else-if="neuralSubview === 'worldline-anchors'"
          :i18n="props.i18n"
          :entries="neuralAnchorEntries"
          :current-node-id="neuralCurrentNodeId"
          @preview="handleNeuralPreview"
          @set-current-focus="handleNeuralSetCurrentFocus"
          @jump-anchor="handleNeuralJumpAnchor"
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
  DisplayedColumnsChangedEvent,
  GridReadyEvent,
  IDatasource,
  IGetRowsParams,
  PaginationChangedEvent,
  RowClickedEvent,
  RowDoubleClickedEvent,
  RowSelectionOptions,
  SortChangedEvent,
} from 'ag-grid-community';
import { openTab, Menu, Protyle, type App } from 'siyuan';
import { confirmDialog, createVueDialog } from '@/utils/dialog';
import {
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
import { runBrowserForceRefresh } from './forceRefreshDataPlan';
import { type BrowserCard, type CardTypeFilter } from './types';
import { migrateExistingCards, checkMigrationNeeded } from '@/scripts/migrateToTopicItem';
import type {
  ICardDataSource,
  IBrowserQueryableDataSource,
  SortModel,
} from './datasource/types';
import { hasQuerySessionInvalidation, isBrowserQueryableDataSource } from './datasource/types';
import { adjustTime } from './datasource/MenuActions';  // Import adjustTime
import ActionParamsDialog from './ActionParamsDialog.vue';
import BrowserHierarchy from './BrowserHierarchy.vue';
import BrowserPreview from './BrowserPreview.vue';
import BrowserToolbar from './BrowserToolbar.vue';
import NeuralAnchorList from './neural/NeuralAnchorList.vue';
import NeuralHistoryList from './neural/NeuralHistoryList.vue';
import NeuralNavigationBar from './neural/NeuralNavigationBar.vue';
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
  NeuralNavigationState,
  NeuralRoamAnchorEntry,
  NeuralRoamHistoryEntry,
  QueueType,
} from '@/types/unified-data-source';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
import { filterService } from './services/FilterService';
import type { NeuralAnchorListEntry, NeuralListEntry, NeuralSubview } from './neural/types';
import { 
  CARD_STATE_COLORS, 
  DEFAULT_PRIORITY, 
  SORT_FIELD_CONFIGS, 
  type SortFieldConfig,
  PREVIEW_SIZE_MIN,
  PREVIEW_SIZE_MAX,
  DEFAULT_PREVIEW_SIZE,
} from './constants';
import { extractSqlStatement } from './utils/cardFilters';
import {
  resolveBrowserCardActionId,
  resolveBrowserCardStableId,
} from './utils/browserCardIdentity';
import { extractBlockIds } from './utils/helpers';
import { interpolateI18n } from './utils/i18n';
import { mergeExplicitSelectionByPage } from './utils/paginatedSelection';
import { resolveEffectiveSortModel } from './utils/sortModel';
import {
  isNeuralQueueId,
  resolveQueueCardTypeOnSwitch,
} from './utils/queueCardTypePolicy';
import {
  createQueueDataSource,
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
import { shouldRefreshQueueData } from './composables/queueChangeScope';
import { useGlobalSelection } from './composables/useGlobalSelection';
import { createLogger } from '@/utils/logger';
import type {
  BrowserQueueCountsRequest,
  IBrowserApplicationService,
} from '@/application/interfaces/IBrowserApplicationService';
import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { IPluginFacade } from '@/application/interfaces/IPluginFacade';
import type { CardTypeMarkerStoragePort } from '@/core/storage/ports';
import type { SortField, SortOrder } from '@/core/card/domain/services/CardSortService';
import type { FSRSCard } from '@/types/card';
import type { WsSyncEvent } from '@/application/services/XiuyuanSyncService.types';

// Register AG-Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);
const logger = createLogger('SRSBrowser');
const DESKTOP_PAGE_SIZE = 50;

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
const totalRowCount = ref(0);
const allRowsSnapshotReady = ref(false);
const hasFirstDataBlockLoaded = ref(false);
const globalTotalCount = ref<number | null>(null);
const globalLostCount = ref<number | null>(null);
const currentDataSource = ref<ICardDataSource | null>(null);
const currentPreset = ref<PresetFilter>('all');
const currentCardType = ref<CardTypeFilter>('all');
const previousNonNeuralCardType = ref<CardTypeFilter | null>(null);
const selectedRows = ref<BrowserCard[]>([]);
const globalSelection = useGlobalSelection();
const gridApi = ref<GridApi | null>(null);
const currentSortModel = ref<SortModel[]>([]);
const sortModelRevision = ref(0);
const currentSortField = ref<SortField>('due');
const currentSortOrder = ref<SortOrder>('asc');
const searchQuery = ref('');
const viewMode = ref<'flat' | 'hierarchy'>(isMobileMode.value ? 'flat' : 'hierarchy');
const activeQueueId = ref<string | null>(null);
const activeDocId = ref<string | null>(null);
const queueCounts = ref<Record<string, number>>({ ...EMPTY_QUEUE_COUNTS });
const neuralSubview = ref<NeuralSubview>('concept-cards');
const neuralHistoryEntries = ref<NeuralListEntry[]>([]);
const neuralAnchorEntries = ref<NeuralAnchorListEntry[]>([]);
const neuralCurrentNodeId = ref<string | null>(null);
const neuralNavigationState = ref<NeuralNavigationState | null>(null);
let neuralPreviewRequestSeq = 0;

const appliedFilter = ref<CardFilter | null>(null);
const showFilterDialog = ref(false);
const canSelectAllMatching = computed(() => isBrowserQueryableDataSource(currentDataSource.value));

let detectionTriggered = false;

const showPreview = ref(!isMobileMode.value);
const previewCard = ref<BrowserCard | null>(null);

const isResizing = ref(false);
const desktopPaginationEnabled = computed(() => !isMobileMode.value);
const desktopPageSize = computed(() => DESKTOP_PAGE_SIZE);
const gridCacheBlockSize = computed(() => (isMobileMode.value ? 120 : DESKTOP_PAGE_SIZE));
const gridMaxBlocksInCache = computed(() => (isMobileMode.value ? 4 : 8));
const randomSortRows = ref<BrowserCard[] | null>(null);

const loadedRowsByBlockId = new Map<string, BrowserCard>();
let datasourceVersion = 0;
let pendingGridDatasource: IDatasource | null = null;
let gridDatasourceApplyTimer: ReturnType<typeof setTimeout> | null = null;
let allRowsSnapshotTaskId = 0;
let allRowsSnapshotPromise: Promise<void> | null = null;
let focusRowsTaskId = 0;
let backgroundSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
let loadedRowsFlushTimer: ReturnType<typeof setTimeout> | null = null;
let loadedRowsDirty = false;
let longTaskObserver: PerformanceObserver | null = null;
let globalStatsTaskId = 0;
let isApplyingSelectionToGrid = false;

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
const activeQueueTypeForRefresh = computed<QueueType | null>(() => {
  const queueType = currentQueueType.value;
  if (
    queueType === 'retrieval-practice'
    || queueType === 'final-drill'
    || queueType === 'incremental-learning'
    || queueType === 'filter-group'
    || queueType === 'neural-roam'
    || queueType === 'leech'
  ) {
    return queueType;
  }
  return null;
});
const showNeuralCustomSubview = computed(() =>
  isNeuralRoamQueueActive.value && neuralSubview.value !== 'concept-cards'
);
const neuralSubviewTabs = computed(() => ([
  { id: 'concept-cards' as const, label: t('roamSeeds', 'Roam Seeds') },
  { id: 'roam-history' as const, label: t('roamHistory', 'Roam Path') },
  { id: 'worldline-anchors' as const, label: t('worldlineAnchors', 'Worldline Anchors') },
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
  const total = globalTotalCount.value ?? 0;
  const lost = globalLostCount.value ?? 0;
  return {
    total,
    lost,
  };
});

function clearLoadedRowsCache(): void {
  if (loadedRowsFlushTimer) {
    clearTimeout(loadedRowsFlushTimer);
    loadedRowsFlushTimer = null;
  }
  loadedRowsDirty = false;
  if (longTaskObserver) {
    longTaskObserver.disconnect();
    longTaskObserver = null;
  }
  loadedRowsByBlockId.clear();
  rows.value = [];
}

function flushLoadedRowsToState(): void {
  if (!loadedRowsDirty) {
    return;
  }
  loadedRowsDirty = false;
  rows.value = Array.from(loadedRowsByBlockId.values());
}

function scheduleLoadedRowsFlush(delayMs = 32): void {
  if (loadedRowsFlushTimer) {
    return;
  }
  loadedRowsFlushTimer = setTimeout(() => {
    loadedRowsFlushTimer = null;
    flushLoadedRowsToState();
  }, delayMs);
}

function mergeLoadedRows(cards: BrowserCard[]): void {
  let changed = false;
  for (const card of cards) {
    if (card?.blockId) {
      const previous = loadedRowsByBlockId.get(card.blockId);
      if (previous !== card) {
        loadedRowsByBlockId.set(card.blockId, card);
        changed = true;
      }
    }
  }
  if (changed) {
    loadedRowsDirty = true;
    scheduleLoadedRowsFlush();
  }
}

function scheduleDatasourceUiUpdate(version: number, update: () => void): void {
  setTimeout(() => {
    if (version !== datasourceVersion) {
      return;
    }
    update();
  }, 0);
}

function isGridApiAlive(api: GridApi | null | undefined): api is GridApi {
  if (!api) {
    return false;
  }
  if (typeof api.isDestroyed === 'function' && api.isDestroyed()) {
    return false;
  }
  return true;
}

async function fetchAllRowsFromDataSource(
  dataSource: ICardDataSource,
  sortModel: SortModel[] = []
): Promise<BrowserCard[]> {
  const probe = await dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: 1,
  });

  if (probe.totalCount <= probe.rows.length) {
    return probe.rows;
  }

  const full = await dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: probe.totalCount,
  });
  return full.rows;
}

function resolveQueryableDataSource(
  dataSource: ICardDataSource | null
): IBrowserQueryableDataSource | null {
  if (!dataSource || !isBrowserQueryableDataSource(dataSource)) {
    return null;
  }
  return dataSource;
}

function resolveIncrementalRowId(card: BrowserCard | null | undefined): string {
  return resolveBrowserCardStableId(card);
}

function resolveBrowserCardSelectionId(card: BrowserCard | null | undefined): string {
  return resolveBrowserCardStableId(card);
}

function buildSelectionContextFingerprint(): string {
  const dataSource = currentDataSource.value;
  const queryable = resolveQueryableDataSource(dataSource);
  if (queryable) {
    return queryable.getQueryFingerprint();
  }

  return JSON.stringify({
    queueId: activeQueueId.value || '',
    docId: activeDocId.value || '',
    preset: currentPreset.value,
    queryText: searchQuery.value,
    cardType: currentCardType.value,
    sortModel: currentSortModel.value,
  });
}

function describeCurrentFilterSummary(): string {
  const parts: string[] = [];
  parts.push(`${t('scope', 'Scope')}: ${activeQueueId.value || t('allCards', 'All')}`);

  if (activeDocId.value) {
    parts.push(`${t('document', 'Document')}: ${activeDocId.value}`);
  }
  if (currentPreset.value && currentPreset.value !== 'all') {
    parts.push(`${t('preset', 'Preset')}: ${currentPreset.value}`);
  }
  if (currentCardType.value && currentCardType.value !== 'all') {
    parts.push(`${t('cardType', 'Card Type')}: ${currentCardType.value}`);
  }
  if (searchQuery.value.trim()) {
    parts.push(`${t('search', 'Search')}: ${searchQuery.value.trim()}`);
  }
  return parts.join(' · ');
}

function clearSelectionState(shouldNotify = false): void {
  const hadSelection =
    selectedRows.value.length > 0 || globalSelection.selectedCount.value > 0 || globalSelection.mode.value === 'all-matching';
  selectedRows.value = [];
  globalSelection.clear();

  const api = gridApi.value;
  if (isGridApiAlive(api)) {
    api.deselectAll?.();
  }

  if (shouldNotify && hadSelection) {
    void pushMsg(t('selectionClearedOnQueryChange', 'Selection was cleared because query conditions changed'));
  }
}

function resetPaginationToFirstPage(): void {
  if (!desktopPaginationEnabled.value) {
    return;
  }
  const api = gridApi.value;
  if (!isGridApiAlive(api)) {
    return;
  }
  const currentPage = Number(api.paginationGetCurrentPage?.() ?? 0);
  if (Number.isFinite(currentPage) && currentPage > 0) {
    api.paginationGoToFirstPage?.();
  }
}

function syncSelectionForQueryChange(): void {
  clearSelectionState(true);
  resetPaginationToFirstPage();
}

function isNodeInSelectionScope(api: GridApi<BrowserCard>, rowIndex: number | null | undefined): boolean {
  if (!desktopPaginationEnabled.value) {
    return true;
  }
  if (!Number.isFinite(rowIndex)) {
    return false;
  }

  const currentPage = Number(api.paginationGetCurrentPage?.() ?? 0);
  const pageSizeCandidate = Number(api.paginationGetPageSize?.() ?? DESKTOP_PAGE_SIZE);
  const pageSize = Number.isFinite(pageSizeCandidate) && pageSizeCandidate > 0
    ? Math.floor(pageSizeCandidate)
    : DESKTOP_PAGE_SIZE;
  const startRow = Math.max(0, currentPage) * pageSize;
  const endRow = startRow + pageSize;

  return Number(rowIndex) >= startRow && Number(rowIndex) < endRow;
}

function collectScopedSelectionIds(api: GridApi<BrowserCard>): { visibleIds: string[]; selectedIds: string[] } {
  const visibleIds: string[] = [];
  const selectedIds: string[] = [];

  api.forEachNode((node) => {
    if (!isNodeInSelectionScope(api, node.rowIndex)) {
      return;
    }
    const row = node.data as BrowserCard | undefined;
    const id = resolveBrowserCardSelectionId(row);
    if (!id) {
      return;
    }
    visibleIds.push(id);
    if (node.isSelected()) {
      selectedIds.push(id);
    }
  });

  return { visibleIds, selectedIds };
}

function applyGlobalSelectionToLoadedRows(): void {
  const api = gridApi.value;
  if (!isGridApiAlive(api)) {
    return;
  }

  const selectionMode = globalSelection.mode.value;
  if (selectionMode !== 'all-matching' && selectionMode !== 'explicit') {
    return;
  }

  isApplyingSelectionToGrid = true;
  try {
    api.forEachNode((node) => {
      if (!isNodeInSelectionScope(api, node.rowIndex)) {
        return;
      }
      const row = node.data as BrowserCard | undefined;
      if (!row) {
        return;
      }
      const id = resolveBrowserCardSelectionId(row);
      if (!id) {
        return;
      }

      const shouldSelect = selectionMode === 'all-matching'
        ? !globalSelection.excludedIds.value.has(id)
        : globalSelection.explicitIds.value.has(id);
      if (node.isSelected() !== shouldSelect) {
        node.setSelected(shouldSelect);
      }
    });
  } finally {
    isApplyingSelectionToGrid = false;
  }

  selectedRows.value = api.getSelectedRows() as BrowserCard[];
}

async function refreshGlobalStats(force = false): Promise<void> {
  const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
  if (!unifiedDataSourceManager) {
    return;
  }

  const taskId = ++globalStatsTaskId;
  try {
    const allCardsDataSource = createDeckDataSource(
      unifiedDataSourceManager,
      {
        docId: null,
        preset: 'all',
        queryText: '',
        cardType: 'all',
      },
      props.currentDocId || null,
      props.plugin
    );

    const visibleCards = await fetchAllRowsFromDataSource(allCardsDataSource, []);
    if (taskId !== globalStatsTaskId) {
      return;
    }

    globalTotalCount.value = visibleCards.length;
    globalLostCount.value = 0;
  } catch (error) {
    if (taskId !== globalStatsTaskId) {
      return;
    }

    if (!force && globalTotalCount.value != null) {
      return;
    }
    logger.error('[SiYuanMemo][SRSBrowser] Failed to refresh global stats:', error);
    globalTotalCount.value = 0;
    globalLostCount.value = 0;
  }
}

function createInfiniteDatasource(
  version: number,
  dataSourceSnapshot: ICardDataSource | null
): IDatasource {
  return {
    getRows: (params: IGetRowsParams) => {
      void (async () => {
        try {
          const dataSource = dataSourceSnapshot;
          if (!dataSource) {
            if (version === datasourceVersion) {
              scheduleDatasourceUiUpdate(version, () => {
                totalRowCount.value = 0;
                hasFirstDataBlockLoaded.value = true;
                loading.value = false;
              });
            }
            params.successCallback([], 0);
            return;
          }

          let rowsForBlock: BrowserCard[] = [];
          let totalCount = 0;
          let requestSortRevision = sortModelRevision.value;

          if (randomSortRows.value) {
            const fullRows = randomSortRows.value;
            totalCount = fullRows.length;
            const start = Math.max(0, Math.min(params.startRow, totalCount));
            const end = Math.max(start, Math.min(params.endRow, totalCount));
            rowsForBlock = fullRows.slice(start, end);
          } else {
            const effectiveSortModel = resolveEffectiveSortModel({
              requestSortModel: (params.sortModel || []) as SortModel[],
              currentSortModel: currentSortModel.value,
              api: gridApi.value,
            });
            requestSortRevision = sortModelRevision.value;
            const result = await dataSource.fetchRows({
              sortModel: effectiveSortModel,
              filterModel: params.filterModel || {},
              startRow: params.startRow,
              endRow: params.endRow,
            });
            rowsForBlock = result.rows;
            totalCount = result.totalCount;
          }

          if (version !== datasourceVersion) {
            // Stale request from an old datasource version: resolve it explicitly
            // so AG Grid does not keep blank placeholder rows.
            params.failCallback();
            return;
          }

          if (requestSortRevision !== sortModelRevision.value) {
            params.failCallback();
            return;
          }

          params.successCallback(rowsForBlock, totalCount);
          scheduleDatasourceUiUpdate(version, () => {
            totalRowCount.value = totalCount;
            hasFirstDataBlockLoaded.value = true;
            mergeLoadedRows(rowsForBlock);
            applyGlobalSelectionToLoadedRows();
            loading.value = false;
          });
        } catch (error) {
          if (version === datasourceVersion) {
            logger.error('[SiYuanMemo][SRSBrowser] Infinite datasource getRows failed:', error);
            scheduleDatasourceUiUpdate(version, () => {
              hasFirstDataBlockLoaded.value = true;
              loading.value = false;
            });
          }
          params.failCallback();
        }
      })();
    },
  };
}

function applyPendingDatasourceToGrid(): void {
  if (!isGridApiAlive(gridApi.value) || !pendingGridDatasource) {
    return;
  }
  if (gridDatasourceApplyTimer) {
    clearTimeout(gridDatasourceApplyTimer);
    gridDatasourceApplyTimer = null;
  }
  const datasource = pendingGridDatasource;
  gridDatasourceApplyTimer = setTimeout(() => {
    gridDatasourceApplyTimer = null;
    const api = gridApi.value;
    if (!isGridApiAlive(api) || !datasource) {
      return;
    }
    api.setGridOption?.('datasource', datasource);
  }, 0);
}

function rebuildInfiniteDatasource(forceRefresh = false): void {
  void forceRefresh;
  const version = ++datasourceVersion;
  loading.value = true;
  hasFirstDataBlockLoaded.value = false;
  clearLoadedRowsCache();
  totalRowCount.value = randomSortRows.value?.length || 0;
  pendingGridDatasource = createInfiniteDatasource(version, currentDataSource.value);
  applyPendingDatasourceToGrid();
}

function startAllRowsSnapshot(): void {
  const taskId = ++allRowsSnapshotTaskId;
  allRowsSnapshotReady.value = false;

  const dataSource = currentDataSource.value;
  if (!dataSource) {
    allRows.value = [];
    rowsForFocus.value = [];
    allRowsSnapshotReady.value = true;
    allRowsSnapshotPromise = Promise.resolve();
    return;
  }

  allRowsSnapshotPromise = (async () => {
    try {
      const fullRows = randomSortRows.value
        ? [...randomSortRows.value]
        : await fetchAllRowsFromDataSource(dataSource, currentSortModel.value || []);
      if (taskId !== allRowsSnapshotTaskId) {
        return;
      }
      allRows.value = fullRows;
      allRowsSnapshotReady.value = true;
      if (!shouldFocusDocList.value && !activeDocId.value) {
        rowsForFocus.value = fullRows;
      }
    } catch (error) {
      if (taskId !== allRowsSnapshotTaskId) {
        return;
      }
      logger.error('[SiYuanMemo][SRSBrowser] Failed to build allRows snapshot:', error);
      allRows.value = [];
      allRowsSnapshotReady.value = true;
    }
  })();
}

function startFocusRowsSnapshot(): void {
  if (!shouldFocusDocList.value) {
    return;
  }

  const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
  if (!unifiedDataSourceManager) {
    rowsForFocus.value = [];
    return;
  }

  const focusDataSource = createFocusDataSource(
    activeQueueId.value,
    unifiedDataSourceManager,
    {
      preset: currentPreset.value,
      queryText: searchQuery.value,
      cardType: currentCardType.value as BrowserCardTypeFilter,
    },
    props.plugin
  );

  if (!focusDataSource) {
    rowsForFocus.value = [];
    return;
  }

  const taskId = ++focusRowsTaskId;
  void (async () => {
    try {
      const focusRows = await fetchAllRowsFromDataSource(focusDataSource, []);
      if (taskId !== focusRowsTaskId) {
        return;
      }
      rowsForFocus.value = focusRows;
    } catch (error) {
      if (taskId !== focusRowsTaskId) {
        return;
      }
      logger.error('[SiYuanMemo][SRSBrowser] Failed to load focus rows:', error);
      rowsForFocus.value = [];
    }
  })();
}

async function ensureAllRowsSnapshotReady(): Promise<BrowserCard[]> {
  if (allRowsSnapshotReady.value) {
    return allRows.value;
  }
  if (allRowsSnapshotPromise) {
    await allRowsSnapshotPromise;
  }
  return allRows.value;
}

type LoadDataOptions = {
  refreshQueueCounts?: boolean;
  snapshotDelayMs?: number;
  origin?: 'default' | 'queue-sync';
};

function scheduleBackgroundSnapshots(delayMs = 80): void {
  if (backgroundSnapshotTimer) {
    clearTimeout(backgroundSnapshotTimer);
    backgroundSnapshotTimer = null;
  }

  const normalizedDelay = Math.max(0, Math.floor(Number(delayMs) || 0));
  backgroundSnapshotTimer = setTimeout(() => {
    backgroundSnapshotTimer = null;
    startAllRowsSnapshot();
    startFocusRowsSnapshot();
  }, normalizedDelay);
}


let loadDataAbortController: AbortController | null = null;

async function loadData(forceRefresh = false, options: LoadDataOptions = {}) {
  const shouldRefreshQueueCounts = options.refreshQueueCounts ?? true;
  const snapshotDelayMs = options.snapshotDelayMs ?? 80;
  const origin = options.origin ?? 'default';

  if (loadDataAbortController) {
    loadDataAbortController.abort();
    logger.info('[SiYuanMemo][SRSBrowser] Previous loadData() aborted');
  }
  if (backgroundSnapshotTimer) {
    clearTimeout(backgroundSnapshotTimer);
    backgroundSnapshotTimer = null;
  }
  
  // Create a new AbortController
  loadDataAbortController = new AbortController();
  const currentController = loadDataAbortController;
  let datasourceTriggered = false;
  
  loading.value = true;
  hasRandomSort.value = false;
  randomSortRows.value = null;
  try {
    if (currentController.signal.aborted) {
      logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted before execution');
      return;
    }
    
    if (origin !== 'queue-sync') {
      selectedRows.value = [];
      globalSelection.clear();
      previewCard.value = null;
    }

    const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;

    // Queue mode: create queue data source and keep doc filter semantics.
    if (activeQueueId.value) {
      if (!unifiedDataSourceManager) {
        logger.error('[SiYuanMemo][SRSBrowser] UnifiedDataSourceManager not available');
        rows.value = [];
        rowsForFocus.value = [];
        allRows.value = [];
        totalRowCount.value = 0;
        return;
      }

      currentDataSource.value = createQueueDataSource(
        activeQueueId.value,
        unifiedDataSourceManager,
        {
          docId: activeDocId.value,
          preset: currentPreset.value,
          queryText: searchQuery.value,
          cardType: currentCardType.value as BrowserCardTypeFilter,
        },
        props.plugin
      );

      if (!currentDataSource.value) {
        logger.error('[SiYuanMemo][SRSBrowser] Failed to create data source for queue:', activeQueueId.value);
        rows.value = [];
        rowsForFocus.value = [];
        allRows.value = [];
        totalRowCount.value = 0;
        return;
      }
    } else {
      clearNeuralSubviewData();
      const sqlStmt = extractSqlStatement(searchQuery.value);
      if (sqlStmt != null) {
        const ok = await ensureSqlModeConfirmed();
        if (!ok) return;
        activeQueueId.value = null;
        currentDataSource.value = createQueryDataSource(sqlStmt);
      } else {
        if (!unifiedDataSourceManager) {
          logger.error('[SiYuanMemo][SRSBrowser] UnifiedDataSourceManager not available for deck mode');
          await pushErrMsg(t('envNotInit', 'Environment not initialized'));
          rows.value = [];
          rowsForFocus.value = [];
          allRows.value = [];
          totalRowCount.value = 0;
          return;
        }

        currentDataSource.value = createDeckDataSource(
          unifiedDataSourceManager,
          {
            docId: activeDocId.value,
            preset: currentPreset.value,
            queryText: searchQuery.value,
            cardType: currentCardType.value as BrowserCardTypeFilter,
          },
          props.currentDocId || null,
          props.plugin
        );
      }
    }

    if (!currentDataSource.value) {
      rows.value = [];
      rowsForFocus.value = [];
      allRows.value = [];
      totalRowCount.value = 0;
      return;
    }

    if (currentController.signal.aborted) {
      logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted before datasource apply');
      return;
    }

    rebuildInfiniteDatasource(forceRefresh);
    datasourceTriggered = true;
    if (origin !== 'queue-sync') {
      scheduleBackgroundSnapshots(snapshotDelayMs);
    }

    if (currentQueueType.value === 'neural-roam') {
      await refreshNeuralSubviewData();
    } else {
      clearNeuralSubviewData();
    }
  } catch (err) {
    logger.error('[SiYuanMemo][CardBrowser] Load data error:', err);
    rows.value = [];
    totalRowCount.value = 0;
  } finally {
    if (!currentController.signal.aborted) {
      if (!datasourceTriggered) {
        loading.value = false;
      }
      if (shouldRefreshQueueCounts) {
        // queue count refresh is independent from row loading.
        void refreshQueueCounts();
      }
    }

    if (loadDataAbortController === currentController) {
      loadDataAbortController = null;
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
      syncSelectionForQueryChange();
      void loadData(false, { refreshQueueCounts: false, snapshotDelayMs: 120 });
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
  syncSelectionForQueryChange();
  void refreshData(false, false, { refreshQueueCounts: false });
});

watch(currentCardType, () => {
  syncSelectionForQueryChange();
  void refreshData(true, false, { refreshQueueCounts: false });
});

watch(neuralSubview, () => {
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
  headerCheckbox: false,
  enableClickSelection: false,
});

// Grid events
function onGridReady(params: GridReadyEvent<BrowserCard>) {
  gridApi.value = params.api;
  applyPendingDatasourceToGrid();
  if (!pendingGridDatasource && currentDataSource.value) {
    rebuildInfiniteDatasource(false);
  }
  applyGlobalSelectionToLoadedRows();
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

function onPaginationChanged(_params: PaginationChangedEvent<BrowserCard>) {
  applyGlobalSelectionToLoadedRows();
}

function onSortChanged(params: SortChangedEvent<BrowserCard>) {
  const api = params?.api || gridApi.value;
  const columnState = api?.getColumnState?.() ?? [];
  const previousSortSignature = JSON.stringify(currentSortModel.value || []);
  currentSortModel.value = resolveEffectiveSortModel({
    currentSortModel: [],
    api,
  });
  const nextSortSignature = JSON.stringify(currentSortModel.value || []);
  if (previousSortSignature !== nextSortSignature) {
    sortModelRevision.value += 1;
  }

  const sortArray = [...currentSortModel.value];

  if (sortArray.length > 0) {
    const firstSort = sortArray[0];
    currentSortField.value = firstSort.colId || 'due';
    currentSortOrder.value = firstSort.sort || 'asc';
    randomSortRows.value = null;
    hasRandomSort.value = false;
  } else {
    currentSortField.value = 'due';
    currentSortOrder.value = 'asc';
  }

  // Check whether sort actually changed
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
    columnState: columnState.filter((c) => c.colId === 'priority'),
  });

  if (api) {
    setTimeout(() => {
      const currentApi = gridApi.value;
      if (!isGridApiAlive(currentApi)) {
        return;
      }
      const infiniteApi = currentApi as GridApi & {
        purgeInfiniteCache?: () => void;
        refreshInfiniteCache?: () => void;
      };
      if (typeof infiniteApi.purgeInfiniteCache === 'function') {
        infiniteApi.purgeInfiniteCache();
        return;
      }
      infiniteApi.refreshInfiniteCache?.();
    }, 0);
  }
  syncSelectionForQueryChange();
  startAllRowsSnapshot();
  startFocusRowsSnapshot();
}

function onSelectionChanged() {
  const api = gridApi.value;
  if (!isGridApiAlive(api)) {
    return;
  }

  const selected = api.getSelectedRows() as BrowserCard[];
  selectedRows.value = selected;

  if (isApplyingSelectionToGrid) {
    return;
  }

  const { visibleIds, selectedIds } = collectScopedSelectionIds(api);

  if (globalSelection.mode.value === 'all-matching') {
    globalSelection.syncAllMatchingVisibleSelection(visibleIds, selectedIds);
    return;
  }

  const mergedExplicitIds = mergeExplicitSelectionByPage({
    existingSelectedIds: globalSelection.explicitIds.value,
    visibleIds,
    pageSelectedIds: selectedIds,
  });
  globalSelection.setExplicitByIds(Array.from(mergedExplicitIds));
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
function jumpToBlock(blockId?: string) {
  const targetId = blockId || previewCard.value?.blockId;
  if (targetId && props.app) {
    openTab({
      app: props.app,
      doc: { id: targetId },
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
    const snapshotRows = await ensureAllRowsSnapshotReady();
    const fullRows = snapshotRows.length > 0 ? snapshotRows : await loadAllRowsForCurrentView([]);

    return new Promise((resolve) => {
      const configManager = new ConfigManager(pluginStorage.value!);
      const dlg = createVueDialog({
        title: t('spread', 'Spread Workload'),
        component: SpreadDialog,
        props: {
          count: cards.length,
          configManager,
          allCards: fullRows,
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
    'add-to-retrieval-queue-all': { key: 'addToRetrievalQueueAll', fallback: '鎻愬彇缁冧範锛堝惈浠婃棩宸插涔狅級' },
    'add-to-incremental-queue': { key: 'addToIncrementalQueue', fallback: '娓愯繘瀛︿範' },
    'add-to-incremental-queue-all': { key: 'addToIncrementalQueueAll', fallback: '娓愯繘瀛︿範锛堝惈浠婃棩宸插涔狅級' },
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
  const preferredFromAnchor = resolveBrowserCardActionId(anchorRow);
  if (preferredFromAnchor) {
    return preferredFromAnchor;
  }
  return resolveBrowserCardActionId(cards?.[0]);
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

async function resolveActionTargetCards(
  actionId: string,
  targetCards: BrowserCard[]
): Promise<BrowserCard[]> {
  if (actionId === 'open') {
    return targetCards;
  }

  if (globalSelection.mode.value === 'explicit') {
    const explicitIds = Array.from(globalSelection.explicitIds.value);
    if (explicitIds.length === 0) {
      return targetCards;
    }

    const queryable = resolveQueryableDataSource(currentDataSource.value);
    if (!queryable) {
      if (explicitIds.length > targetCards.length) {
        await pushMsg('Current view does not support cross-page selection. Using visible selections only.');
      }
      return targetCards;
    }

    return PerformanceMonitor.measure('browser.action.materialize.ms', async () => {
      return queryable.getRowsByIds(explicitIds);
    });
  }

  if (globalSelection.mode.value !== 'all-matching') {
    return targetCards;
  }

  const queryable = resolveQueryableDataSource(currentDataSource.value);
  if (!queryable) {
    await pushErrMsg(t('selectAllMatchingUnsupported', 'Current view does not support select-all-matching'));
    return [];
  }

  const allMatchedIds = await queryable.getAllMatchedIds();
  const selectedIds = globalSelection.resolveSelectedIds(allMatchedIds);
  if (selectedIds.length === 0) {
    return [];
  }

  return PerformanceMonitor.measure('browser.action.materialize.ms', async () => {
    return queryable.getRowsByIds(selectedIds);
  });
}

async function handleAction(actionId: string, targetCards: BrowserCard[], anchorRow?: BrowserCard) {
  const materializedTargets = await resolveActionTargetCards(actionId, targetCards);

  logger.debug('handleAction called:', {
    actionId,
    count: materializedTargets?.length || 0,
    blockIds: materializedTargets?.map(c => c.blockId),
  });
  
  if (!materializedTargets?.length) {
    logger.debug('handleAction skipped: no selected cards');
    return;
  }

  if (actionId === 'open') {
    const blockId = String(anchorRow?.blockId || materializedTargets[0]?.blockId || '');
    if (blockId) {
      await openDocumentTabById(blockId);
      return;
    }
    await pushErrMsg(t('envNotInit', 'Environment not initialized, cannot open tab'));
    return;
  }

  if (actionId === 'review-subset') {
    await openSubsetReviewFromSelection(materializedTargets, anchorRow);
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
      content: interpolateI18n(
        t('confirmReset', 'Are you sure you want to reset {count} cards?'),
        { count: materializedTargets.length },
      ),
      confirmText: t('confirm', 'Confirm'),
      cancelText: t('cancel', 'Cancel'),
    });
    if (!ok) return;
  }

  // 🆕 删除卡片确认
  if (actionId === 'delete-card') {
    const confirmContent = interpolateI18n(
      t('confirmDelete', 'Are you sure you want to remove {count} flashcards? This action cannot be undone.'),
      { count: materializedTargets.length },
    );
    const contentWithScope = globalSelection.mode.value === 'all-matching'
      ? `${confirmContent}\n${describeCurrentFilterSummary()}`
      : confirmContent;
    const ok = await confirmDialog({
      title: t('deleteCard', 'Remove Flashcard'),
      content: contentWithScope,
      confirmText: t('confirm', 'Confirm'),
      cancelText: t('cancel', 'Cancel'),
    });
    if (!ok) return;
  }

  const builder = ACTION_PARAM_BUILDERS[actionId];
  logger.debug('action param builder exists:', Boolean(builder));
  
  const ctx = builder ? await builder(materializedTargets) : { refresh: () => void loadData() };
  if (builder && ctx == null) {
    logger.debug('action canceled by builder');
    return;
  }

  try {
    const res = await ds.performAction(actionId, materializedTargets, ctx);
    logger.debug('performAction result:', { actionId, res });
    const isAddToQueueAction = actionId.startsWith('add-to-');
    let handledActionMessage = false;

    if (isAddToQueueAction && typeof res === 'object' && res !== null) {
      const addResult = res as { added?: unknown; message?: unknown };
      const added = typeof addResult.added === 'number' ? addResult.added : Number.NaN;
      const message = typeof addResult.message === 'string' ? addResult.message : '';

      if (Number.isFinite(added)) {
        handledActionMessage = true;
        if (added <= 0) {
          await refreshQueueCounts();
          await pushErrMsg(message || t('batchNoEffect', 'No cards were updated (some cards may be unsynced)'));
          return;
        }

        await pushMsg(message || t('actionSuccess', 'Success'));
      }
    }

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
        void refreshGlobalStats(true);
      }
      
      // Force refresh after postpone/advance to show new due date
      const forceRefresh = actionId === 'delete-card' || actionId === 'postpone' || actionId === 'advance';
      await loadData(forceRefresh);
    } else {
      gridApi.value?.refreshCells({ force: true });
    }
    await refreshQueueCounts();
    if (!handledActionMessage) {
      await pushMsg(t('actionSuccess', 'Success'));
    }
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
      const seedIds = new Set(neuralQueue.getSeedSnapshot().map((entry) => entry.nodeId));
      const selectedIds = selected.map((row) => String(row.blockId || '')).filter(Boolean);
      const allInSeedPool = selectedIds.length > 0 && selectedIds.every((id) => seedIds.has(id));

      menu.addItem({
        icon: 'iconList',
        label: allInSeedPool
          ? t('removeSeedEntry', '移出漫游种子')
          : t('addSeedEntry', '加入漫游种子'),
        click: () => {
          void (async () => {
            for (const blockId of selectedIds) {
              await neuralQueue.setSeedEntry(blockId, !allInSeedPool);
            }
            await refreshNeuralSubviewData();
            await refreshQueueCounts();
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
      void applyRandomSort();
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

async function handleSelectAllMatching(): Promise<void> {
  const dataSource = currentDataSource.value;
  const queryable = resolveQueryableDataSource(dataSource);
  if (!queryable) {
    await pushErrMsg(t('selectAllMatchingUnsupported', 'Current view does not support select-all-matching'));
    return;
  }

  if (totalRowCount.value <= 0) {
    await pushMsg(t('noCards', 'No cards'));
    return;
  }

  const fingerprint = buildSelectionContextFingerprint();
  globalSelection.selectAllMatching(fingerprint, totalRowCount.value);
  selectedRows.value = [];
  applyGlobalSelectionToLoadedRows();

  await pushMsg(
    t('allMatchingSelected', 'Selected all matching results ({count})')
      .replace('{count}', String(globalSelection.selectedCount.value))
  );
}

function handleClearSelection(): void {
  clearSelectionState(false);
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
async function refreshData(
  forceRefresh = false,
  preserveFocusState = false,
  options: LoadDataOptions = {}
) {
  const mergedOptions: LoadDataOptions = {
    refreshQueueCounts: false,
    origin: 'default',
    ...options,
  };

  if (mergedOptions.origin !== 'queue-sync') {
    clearSelectionState(false);
    previewCard.value = null;
  }


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
  
  await loadData(forceRefresh, mergedOptions);
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
  loadVisibleRows: async (impactedRows) => {
    const queryable = resolveQueryableDataSource(currentDataSource.value);
    if (queryable) {
      if (hasQuerySessionInvalidation(queryable)) {
        queryable.invalidateQuerySession();
      }
      const rowIds = Array.from(
        new Set(impactedRows.map((row) => resolveIncrementalRowId(row)).filter(Boolean))
      );
      return queryable.getRowsByIds(rowIds);
    }

    const blockIds = Array.from(
      new Set(impactedRows.map((row) => String(row.blockId || '').trim()).filter(Boolean))
    );
    return loadQueueCardsSimple(blockIds);
  },
  onRowsDeleted: () => {
    setTimeout(() => {
      const currentApi = gridApi.value;
      if (!isGridApiAlive(currentApi)) {
        return;
      }
      currentApi.refreshInfiniteCache?.();
    }, 0);
  },
});

const {
  initBrowserAdapter,
  destroyBrowserAdapter,
} = useBrowserAdapterSync({
  manager: pluginUnifiedDataSourceManager,
  onCardUpdated: handleCardUpdatedIncremental,
  onCardDeleted: handleCardDeletedIncremental,
  onQueueChanged: ({ affectedQueueTypes, invalidateAllCounts }) => {
    logger.info('[SiYuanMemo][SRSBrowser] Refreshing queue counts due to queue changes', {
      affectedQueueTypes: affectedQueueTypes ?? 'all',
      invalidateAllCounts,
      activeQueueId: activeQueueId.value,
      activeQueueType: activeQueueTypeForRefresh.value,
    });
    void refreshQueueCounts({
      forceRefresh: invalidateAllCounts,
      affectedQueueTypes,
    });

    const activeQueueType = activeQueueTypeForRefresh.value;
    const shouldRefreshActiveQueue = shouldRefreshQueueData(
      activeQueueId.value,
      activeQueueType,
      affectedQueueTypes ?? null,
    );

    if (shouldRefreshActiveQueue) {
      const queryable = resolveQueryableDataSource(currentDataSource.value);
      if (queryable) {
        if (hasQuerySessionInvalidation(queryable)) {
          queryable.invalidateQuerySession();
        }
        const currentApi = gridApi.value as (GridApi & { refreshInfiniteCache?: () => void }) | null;
        currentApi?.refreshInfiniteCache?.();
      } else {
        void refreshData(true, false, {
          origin: 'queue-sync',
          refreshQueueCounts: false,
          snapshotDelayMs: 0,
        });
      }
    }

    if (shouldRefreshActiveQueue && isNeuralRoamQueueActive.value) {
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
async function forceRefreshData() {
  await runBrowserForceRefresh({
    invalidateCardCache,
    refreshGlobalStats,
    refreshData,
    refreshQueueCounts,
  });
}

// 🆕 处理同步完成事件
function handleSyncComplete(type: 'incremental' | 'full') {
  logger.info('[SiYuanMemo][SRSBrowser] Sync completed:', type);
  void forceRefreshData();
}

// Show performance report
function showPerformanceReport() {
  PerformanceMonitor.printReport();
  
  // 显示缓存统计
  const cacheStats = getCacheStats();
  logger.info('馃搳 缂撳瓨缁熻:', cacheStats);
  
  void pushMsg('Performance report printed to console', 2000);
}

function setupLongTaskMonitor(): void {
  if (typeof PerformanceObserver === 'undefined') {
    return;
  }
  if (longTaskObserver) {
    longTaskObserver.disconnect();
    longTaskObserver = null;
  }

  const observerCtor = PerformanceObserver as typeof PerformanceObserver & {
    supportedEntryTypes?: string[];
  };
  const supported = observerCtor.supportedEntryTypes;
  if (Array.isArray(supported) && !supported.includes('longtask')) {
    return;
  }

  try {
    longTaskObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const longTaskCount = entries.filter((entry) => entry.duration > 50).length;
      if (longTaskCount > 0) {
        PerformanceMonitor.incrementCounter('browser.scroll.longtask.count', longTaskCount);
      }
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch (error) {
    logger.debug('[SiYuanMemo][SRSBrowser] Longtask observer unavailable', error);
  }
}

// Cleanup
let unsubscribe: (() => void) | null = null;

onBeforeUnmount(() => {
  disposeIncrementalGridUpdates();
  destroyBrowserAdapter();

  if (loadDataAbortController) {
    loadDataAbortController.abort();
    loadDataAbortController = null;
  }
  datasourceVersion += 1;
  pendingGridDatasource = null;
  currentDataSource.value = null;

  // 🆕 清理全局浏览器上下文
  clearGlobalBrowserContext();
  logger.info('[SiYuanMemo][SRSBrowser] Global browser context cleared');

  if (gridDatasourceApplyTimer) {
    clearTimeout(gridDatasourceApplyTimer);
    gridDatasourceApplyTimer = null;
  }
  if (backgroundSnapshotTimer) {
    clearTimeout(backgroundSnapshotTimer);
    backgroundSnapshotTimer = null;
  }
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  if (loadedRowsFlushTimer) {
    clearTimeout(loadedRowsFlushTimer);
    loadedRowsFlushTimer = null;
  }
  loadedRowsDirty = false;
  
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  gridApi.value = null;
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
  setupLongTaskMonitor();
  void refreshGlobalStats(false);

  // Subscribe to incremental updates
  unsubscribe = subscribeCacheUpdate((cards, isComplete) => {
    if (activeQueueId.value) {
      return;
    }
    if (!allRowsSnapshotReady.value || isComplete) {
      allRows.value = cards;
      if (isComplete) {
        allRowsSnapshotReady.value = true;
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

function toNeuralHistoryListEntries(
  entries: NeuralRoamHistoryEntry[],
  options?: {
    anchorIds?: Set<string>;
    currentNodeId?: string | null;
  }
): NeuralListEntry[] {
  const anchorIds = options?.anchorIds ?? new Set<string>();
  const currentNodeId = options?.currentNodeId ?? null;
  return [...entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .map((entry) => ({
      ...entry,
      isCurrent: currentNodeId ? entry.nodeId === currentNodeId : false,
      isAnchored: anchorIds.has(entry.nodeId),
    }));
}

function toNeuralAnchorListEntries(
  entries: NeuralRoamAnchorEntry[],
  options?: {
    historyNodeIds?: Set<string>;
    currentNodeId?: string | null;
  }
): NeuralAnchorListEntry[] {
  const historyNodeIds = options?.historyNodeIds ?? new Set<string>();
  const currentNodeId = options?.currentNodeId ?? null;
  return [...entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .map((entry) => ({
      ...entry,
      isCurrent: currentNodeId ? entry.nodeId === currentNodeId : false,
      inHistory: historyNodeIds.has(entry.nodeId),
    }));
}

function clearNeuralSubviewData(): void {
  neuralHistoryEntries.value = [];
  neuralAnchorEntries.value = [];
  neuralCurrentNodeId.value = null;
  neuralNavigationState.value = null;
}

async function refreshNeuralSubviewData(): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    clearNeuralSubviewData();
    return;
  }

  const navState = neuralQueue.getNavigationState();
  const historySnapshot = neuralQueue.getHistorySnapshot();
  const anchorSnapshot = neuralQueue.getAnchorSnapshot();
  const anchorIds = new Set(anchorSnapshot.map((entry) => entry.nodeId));
  neuralHistoryEntries.value = toNeuralHistoryListEntries(historySnapshot, {
    anchorIds,
    currentNodeId: navState.currentNodeId,
  });
  const currentSessionNodeIds = new Set(
    historySnapshot
      .filter((entry) => entry.sessionId === navState.sessionId)
      .map((entry) => entry.nodeId)
  );
  neuralAnchorEntries.value = toNeuralAnchorListEntries(anchorSnapshot, {
    historyNodeIds: currentSessionNodeIds,
    currentNodeId: navState.currentNodeId,
  });
  neuralCurrentNodeId.value = navState.currentNodeId;
  neuralNavigationState.value = navState;
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
  if (!neuralQueue) {
    await pushErrMsg(t('jumpHistoryNodeFailed', 'Failed to jump history node'));
    return;
  }

  const jumped = await neuralQueue.jumpToHistoryNode(nodeId);
  await refreshNeuralSubviewData();
  await refreshQueueCounts();

  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    await handleNeuralPreview(navState.currentNodeId);
  }

  const dialogManager = pluginContext.value?.getDialogManager?.();
  if (!jumped) {
    await pushErrMsg(t('jumpHistoryNodeFailed', 'Failed to jump history node'));
    return;
  }

  if (!dialogManager?.openNeuralRoamDialog) {
    return;
  }

  await dialogManager.openNeuralRoamDialog();
}

async function handleNeuralJumpAnchor(nodeId: string): Promise<void> {
  await handleNeuralJump(nodeId);
}

async function handleNeuralSetCurrentFocus(nodeId: string): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  await neuralQueue.setCurrentFocus(nodeId, {
    includeFocusAsFirst: true,
    resetHistory: false,
    bookmarkCurrentPath: true,
  });
  await refreshNeuralSubviewData();
  await refreshQueueCounts();
  await handleNeuralPreview(nodeId);

  const dialogManager = pluginContext.value?.getDialogManager?.();
  if (dialogManager?.openNeuralRoamDialog) {
    await dialogManager.openNeuralRoamDialog();
  }
}

async function handleNeuralToggleNavigationMode(): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  const currentMode = neuralQueue.getNavigationState().navigationMode;
  const nextMode = currentMode === 'follow' ? 'explore' : 'follow';
  neuralQueue.setNavigationMode(nextMode);
  await refreshNeuralSubviewData();

  const modeText = nextMode === 'follow'
    ? t('navModeFollow', '沿主线前进')
    : t('navModeExplore', '探索世界线分支');
  await pushMsg(t('navModeSwitched', '已切换为: {mode}').replace('{mode}', modeText));
}

async function handleNeuralReturnToBookmark(): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  const moved = neuralQueue.returnToBookmark();
  if (!moved) {
    return;
  }

  await refreshNeuralSubviewData();
  await refreshQueueCounts();

  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    await handleNeuralPreview(navState.currentNodeId);
  }

  const dialogManager = pluginContext.value?.getDialogManager?.();
  if (dialogManager?.openNeuralRoamDialog) {
    await dialogManager.openNeuralRoamDialog();
  }
}

async function handleNeuralToggleAnchor(nodeId: string, enabled: boolean): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  await neuralQueue.setAnchorEntry(nodeId, enabled);
  await refreshNeuralSubviewData();
  await refreshQueueCounts();
}

async function handleNeuralClearHistory(): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  const ok = await confirmDialog({
    title: t('clearHistory', '清空历史记录'),
    content: t('confirmClearHistoryAll', '确认清空全部漫游历史？'),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  });
  if (!ok) {
    return;
  }

  try {
    neuralQueue.clearHistory('all');
    await refreshNeuralSubviewData();
    await refreshQueueCounts();
    await pushMsg(t('historyClearedSuccess', '历史记录已清空'));
  } catch (error) {
    logger.error('Failed to clear neural history:', error);
    await pushErrMsg(t('clearHistoryFailed', '清空历史记录失败'));
  }
}

async function loadAllRowsForCurrentView(sortModel: SortModel[] = []): Promise<BrowserCard[]> {
  const dataSource = currentDataSource.value;
  if (!dataSource) {
    return [];
  }

  if (randomSortRows.value && sortModel.length === 0) {
    return [...randomSortRows.value];
  }

  return fetchAllRowsFromDataSource(dataSource, sortModel);
}

function applyRandomSortRows(rowsForRandom: BrowserCard[] | null): void {
  randomSortRows.value = rowsForRandom ? [...rowsForRandom] : null;
  rebuildInfiniteDatasource(false);
  startAllRowsSnapshot();
}

const {
  hasRandomSort,
  applySort,
  applyRandomSort,
  canApplySortToQueue,
  handleApplySortToQueue,
} = useSorting({
  gridApi,
  currentSortModel,
  getQueueById,
  activeQueueId,
  loadData,
  loadAllRowsForCurrentView,
  applyRandomSortRows,
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
  manager: pluginUnifiedDataSourceManager.value,
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

async function refreshQueueCounts(request: BrowserQueueCountsRequest = { forceRefresh: true }) {
  await refreshQueueCountsBridge(queueCounts, request);
}

async function handleSelectQueue(queueId: string) {
  if (activeQueueId.value === queueId && activeDocId.value === null && shouldFocusDocList.value) {
    return;
  }

  const fromQueueId = activeQueueId.value;
  const cardTypeTransition = resolveQueueCardTypeOnSwitch({
    fromQueueId,
    toQueueId: queueId,
    currentCardType: currentCardType.value,
    previousNonNeuralCardType: previousNonNeuralCardType.value,
  });

  logger.info('[SiYuanMemo][SRSBrowser] 馃攳 handleSelectQueue called:', {
    queueId,
    fromQueueId,
    beforeActiveDocId: activeDocId.value,
  });
  
  activeQueueId.value = queueId;
  activeDocId.value = null;
  shouldFocusDocList.value = true;
  syncSelectionForQueryChange();

  currentCardType.value = cardTypeTransition.nextCardType;
  previousNonNeuralCardType.value = cardTypeTransition.nextPreviousNonNeuralCardType;

  if (isNeuralQueueId(queueId)) {
    neuralSubview.value = 'concept-cards';
  }
  
  logger.info('[SiYuanMemo][SRSBrowser] 馃攳 After clearing activeDocId:', {
    activeDocId: activeDocId.value,
    shouldFocusDocList: shouldFocusDocList.value,
    currentCardType: currentCardType.value,
    previousNonNeuralCardType: previousNonNeuralCardType.value,
  });
  
  await loadData(false, { refreshQueueCounts: false, snapshotDelayMs: 120 });
}

async function applyInitialBrowserView(forceRefresh = false): Promise<void> {
  const initialQueueId = normalizeQueueId(props.initialQueueId);
  if (!initialQueueId) {
    await loadData(forceRefresh);
    return;
  }

  await handleSelectQueue(initialQueueId);

  if (forceRefresh) {
    await loadData(true, { refreshQueueCounts: false });
  }

  await refreshQueueCounts();

  if (initialQueueId === 'neural-roam') {
    const initialSubview = props.initialNeuralSubview;
    if (
      initialSubview === 'concept-cards'
      || initialSubview === 'roam-history'
      || initialSubview === 'worldline-anchors'
    ) {
      neuralSubview.value = initialSubview;
      if (initialSubview !== 'concept-cards') {
        await refreshNeuralSubviewData();
      }
    }
  }
}

function handleSelectGlobal(_type: '__all__') {
  syncSelectionForQueryChange();
  activeQueueId.value = null;
  clearNeuralSubviewData();
  activeDocId.value = null;

  currentPreset.value = 'all';
  currentCardType.value = 'all';
  searchQuery.value = '';
  shouldFocusDocList.value = false;
  void loadData(false, { refreshQueueCounts: false });
}

function handleExitFocus() {
  handleSelectGlobal('__all__');
}

function handleSelectDoc(docId: string) {
  syncSelectionForQueryChange();
  const id = String(docId || '');

  activeDocId.value = id;
  void loadData(false, { refreshQueueCounts: false });
}

function handleFilterDoc(docId: string) {
  syncSelectionForQueryChange();
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
    const isQueueMode = activeQueueId.value === 'retrieval' || activeQueueId.value === 'incremental-learning';

    // Spread requires full-snapshot semantics under infinite paging.
    let cardsToSpread = await ensureAllRowsSnapshotReady();
    if (cardsToSpread.length === 0) {
      cardsToSpread = await loadAllRowsForCurrentView([]);
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
