<template>
  <div
    ref="browserRootRef"
    class="card-browser"
    :class="[
    `card-browser--${mode}`,
    isMobileMode ? 'card-browser--mobile' : '',
    `card-browser--${layoutProfile}`,
    showPreview ? 'card-browser--preview-open' : '',
    showNavigatorDrawer ? 'card-browser--navigator-open' : '',
  ]"
  >
    <!-- Main area: toolbar + grid -->
    <div class="card-browser__main">
      <div v-if="showInlineHierarchy" class="card-browser__hierarchy">
        <BrowserHierarchy
          :cards="rowsForFocus"
          :queues="{ active: activeQueueId || '', counts: queueCounts }"
          :focusedDocIds="focusedDocIds"
          :globalStats="globalStats"
          :activeGlobal="activeGlobalScope"
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
        :layout-profile="layoutProfile"
        :mobile-mode="isMobileMode"
        :queue-type="currentQueueType"
        :applied-filter="appliedFilter"
        :active-queue-id="activeQueueId"
        :active-doc-id="activeDocId"
        :active-global-scope="activeGlobalScope"
        :selected-count="globalSelection.selectedCount.value"
        :selection-mode="globalSelection.mode.value"
        :can-select-all-matching="canSelectAllMatching"
        :show-navigator-toggle="showNavigatorToggle"
        :navigator-open="navigatorOpen"
        @exitFocus="handleExitFocus"
        @openPracticeMenu="openPracticeMenu"
        @applySortToQueue="handleApplySortToQueue"
        @toggleViewMode="toggleViewMode"
        @toggleNavigator="toggleNavigator"
        @forceRefresh="forceRefreshData"
        @migrateTopicItem="migrateTopicItem"
        @showPerformanceReport="showPerformanceReport"
        @convertToTab="convertToTab"
        @openFilterDialog="showFilterDialog = true"
        @openSpreadDialog="handleOpenSpreadDialog"
        @openAiWorkbench="handleOpenAiWorkbench"
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
          @toggle-engine-mode="handleNeuralToggleEngineMode"
          @toggle-nav-mode="handleNeuralToggleNavigationMode"
          @return-bookmark="handleNeuralReturnToBookmark"
        />
        <NeuralFocusList
          v-if="neuralSubview === 'concept-cards'"
          :i18n="props.i18n"
          :entries="neuralSourceEntries"
          :selected-node-id="selectedNeuralTraceNodeId"
          :engine-mode="neuralNavigationState?.engineMode || 'orbit'"
          @preview="handleNeuralExternalNodePreview"
          @set-current-focus="handleNeuralSetCurrentFocus"
          @toggle-source="handleNeuralToggleSource"
        />
        <template v-else-if="neuralSubview === 'roam-history'">
          <div v-if="showNarrowRoamLayout" class="card-browser__neural-roam-stack">
            <div class="card-browser__neural-roam-segments" role="tablist" :aria-label="t('roamHistory', '双链轨道')">
              <button
                type="button"
                class="b3-button b3-button--outline card-browser__neural-roam-segment"
                :class="{ 'card-browser__neural-roam-segment--active': narrowRoamPane === 'history' }"
                @click="narrowRoamPane = 'history'"
              >
                {{ t('history', 'History') }}
              </button>
              <button
                type="button"
                class="b3-button b3-button--outline card-browser__neural-roam-segment"
                :class="{ 'card-browser__neural-roam-segment--active': narrowRoamPane === 'wake' }"
                @click="narrowRoamPane = 'wake'"
              >
                Wake
              </button>
            </div>
            <NeuralHistoryList
              v-if="narrowRoamPane === 'history'"
              class="card-browser__neural-roam-pane card-browser__neural-roam-pane--history"
              :i18n="props.i18n"
              :entries="neuralHistoryEntries"
              :total-count="neuralHistoryTotalCount"
              :has-more="neuralHistoryHasMore"
              :loading-more="neuralHistoryLoadingMore"
              :current-node-id="neuralCurrentNodeId"
              :selected-event-id="selectedNeuralHistoryEventId"
              :engine-mode="neuralNavigationState?.engineMode || 'orbit'"
              @select="handleNeuralSelectHistoryEntry"
              @preview="handleNeuralPreview"
              @jump="handleNeuralJump"
              @set-current-focus="handleNeuralSetCurrentFocus"
              @toggle-anchor="handleNeuralToggleAnchor"
              @clear-history="handleNeuralClearHistory"
              @load-more="handleNeuralLoadMoreHistory"
            />
            <NeuralActivationTracePanel
              v-else
              class="card-browser__neural-roam-pane card-browser__neural-roam-pane--trace"
              :i18n="props.i18n"
              :trace="neuralActivationTrace"
              :current-node-id="neuralCurrentNodeId"
              :anchor-node-ids="neuralAnchorEntries.map((entry) => entry.nodeId)"
              @preview="handleNeuralTracePreview"
              @jump="handleNeuralTraceJump"
              @select-step="handleNeuralSelectTraceStep"
              @request-convergence-details="handleNeuralRequestConvergenceDetails"
              @switch-trace-event="handleNeuralSwitchTraceEvent"
            />
          </div>
          <div v-else class="card-browser__neural-roam-layout">
            <NeuralHistoryList
              class="card-browser__neural-roam-pane card-browser__neural-roam-pane--history"
              :i18n="props.i18n"
              :entries="neuralHistoryEntries"
              :total-count="neuralHistoryTotalCount"
              :has-more="neuralHistoryHasMore"
              :loading-more="neuralHistoryLoadingMore"
              :current-node-id="neuralCurrentNodeId"
              :selected-event-id="selectedNeuralHistoryEventId"
              :engine-mode="neuralNavigationState?.engineMode || 'orbit'"
              @select="handleNeuralSelectHistoryEntry"
              @preview="handleNeuralPreview"
              @jump="handleNeuralJump"
              @set-current-focus="handleNeuralSetCurrentFocus"
              @toggle-anchor="handleNeuralToggleAnchor"
              @clear-history="handleNeuralClearHistory"
              @load-more="handleNeuralLoadMoreHistory"
            />
            <NeuralActivationTracePanel
              class="card-browser__neural-roam-pane card-browser__neural-roam-pane--trace"
              :i18n="props.i18n"
              :trace="neuralActivationTrace"
              :current-node-id="neuralCurrentNodeId"
              :anchor-node-ids="neuralAnchorEntries.map((entry) => entry.nodeId)"
              @preview="handleNeuralTracePreview"
              @jump="handleNeuralTraceJump"
              @select-step="handleNeuralSelectTraceStep"
              @request-convergence-details="handleNeuralRequestConvergenceDetails"
              @switch-trace-event="handleNeuralSwitchTraceEvent"
            />
          </div>
        </template>
        <NeuralAnchorList
          v-else-if="neuralSubview === 'worldline-anchors'"
          :i18n="props.i18n"
          :entries="neuralAnchorEntries"
          :current-node-id="neuralCurrentNodeId"
          :selected-node-id="selectedNeuralTraceNodeId"
          :engine-mode="neuralNavigationState?.engineMode || 'orbit'"
          @preview="handleNeuralExternalNodePreview"
          @set-current-focus="handleNeuralSetCurrentFocus"
          @toggle-anchor="handleNeuralToggleAnchor"
          @jump-anchor="handleNeuralJumpAnchor"
        />
      </div>
      </div>

      <div v-if="showNavigatorDrawer" class="card-browser__navigator-scrim" @click="closeNavigatorDrawer"></div>
      <div v-if="showNavigatorDrawer" class="card-browser__navigator-drawer">
        <BrowserHierarchy
          :cards="rowsForFocus"
          :queues="{ active: activeQueueId || '', counts: queueCounts }"
          :focusedDocIds="focusedDocIds"
          :globalStats="globalStats"
          :activeGlobal="activeGlobalScope"
          :mobile-mode="isMobileMode"
          :i18n="props.i18n"
          @selectQueue="handleSelectQueue"
          @selectDoc="handleSelectDoc"
          @filterDoc="handleFilterDoc"
          @selectGlobal="handleSelectGlobal"
        />
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
  loadBrowserCardsByBlockIds,
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
import {
  type BrowserCard,
  type BrowserMode,
  type BrowserOpenState,
  type BrowserViewMode,
  type CardTypeFilter,
} from './types';
import {
  buildBrowserPreferenceKey,
  LEGACY_BROWSER_VIEW_MODE_KEY,
  resolveBrowserLayoutProfile,
  resolveDefaultBrowserNavigatorOpen,
  resolveDefaultBrowserNarrowRoamPane,
  resolveDefaultBrowserShowPreview,
  resolveDefaultBrowserViewMode,
  type BrowserLayoutProfile,
  type BrowserNarrowRoamPane,
} from './layoutProfile';
import {
  DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
  normalizeHierarchySnapshotDelayMs,
  resolveBrowserHierarchySnapshotMode,
} from './hierarchySnapshotPlan';
import { getNeuralEngineLabel } from '@/ui/shared/neuralRoamLabels';
import { migrateExistingCards, checkMigrationNeeded } from '@/scripts/migrateToTopicItem';
import type {
  BrowserActionTarget,
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
import NeuralActivationTracePanel from './neural/NeuralActivationTracePanel.vue';
import NeuralFocusList from './neural/NeuralFocusList.vue';
import NeuralHistoryList from './neural/NeuralHistoryList.vue';
import NeuralNavigationBar from './neural/NeuralNavigationBar.vue';
import NeuralSubviewTabs from './neural/NeuralSubviewTabs.vue';
import {
  buildNeuralHistoryIndex,
  resolveNeuralTraceConvergenceForStep,
} from './neural/traceAggregation';
import { handoffNeuralNavigationToReviewSurface } from './neural/reviewSurfaceHandoff';
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
import { getNeuralSourceLabelSet } from '@/ui/shared/neuralRoamLabels';
import type {
  NeuralActivationTrace,
  BrowserCardTypeFilter,
  CardFilter,
  IReviewQueue,
  IUnifiedDataSourceManagerFacade,
  NeuralEngineMode,
  NeuralNavigationState,
  NeuralPropagationOrigin,
  NeuralRoamAnchorEntry,
  NeuralRoamHistoryEntry,
  NeuralRoamSourceEntry,
  QueueType,
} from '@/types/unified-data-source';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
import { filterService } from './services/FilterService';
import type {
  NeuralActivationTraceStepViewModel,
  NeuralActivationTraceViewModel,
  NeuralAnchorListEntry,
  NeuralHistoryEventRef,
  NeuralListEntry,
  NeuralSourceListEntry,
  NeuralTraceConvergenceViewModel,
  NeuralSubview,
} from './neural/types';
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
import type { WsSyncEvent } from '@/application/services/XiuyuanSyncService.types';
import type { AIWorkbenchOpenOptions } from '@/types/ai';

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
  getDialogManager?: () => BrowserDialogManagerPort | null;
  getTabManager?: () => BrowserTabManagerPort | null;
};

type BrowserPluginPort = IPluginFacade & {
  getContext?: () => BrowserPluginContext | null;
  isMobile?: boolean;
};

type BrowserTabApplicationServicePort = {
  openDocumentTab: (params: { docId: string }) => Promise<void> | void;
};

type BrowserDialogManagerPort = {
  openNeuralRoamDialog?: () => Promise<void> | void;
  openAiWorkbenchDialog?: (options?: AIWorkbenchOpenOptions) => Promise<void> | void;
};

type BrowserTabManagerPort = {
  syncExistingNeuralReviewTabToCurrentNode?: (options?: {
    fallbackNodeId?: string | null;
    focus?: boolean;
  }) => Promise<'synced' | 'missing' | 'failed'> | 'synced' | 'missing' | 'failed';
};

const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: BrowserMode;
  mobileMode?: boolean;
  plugin?: BrowserPluginPort;
  browserService?: IBrowserApplicationService;
  tabApplicationService?: BrowserTabApplicationServicePort;
  initialQueueId?: string;
  initialNeuralSubview?: NeuralSubview;
  initialOpenState?: BrowserOpenState | null;
}>();

const mode = computed(() => props.mode || 'dialog');
const isMobileMode = computed(() => {
  if (typeof props.mobileMode === 'boolean') {
    return props.mobileMode;
  }
  return props.plugin?.isMobile === true;
});
const browserRootRef = ref<HTMLElement | null>(null);
const layoutProfile = ref<BrowserLayoutProfile>(
  resolveBrowserLayoutProfile({
    mode: mode.value,
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    isMobile: isMobileMode.value,
  }),
);

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
  (e: 'convertToTab', state: BrowserOpenState): void;
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
const globalDismissedCount = ref<number | null>(null);
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
const viewMode = ref<BrowserViewMode>(isMobileMode.value ? 'flat' : 'hierarchy');
const activeQueueId = ref<string | null>(null);
const activeDocId = ref<string | null>(null);
const queueCounts = ref<Record<string, number>>({ ...EMPTY_QUEUE_COUNTS });
const neuralSubview = ref<NeuralSubview>('concept-cards');
const navigatorOpen = ref(false);
const narrowRoamPane = ref<BrowserNarrowRoamPane>(resolveDefaultBrowserNarrowRoamPane());
const neuralSourceEntries = ref<NeuralSourceListEntry[]>([]);
const neuralHistoryEntries = ref<NeuralListEntry[]>([]);
const neuralHistoryTotalCount = ref(0);
const neuralHistoryHasMore = ref(false);
const neuralHistoryLoadingMore = ref(false);
const neuralAnchorEntries = ref<NeuralAnchorListEntry[]>([]);
const neuralCurrentNodeId = ref<string | null>(null);
const neuralNavigationState = ref<NeuralNavigationState | null>(null);
const selectedNeuralHistoryEventId = ref<string | null>(null);
const neuralActivationTrace = ref<NeuralActivationTraceViewModel | null>(null);
const neuralTracePinnedToSelection = ref(false);
const selectedNeuralTraceEventId = ref<string | null>(null);
const selectedNeuralTraceNodeId = ref<string | null>(null);
let neuralPreviewRequestSeq = 0;
let neuralTraceConvergenceRequestSeq = 0;
const neuralTraceConvergenceCache = new Map<string, NeuralTraceConvergenceViewModel | null>();
const neuralTraceRouteViewModelCache = new Map<string, NeuralActivationTraceViewModel | null>();
const NEURAL_HISTORY_PAGE_SIZE = 200;
const neuralHistoryRequestedCount = ref(NEURAL_HISTORY_PAGE_SIZE);

const appliedFilter = ref<CardFilter | null>(null);
const showFilterDialog = ref(false);
const canSelectAllMatching = computed(() => isBrowserQueryableDataSource(currentDataSource.value));

let detectionTriggered = false;

const showPreview = ref(resolveDefaultBrowserShowPreview(layoutProfile.value));
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
let browserRootResizeObserver: ResizeObserver | null = null;
let suspendBrowserChromePersistence = false;
let suspendBrowserStateBootstrap = false;

const calculateInitialPreviewSize = (): number => {
  if (isMobileMode.value) {
    return DEFAULT_PREVIEW_SIZE.tab;
  }

  if (mode.value !== 'dialog') {
    const target = Math.round(window.innerHeight * 0.34);
    return Math.min(360, Math.max(240, target));
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
const showNavigatorToggle = computed(() => layoutProfile.value === 'tab-narrow' && !isMobileMode.value);
const showInlineHierarchy = computed(() => {
  if (isMobileMode.value || layoutProfile.value === 'tab-narrow') {
    return false;
  }
  return viewMode.value === 'hierarchy';
});
const showNavigatorDrawer = computed(() =>
  !isMobileMode.value
  && layoutProfile.value === 'tab-narrow'
  && viewMode.value === 'hierarchy'
  && navigatorOpen.value
);
const showNarrowRoamLayout = computed(() =>
  layoutProfile.value === 'tab-narrow' && !isMobileMode.value
);

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getBrowserRootWidth(): number {
  const root = browserRootRef.value;
  if (!root) {
    return typeof window !== 'undefined' ? window.innerWidth : 1440;
  }
  const rectWidth = Number(root.getBoundingClientRect().width || 0);
  const clientWidth = Number(root.clientWidth || 0);
  const offsetWidth = Number(root.offsetWidth || 0);
  return Math.max(rectWidth, clientWidth, offsetWidth, 0);
}

function updateLayoutProfile(): void {
  layoutProfile.value = resolveBrowserLayoutProfile({
    mode: mode.value,
    width: getBrowserRootWidth(),
    isMobile: isMobileMode.value,
  });
}

function setupBrowserLayoutObserver(): void {
  updateLayoutProfile();
  if (typeof ResizeObserver === 'undefined') {
    return;
  }

  const root = browserRootRef.value;
  if (!root) {
    return;
  }

  browserRootResizeObserver = new ResizeObserver(() => {
    updateLayoutProfile();
  });
  browserRootResizeObserver.observe(root);
}

function readStoredViewMode(profile: BrowserLayoutProfile): BrowserViewMode {
  const key = buildBrowserPreferenceKey('viewMode', profile);
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'flat' || stored === 'hierarchy') {
      return stored;
    }

    if (profile === 'dialog') {
      const legacy = localStorage.getItem(LEGACY_BROWSER_VIEW_MODE_KEY);
      if (legacy === 'flat' || legacy === 'hierarchy') {
        localStorage.setItem(key, legacy);
        return legacy;
      }
    }
  } catch {}

  return resolveDefaultBrowserViewMode(profile);
}

function readStoredBooleanPreference(
  key: 'showPreview' | 'navigatorOpen',
  profile: BrowserLayoutProfile,
  fallback: boolean,
): boolean {
  try {
    const stored = localStorage.getItem(buildBrowserPreferenceKey(key, profile));
    if (stored === '1') {
      return true;
    }
    if (stored === '0') {
      return false;
    }
  } catch {}

  return fallback;
}

function readStoredNarrowRoamPane(profile: BrowserLayoutProfile): BrowserNarrowRoamPane {
  try {
    const stored = localStorage.getItem(buildBrowserPreferenceKey('narrowRoamPane', profile));
    if (stored === 'history' || stored === 'wake') {
      return stored;
    }
  } catch {}

  return resolveDefaultBrowserNarrowRoamPane();
}

function persistBrowserChromePreference(key: string, value: string): void {
  if (isMobileMode.value || suspendBrowserChromePersistence) {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {}
}

function applyBrowserChromePreferences(profile: BrowserLayoutProfile): void {
  suspendBrowserChromePersistence = true;
  try {
    if (isMobileMode.value) {
      viewMode.value = 'flat';
      showPreview.value = false;
      navigatorOpen.value = false;
      narrowRoamPane.value = resolveDefaultBrowserNarrowRoamPane();
      return;
    }

    viewMode.value = readStoredViewMode(profile);
    showPreview.value = readStoredBooleanPreference(
      'showPreview',
      profile,
      resolveDefaultBrowserShowPreview(profile),
    );
    navigatorOpen.value = readStoredBooleanPreference(
      'navigatorOpen',
      profile,
      resolveDefaultBrowserNavigatorOpen(profile),
    );
    narrowRoamPane.value = readStoredNarrowRoamPane(profile);

    if (profile === 'tab-narrow' && viewMode.value !== 'hierarchy') {
      navigatorOpen.value = false;
    }
  } finally {
    suspendBrowserChromePersistence = false;
  }
}

function syncGlobalBrowserContext(): void {
  const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
  if (unifiedDataSourceManager) {
    setGlobalBrowserContext(unifiedDataSourceManager, searchQuery.value, browserSiyuanApi.value);
  }
}

function clearBackgroundSnapshotTimer(): void {
  if (!backgroundSnapshotTimer) {
    return;
  }

  clearTimeout(backgroundSnapshotTimer);
  backgroundSnapshotTimer = null;
}

function invalidateHierarchySnapshots(): void {
  clearBackgroundSnapshotTimer();
  allRowsSnapshotTaskId += 1;
  allRowsSnapshotPromise = null;
  allRowsSnapshotReady.value = false;
  focusRowsTaskId += 1;
}

async function runWithSuspendedBrowserStateBootstrap<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  const previous = suspendBrowserStateBootstrap;
  suspendBrowserStateBootstrap = true;
  try {
    return await operation();
  } finally {
    suspendBrowserStateBootstrap = previous;
  }
}

function cloneCardFilter(filter: CardFilter | null): CardFilter | null {
  if (!filter) {
    return null;
  }

  try {
    const structuredCloneFn = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone;
    if (typeof structuredCloneFn === 'function') {
      return structuredCloneFn(filter);
    }
  } catch {}

  try {
    return JSON.parse(JSON.stringify(filter)) as CardFilter;
  } catch {
    return filter;
  }
}

function normalizeNeuralSubview(value: NeuralSubview | null | undefined): NeuralSubview | null {
  if (
    value === 'concept-cards'
    || value === 'roam-history'
    || value === 'worldline-anchors'
  ) {
    return value;
  }
  return null;
}

function captureCurrentBrowserOpenState(): BrowserOpenState {
  return {
    queueId: activeQueueId.value,
    globalScope: activeGlobalScope.value,
    docId: activeDocId.value,
    queryText: searchQuery.value,
    preset: currentPreset.value,
    cardType: currentCardType.value,
    filter: activeQueueId.value === 'filter-group' ? cloneCardFilter(appliedFilter.value) : null,
    neuralSubview: isNeuralQueueId(activeQueueId.value)
      ? normalizeNeuralSubview(neuralSubview.value)
      : null,
  };
}

async function applyInitialBrowserOpenState(
  state: BrowserOpenState,
  forceRefresh = false,
): Promise<void> {
  suspendBrowserStateBootstrap = true;
  try {
    const nextQueueId = normalizeQueueId(state.queueId);
    const nextDocId = String(state.docId || '').trim() || null;
    const nextGlobalScope = state.globalScope === '__dismissed__' ? '__dismissed__' : '__all__';
    const nextPreset = nextGlobalScope === '__dismissed__'
      ? 'suspended'
      : (state.preset || 'all') as PresetFilter;
    const nextCardType = (state.cardType || 'all') as CardTypeFilter;
    const nextQueryText = String(state.queryText || '');
    const nextFilter = nextQueueId === 'filter-group' ? cloneCardFilter(state.filter ?? null) : null;
    const nextNeuralSubview = nextQueueId === 'neural-roam'
      ? normalizeNeuralSubview(state.neuralSubview) || 'concept-cards'
      : 'concept-cards';

    syncSelectionForQueryChange();

    const cardTypeTransition = resolveQueueCardTypeOnSwitch({
      fromQueueId: activeQueueId.value,
      toQueueId: nextQueueId,
      currentCardType: nextCardType,
      previousNonNeuralCardType: previousNonNeuralCardType.value,
    });

    activeQueueId.value = nextQueueId;
    activeDocId.value = nextDocId;
    shouldFocusDocList.value = Boolean(nextQueueId) && !nextDocId;

    currentPreset.value = nextPreset;
    currentCardType.value = cardTypeTransition.nextCardType;
    previousNonNeuralCardType.value = cardTypeTransition.nextPreviousNonNeuralCardType;
    searchQuery.value = nextQueryText;
    appliedFilter.value = nextFilter;

    if (nextQueueId === 'neural-roam') {
      neuralSubview.value = nextNeuralSubview;
    } else {
      neuralSubview.value = 'concept-cards';
      clearNeuralSubviewData();
    }

    syncGlobalBrowserContext();

    if (nextQueueId === 'filter-group') {
      try {
        await setFilterGroupFilterBridge(nextFilter ?? {});
      } catch (error) {
        logger.error('[SiYuanMemo][SRSBrowser] Failed to apply initial filter-group browser state:', error);
      }
    }

    await loadData(forceRefresh, { refreshQueueCounts: false, snapshotDelayMs: 120 });
    await refreshQueueCounts();

    if (nextQueueId === 'neural-roam' && nextNeuralSubview !== 'concept-cards') {
      await refreshNeuralSubviewData();
    }
  } finally {
    suspendBrowserStateBootstrap = false;
  }
}

function resolveNeuralSourceLabels(engineMode: NeuralEngineMode = neuralNavigationState.value?.engineMode || 'orbit') {
  return getNeuralSourceLabelSet(engineMode, t);
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
  isNeuralRoamQueueActive.value
);
const neuralSubviewTabs = computed(() => ([
  { id: 'concept-cards' as const, label: resolveNeuralSourceLabels().sectionTitle },
  { id: 'roam-history' as const, label: t('roamHistory', '双链轨道') },
  { id: 'worldline-anchors' as const, label: t('worldlineAnchors', '空间站') },
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
  const dismissed = globalDismissedCount.value ?? 0;
  return {
    total,
    lost,
    dismissed,
  };
});

const activeGlobalScope = computed<'__all__' | '__dismissed__' | null>(() => {
  if (currentPreset.value === 'suspended' && !activeQueueId.value && !activeDocId.value) {
    return '__dismissed__';
  }
  if (!activeQueueId.value && !activeDocId.value) {
    return '__all__';
  }
  return null;
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

async function loadAllRowsFromQueryableDataSource(
  dataSource: ICardDataSource,
  sortModel: SortModel[] = [],
  options: {
    chunkSize?: number;
    shouldAbort?: () => boolean;
  } = {},
): Promise<BrowserCard[]> {
  const queryable = resolveQueryableDataSource(dataSource);
  if (!queryable) {
    return fetchAllRowsFromDataSource(dataSource, sortModel);
  }

  await dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: 0,
  });

  if (options.shouldAbort?.()) {
    return [];
  }

  const allIds = await queryable.getAllMatchedIds();
  if (allIds.length === 0) {
    return [];
  }

  const chunkSize = Math.max(1, Math.floor(Number(options.chunkSize) || 500));
  const rows: BrowserCard[] = [];
  for (let index = 0; index < allIds.length; index += chunkSize) {
    if (options.shouldAbort?.()) {
      return rows;
    }

    const chunkIds = allIds.slice(index, index + chunkSize);
    const hydratedRows = await queryable.getRowsByIds(chunkIds);
    if (options.shouldAbort?.()) {
      return rows;
    }
    rows.push(...hydratedRows);
  }

  return rows;
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
  const browserService = browserAppServiceRef.value;
  if (browserService?.getStats) {
    const taskId = ++globalStatsTaskId;
    try {
      const stats = await browserService.getStats();
      if (taskId !== globalStatsTaskId) {
        return;
      }

      const normalized = stats as {
        totalCards?: number;
        suspendedCards?: number;
      };
      globalTotalCount.value = Number(normalized.totalCards) || 0;
      globalLostCount.value = 0;
      globalDismissedCount.value = Number(normalized.suspendedCards) || 0;
      return;
    } catch (error) {
      if (taskId !== globalStatsTaskId) {
        return;
      }

      if (!force && globalTotalCount.value != null) {
        return;
      }
      logger.error('[SiYuanMemo][SRSBrowser] Failed to refresh global stats via browser service:', error);
      globalTotalCount.value = 0;
      globalLostCount.value = 0;
      globalDismissedCount.value = 0;
      return;
    }
  }

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
      props.plugin,
      browserAppServiceRef.value || null,
    );

    const visibleCards = await fetchAllRowsFromDataSource(allCardsDataSource, []);
    if (taskId !== globalStatsTaskId) {
      return;
    }

    globalTotalCount.value = visibleCards.length;
    globalLostCount.value = 0;
    globalDismissedCount.value = visibleCards.filter((card) => card.suspended).length;
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
    globalDismissedCount.value = 0;
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
            rows.value = rowsForBlock;
            if (!shouldFocusDocList.value && !activeDocId.value) {
              rowsForFocus.value = [...rowsForBlock];
            }
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
        : await loadAllRowsFromQueryableDataSource(dataSource, currentSortModel.value || [], {
          chunkSize: 500,
          shouldAbort: () => taskId !== allRowsSnapshotTaskId,
        });
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

function scheduleAllRowsSnapshot(delayMs?: number): void {
  clearBackgroundSnapshotTimer();

  const normalizedDelay = normalizeHierarchySnapshotDelayMs(
    delayMs,
    DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
  );
  if (normalizedDelay === 0) {
    startAllRowsSnapshot();
    return;
  }

  backgroundSnapshotTimer = setTimeout(() => {
    backgroundSnapshotTimer = null;
    if (shouldFocusDocList.value || activeDocId.value) {
      return;
    }
    startAllRowsSnapshot();
  }, normalizedDelay);
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
    props.plugin,
    browserAppServiceRef.value || null,
  );

  if (!focusDataSource) {
    rowsForFocus.value = [];
    return;
  }

  const taskId = ++focusRowsTaskId;
  void (async () => {
    try {
      const focusRows = await loadAllRowsFromQueryableDataSource(focusDataSource, [], {
        chunkSize: 500,
        shouldAbort: () => taskId !== focusRowsTaskId,
      });
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
  if (!allRowsSnapshotPromise) {
    startAllRowsSnapshot();
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

let loadDataAbortController: AbortController | null = null;

async function loadData(forceRefresh = false, options: LoadDataOptions = {}) {
  const shouldRefreshQueueCounts = options.refreshQueueCounts ?? true;
  const origin = options.origin ?? 'default';

  if (loadDataAbortController) {
    loadDataAbortController.abort();
    logger.info('[SiYuanMemo][SRSBrowser] Previous loadData() aborted');
  }
  invalidateHierarchySnapshots();
  
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
        props.plugin,
        browserAppServiceRef.value || null,
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
          props.plugin,
          browserAppServiceRef.value || null,
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
    const hierarchySnapshotMode = resolveBrowserHierarchySnapshotMode({
      shouldFocusDocList: shouldFocusDocList.value,
      activeDocId: activeDocId.value,
    });
    if (hierarchySnapshotMode === 'focus') {
      startFocusRowsSnapshot();
    } else if (hierarchySnapshotMode === 'all') {
      scheduleAllRowsSnapshot(options.snapshotDelayMs);
    }
    void origin;

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
  if (suspendBrowserStateBootstrap) {
    return;
  }
  handleSearchInput();
  syncGlobalBrowserContext();
});

watch(currentPreset, () => {
  if (suspendBrowserStateBootstrap) {
    return;
  }
  syncSelectionForQueryChange();
  void refreshData(false, false, { refreshQueueCounts: false });
});

watch(currentCardType, () => {
  if (suspendBrowserStateBootstrap) {
    return;
  }
  syncSelectionForQueryChange();
  void refreshData(true, false, { refreshQueueCounts: false });
});

watch(neuralSubview, () => {
  if (suspendBrowserStateBootstrap) {
    return;
  }
  if (neuralSubview.value !== 'roam-history') {
    selectedNeuralHistoryEventId.value = null;
    neuralActivationTrace.value = null;
    neuralTracePinnedToSelection.value = false;
    selectedNeuralTraceEventId.value = null;
    selectedNeuralTraceNodeId.value = null;
  }
  if (isNeuralRoamQueueActive.value) {
    void refreshNeuralSubviewData();
  }
});

watch(layoutProfile, (profile, previousProfile) => {
  if (profile === previousProfile) {
    return;
  }
  applyBrowserChromePreferences(profile);
});

watch(viewMode, (value) => {
  if (layoutProfile.value === 'tab-narrow' && value !== 'hierarchy') {
    navigatorOpen.value = false;
  }
  persistBrowserChromePreference(
    buildBrowserPreferenceKey('viewMode', layoutProfile.value),
    value,
  );
});

watch(showPreview, (value) => {
  persistBrowserChromePreference(
    buildBrowserPreferenceKey('showPreview', layoutProfile.value),
    value ? '1' : '0',
  );
});

watch(navigatorOpen, (value) => {
  persistBrowserChromePreference(
    buildBrowserPreferenceKey('navigatorOpen', layoutProfile.value),
    value ? '1' : '0',
  );
});

watch(narrowRoamPane, (value) => {
  persistBrowserChromePreference(
    buildBrowserPreferenceKey('narrowRoamPane', layoutProfile.value),
    value,
  );
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
  emit('convertToTab', captureCurrentBrowserOpenState());
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

type ActionParamBuilder = (targetCards: BrowserActionTarget[]) => Promise<ActionParams | null>;

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
    unsuspend: { key: 'restore', fallback: 'Restore' },
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

function resolveSubsetBlockIds(cards: BrowserActionTarget[]): string[] {
  return Array.from(
    new Set(
      (cards || [])
        .map((card) => String(card?.blockId || ''))
        .filter(Boolean)
    )
  );
}

function resolvePreferredSubsetCardId(cards: BrowserActionTarget[], anchorRow?: BrowserCard): string {
  const preferredFromAnchor = resolveBrowserCardActionId(anchorRow);
  if (preferredFromAnchor) {
    return preferredFromAnchor;
  }
  return resolveBrowserCardActionId(cards?.[0] as BrowserCard | undefined);
}

async function openSubsetReviewFromSelection(cards: BrowserActionTarget[], anchorRow?: BrowserCard): Promise<void> {
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

async function resolveActionTargets(
  actionId: string,
  targetCards: BrowserCard[]
): Promise<BrowserActionTarget[]> {
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

    return PerformanceMonitor.measure('browser.action.targets.ms', async () => {
      return queryable.getActionTargetsByIds(explicitIds);
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

  return PerformanceMonitor.measure('browser.action.targets.ms', async () => {
    const targets: BrowserActionTarget[] = [];
    for (let index = 0; index < selectedIds.length; index += 500) {
      const chunkIds = selectedIds.slice(index, index + 500);
      const chunkTargets = await queryable.getActionTargetsByIds(chunkIds);
      targets.push(...chunkTargets);
    }
    return targets;
  });
}

async function handleAction(actionId: string, targetCards: BrowserCard[], anchorRow?: BrowserCard) {
  const materializedTargets = await resolveActionTargets(actionId, targetCards);

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
      || actionId === 'delete-card'
      || actionId === 'insert-at'
      || actionId === 'set-priority'
      || actionId === 'spread'
      || actionId === 'auto-sort'
      || actionId === 'reset'
      || actionId === 'suspend'
      || actionId === 'unsuspend'
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
      const sourceLabels = resolveNeuralSourceLabels(neuralQueue.getNavigationState().engineMode);
      const seedIds = new Set(neuralQueue.getSeedSnapshot().map((entry) => entry.nodeId));
      const selectedIds = selected.map((row) => String(row.blockId || '')).filter(Boolean);
      const allInSeedPool = selectedIds.length > 0 && selectedIds.every((id) => seedIds.has(id));

      menu.addItem({
        icon: 'iconList',
        label: allInSeedPool
          ? sourceLabels.removeItem
          : sourceLabels.addItem,
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
    return loadBrowserCardsByBlockIds(blockIds, { applyQueryFilter: false });
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
  onQueueChanged: ({ affectedQueueTypes, invalidateAllCounts, requiresFullRefresh, forceRefreshCounts }) => {
    logger.info('[SiYuanMemo][SRSBrowser] Refreshing queue counts due to queue changes', {
      affectedQueueTypes: affectedQueueTypes ?? 'all',
      invalidateAllCounts,
      requiresFullRefresh,
      forceRefreshCounts,
      activeQueueId: activeQueueId.value,
      activeQueueType: activeQueueTypeForRefresh.value,
    });
    void refreshQueueCounts({
      forceRefresh: invalidateAllCounts || forceRefreshCounts,
      affectedQueueTypes,
    });

    const activeQueueType = activeQueueTypeForRefresh.value;
    const shouldRefreshActiveQueue = shouldRefreshQueueData(
      activeQueueId.value,
      activeQueueType,
      affectedQueueTypes ?? null,
    );
    const shouldForceFullActiveReload = requiresFullRefresh && activeQueueType === QueueType.FilterGroup;

    if (shouldRefreshActiveQueue) {
      if (shouldForceFullActiveReload) {
        void refreshData(true, false, {
          origin: 'queue-sync',
          refreshQueueCounts: false,
          snapshotDelayMs: 0,
        });
      } else {
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
  clearBackgroundSnapshotTimer();
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

  browserRootResizeObserver?.disconnect();
  browserRootResizeObserver = null;
  gridApi.value = null;
});

onMounted(() => {
  setupBrowserLayoutObserver();
  applyBrowserChromePreferences(layoutProfile.value);

  // 🆕 初始化全屢浏览器上下文（DDD 化）
  const unifiedDataSourceManager = pluginUnifiedDataSourceManager.value;
  if (unifiedDataSourceManager) {
    syncGlobalBrowserContext();
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
    
    const shouldSyncOnBrowserOpen = riffConfig?.incrementalSync?.enabled && 
                                    riffConfig?.incrementalSync?.triggers?.includes('browser-open');
    
    if (shouldSyncOnBrowserOpen) {
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
        shouldSyncOnBrowserOpen,
        reason: !shouldSyncOnBrowserOpen ? 'browser-open trigger not configured' : 'browser-open trigger skipped'
      });
    }
  } else {
    logger.info('[SiYuanMemo][SRSBrowser] 鈿狅笍 HybridSyncService not available');
  }

  void applyInitialBrowserView(false);
});

function toggleViewMode() {
  const nextViewMode = viewMode.value === 'flat' ? 'hierarchy' : 'flat';
  viewMode.value = nextViewMode;

  if (layoutProfile.value === 'tab-narrow') {
    navigatorOpen.value = nextViewMode === 'hierarchy';
  }
}

function toggleNavigator() {
  if (isMobileMode.value || !showNavigatorToggle.value) {
    return;
  }

  if (viewMode.value !== 'hierarchy') {
    viewMode.value = 'hierarchy';
    navigatorOpen.value = true;
    return;
  }

  navigatorOpen.value = !navigatorOpen.value;
}

function closeNavigatorDrawer() {
  navigatorOpen.value = false;
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
    selectedEventId?: string | null;
    getRepeatHitCount?: (nodeId: string) => number;
  }
): NeuralListEntry[] {
  const anchorIds = options?.anchorIds ?? new Set<string>();
  const currentNodeId = options?.currentNodeId ?? null;
  const selectedEventId = options?.selectedEventId ?? null;
  const getRepeatHitCount = options?.getRepeatHitCount;
  const repeatHitCountByNodeId = getRepeatHitCount
    ? null
    : entries.reduce((map, entry) => {
      map.set(entry.nodeId, (map.get(entry.nodeId) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  return [...entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .map((entry) => ({
      ...entry,
      isCurrent: currentNodeId ? entry.nodeId === currentNodeId : false,
      isAnchored: anchorIds.has(entry.nodeId),
      isSelected: selectedEventId ? entry.eventId === selectedEventId : false,
      repeatHitCount: getRepeatHitCount
        ? Math.max(1, getRepeatHitCount(entry.nodeId))
        : (repeatHitCountByNodeId?.get(entry.nodeId) ?? 1),
    }));
}

function toNeuralSourceListEntries(
  entries: NeuralRoamSourceEntry[],
  options?: {
    currentNodeId?: string | null;
  }
): NeuralSourceListEntry[] {
  const currentNodeId = options?.currentNodeId ?? null;
  return [...entries]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .map((entry) => ({
      ...entry,
      isCurrent: currentNodeId ? entry.nodeId === currentNodeId : false,
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
  neuralSourceEntries.value = [];
  neuralHistoryEntries.value = [];
  neuralHistoryTotalCount.value = 0;
  neuralHistoryHasMore.value = false;
  neuralHistoryLoadingMore.value = false;
  neuralHistoryRequestedCount.value = NEURAL_HISTORY_PAGE_SIZE;
  neuralAnchorEntries.value = [];
  neuralCurrentNodeId.value = null;
  neuralNavigationState.value = null;
  selectedNeuralHistoryEventId.value = null;
  neuralActivationTrace.value = null;
  neuralTracePinnedToSelection.value = false;
  selectedNeuralTraceEventId.value = null;
  selectedNeuralTraceNodeId.value = null;
  resetNeuralTraceConvergenceState();
}

function resolveNeuralRelationLabel(type: string): string {
  const map: Record<string, string> = {
    backlink: t('relationBacklink', '反链'),
    'outgoing-direct': t('relationOutgoingDirect', '直接正链'),
    'outgoing-indirect': t('relationOutgoingIndirect', '间接正链'),
    descriptor: t('relationDescriptor', '描述符'),
    focus: t('activationKindFocusRoot', '概念卡：轨道中心节点'),
    source: t('activationKindSourceRoot', '概念卡：激活源'),
    'concept-link': t('relationConceptLink', '概念链接'),
    'element-link': t('relationElementLink', '块链接'),
    'tree-child': t('relationTreeChild', '子块'),
    'tree-sibling': t('relationTreeSibling', '同级块'),
    'tree-parent': t('relationTreeParent', '父块'),
    path: t('activationKindManualJump', '手动跳转'),
  };
  return map[type] || type || t('routeMetaWorldline', '空间站');
}

function resolveNeuralOriginLabel(origin: NeuralPropagationOrigin | string | null | undefined): string | null {
  const map: Record<string, string> = {
    backlink: t('relationOriginBacklink', '反向链接'),
    'direct-ref': t('relationOriginDirectRef', '直接引用'),
    'indirect-ref': t('relationOriginIndirectRef', '间接引用'),
    descriptor: t('relationDescriptor', '描述符'),
    'block-tree': t('relationOriginBlockTree', '块树'),
    'document-tree': t('relationOriginDocumentTree', '文档树'),
  };
  const normalizedOrigin = String(origin || '').trim();
  return map[normalizedOrigin] || null;
}

function resolveNeuralActivationLabel(type: string): string {
  const map: Record<string, string> = {
    'focus-root': t('activationKindFocusRoot', '概念卡：轨道中心节点'),
    'source-root': t('activationKindSourceRoot', '概念卡：激活源'),
    'graph-edge': t('activationKindGraphEdge', '图关系激活'),
    'tree-edge': t('activationKindTreeEdge', '树关系激活'),
    'follow-path': t('activationKindFollowPath', '沿当前路径'),
    'manual-jump': t('activationKindManualJump', '手动跳转'),
  };
  return map[type] || type || t('activationTrace', '激活轨迹树');
}

function buildNeuralTraceRelationBadges(
  step: NeuralActivationTraceStep,
): NeuralActivationTraceStepViewModel['displayBadges'] {
  const badges: NeuralActivationTraceStepViewModel['displayBadges'] = [];
  const relationLabel = resolveNeuralRelationLabel(step.associationType);
  const originLabel = resolveNeuralOriginLabel(step.origin);
  const supportsOriginDetail =
    step.associationType === 'concept-link'
    || step.associationType === 'element-link'
    || step.associationType === 'tree-child'
    || step.associationType === 'tree-sibling'
    || step.associationType === 'tree-parent';

  pushTraceBadge(badges, `relation:${step.associationType}`, relationLabel, 'soft');
  if (supportsOriginDetail && originLabel && originLabel !== relationLabel) {
    pushTraceBadge(badges, `origin:${step.origin}`, originLabel, 'soft');
  }
  return badges;
}

type NeuralTraceSummaryStep = Pick<
  NeuralActivationTraceStep,
  'eventId' | 'nodeId' | 'activationKind' | 'sourceRole' | 'isSyntheticRoot'
>;

function isNeuralTraceRootSemanticStep(
  step: NeuralTraceSummaryStep | null | undefined,
  engineMode: NeuralEngineMode,
): boolean {
  if (!step) {
    return false;
  }
  if (engineMode === 'hyperspace') {
    return step.sourceRole === 'activation-source' || step.activationKind === 'source-root';
  }
  return step.sourceRole === 'orbit-center' || step.activationKind === 'focus-root';
}

function pickPreferredNeuralTraceStep<T extends Pick<NeuralTraceSummaryStep, 'isSyntheticRoot'>>(
  steps: T[],
): T | null {
  return steps.find((step) => !step.isSyntheticRoot) ?? steps[0] ?? null;
}

function resolveNeuralDirectActivatorStep<T extends Pick<NeuralTraceSummaryStep, 'eventId'>>(
  steps: T[],
): T | null {
  return steps.length > 1 ? steps[steps.length - 2] ?? null : null;
}

function resolveNeuralBranchRootStep<T extends NeuralTraceSummaryStep>(
  steps: T[],
  branchRootNodeId: string | null,
  engineMode: NeuralEngineMode,
): T | null {
  const rootedBranchCandidates = branchRootNodeId
    ? steps.filter((step) => step.nodeId === branchRootNodeId && isNeuralTraceRootSemanticStep(step, engineMode))
    : [];
  const matchedBranchRoot = pickPreferredNeuralTraceStep(rootedBranchCandidates);
  if (matchedBranchRoot) {
    return matchedBranchRoot;
  }

  const rootedSteps = steps.filter((step) => isNeuralTraceRootSemanticStep(step, engineMode));
  return pickPreferredNeuralTraceStep(rootedSteps) ?? steps[0] ?? null;
}

function resolveNeuralTraceStepByEventId<T extends Pick<NeuralTraceSummaryStep, 'eventId'>>(
  steps: T[],
  eventId: string | null | undefined,
): T | null {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) {
    return null;
  }
  return steps.find((step) => step.eventId === normalizedEventId) ?? null;
}

function pushTraceBadge(
  badges: NeuralActivationTraceStepViewModel['displayBadges'],
  key: string,
  label: string | null | undefined,
  tone: 'default' | 'soft' | 'root' | 'current' = 'soft',
): void {
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel) {
    return;
  }
  if (badges.some((badge) => badge.label === normalizedLabel || badge.key === key)) {
    return;
  }
  badges.push({ key, label: normalizedLabel, tone });
}

function buildNeuralTraceBadges(
  step: NeuralActivationTraceStep,
  options: {
    engineMode: NeuralEngineMode;
    isRoot: boolean;
    isDirectActivator: boolean;
    isTarget: boolean;
    isCurrent: boolean;
  },
): NeuralActivationTraceStepViewModel['displayBadges'] {
  const badges = buildNeuralTraceRelationBadges(step);
  const inferredLabel = t('traceStepSyntheticRoot', '推定');
  const isSemanticRoot = isNeuralTraceRootSemanticStep(step, options.engineMode);
  const shouldShowInferred = step.isSyntheticRoot || (options.isRoot && !isSemanticRoot);

  if (options.isRoot) {
    const rootLabel = options.engineMode === 'hyperspace'
      ? t('traceBadgePrimarySource', '主概念卡：激活源')
      : t('traceBadgeCurrentOrbitCenter', '当前概念卡：轨道中心');
    badges.length = 0;
    pushTraceBadge(badges, 'root-role', rootLabel, 'root');
  } else if (options.engineMode === 'hyperspace' && options.isDirectActivator) {
    pushTraceBadge(badges, 'direct-role', t('directConductor', '直接传导节点'));
  }

  if (shouldShowInferred) {
    pushTraceBadge(badges, 'synthetic-root', inferredLabel);
  }

  if (step.isVirtual) {
    pushTraceBadge(badges, 'virtual', t('virtualNode', '虚拟节点'), 'soft');
  }

  if (options.isTarget || options.isCurrent) {
    pushTraceBadge(badges, 'current', t('currentNodeTag', '当前'), 'current');
  }

  return badges;
}

function resolveNeuralHistoryEventRef(
  neuralQueue: ReturnType<typeof getNeuralRoamQueue>,
  historyEntries: Pick<NeuralRoamHistoryEntry, 'eventId' | 'nodeId'>[],
  navState: NeuralNavigationState,
): NeuralHistoryEventRef | null {
  if (neuralTracePinnedToSelection.value && selectedNeuralHistoryEventId.value) {
    const selectedEntry = historyEntries.find((entry) => entry.eventId === selectedNeuralHistoryEventId.value)
      ?? neuralQueue?.getHistoryEntryByEventId(selectedNeuralHistoryEventId.value);
    if (selectedEntry) {
      return {
        eventId: selectedEntry.eventId,
        nodeId: selectedEntry.nodeId,
      };
    }
    selectedNeuralHistoryEventId.value = null;
    neuralTracePinnedToSelection.value = false;
  }

  if (navState.currentEventId) {
    const currentEntry = historyEntries.find((entry) => entry.eventId === navState.currentEventId)
      ?? neuralQueue?.getHistoryEntryByEventId(navState.currentEventId);
    if (currentEntry) {
      return {
        eventId: currentEntry.eventId,
        nodeId: currentEntry.nodeId,
      };
    }
  }

  const latestEntry = historyEntries[0]
    ?? neuralQueue?.getHistoryPage({ offset: 0, limit: 1 }).entries[0]
    ?? null;
  if (!latestEntry) {
    return null;
  }

  return {
    eventId: latestEntry.eventId,
    nodeId: latestEntry.nodeId,
  };
}

function buildNeuralActivationTraceViewModel(
  trace: NeuralActivationTrace,
  options: {
    currentNodeId?: string | null;
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  } = {},
): NeuralActivationTraceViewModel {
  const currentNodeId = options.currentNodeId ?? null;
  const selectedTraceEventId = options.selectedTraceEventId ?? null;
  const selectedTraceNodeId = options.selectedTraceNodeId ?? null;
  const engineMode = trace.steps[trace.steps.length - 1]?.engineMode ?? trace.steps[0]?.engineMode ?? 'orbit';
  const directActivator = resolveNeuralDirectActivatorStep(trace.steps);
  const branchRoot = resolveNeuralBranchRootStep(trace.steps, trace.branchRootNodeId, engineMode);
  const directActivatorEventId = directActivator?.eventId ?? null;
  const branchRootEventId = branchRoot?.eventId ?? null;
  const steps = trace.steps.map((step, index) => ({
    ...step,
    relationLabel: resolveNeuralRelationLabel(step.associationType),
    activationLabel: resolveNeuralActivationLabel(step.activationKind),
    isCurrent: currentNodeId ? step.nodeId === currentNodeId : false,
    isTarget: index === trace.steps.length - 1,
    isRoot: branchRootEventId ? step.eventId === branchRootEventId : false,
    isSelected: resolveNeuralTraceStepIsSelected(step, index, trace.steps, {
      selectedTraceEventId,
      selectedTraceNodeId,
    }),
    previewable: Boolean(step.nodeId),
    jumpable: Boolean(step.nodeId),
    displayBadges: buildNeuralTraceBadges(step, {
      engineMode,
      isRoot: branchRootEventId ? step.eventId === branchRootEventId : false,
      isDirectActivator: directActivatorEventId ? step.eventId === directActivatorEventId : false,
      isTarget: index === trace.steps.length - 1,
      isCurrent: currentNodeId ? step.nodeId === currentNodeId : false,
    }),
  }));
  const resolvedDirectActivator = resolveNeuralTraceStepByEventId(steps, directActivatorEventId);
  const resolvedBranchRoot = resolveNeuralTraceStepByEventId(steps, branchRootEventId);
  const target = steps[steps.length - 1] ?? null;

  return {
    ...trace,
    engineMode,
    steps,
    targetTitle: target?.nodePreview || target?.nodeId || trace.targetNodeId,
    directActivatorTitle: resolvedDirectActivator?.nodePreview || resolvedDirectActivator?.nodeId || null,
    directActivatorEventId,
    directRelationLabel: resolveNeuralRelationLabel(target?.associationType || ''),
    directRelationBadges: target ? buildNeuralTraceRelationBadges(target) : [],
    branchRootTitle: resolvedBranchRoot?.nodePreview || resolvedBranchRoot?.nodeId || trace.branchRootNodeId,
    branchRootEventId,
  };
}

function isBlockIdFallbackLabel(label: string | null | undefined, nodeId: string): boolean {
  const normalizedLabel = String(label || '').trim();
  const normalizedNodeId = String(nodeId || '').trim();
  if (!normalizedNodeId) {
    return false;
  }
  return !normalizedLabel || normalizedLabel === normalizedNodeId;
}

async function enrichNeuralActivationTraceViewModel(
  trace: NeuralActivationTraceViewModel,
): Promise<NeuralActivationTraceViewModel> {
  const missingPreviewIds = Array.from(new Set(
    trace.steps
      .filter((step) => isBlockIdFallbackLabel(step.nodePreview, step.nodeId))
      .map((step) => step.nodeId)
      .filter(Boolean)
  ));

  if (missingPreviewIds.length === 0) {
    return trace;
  }

  const cards = await loadBrowserCardsByBlockIds(missingPreviewIds, { applyQueryFilter: false });
  const contentByNodeId = new Map(
    cards.map((card) => [
      card.blockId,
      String(card.content || card.fullContent || '').trim(),
    ]),
  );

  const steps = trace.steps.map((step) => {
    const resolvedContent = contentByNodeId.get(step.nodeId);
    if (!resolvedContent || !isBlockIdFallbackLabel(step.nodePreview, step.nodeId)) {
      return step;
    }
    return {
      ...step,
      nodePreview: resolvedContent,
    };
  });

  const directActivator = resolveNeuralTraceStepByEventId(steps, trace.directActivatorEventId);
  const branchRoot = resolveNeuralTraceStepByEventId(steps, trace.branchRootEventId);
  const target = steps[steps.length - 1] ?? null;

  return {
    ...trace,
    steps,
    targetTitle: target?.nodePreview || target?.nodeId || trace.targetNodeId,
    directActivatorTitle: directActivator?.nodePreview || directActivator?.nodeId || null,
    branchRootTitle: branchRoot?.nodePreview || branchRoot?.nodeId || trace.branchRootNodeId,
  };
}

function resetNeuralTraceConvergenceState(): void {
  neuralTraceConvergenceRequestSeq += 1;
  neuralTraceConvergenceCache.clear();
  neuralTraceRouteViewModelCache.clear();
}

function buildNeuralTraceConvergenceCacheKey(traceTargetEventId: string, stepEventId: string): string {
  return `${traceTargetEventId}::${stepEventId}`;
}

function withNeuralTraceRepeatHitState(
  trace: NeuralActivationTraceViewModel,
  neuralQueue: ReturnType<typeof getNeuralRoamQueue>,
): NeuralActivationTraceViewModel {
  const repeatHitCountByNodeId = new Map<string, number>();
  const steps = trace.steps.map((step) => {
    let repeatHitCount = repeatHitCountByNodeId.get(step.nodeId);
    if (repeatHitCount === undefined) {
      repeatHitCount = Math.max(1, neuralQueue?.getHistoryHitCount(step.nodeId) ?? 1);
      repeatHitCountByNodeId.set(step.nodeId, repeatHitCount);
    }

    return {
      ...step,
      repeatHitCount,
      convergenceStatus: 'idle' as const,
      convergence: null,
    };
  });

  return {
    ...trace,
    steps,
  };
}

function updateNeuralTraceStepConvergenceState(
  trace: NeuralActivationTraceViewModel,
  stepEventId: string,
  updates: Pick<NeuralActivationTraceStepViewModel, 'convergenceStatus' | 'convergence'>,
): NeuralActivationTraceViewModel {
  return {
    ...trace,
    steps: trace.steps.map((step) => (
      step.eventId === stepEventId
        ? {
          ...step,
          convergenceStatus: updates.convergenceStatus,
          convergence: updates.convergence,
        }
        : step
    )),
  };
}

function resolveNeuralTraceStepIsSelected(
  step: Pick<NeuralActivationTraceStepViewModel, 'eventId' | 'nodeId'>,
  index: number,
  steps: readonly Pick<NeuralActivationTraceStepViewModel, 'eventId' | 'nodeId'>[],
  options: {
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  } = {},
): boolean {
  const selectedTraceEventId = options.selectedTraceEventId ?? null;
  const selectedTraceNodeId = options.selectedTraceNodeId ?? null;
  if (selectedTraceEventId) {
    return step.eventId === selectedTraceEventId;
  }
  if (selectedTraceNodeId) {
    return step.nodeId === selectedTraceNodeId;
  }
  return index === steps.length - 1;
}

function applyNeuralTraceSelectionState(
  trace: NeuralActivationTraceViewModel | null,
  options: {
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  } = {},
): NeuralActivationTraceViewModel | null {
  if (!trace) {
    return trace;
  }
  return {
    ...trace,
    steps: trace.steps.map((step, index, steps) => ({
      ...step,
      isSelected: resolveNeuralTraceStepIsSelected(step, index, steps, options),
    })),
  };
}

function setSelectedNeuralTraceState(
  options: {
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  } = {},
): void {
  selectedNeuralTraceEventId.value = options.selectedTraceEventId ?? null;
  selectedNeuralTraceNodeId.value = options.selectedTraceNodeId ?? null;
  neuralActivationTrace.value = applyNeuralTraceSelectionState(neuralActivationTrace.value, options);
  if (neuralActivationTrace.value) {
    neuralTraceRouteViewModelCache.set(neuralActivationTrace.value.targetEventId, neuralActivationTrace.value);
  }
}

async function handleOpenAiWorkbench(): Promise<void> {
  const dialogManager = pluginContext.value?.getDialogManager?.();
  if (!dialogManager?.openAiWorkbenchDialog) {
    await pushErrMsg(t('pluginNotReady', 'Plugin not ready'));
    return;
  }

  const selectedBlockIds = Array.from(new Set(
    (selectedRows.value || [])
      .map((row) => String(row?.blockId || '').trim())
      .filter((blockId) => blockId.length > 0),
  ));
  const previewBlockId = String(previewCard.value?.blockId || '').trim();
  const effectiveBlockIds = selectedBlockIds.length > 0
    ? selectedBlockIds
    : previewBlockId
      ? [previewBlockId]
      : [];

  if (effectiveBlockIds.length === 0) {
    await pushMsg(t('browserAiNoSelection', '请先选择卡片或打开一个预览块'), 3000, 'error');
    return;
  }

  await dialogManager.openAiWorkbenchDialog({
    view: 'explain',
    source: 'browser',
    selectedBlockIds: effectiveBlockIds,
    currentBlockId: selectedBlockIds.length === 0 ? previewBlockId || null : null,
    queueType: currentQueueType.value || null,
    neuralBatch: getNeuralRoamQueue()?.getCurrentBatchSnapshot() ?? null,
  });
}

function resolveNeuralTraceRouteViewModelByEventId(
  neuralQueue: ReturnType<typeof getNeuralRoamQueue>,
  eventId: string,
  options: {
    currentNodeId?: string | null;
    currentTrace?: NeuralActivationTraceViewModel | null;
  } = {},
): NeuralActivationTraceViewModel | null {
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) {
    return null;
  }
  if (options.currentTrace?.targetEventId === normalizedEventId) {
    return options.currentTrace;
  }
  if (neuralTraceRouteViewModelCache.has(normalizedEventId)) {
    return neuralTraceRouteViewModelCache.get(normalizedEventId) ?? null;
  }
  const routeTrace = neuralQueue?.getActivationTrace(normalizedEventId);
  if (!routeTrace) {
    neuralTraceRouteViewModelCache.set(normalizedEventId, null);
    return null;
  }
  const viewModel = buildNeuralActivationTraceViewModel(routeTrace, {
    currentNodeId: options.currentNodeId ?? null,
  });
  neuralTraceRouteViewModelCache.set(normalizedEventId, viewModel);
  return viewModel;
}

function resolveNeuralConvergenceForTraceStep(
  neuralQueue: ReturnType<typeof getNeuralRoamQueue>,
  trace: NeuralActivationTraceViewModel,
  stepEventId: string,
  options: {
    currentNodeId?: string | null;
  } = {},
): NeuralTraceConvergenceViewModel | null {
  if (!neuralQueue) {
    return null;
  }
  const step = trace.steps.find((candidate) => candidate.eventId === stepEventId) ?? null;
  if (!step || (step.repeatHitCount ?? 1) <= 1) {
    return null;
  }
  const matchingEntries = neuralQueue.getHistoryEntriesByNodeId(step.nodeId);
  if (matchingEntries.length <= 1) {
    return null;
  }
  return resolveNeuralTraceConvergenceForStep({
    step,
    historyIndex: buildNeuralHistoryIndex(matchingEntries),
    currentTrace: trace.targetEventId === stepEventId ? trace : null,
    getActivationTrace: (eventId) => neuralQueue.getActivationTrace(eventId),
    buildTraceViewModel: (routeTrace) => resolveNeuralTraceRouteViewModelByEventId(
      neuralQueue,
      routeTrace.targetEventId,
      { currentNodeId: options.currentNodeId ?? null },
    ) ?? buildNeuralActivationTraceViewModel(routeTrace, {
      currentNodeId: options.currentNodeId ?? null,
    }),
    traceViewModelCache: neuralTraceRouteViewModelCache,
  });
}

async function buildAggregatedNeuralActivationTraceViewModel(
  neuralQueue: ReturnType<typeof getNeuralRoamQueue>,
  trace: NeuralActivationTrace,
  options: {
    currentNodeId?: string | null;
    selectedTraceEventId?: string | null;
    selectedTraceNodeId?: string | null;
  } = {},
): Promise<NeuralActivationTraceViewModel> {
  resetNeuralTraceConvergenceState();
  const traceViewModel = buildNeuralActivationTraceViewModel(trace, options);
  const enrichedTrace = await enrichNeuralActivationTraceViewModel(traceViewModel);
  let preparedTrace = withNeuralTraceRepeatHitState(enrichedTrace, neuralQueue);
  neuralTraceRouteViewModelCache.set(preparedTrace.targetEventId, preparedTrace);

  const targetStep = preparedTrace.steps[preparedTrace.steps.length - 1] ?? null;
  if (!targetStep || (targetStep.repeatHitCount ?? 1) <= 1) {
    return preparedTrace;
  }

  const targetConvergence = resolveNeuralConvergenceForTraceStep(
    neuralQueue,
    preparedTrace,
    targetStep.eventId,
    { currentNodeId: options.currentNodeId ?? null },
  );
  neuralTraceConvergenceCache.set(
    buildNeuralTraceConvergenceCacheKey(preparedTrace.targetEventId, targetStep.eventId),
    targetConvergence,
  );
  preparedTrace = updateNeuralTraceStepConvergenceState(preparedTrace, targetStep.eventId, {
    convergenceStatus: 'ready',
    convergence: targetConvergence,
  });
  neuralTraceRouteViewModelCache.set(preparedTrace.targetEventId, preparedTrace);
  return preparedTrace;
}

async function syncNeuralActivationTrace(
  neuralQueue: ReturnType<typeof getNeuralRoamQueue>,
  historyEntries: Pick<NeuralRoamHistoryEntry, 'eventId' | 'nodeId'>[],
  navState: NeuralNavigationState,
): Promise<void> {
  if (!neuralQueue || neuralQueue.getHistoryCount() === 0) {
    selectedNeuralHistoryEventId.value = null;
    neuralActivationTrace.value = null;
    neuralTracePinnedToSelection.value = false;
    selectedNeuralTraceEventId.value = null;
    selectedNeuralTraceNodeId.value = null;
    resetNeuralTraceConvergenceState();
    return;
  }

  const targetRef = resolveNeuralHistoryEventRef(neuralQueue, historyEntries, navState);
  if (!targetRef) {
    selectedNeuralHistoryEventId.value = null;
    neuralActivationTrace.value = null;
    selectedNeuralTraceEventId.value = null;
    selectedNeuralTraceNodeId.value = null;
    resetNeuralTraceConvergenceState();
    return;
  }

  selectedNeuralHistoryEventId.value = targetRef.eventId;
  const trace = neuralQueue.getActivationTrace(targetRef.eventId);
  if (!trace) {
    neuralActivationTrace.value = null;
    resetNeuralTraceConvergenceState();
    return;
  }

  const availableEventIds = new Set(trace.steps.map((step) => step.eventId));
  const availableNodeIds = new Set(trace.steps.map((step) => step.nodeId));
  if (!selectedNeuralTraceEventId.value || !availableEventIds.has(selectedNeuralTraceEventId.value)) {
    selectedNeuralTraceEventId.value = trace.targetEventId;
  }
  if (!selectedNeuralTraceNodeId.value || !availableNodeIds.has(selectedNeuralTraceNodeId.value)) {
    selectedNeuralTraceNodeId.value = trace.targetNodeId;
  }
  neuralActivationTrace.value = await buildAggregatedNeuralActivationTraceViewModel(neuralQueue, trace, {
    currentNodeId: navState.currentNodeId,
    selectedTraceEventId: selectedNeuralTraceEventId.value,
    selectedTraceNodeId: selectedNeuralTraceNodeId.value,
  });
}

async function refreshNeuralSubviewData(): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    clearNeuralSubviewData();
    return;
  }

  const navState = neuralQueue.getNavigationState();
  const sourceSnapshot = neuralQueue.getSourceSnapshot();
  const historyPage = neuralQueue.getHistoryPage({
    offset: 0,
    limit: Math.max(NEURAL_HISTORY_PAGE_SIZE, neuralHistoryRequestedCount.value),
  });
  const anchorSnapshot = neuralQueue.getAnchorSnapshot();
  await syncNeuralActivationTrace(neuralQueue, historyPage.entries, navState);
  const anchorIds = new Set(anchorSnapshot.map((entry) => entry.nodeId));
  neuralSourceEntries.value = toNeuralSourceListEntries(sourceSnapshot, {
    currentNodeId: navState.currentNodeId,
  });
  neuralHistoryEntries.value = toNeuralHistoryListEntries(historyPage.entries, {
    anchorIds,
    currentNodeId: navState.currentNodeId,
    selectedEventId: selectedNeuralHistoryEventId.value,
    getRepeatHitCount: (nodeId) => neuralQueue.getHistoryHitCount(nodeId),
  });
  neuralHistoryTotalCount.value = historyPage.totalCount;
  neuralHistoryHasMore.value = historyPage.hasMore;
  const currentSessionNodeIds = new Set(
    historyPage.entries
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
  const cards = await loadBrowserCardsByBlockIds([nodeId], { applyQueryFilter: false });
  if (requestSeq !== neuralPreviewRequestSeq) {
    return;
  }
  previewCard.value = cards[0] || null;
}

async function handleNeuralExternalNodePreview(nodeId: string): Promise<void> {
  setSelectedNeuralTraceState({
    selectedTraceEventId: null,
    selectedTraceNodeId: nodeId,
  });
  await handleNeuralPreview(nodeId);
}

async function handleNeuralSelectHistoryEntry(entry: Pick<NeuralRoamHistoryEntry, 'eventId' | 'nodeId'>): Promise<void> {
  selectedNeuralHistoryEventId.value = entry.eventId;
  neuralTracePinnedToSelection.value = true;
  setSelectedNeuralTraceState({
    selectedTraceEventId: entry.eventId,
    selectedTraceNodeId: entry.nodeId,
  });

  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    neuralActivationTrace.value = null;
    resetNeuralTraceConvergenceState();
    return;
  }

  const trace = neuralQueue.getActivationTrace(entry.eventId);
  if (trace) {
    neuralActivationTrace.value = await buildAggregatedNeuralActivationTraceViewModel(neuralQueue, trace, {
      currentNodeId: neuralCurrentNodeId.value,
      selectedTraceEventId: selectedNeuralTraceEventId.value,
      selectedTraceNodeId: selectedNeuralTraceNodeId.value,
    });
  } else {
    neuralActivationTrace.value = null;
    resetNeuralTraceConvergenceState();
  }
  neuralHistoryEntries.value = neuralHistoryEntries.value.map((item) => ({
    ...item,
    isCurrent: neuralCurrentNodeId.value ? item.nodeId === neuralCurrentNodeId.value : false,
    isSelected: item.eventId === entry.eventId,
  }));
}

async function ensureNeuralStepConvergenceResolved(stepEventId: string): Promise<void> {
  const currentTrace = neuralActivationTrace.value;
  const currentTargetEventId = currentTrace?.targetEventId ?? null;
  const currentStep = currentTrace?.steps.find((step) => step.eventId === stepEventId) ?? null;
  if (!currentTrace || !currentStep || (currentStep.repeatHitCount ?? 1) <= 1) {
    return;
  }
  if (currentStep.convergenceStatus === 'ready' || currentStep.convergenceStatus === 'loading') {
    return;
  }

  const cacheKey = buildNeuralTraceConvergenceCacheKey(currentTargetEventId, stepEventId);
  if (neuralTraceConvergenceCache.has(cacheKey)) {
    neuralActivationTrace.value = updateNeuralTraceStepConvergenceState(currentTrace, stepEventId, {
      convergenceStatus: 'ready',
      convergence: neuralTraceConvergenceCache.get(cacheKey) ?? null,
    });
    return;
  }

  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  const requestSeq = ++neuralTraceConvergenceRequestSeq;
  neuralActivationTrace.value = updateNeuralTraceStepConvergenceState(currentTrace, stepEventId, {
    convergenceStatus: 'loading',
    convergence: null,
  });

  await nextTick();

  const latestTrace = neuralActivationTrace.value;
  if (!latestTrace || latestTrace.targetEventId !== currentTargetEventId || requestSeq !== neuralTraceConvergenceRequestSeq) {
    return;
  }

  const resolvedConvergence = resolveNeuralConvergenceForTraceStep(
    neuralQueue,
    latestTrace,
    stepEventId,
    { currentNodeId: neuralCurrentNodeId.value },
  );

  if (!neuralActivationTrace.value || neuralActivationTrace.value.targetEventId !== currentTargetEventId || requestSeq !== neuralTraceConvergenceRequestSeq) {
    return;
  }

  neuralTraceConvergenceCache.set(cacheKey, resolvedConvergence);
  neuralActivationTrace.value = updateNeuralTraceStepConvergenceState(neuralActivationTrace.value, stepEventId, {
    convergenceStatus: 'ready',
    convergence: resolvedConvergence,
  });
  neuralTraceRouteViewModelCache.set(neuralActivationTrace.value.targetEventId, neuralActivationTrace.value);
}

async function handleNeuralSelectTraceStep(eventId: string): Promise<void> {
  const traceStep = neuralActivationTrace.value?.steps.find((step) => step.eventId === eventId) ?? null;
  setSelectedNeuralTraceState({
    selectedTraceEventId: eventId,
    selectedTraceNodeId: traceStep?.nodeId ?? null,
  });
  if (!neuralActivationTrace.value) {
    return;
  }
  if (eventId === neuralActivationTrace.value.targetEventId) {
    selectedNeuralHistoryEventId.value = eventId;
  }
  if ((traceStep?.repeatHitCount ?? 1) > 1 && traceStep?.convergenceStatus !== 'ready') {
    void ensureNeuralStepConvergenceResolved(eventId);
  }
}

async function handleNeuralRequestConvergenceDetails(eventId: string): Promise<void> {
  await ensureNeuralStepConvergenceResolved(eventId);
}

async function handleNeuralTracePreview(nodeId: string): Promise<void> {
  selectedNeuralTraceNodeId.value = nodeId;
  await handleNeuralPreview(nodeId);
}

async function handleNeuralTraceJump(nodeId: string): Promise<void> {
  selectedNeuralTraceNodeId.value = nodeId;
  await handleNeuralJump(nodeId);
}

async function handleNeuralSwitchTraceEvent(eventId: string): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }
  const historyEntry = neuralQueue.getHistoryEntryByEventId(eventId);
  if (!historyEntry) {
    return;
  }
  await handleNeuralSelectHistoryEntry(historyEntry);
}

async function handleNeuralLoadMoreHistory(): Promise<void> {
  if (neuralHistoryLoadingMore.value || !neuralHistoryHasMore.value) {
    return;
  }

  neuralHistoryLoadingMore.value = true;
  neuralHistoryRequestedCount.value += NEURAL_HISTORY_PAGE_SIZE;
  try {
    await refreshNeuralSubviewData();
  } finally {
    neuralHistoryLoadingMore.value = false;
  }
}

async function handoffNeuralReviewSurface(fallbackNodeId?: string | null): Promise<void> {
  const result = await handoffNeuralNavigationToReviewSurface(
    {
      tabManager: pluginContext.value?.getTabManager?.() ?? null,
      dialogManager: pluginContext.value?.getDialogManager?.() ?? null,
    },
    {
      fallbackNodeId: fallbackNodeId ?? null,
    },
  );

  if (result === 'tab' && mode.value === 'dialog') {
    emit('close');
    return;
  }

  if (result === 'failed') {
    await pushErrMsg(t('syncOpenReviewTabFailed', 'Failed to sync the open review tab'));
  }
}

async function handleNeuralJump(nodeId: string): Promise<void> {
  setSelectedNeuralTraceState({
    selectedTraceEventId: null,
    selectedTraceNodeId: nodeId,
  });
  await handleNeuralPreview(nodeId);

  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    await pushErrMsg(t('jumpHistoryNodeFailed', 'Failed to jump trajectory node'));
    return;
  }

  const jumped = await neuralQueue.jumpToHistoryNode(nodeId);
  await refreshNeuralSubviewData();
  await refreshQueueCounts();

  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    await handleNeuralPreview(navState.currentNodeId);
  }

  if (!jumped) {
    await pushErrMsg(t('jumpHistoryNodeFailed', 'Failed to jump trajectory node'));
    return;
  }

  await handoffNeuralReviewSurface(navState.currentNodeId || nodeId);
}

async function handleNeuralJumpAnchor(nodeId: string): Promise<void> {
  await handleNeuralJump(nodeId);
}

async function handleNeuralSetCurrentFocus(nodeId: string): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  setSelectedNeuralTraceState({
    selectedTraceEventId: null,
    selectedTraceNodeId: nodeId,
  });
  await neuralQueue.setCurrentFocus(nodeId, {
    includeFocusAsFirst: false,
    resetHistory: false,
    bookmarkCurrentPath: true,
  });
  await refreshNeuralSubviewData();
  await refreshQueueCounts();
  await handleNeuralPreview(nodeId);
  await handoffNeuralReviewSurface(nodeId);
}

async function handleNeuralToggleSource(nodeId: string, enabled: boolean): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  await neuralQueue.setSourceEntry(nodeId, enabled);
  await refreshNeuralSubviewData();
  await refreshQueueCounts();
}

async function handleNeuralToggleEngineMode(): Promise<void> {
  const neuralQueue = getNeuralRoamQueue();
  if (!neuralQueue) {
    return;
  }

  const currentMode = neuralQueue.getEngineMode();
  const nextMode = currentMode === 'hyperspace' ? 'orbit' : 'hyperspace';
  await neuralQueue.setEngineMode(nextMode, { carryCurrentNode: true });
  await refreshNeuralSubviewData();
  await refreshQueueCounts();

  const navState = neuralQueue.getNavigationState();
  if (navState.currentNodeId) {
    setSelectedNeuralTraceState({
      selectedTraceEventId: null,
      selectedTraceNodeId: navState.currentNodeId,
    });
    await handleNeuralPreview(navState.currentNodeId);
  }

  const modeText = getNeuralEngineLabel(nextMode, t, 'full');
  await pushMsg(t('engineModeSwitched', '已切换引擎：{mode}').replace('{mode}', modeText));
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
    ? t('navModeFollow', '沿当前路径')
    : t('navModeExplore', '自由航行');
  await pushMsg(t('navModeSwitched', '已切换为：{mode}').replace('{mode}', modeText));
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
    setSelectedNeuralTraceState({
      selectedTraceEventId: null,
      selectedTraceNodeId: navState.currentNodeId,
    });
    await handleNeuralPreview(navState.currentNodeId);
  }
  await handoffNeuralReviewSurface(navState.currentNodeId);
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
    title: t('clearHistory', '清空轨迹历史'),
    content: t('confirmClearHistoryAll', '确认清空全部轨迹历史？'),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  });
  if (!ok) {
    return;
  }

  try {
    neuralHistoryRequestedCount.value = NEURAL_HISTORY_PAGE_SIZE;
    neuralQueue.clearHistory('all');
    await refreshNeuralSubviewData();
    await refreshQueueCounts();
    await pushMsg(t('historyClearedSuccess', '轨迹历史已清空'));
  } catch (error) {
    logger.error('Failed to clear neural history:', error);
    await pushErrMsg(t('clearHistoryFailed', '清空轨迹历史失败'));
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

  return loadAllRowsFromQueryableDataSource(dataSource, sortModel, {
    chunkSize: 500,
  });
}

function applyRandomSortRows(rowsForRandom: BrowserCard[] | null): void {
  randomSortRows.value = rowsForRandom ? [...rowsForRandom] : null;
  rebuildInfiniteDatasource(false);
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
  
  await runWithSuspendedBrowserStateBootstrap(async () => {
    activeQueueId.value = queueId;
    activeDocId.value = null;
    shouldFocusDocList.value = true;
    syncSelectionForQueryChange();

    currentCardType.value = cardTypeTransition.nextCardType;
    previousNonNeuralCardType.value = cardTypeTransition.nextPreviousNonNeuralCardType;

    if (isNeuralQueueId(queueId)) {
      neuralSubview.value = 'concept-cards';
    }

    syncGlobalBrowserContext();

    logger.info('[SiYuanMemo][SRSBrowser] 馃攳 After clearing activeDocId:', {
      activeDocId: activeDocId.value,
      shouldFocusDocList: shouldFocusDocList.value,
      currentCardType: currentCardType.value,
      previousNonNeuralCardType: previousNonNeuralCardType.value,
    });

    await loadData(false, { refreshQueueCounts: false, snapshotDelayMs: 120 });
  });
}

async function applyInitialBrowserView(forceRefresh = false): Promise<void> {
  if (props.initialOpenState) {
    await applyInitialBrowserOpenState(props.initialOpenState, forceRefresh);
    return;
  }

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

async function handleSelectGlobal(type: '__all__' | '__dismissed__') {
  await runWithSuspendedBrowserStateBootstrap(async () => {
    syncSelectionForQueryChange();
    activeQueueId.value = null;
    clearNeuralSubviewData();
    activeDocId.value = null;

    currentPreset.value = type === '__dismissed__' ? 'suspended' : 'all';
    currentCardType.value = 'all';
    searchQuery.value = '';
    shouldFocusDocList.value = false;
    syncGlobalBrowserContext();

    await loadData(false, {
      refreshQueueCounts: false,
      snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
    });
  });
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
