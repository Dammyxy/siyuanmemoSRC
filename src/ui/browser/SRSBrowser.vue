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
          :document-counts="hierarchyDocumentCounts"
          :queues="{ active: activeQueueId || '', counts: queueCounts }"
          :focusedDocIds="focusedDocIds"
          :globalStats="globalStats"
          :activeGlobal="activeGlobalScope"
          :activeDocId="activeDocId"
          :mobile-mode="isMobileMode"
          :i18n="props.i18n"
          :siyuan-api="browserSiyuanApi"
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
        :showExitFocus="showToolbarExitScope"
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
        :active-scope-doc-ids="activeScopeDocIds"
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
        @showPerformanceReport="showPerformanceReport"
        @convertToTab="convertToTab"
        @openFilterDialog="showFilterDialog = true"
        @openSpreadDialog="handleOpenSpreadDialog"
        @rebuildQueue="handleRebuildQueue"
        @selectCurrentPage="handleSelectCurrentPage"
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
        v-if="isNeuralRoamQueueActive && !isBrowserSemanticWorkspaceActive"
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
      <div v-if="firstPageState.showShellLoading" class="card-browser__loading">
        <div class="fn__loading"></div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="firstPageState.showEmptyState"
        class="card-browser__empty"
      >
        <div>📭</div>
        <span>{{ t('noCards', 'No cards') }}</span>
      </div>

      <!-- AG-Grid table -->
      <div v-else-if="firstPageState.showGrid" class="card-browser__grid">
        <ag-grid-vue
          class="ag-theme-balham card-browser-grid"
          style="width: 100%; height: 100%;"
          :columnDefs="columnDefs"
          rowModelType="infinite"
          :pagination="desktopPaginationEnabled"
          :paginationPageSize="desktopPageSize"
          :paginationPageSizeSelector="[20, 32, 50, 100]"
          :cacheBlockSize="gridCacheBlockSize"
          :maxBlocksInCache="gridMaxBlocksInCache"
          :infiniteInitialRowCount="gridCacheBlockSize"
          :defaultColDef="defaultColDef"
          :getRowId="getGridRowId"
          :rowSelection="rowSelection"
          :getRowClass="getBrowserRowClass"
          :enableCellTextSelection="true"
          :animateRows="false"
          :suppressCellFocus="true"
          :suppressRowHoverHighlight="false"
          :rowBuffer="gridRowBuffer"
          @grid-ready="onGridReady"
          @first-data-rendered="onFirstDataRendered"
          @model-updated="onModelUpdated"
          @filter-changed="onFilterChanged"
          @sort-changed="onSortChanged"
          @displayed-columns-changed="onDisplayedColumnsChanged"
          @pagination-changed="onPaginationChanged"
          @selection-changed="onSelectionChanged"
          @row-clicked="onRowClicked"
          @row-double-clicked="onRowDoubleClicked"
          @cell-context-menu="onCellContextMenu"
        />
        <div
          v-if="firstPageState.overlayKind"
          class="card-browser__grid-first-page-overlay"
          :class="`card-browser__grid-first-page-overlay--${firstPageState.overlayKind}`"
        >
          <div class="fn__loading"></div>
        </div>
      </div>

      <div
        v-else
        class="card-browser__neural-subview"
        :class="{ 'card-browser__neural-subview--roam-path': isNeuralHistorySubview }"
      >
        <NeuralNavigationBar
          :i18n="props.i18n"
          :siyuan-api="browserSiyuanApi"
          :navigation-state="neuralNavigationState"
          :workspace-mode="neuralWorkspaceMode"
          @select-workspace-mode="handleSelectNeuralWorkspaceMode"
          @toggle-engine-mode="handleNeuralToggleEngineMode"
          @toggle-nav-mode="handleNeuralToggleNavigationMode"
          @return-bookmark="handleNeuralReturnToBookmark"
        />
        <NeuralRouteBar
          v-if="!isBrowserSemanticWorkspaceActive"
          :i18n="props.i18n"
          :routes="neuralRoutes"
          :busy="neuralRouteBusy"
          @switch-route="handleNeuralSwitchRoute"
          @create-route="handleNeuralCreateRoute"
          @rename-route="handleNeuralRenameRoute"
          @delete-route="handleNeuralDeleteRoute"
          @save-temporary-route="handleNeuralSaveTemporaryRoute"
        />
        <section
          v-if="isBrowserSemanticWorkspaceActive"
          class="card-browser__semantic-workspace"
          aria-label="Browser Semantic Review"
        >
          <div class="card-browser__semantic-root-pool">
            <div class="card-browser__semantic-root-pool-header">
              <span>{{ t('semanticRootCandidates', 'Semantic Roots') }}</span>
              <span class="ft__secondary">{{ neuralSourceEntries.length }}</span>
            </div>
            <div
              v-if="neuralSourceEntries.length === 0"
              class="card-browser__semantic-empty"
            >
              {{ t('semanticRootPoolEmpty', 'No concept roots available. Add Concept cards to the Neural Roam pool first.') }}
            </div>
            <button
              v-for="entry in neuralSourceEntries"
              v-else
              :key="`${entry.nodeId}-${entry.addedAt}`"
              type="button"
              class="card-browser__semantic-root"
              :class="{ 'card-browser__semantic-root--active': browserSemanticState.model?.rootNode.nodeId === entry.nodeId }"
              @click="handleBrowserSemanticStartFromNeuralRoot(entry.nodeId)"
            >
              <span>{{ entry.nodePreview || entry.nodeId }}</span>
              <small>{{ t('startSemanticRoot', 'Start Semantic') }}</small>
            </button>
          </div>
          <div class="card-browser__semantic-workbench">
            <BrowserSemanticNavigator
              v-if="browserSemanticState.model"
              :model="browserSemanticState.model"
              :i18n="props.i18n"
              :pending="browserSemanticPending"
              :unavailable="browserSemanticState.unavailable"
              @follow="handleBrowserSemanticFollow"
              @create-station="handleBrowserSemanticCreateStation"
              @archive-station="handleBrowserSemanticArchiveStation"
              @open-node-station="handleBrowserSemanticOpenNodeStation"
              @restore-path-station="handleBrowserSemanticRestorePathStation"
              @open-review="handleBrowserSemanticOpenInReview"
              @end-session="handleBrowserSemanticEndSession"
            />
            <div
              v-else
              class="card-browser__semantic-unavailable"
              role="alert"
            >
              <strong>{{ t('browserSemanticUnavailable', 'Semantic Workbench unavailable') }}</strong>
              <span>{{ browserSemanticState.unavailable?.message || t('browserSemanticNoSession', 'Select a Concept from the pool to start Semantic.') }}</span>
            </div>
          </div>
        </section>
        <NeuralFocusList
          v-else-if="neuralSubview === 'concept-cards'"
          :i18n="props.i18n"
          :entries="neuralSourceEntries"
          :selected-node-id="selectedNeuralTraceNodeId"
          :engine-mode="neuralNavigationState?.engineMode || 'orbit'"
          @preview="handleNeuralExternalNodePreview"
          @set-current-focus="handleNeuralSetCurrentFocus"
          @toggle-source="handleNeuralToggleSource"
        />
        <template v-else-if="isNeuralHistorySubview">
          <div v-if="showNarrowRoamLayout" class="card-browser__neural-roam-stack">
            <div class="card-browser__neural-roam-segments" role="tablist" :aria-label="neuralHistorySubviewLabel">
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
              :allow-clear-history="canClearNeuralHistory"
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
              :allow-clear-history="canClearNeuralHistory"
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
          :document-counts="hierarchyDocumentCounts"
          :queues="{ active: activeQueueId || '', counts: queueCounts }"
          :focusedDocIds="focusedDocIds"
          :globalStats="globalStats"
          :activeGlobal="activeGlobalScope"
          :activeDocId="activeDocId"
          :mobile-mode="isMobileMode"
          :i18n="props.i18n"
          :siyuan-api="browserSiyuanApi"
          @selectQueue="handleSelectQueue"
          @selectDoc="handleSelectDoc"
          @filterDoc="handleFilterDoc"
          @selectGlobal="handleSelectGlobal"
        />
      </div>
    </div>

    <nav
      v-if="isMobileMode"
      class="card-browser__mobile-tabs"
      :aria-label="t('mobileBrowserTabs', '浏览器切页')"
    >
      <button
        type="button"
        class="card-browser__mobile-tab"
        :class="{ 'card-browser__mobile-tab--active': !navigatorOpen && !showPreview }"
        @click="showMobileCardsPane"
      >
        <svg><use xlink:href="#iconList"></use></svg>
        <span>{{ t('mobileBrowserCards', '卡片') }}</span>
      </button>
      <button
        type="button"
        class="card-browser__mobile-tab"
        :class="{ 'card-browser__mobile-tab--active': navigatorOpen }"
        @click="toggleMobileNavigator"
      >
        <svg><use xlink:href="#iconFiles"></use></svg>
        <span>{{ t('mobileBrowserNavigator', '导航') }}</span>
      </button>
      <button
        type="button"
        class="card-browser__mobile-tab"
        :class="{ 'card-browser__mobile-tab--active': showPreview }"
        @click="toggleMobilePreview"
      >
        <svg><use xlink:href="#iconPreview"></use></svg>
        <span>{{ t('preview', '预览') }}</span>
      </button>
    </nav>

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
      :siyuan-api="browserPreviewSiyuanApi"
      @jump="jumpToBlock"
      @delete-card="handlePreviewDeleteCard"
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
  PaginationChangedEvent,
  RowClickedEvent,
  RowDoubleClickedEvent,
  RowSelectionOptions,
  SortChangedEvent,
} from 'ag-grid-community';
import { openTab, Protyle, type App } from 'siyuan';
import { confirmDialog, inputDialog } from '@/utils/dialog';
import {
  loadBrowserCardsByBlockIds,
  invalidateCardCache,
  getCacheStats,
  subscribeCacheUpdate,
  loadQueueCards,
  pushBrowserErrMsg,
  pushBrowserMsg,
} from './browserService';
import { PerformanceMonitor } from '@/utils/performance';
import {
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
  printRuntimePerformanceDiagnosticsReport,
  recordRuntimePerformanceSpan,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
import { runBrowserForceRefresh } from './forceRefreshDataPlan';
import {
  applyBackendBrowserStats,
  applyLoadedAllCardsTotal,
  type BrowserGlobalStatsScope,
} from './browserGlobalStatsRuntime';
import {
  type BrowserCard,
  type BrowserMode,
  type BrowserOpenState,
  type BrowserViewMode,
  type CardTypeFilter,
} from './types';
import {
  resolveBrowserLayoutProfile,
  resolveDefaultBrowserNarrowRoamPane,
  resolveDefaultBrowserShowPreview,
  type BrowserChromePreferenceKey,
  type BrowserLayoutProfile,
  type BrowserNarrowRoamPane,
} from './layoutProfile';
import {
  readBrowserChromePreferences,
  writeBrowserChromePreference,
  type BrowserChromePreferenceValue,
} from './browserChromePreferences';
import {
  captureBrowserOpenState,
  normalizeBrowserNeuralSubview,
  normalizeBrowserQueueId,
  resolveInitialBrowserOpenState,
} from './browserSurfaceState';
import {
  DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
  normalizeHierarchySnapshotDelayMs,
  shouldDelayHierarchySnapshot,
} from './hierarchySnapshotPlan';
import { resolveBrowserGridSizing } from './browserGridSizing';
import { migrateExistingCards, checkMigrationNeeded } from '@/scripts/migrateToTopicItem';
import type {
  ICardDataSource,
  SortModel,
} from './datasource/types';
import { hasQuerySessionInvalidation, isBrowserQueryableDataSource } from './datasource/types';
import BrowserHierarchy from './BrowserHierarchy.vue';
import BrowserPreview from './BrowserPreview.vue';
import BrowserToolbar from './BrowserToolbar.vue';
import BrowserSemanticNavigator from './semantic/BrowserSemanticNavigator.vue';
import { createBrowserSemanticWorkspaceRuntime } from './semantic/BrowserSemanticWorkspaceRuntime';
import NeuralAnchorList from './neural/NeuralAnchorList.vue';
import NeuralActivationTracePanel from './neural/NeuralActivationTracePanel.vue';
import NeuralFocusList from './neural/NeuralFocusList.vue';
import NeuralHistoryList from './neural/NeuralHistoryList.vue';
import NeuralNavigationBar from './neural/NeuralNavigationBar.vue';
import NeuralRouteBar from './neural/NeuralRouteBar.vue';
import NeuralSubviewTabs from './neural/NeuralSubviewTabs.vue';
import { createBrowserNeuralWorkspaceRuntime } from './neural/browserNeuralWorkspaceRuntime';
import { useNeuralBrowserController } from './neural/useNeuralBrowserController';
import FilterDialog from './dialogs/FilterDialog.vue';
import SyncStatusIndicator from '../components/SyncStatusIndicator.vue';  // 🆕 导入同步状指示器
import { useCardTypeDetection } from './composables/useCardTypeDetection';
import type { RescheduleStoragePort } from '@/core/scheduler/ports';
import { createColumnDefs, getBrowserRowClass } from './config';
import { getNeuralSourceLabelSet } from '@/ui/shared/neuralRoamLabels';
import type {
  BrowserCardTypeFilter,
  CardFilter,
  IUnifiedDataSourceManagerFacade,
  NeuralEngineMode,
  QueueType,
} from '@/types/unified-data-source';
import { filterService } from './services/FilterService';
import type { BrowserNeuralWorkspaceMode, NeuralSubview } from './neural/types';
import {
  CARD_STATE_COLORS,
  DEFAULT_PRIORITY,
  PREVIEW_SIZE_MIN,
  PREVIEW_SIZE_MAX,
  DEFAULT_PREVIEW_SIZE,
} from './constants';
import { extractSqlStatement } from './utils/cardFilters';
import {
  resolveBrowserCardStableId,
} from './utils/browserCardIdentity';
import { extractBlockIds } from './utils/helpers';
import { mergeExplicitSelectionByPage } from './utils/paginatedSelection';
import { resolveEffectiveSortModel } from './utils/sortModel';
import { createBrowserGridFirstRowsLifecycle } from './BrowserGridFirstRowsLifecycle';
import type { BrowserGridRowsLifecycleStatus } from './BrowserGridFirstRowsLifecycle';
import { createBrowserGridDatasourceLifecycle } from './BrowserGridDatasourceLifecycle';
import {
  createBrowserQueueViewLifecycle,
  type BrowserQueueViewAsyncReadToken,
  type BrowserQueueViewPrepareResult,
} from '@/application/queries/browser/BrowserQueueViewLifecycle';
import { resolveBrowserGridFirstPageState } from './browserGridFirstPageState';
import {
  fetchAllRowsFromDataSource,
  loadAllRowsFromQueryableDataSource,
  resolveQueryableDataSource,
} from './browserDataSnapshots';
import {
  buildBrowserSelectionContextFingerprint,
  collectScopedBrowserSelectionIds,
  describeBrowserFilterSummary,
  isBrowserGridApiAlive as isGridApiAlive,
  isBrowserNodeInSelectionScope,
  resolveBrowserCardSelectionId,
} from './browserSelectionScope';
import { createBrowserActionMenuRuntime } from './browserActionMenuRuntime';
import {
  createBrowserLoadDataRuntime,
  type BrowserLoadDataOptions,
} from './browserLoadDataRuntime';
import { createBrowserQueueProjectionWarmupRuntime } from './browserQueueProjectionWarmupRuntime';
import { createBrowserSourceExistenceRuntime } from './browserSourceExistenceRuntime';
import { openBrowserSpreadDialog } from './browserSpreadDialog';
import {
  isNeuralQueueId,
  resolveQueueCardTypeOnSwitch,
} from './utils/queueCardTypePolicy';
import {
  createDeckDataSource,
  createFocusDataSource,
  createQueueDataSource,
  type DataSourceOptionsWithDoc,
} from './utils/dataSourceFactory';
import { useSorting } from './composables/useSorting';
import { useQueueBridge, EMPTY_QUEUE_COUNTS } from './composables/useQueueBridge';
import { useIncrementalGridUpdates } from './composables/useIncrementalGridUpdates';
import { useBrowserAdapterSync } from './composables/useBrowserAdapterSync';
import { shouldRefreshQueueData } from './composables/queueChangeScope';
import { useGlobalSelection } from './composables/useGlobalSelection';
import { createLogger } from '@/utils/logger';
import type {
  BrowserQueueCountsRequest,
  BrowserSourceExistenceStatus,
  BrowserSourceExistenceUpdate,
  IBrowserApplicationService,
} from '@/application/interfaces/IBrowserApplicationService';
import { resolveQueueTypeForBrowserQueueId } from '@/types/browser-queue-identity';
import type { BrowserPreviewSiyuanPort } from '@/application/ports/BrowserPreviewSiyuanPort';
import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';
import type {
  BrowserDocumentCountRow,
  BrowserDocumentCountsScope,
} from '@/application/queries/browser/browser-deck-query';
import type { IPluginFacade } from '@/application/interfaces/IPluginFacade';
import type { CardTypeMarkerStoragePort } from '@/core/storage/ports';
import type { SortField, SortOrder } from '@/core/card/domain/services/CardSortService';
import type { WsSyncEvent } from '@/application/services/XiuyuanSyncService.types';
import type { SemanticActivationCommandClient } from '@/application/clients/SemanticActivationCommandClient';
import type { SemanticActivationBrowserReadClient } from '@/application/clients/SemanticActivationBrowserReadClient';
import type { BackendSemanticLens, BackendSemanticStationType } from '../../../packages/contracts/src/backend-rpc';

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
  getDialogManager?: () => BrowserDialogManagerPort | null;
  getTabManager?: () => BrowserTabManagerPort | null;
  getDocTreeReviewScopeService?: () => BrowserDocTreeReviewScopeService | null;
  getSemanticActivationCommandClient?: () => SemanticActivationCommandClient | null;
  getSemanticActivationBrowserReadClient?: () => SemanticActivationBrowserReadClient | null;
};

type BrowserDocTreeReviewScope = {
  docIds?: string[] | null;
};

type BrowserDocTreeReviewScopeService = {
  collectDocReviewScope?: (docId: string) => BrowserDocTreeReviewScope | null;
  hydrate?: () => Promise<void> | void;
};

type BrowserHybridSyncService = {
  incrementalSync: (
    onProgress?: unknown,
    options?: { source?: 'browser-open'; persistIdleCheckpoint?: boolean }
  ) => Promise<unknown>;
  on?: (eventName: string, handler: (data: unknown) => void) => void;
};

type BrowserPluginPort = IPluginFacade & {
  getContext?: () => BrowserPluginContext | null;
  isMobile?: boolean;
};

type BrowserTabApplicationServicePort = {
  openDocumentTab: (params: { docId: string }) => Promise<void> | void;
};

type BrowserDialogManagerPort = {
  hasOpenNeuralReviewDialog?: () => boolean;
  openNeuralRoamDialog?: (options?: {
    focusBlockId?: string;
    includeFocusAsFirst?: boolean;
    resetHistory?: boolean;
    startNewSession?: boolean;
    semanticPinnedSessionId?: string;
  }) => Promise<void> | void;
};

type BrowserTabManagerPort = {
  hasOpenNeuralReviewTab?: () => boolean;
  syncExistingNeuralReviewTabToCurrentNode?: (options?: {
    fallbackNodeId?: string | null;
    focus?: boolean;
  }) => Promise<'synced' | 'missing' | 'failed'> | 'synced' | 'missing' | 'failed';
  focusSemanticReviewSession?: (
    sessionId: string,
    options?: { focus?: boolean },
  ) => Promise<'synced' | 'missing' | 'failed'> | 'synced' | 'missing' | 'failed';
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
const browserPreviewSiyuanApi = computed(() => (
  browserSiyuanApi.value as unknown as BrowserPreviewSiyuanPort | undefined
));
const {
  getQueueById: resolveQueueById,
  refreshQueueCounts: refreshQueueCountsBridge,
  setFilterGroupFilter: setFilterGroupFilterBridge,
  rebuildFilterGroupQueue: rebuildFilterGroupQueueBridge,
} = useQueueBridge({
  browserService: browserAppServiceRef,
});

// 🆕 同步状指示器相关
const hybridSyncService = computed(() => pluginContext.value?.getHybridSyncService?.() as BrowserHybridSyncService | undefined);
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
const firstRowsStatus = ref<BrowserGridRowsLifecycleStatus | 'pending'>('pending');
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
const activeScopeDocIds = ref<string[] | null>(null);
const activeDocId = ref<string | null>(null);
const queueCounts = ref<Record<string, number>>({ ...EMPTY_QUEUE_COUNTS });
const neuralSubview = ref<NeuralSubview>('concept-cards');
const neuralWorkspaceMode = ref<BrowserNeuralWorkspaceMode>('orbit');
const navigatorOpen = ref(false);
const narrowRoamPane = ref<BrowserNarrowRoamPane>(resolveDefaultBrowserNarrowRoamPane());
const NEURAL_HISTORY_PAGE_SIZE = 200;

const appliedFilter = ref<CardFilter | null>(null);
const showFilterDialog = ref(false);
const canSelectAllMatching = computed(() => isBrowserQueryableDataSource(currentDataSource.value));

let detectionTriggered = false;
const browserOpenStartedAt = browserPerfNow();
let browserShellAttachedRecorded = false;
let browserFirstRowsRecorded = false;
let gridModelUpdateSeq = 0;
let pendingGridModelUpdate: {
  reason: string;
  seq: number;
  startedAt: number;
  version?: number;
} | null = null;

const showPreview = ref(resolveDefaultBrowserShowPreview(layoutProfile.value));
const previewCard = ref<BrowserCard | null>(null);
const browserSemanticWorkspaceRuntime = createBrowserSemanticWorkspaceRuntime({
  getCommandClient: () => pluginContext.value?.getSemanticActivationCommandClient?.() ?? null,
  getReadClient: () => pluginContext.value?.getSemanticActivationBrowserReadClient?.() ?? null,
  loadRootCard: async (nodeId) => {
    const cards = await loadBrowserCardsByBlockIds([nodeId], {
      applyQueryFilter: false,
      manager: pluginUnifiedDataSourceManager.value || undefined,
      siyuanApi: browserSiyuanApi.value || undefined,
    });
    return cards[0] ?? null;
  },
  openSemanticReviewSession: async (handoff) => {
    const context = pluginContext.value;
    const tabResult = await context?.getTabManager?.()?.focusSemanticReviewSession?.(handoff.sessionId, { focus: true });
    if (tabResult === 'synced') {
      return;
    }
    const dialogManager = context?.getDialogManager?.();
    if (!dialogManager?.openNeuralRoamDialog) {
      throw new Error(t(
        'browserSemanticReviewHandoffUnavailable',
        'Review Semantic handoff is not wired yet; continue in Browser Semantic Review.',
      ));
    }
    await dialogManager.openNeuralRoamDialog({
      focusBlockId: handoff.focusBlockId ?? handoff.currentNodeId,
      includeFocusAsFirst: false,
      resetHistory: false,
      startNewSession: false,
      semanticPinnedSessionId: handoff.sessionId,
    });
  },
  pushErrMsg,
  t,
});
const browserSemanticState = browserSemanticWorkspaceRuntime.state;
const browserNeuralWorkspaceRuntime = createBrowserNeuralWorkspaceRuntime({
  getManager: () => pluginUnifiedDataSourceManager.value as IUnifiedDataSourceManagerFacade | null | undefined,
  t,
});

const {
  neuralSourceEntries,
  neuralRoutes,
  neuralRouteBusy,
  neuralHistoryEntries,
  neuralHistoryTotalCount,
  neuralHistoryHasMore,
  neuralHistoryLoadingMore,
  neuralAnchorEntries,
  neuralCurrentNodeId,
  neuralNavigationState,
  selectedNeuralHistoryEventId,
  neuralActivationTrace,
  neuralTracePinnedToSelection,
  selectedNeuralTraceEventId,
  selectedNeuralTraceNodeId,
  clearNeuralSubviewData,
  getNeuralRoamQueue,
  refreshNeuralSubviewData,
  handleNeuralSwitchRoute,
  handleNeuralCreateRoute,
  handleNeuralRenameRoute,
  handleNeuralDeleteRoute,
  handleNeuralSaveTemporaryRoute,
  handleNeuralPreview,
  handleNeuralExternalNodePreview,
  handleNeuralSelectHistoryEntry,
  handleNeuralSelectTraceStep,
  handleNeuralRequestConvergenceDetails,
  handleNeuralTracePreview,
  handleNeuralTraceJump,
  handleNeuralSwitchTraceEvent,
  handleNeuralLoadMoreHistory,
  handleNeuralJump,
  handleNeuralJumpAnchor,
  handleNeuralSetCurrentFocus,
  handleNeuralToggleSource,
  handleNeuralToggleEngineMode,
  handleNeuralToggleNavigationMode,
  handleNeuralReturnToBookmark,
  handleNeuralToggleAnchor,
  handleNeuralClearHistory,
} = useNeuralBrowserController({
  getQueueById,
  getNeuralSubview: () => neuralSubview.value,
  loadCardsByBlockIds: loadBrowserCardsByBlockIds,
  getCardLoadOptions: () => ({
    manager: pluginUnifiedDataSourceManager.value || undefined,
    siyuanApi: browserSiyuanApi.value || undefined,
  }),
  previewCard,
  refreshQueueCounts,
  readNeuralRoamViewState: () => browserNeuralWorkspaceRuntime.readViewState(),
  runNeuralRoamCommand: (command) => browserNeuralWorkspaceRuntime.runCommand(command),
  getReviewSurfaceDeps: () => ({
    tabManager: pluginContext.value?.getTabManager?.() ?? null,
    dialogManager: pluginContext.value?.getDialogManager?.() ?? null,
  }),
  confirmClearHistory: () => confirmDialog({
    title: t('clearHistory', '清空轨迹历史'),
    content: t('confirmClearHistoryAll', '确认清空全部轨迹历史？'),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  }),
  confirmClearRouteHistory: () => confirmDialog({
    title: t('clearRouteHistory', '清空航线日志'),
    content: t('confirmClearRouteHistory', '确认清空当前航线日志？'),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  }),
  confirmRouteSwitchReviewReset: () => confirmDialog({
    title: t('routeSwitchReviewResetTitle', '切换航线'),
    content: t('routeSwitchReviewResetPrompt', '已打开的神经漫游复习会重置到新航线。是否继续？'),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  }),
  promptRouteName: (options) => inputDialog({
    title: options.title,
    placeholder: options.placeholder,
    defaultValue: options.defaultValue,
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
    visualVariant: 'workspace',
  }),
  confirmDeleteRoute: () => confirmDialog({
    title: t('deleteRoute', '删除航线'),
    content: t('deleteRouteConfirm', '删除航线只会移除航线状态，不会删除卡片或思源块。是否继续？'),
    confirmText: t('delete', '删除'),
    cancelText: t('cancel', '取消'),
    visualVariant: 'workspace',
  }),
  close: () => emit('close'),
  getMode: () => mode.value,
  pushMessage: (message) => pushMsg(message),
  pushError: (message) => pushErrMsg(message),
  logError: (message, error) => logger.error(message, error),
  t,
  historyPageSize: NEURAL_HISTORY_PAGE_SIZE,
});

const isResizing = ref(false);
const gridSizing = computed(() => resolveBrowserGridSizing({ mobileMode: isMobileMode.value }));
const desktopPaginationEnabled = computed(() => !isMobileMode.value);
const desktopPageSize = computed(() => gridSizing.value.pageSize);
const gridCacheBlockSize = computed(() => gridSizing.value.cacheBlockSize);
const gridMaxBlocksInCache = computed(() => gridSizing.value.maxBlocksInCache);
const gridRowBuffer = computed(() => gridSizing.value.rowBuffer);
const randomSortRows = ref<BrowserCard[] | null>(null);
const browserQueueViewLifecycle = createBrowserQueueViewLifecycle({
  createDataSource: (request) => createQueueDataSource(
    request.activeQueueId,
    request.manager,
    {
      docId: request.activeDocId,
      scopeDocIds: request.activeScopeDocIds,
      preset: request.currentPreset,
      queryText: request.searchText,
      cardType: request.cardType,
    },
    request.plugin,
    request.browserAppService,
  ),
  logger,
});
const SNAPSHOT_HYDRATE_CHUNK_SIZE = 24;
const SNAPSHOT_FIRST_ROWS_POLL_MS = 50;
const SOURCE_EXISTENCE_PATCH_DELAY_MS = 32;
const SOURCE_EXISTENCE_FIRST_ROWS_MAX_WAIT_MS = 1000;

const loadedRowsByBlockId = new Map<string, BrowserCard>();
const pendingSourceExistenceStatuses = new Map<string, BrowserSourceExistenceStatus>();
const pendingSourceExistenceSources = new Set<BrowserSourceExistenceUpdate['source']>();
let allRowsSnapshotTaskId = 0;
let allRowsSnapshotPromise: Promise<void> | null = null;
let focusRowsTaskId = 0;
let backgroundSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
let sourceExistencePatchTimer: ReturnType<typeof setTimeout> | null = null;
let sourceExistencePatchCoalescedCount = 0;
let sourceExistencePatchStartedAt = 0;
let sourceExistencePatchToken: BrowserQueueViewAsyncReadToken | null = null;
let globalStatsAfterFirstRowsTimer: ReturnType<typeof setTimeout> | null = null;
let resolveGlobalStatsAfterFirstRows: (() => void) | null = null;
let globalStatsAfterFirstRowsSequence = 0;
let hierarchyDocumentCountsAfterFirstRowsTimer: ReturnType<typeof setTimeout> | null = null;
let hierarchyDocumentCountsAfterFirstRowsSequence = 0;
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
const showNavigatorDrawer = computed(() => {
  if (isMobileMode.value) {
    return navigatorOpen.value;
  }
  return layoutProfile.value === 'tab-narrow'
    && viewMode.value === 'hierarchy'
    && navigatorOpen.value;
});
const showNarrowRoamLayout = computed(() =>
  layoutProfile.value === 'tab-narrow' && !isMobileMode.value
);
const browserSemanticTargetCard = computed(() => selectedRows.value[0] ?? previewCard.value ?? null);
const canStartBrowserSemantic = computed(() =>
  Boolean(browserSemanticTargetCard.value) && !loading.value
);
const isBrowserSemanticWorkspaceActive = computed(() =>
  isNeuralRoamQueueActive.value && neuralWorkspaceMode.value === 'semantic'
);
const showBrowserSemanticWorkbench = computed(() =>
  isBrowserSemanticWorkspaceActive.value && browserSemanticState.value.status !== 'idle'
);
const browserSemanticPending = computed(() => browserSemanticState.value.status === 'pending');

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

function persistBrowserChromePreference(
  key: BrowserChromePreferenceKey,
  value: BrowserChromePreferenceValue,
): void {
  if (isMobileMode.value || suspendBrowserChromePersistence) {
    return;
  }

  writeBrowserChromePreference(key, layoutProfile.value, value);
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

    const preferences = readBrowserChromePreferences(profile);
    viewMode.value = preferences.viewMode;
    showPreview.value = preferences.showPreview;
    navigatorOpen.value = preferences.navigatorOpen;
    narrowRoamPane.value = preferences.narrowRoamPane;

    if (profile === 'tab-narrow' && viewMode.value !== 'hierarchy') {
      navigatorOpen.value = false;
    }
  } finally {
    suspendBrowserChromePersistence = false;
  }
}

function clearBackgroundSnapshotTimer(): void {
  if (!backgroundSnapshotTimer) {
    return;
  }

  clearTimeout(backgroundSnapshotTimer);
  backgroundSnapshotTimer = null;
}

function clearGlobalStatsAfterFirstRowsTimer(): void {
  globalStatsAfterFirstRowsSequence += 1;
  if (globalStatsAfterFirstRowsTimer) {
    clearTimeout(globalStatsAfterFirstRowsTimer);
    globalStatsAfterFirstRowsTimer = null;
  }
  if (resolveGlobalStatsAfterFirstRows) {
    resolveGlobalStatsAfterFirstRows();
    resolveGlobalStatsAfterFirstRows = null;
  }
}

function clearHierarchyDocumentCountsAfterFirstRowsTimer(): void {
  hierarchyDocumentCountsAfterFirstRowsSequence += 1;
  if (hierarchyDocumentCountsAfterFirstRowsTimer) {
    clearTimeout(hierarchyDocumentCountsAfterFirstRowsTimer);
    hierarchyDocumentCountsAfterFirstRowsTimer = null;
  }
}

function captureBrowserAsyncReadToken(): BrowserQueueViewAsyncReadToken {
  return browserQueueViewLifecycle.captureAsyncReadToken();
}

function isBrowserAsyncReadStillCurrent(token: BrowserQueueViewAsyncReadToken): boolean {
  return browserQueueViewLifecycle.isAsyncReadTokenCurrent(token);
}

function invalidateHierarchySnapshots(): void {
  clearBackgroundSnapshotTimer();
  clearHierarchyDocumentCountsAfterFirstRowsTimer();
  allRowsSnapshotTaskId += 1;
  allRowsSnapshotPromise = null;
  allRowsSnapshotReady.value = false;
  focusRowsTaskId += 1;
  hierarchyDocumentCountsTaskId += 1;
  hierarchyDocumentCountsStatus.value = 'idle';
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

function captureCurrentBrowserOpenState(): BrowserOpenState {
  return captureBrowserOpenState({
    queueId: activeQueueId.value,
    globalScope: activeGlobalScope.value,
    scopeDocIds: activeScopeDocIds.value ? [...activeScopeDocIds.value] : null,
    docId: activeDocId.value,
    queryText: searchQuery.value,
    preset: currentPreset.value,
    cardType: currentCardType.value,
    filter: appliedFilter.value,
    neuralSubview: neuralSubview.value,
  });
}

async function applyInitialBrowserOpenState(
  state: BrowserOpenState,
  forceRefresh = false,
): Promise<void> {
  suspendBrowserStateBootstrap = true;
  try {
    const resolved = resolveInitialBrowserOpenState({
      state,
      currentQueueId: activeQueueId.value,
      previousNonNeuralCardType: previousNonNeuralCardType.value,
    });
    const { projection } = resolved;

    if (resolved.normalizedLegacyMissingBlockScope) {
      logger.info('[SiYuanMemo][SRSBrowser] Normalized legacy missing-block browser state back to the default global view');
    }

    syncSelectionForQueryChange();

    activeQueueId.value = projection.queueId;
    activeScopeDocIds.value = projection.scopeDocIds;
    activeDocId.value = projection.docId;
    shouldFocusDocList.value = projection.shouldFocusDocList;

    currentPreset.value = projection.preset;
    currentCardType.value = projection.cardType;
    previousNonNeuralCardType.value = projection.previousNonNeuralCardType;
    searchQuery.value = projection.queryText;
    appliedFilter.value = projection.filter;

    neuralSubview.value = projection.neuralSubview;
    if (resolved.shouldClearNeuralSubviewData) {
      clearNeuralSubviewData();
    }

    if (resolved.shouldApplyFilterGroupFilter) {
      try {
        await setFilterGroupFilterBridge(projection.filter ?? {});
      } catch (error) {
        logger.error('[SiYuanMemo][SRSBrowser] Failed to apply initial filter-group browser state:', error);
      }
    }

    await loadData(forceRefresh, {
      refreshQueueCounts: false,
      snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
    });
    await refreshQueueCounts();
    await refreshGlobalStatsAfterFirstRows(forceRefresh);

    if (resolved.shouldRefreshNeuralSubviewData) {
      await refreshNeuralSubviewData();
    }
  } finally {
    suspendBrowserStateBootstrap = false;
  }
}

function resolveNeuralSourceLabels(engineMode: NeuralEngineMode = neuralNavigationState.value?.engineMode || 'orbit') {
  return getNeuralSourceLabelSet(engineMode, t);
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
  const siyuanApi = browserSiyuanApi.value;
  if (!siyuanApi) {
    logger.error('[SiYuanMemo][SRSBrowser] Browser Siyuan API unavailable for message:', msg);
    return;
  }
  if (level === 'error') {
    await pushBrowserErrMsg(msg, duration, siyuanApi);
    return;
  }
  await pushBrowserMsg(msg, duration, siyuanApi);
}

async function pushErrMsg(msg: string, duration?: number): Promise<void> {
  const siyuanApi = browserSiyuanApi.value;
  if (!siyuanApi) {
    logger.error('[SiYuanMemo][SRSBrowser] Browser Siyuan API unavailable for error message:', msg);
    return;
  }
  await pushBrowserErrMsg(msg, duration, siyuanApi);
}

const isDevMode = String(process.env.DEV_MODE) === 'true';

const columnDefs = ref<ColDef[]>(createColumnDefs(t));

const isQueueMode = computed(() => {
  return Boolean(normalizeBrowserQueueId(activeQueueId.value));
});

// Current queue type (filter-group-queue-ui)
const currentQueueType = computed(() => {
  const qid = normalizeBrowserQueueId(activeQueueId.value);
  if (isDevMode) {
    logger.info('[SiYuanMemo][SRSBrowser] currentQueueType computed:', {
      activeQueueId: activeQueueId.value,
      qid,
    });
  }
  return resolveQueueTypeForBrowserQueueId(qid) || '';
});

const isNeuralRoamQueueActive = computed(() => currentQueueType.value === 'neural-roam');
const activeQueueTypeForRefresh = computed<QueueType | null>(() => {
  return resolveQueueTypeForBrowserQueueId(activeQueueId.value);
});
const showNeuralCustomSubview = computed(() =>
  isNeuralRoamQueueActive.value
);
const firstPageState = computed(() => resolveBrowserGridFirstPageState({
  currentDataSourceReady: Boolean(currentDataSource.value),
  firstRowsStatus: firstRowsStatus.value,
  hasFirstDataBlockLoaded: hasFirstDataBlockLoaded.value,
  loading: loading.value,
  showNeuralCustomSubview: showNeuralCustomSubview.value,
  totalRowCount: totalRowCount.value,
}));
const neuralSubviewTabs = computed(() => ([
  { id: 'concept-cards' as const, label: resolveNeuralSourceLabels().sectionTitle },
  { id: 'engine-history' as const, label: t('engineHistory', '双链轨道') },
  { id: 'roam-history' as const, label: t('roamHistory', '航线日志') },
  { id: 'worldline-anchors' as const, label: t('worldlineAnchors', '空间站') },
]));
const isNeuralHistorySubview = computed(() =>
  neuralSubview.value === 'engine-history' || neuralSubview.value === 'roam-history'
);
const neuralHistorySubviewLabel = computed(() =>
  neuralSubview.value === 'engine-history'
    ? t('engineHistory', '双链轨道')
    : t('roamHistory', '航线日志')
);
const canClearNeuralHistory = computed(() =>
  neuralSubview.value === 'engine-history' || neuralSubview.value === 'roam-history'
);

// 始终启用 sortable，过 canApplySortToQueue 控制按钮显示
const defaultColDef: ColDef = {
  resizable: true,
  sortable: true,
};

const getGridRowId = (params: { data?: BrowserCard | null }): string =>
  resolveBrowserCardStableId(params.data);

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


const shouldFocusDocList = ref(false);


const rowsForFocus = ref<BrowserCard[]>([]);
const hierarchyDocumentCounts = ref<BrowserDocumentCountRow[] | null>(null);
const hierarchyDocumentCountsStatus = ref<'idle' | 'loading' | 'ready' | 'unsupported' | 'unavailable' | 'error'>('idle');
let hierarchyDocumentCountsTaskId = 0;

const focusedDocIds = computed(() => {

  if (!shouldFocusDocList.value) {
    if (isDevMode) {
      logger.info('[SiYuanMemo][SRSBrowser] focusedDocIds: shouldFocusDocList is false, returning null');
    }
    return null;
  }

  if (hierarchyDocumentCounts.value?.length) {
    return hierarchyDocumentCounts.value
      .map((item) => String(item.rootId || '').trim())
      .filter(Boolean);
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

    logger.info('[SiYuanMemo][SRSBrowser] focusedDocIds computed:', {
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
  const total = globalTotalCount.value;
  const lost = globalLostCount.value ?? 0;
  const dismissed = globalDismissedCount.value ?? 0;
  return {
    total,
    lost,
    dismissed,
  };
});

const hasActiveScopeDocIds = computed(() => (activeScopeDocIds.value?.length ?? 0) > 0);

const activeGlobalScope = computed<'__all__' | '__dismissed__' | null>(() => {
  if (hasActiveScopeDocIds.value) {
    return null;
  }
  if (currentPreset.value === 'suspended' && !activeQueueId.value && !activeDocId.value) {
    return '__dismissed__';
  }
  if (!activeQueueId.value && !activeDocId.value) {
    return '__all__';
  }
  return null;
});

function currentGlobalStatsScope(): BrowserGlobalStatsScope {
  return {
    activeDocId: activeDocId.value,
    activeQueueId: activeQueueId.value,
    activeScopeDocIds: activeScopeDocIds.value,
    currentCardType: currentCardType.value,
    currentPreset: currentPreset.value,
    searchQuery: searchQuery.value,
  };
}

function applyGlobalStatsState(next: { total: number | null; lost: number; dismissed: number }): void {
  globalTotalCount.value = next.total;
  globalLostCount.value = next.lost;
  globalDismissedCount.value = next.dismissed;
}

const showToolbarExitScope = computed(() => (
  shouldFocusDocList.value
  || hasActiveScopeDocIds.value
));

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

function patchGridRows(updatedRows: BrowserCard[]): number {
  if (updatedRows.length === 0) {
    return 0;
  }
  const api = gridApi.value;
  if (!isGridApiAlive(api)) {
    return 0;
  }

  const updatedById = new Map(
    updatedRows
      .map((row) => [resolveBrowserCardStableId(row), row] as const)
      .filter(([rowId]) => Boolean(rowId)),
  );
  let patched = 0;
  api.forEachNode((node) => {
    const current = node.data as BrowserCard | undefined;
    const rowId = resolveBrowserCardStableId(current);
    if (!rowId) {
      return;
    }
    const updated = updatedById.get(rowId);
    if (!updated) {
      return;
    }
    node.setData(updated);
    patched++;
  });
  return patched;
}

const browserSourceExistenceRuntime = createBrowserSourceExistenceRuntime({
  getActiveQueueId: () => activeQueueId.value,
  getRows: () => rows.value,
  setRows: (nextRows) => {
    rows.value = nextRows;
  },
  getRowsForFocus: () => rowsForFocus.value,
  setRowsForFocus: (nextRows) => {
    rowsForFocus.value = nextRows;
  },
  getAllRows: () => allRows.value,
  setAllRows: (nextRows) => {
    allRows.value = nextRows;
  },
  getLoadedRowByBlockId: (blockId) => loadedRowsByBlockId.get(blockId) ?? null,
  setLoadedRowByBlockId: (blockId, row) => {
    loadedRowsByBlockId.set(blockId, row);
  },
  patchGridRows,
});

function handleSourceExistenceUpdate(update: BrowserSourceExistenceUpdate): void {
  if (update.statuses.length === 0) {
    return;
  }
  for (const status of update.statuses) {
    const blockId = String(status.blockId || '').trim();
    if (!blockId) {
      continue;
    }
    pendingSourceExistenceStatuses.set(blockId, { blockId, exists: status.exists });
  }
  pendingSourceExistenceSources.add(update.source);
  if (sourceExistencePatchTimer) {
    sourceExistencePatchCoalescedCount += 1;
    recordRuntimePerformanceSpan('source-existence', 'visible-rows-patch.coalesced', 0, {
      coalescedCount: sourceExistencePatchCoalescedCount,
      pendingStatusCount: pendingSourceExistenceStatuses.size,
      source: update.source,
    });
    return;
  }
  sourceExistencePatchToken = captureBrowserAsyncReadToken();
  sourceExistencePatchStartedAt = browserPerfNow();
  scheduleSourceExistencePatchFlush();
}

function scheduleSourceExistencePatchFlush(delayMs = SOURCE_EXISTENCE_PATCH_DELAY_MS): void {
  sourceExistencePatchTimer = setTimeout(flushPendingSourceExistencePatch, delayMs);
}

function flushPendingSourceExistencePatch(): void {
  sourceExistencePatchTimer = null;
  if (pendingSourceExistenceStatuses.size === 0) {
    sourceExistencePatchCoalescedCount = 0;
    pendingSourceExistenceSources.clear();
    sourceExistencePatchStartedAt = 0;
    sourceExistencePatchToken = null;
    return;
  }

  const elapsedMs = Math.max(0, browserPerfNow() - sourceExistencePatchStartedAt);
  if (loading.value && !hasFirstDataBlockLoaded.value && elapsedMs < SOURCE_EXISTENCE_FIRST_ROWS_MAX_WAIT_MS) {
    recordRuntimePerformanceSpan('source-existence', 'visible-rows-patch.defer-first-rows', 0, {
      coalescedCount: sourceExistencePatchCoalescedCount,
      elapsedMs,
      pendingStatusCount: pendingSourceExistenceStatuses.size,
    });
    scheduleSourceExistencePatchFlush(SNAPSHOT_FIRST_ROWS_POLL_MS);
    return;
  }

  const statuses = Array.from(pendingSourceExistenceStatuses.values());
  const sources = Array.from(pendingSourceExistenceSources);
  const source: BrowserSourceExistenceUpdate['source'] = sources.includes('page-refresh')
    ? 'page-refresh'
    : 'background-sweep';
  const coalescedCount = sourceExistencePatchCoalescedCount;
  const readToken = sourceExistencePatchToken;
  const overlappedFirstRows = !hasFirstDataBlockLoaded.value;
  pendingSourceExistenceStatuses.clear();
  pendingSourceExistenceSources.clear();
  sourceExistencePatchCoalescedCount = 0;
  sourceExistencePatchStartedAt = 0;
  sourceExistencePatchToken = null;

  applySourceExistenceUpdate({
    source,
    statuses,
  }, {
    coalescedCount,
    overlappedFirstRows,
    readToken,
    sourceCount: sources.length,
  });
}

function applySourceExistenceUpdate(
  update: BrowserSourceExistenceUpdate,
  metadata: { coalescedCount: number; overlappedFirstRows: boolean; readToken: BrowserQueueViewAsyncReadToken | null; sourceCount: number },
): void {
  const result = measureRuntimePerformance('source-existence', 'visible-rows-patch.apply', () => {
    return browserSourceExistenceRuntime.applyUpdate(update, {
      isCurrent: () => !metadata.readToken || isBrowserAsyncReadStillCurrent(metadata.readToken),
    });
  }, {
    coalescedCount: metadata.coalescedCount,
    firstRowsLoaded: hasFirstDataBlockLoaded.value,
    overlappedFirstRows: metadata.overlappedFirstRows,
    source: update.source,
    sourceCount: metadata.sourceCount,
    statusCount: update.statuses.length,
  });

  if (result.status === 'ignored') {
    return;
  }

  recordRuntimePerformanceSpan('source-existence', 'visible-rows-patch.grid', 0, {
    coalescedCount: metadata.coalescedCount,
    firstRowsLoaded: hasFirstDataBlockLoaded.value,
    overlappedFirstRows: metadata.overlappedFirstRows,
    patchedGridRows: result.patchedGridRows,
    source: update.source,
    statusCount: result.statusCount,
    updatedRows: result.updatedRows,
  });

  if (result.shouldReloadActiveQueue) {
    void loadData(false, {
      origin: 'queue-sync',
      refreshQueueCounts: false,
    });
  }
}

function scheduleDatasourceUiUpdate(version: number, update: () => void): void {
  setTimeout(() => {
    if (version !== browserQueueViewLifecycle.getDatasourceVersion()) {
      return;
    }
    update();
  }, 0);
}

function resolveIncrementalRowId(card: BrowserCard | null | undefined): string {
  return resolveBrowserCardStableId(card);
}

function buildSelectionContextFingerprint(): string {
  const dataSource = currentDataSource.value;
  const queryable = resolveQueryableDataSource(dataSource);
  return buildBrowserSelectionContextFingerprint({
    activeDocId: activeDocId.value,
    activeQueueId: activeQueueId.value,
    activeScopeDocIds: activeScopeDocIds.value,
    cardType: currentCardType.value,
    preset: currentPreset.value,
    queryFingerprint: queryable?.getQueryFingerprint(),
    queryText: searchQuery.value,
    sortModel: currentSortModel.value,
  });
}

function describeCurrentFilterSummary(): string {
  return describeBrowserFilterSummary({
    activeDocId: activeDocId.value,
    activeQueueId: activeQueueId.value,
    activeScopeDocIds: activeScopeDocIds.value,
    cardType: currentCardType.value,
    hasActiveScopeDocIds: hasActiveScopeDocIds.value,
    preset: currentPreset.value,
    queryText: searchQuery.value,
    t,
  });
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
      if (!isBrowserNodeInSelectionScope(api, node.rowIndex, {
        defaultPageSize: desktopPageSize.value,
        paginationEnabled: desktopPaginationEnabled.value,
      })) {
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
  if (browserService?.getStats && !hasActiveScopeDocIds.value) {
    const taskId = ++globalStatsTaskId;
    const readToken = captureBrowserAsyncReadToken();
    try {
      const stats = await browserService.getStats();
      if (taskId !== globalStatsTaskId) {
        return;
      }
      if (!isBrowserAsyncReadStillCurrent(readToken)) {
        return;
      }

      const normalized = stats as {
        totalCards?: number;
        suspendedCards?: number;
        lostCards?: number;
      };
      applyGlobalStatsState(applyBackendBrowserStats({
        dismissed: globalDismissedCount.value,
        lost: globalLostCount.value,
        total: globalTotalCount.value,
      }, currentGlobalStatsScope(), {
        dueCards: 0,
        learningCards: 0,
        lostCards: Number(normalized.lostCards) || 0,
        newCards: 0,
        reviewCards: 0,
        suspendedCards: Number(normalized.suspendedCards) || 0,
        totalCards: Number(normalized.totalCards) || 0,
      }, hasFirstDataBlockLoaded.value ? totalRowCount.value : null));
      return;
    } catch (error) {
      if (taskId !== globalStatsTaskId) {
        return;
      }
      if (!isBrowserAsyncReadStillCurrent(readToken)) {
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
  const readToken = captureBrowserAsyncReadToken();
  try {
    const allCardsDataSource = createDeckDataSource(
      unifiedDataSourceManager,
      {
        docId: null,
        scopeDocIds: activeScopeDocIds.value,
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
    if (!isBrowserAsyncReadStillCurrent(readToken)) {
      return;
    }

    globalTotalCount.value = visibleCards.length;
    globalLostCount.value = 0;
    globalDismissedCount.value = visibleCards.filter((card) => card.suspended).length;
  } catch (error) {
    if (taskId !== globalStatsTaskId) {
      return;
    }
    if (!isBrowserAsyncReadStillCurrent(readToken)) {
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

async function refreshGlobalStatsAfterFirstRows(force = false): Promise<void> {
  clearGlobalStatsAfterFirstRowsTimer();
  const requestId = globalStatsAfterFirstRowsSequence;

  if (!loading.value || hasFirstDataBlockLoaded.value) {
    await refreshGlobalStats(force);
    return;
  }

  await new Promise<void>((resolve) => {
    resolveGlobalStatsAfterFirstRows = resolve;
    const poll = () => {
      globalStatsAfterFirstRowsTimer = null;
      if (!loading.value || hasFirstDataBlockLoaded.value) {
        resolveGlobalStatsAfterFirstRows = null;
        resolve();
        return;
      }
      globalStatsAfterFirstRowsTimer = setTimeout(poll, SNAPSHOT_FIRST_ROWS_POLL_MS);
    };
    globalStatsAfterFirstRowsTimer = setTimeout(poll, SNAPSHOT_FIRST_ROWS_POLL_MS);
  });

  if (requestId !== globalStatsAfterFirstRowsSequence) {
    return;
  }
  await refreshGlobalStats(force);
}

function browserPerfNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function browserOpenElapsedMs(now = browserPerfNow()): number {
  return Math.max(0, now - browserOpenStartedAt);
}

function recordBrowserOpenMilestone(
  operation: string,
  endedAt: number,
  metadata: Record<string, unknown> = {},
  startedAt = browserOpenStartedAt,
): void {
  recordRuntimePerformanceSpan('browser', operation, Math.max(0, endedAt - startedAt), {
    ...metadata,
    elapsedMs: browserOpenElapsedMs(endedAt),
    hasFirstRows: hasFirstDataBlockLoaded.value,
    loading: loading.value,
    mode: mode.value,
  }, {
    startedAt,
    endedAt,
  });
}

function recordBrowserShellAttached(): void {
  if (browserShellAttachedRecorded) {
    return;
  }
  browserShellAttachedRecorded = true;
  recordBrowserOpenMilestone('open.shell-attached', browserPerfNow(), {
    layoutProfile: layoutProfile.value,
  });
}

function recordBrowserFirstRowsVisible(metadata: Record<string, unknown> = {}): void {
  if (browserFirstRowsRecorded) {
    return;
  }
  browserFirstRowsRecorded = true;
  recordBrowserOpenMilestone('open.first-rows-visible', browserPerfNow(), metadata);
  incrementRuntimePerformanceCounter('browser', 'open-first-rows-visible');
}

function startGridModelUpdate(reason: string, metadata: { version?: number } = {}): void {
  pendingGridModelUpdate = {
    reason,
    seq: ++gridModelUpdateSeq,
    startedAt: browserPerfNow(),
    version: metadata.version,
  };
}

function recordGridModelUpdate(operation: string, metadata: Record<string, unknown> = {}): void {
  const endedAt = browserPerfNow();
  const pending = pendingGridModelUpdate;
  const startedAt = pending?.startedAt ?? endedAt;
  recordRuntimePerformanceSpan('browser', operation, Math.max(0, endedAt - startedAt), {
    ...metadata,
    elapsedMs: browserOpenElapsedMs(endedAt),
    firstRowsLoaded: hasFirstDataBlockLoaded.value,
    reason: pending?.reason ?? 'unknown',
    seq: pending?.seq ?? null,
    version: pending?.version ?? null,
  }, {
    startedAt,
    endedAt,
  });
  if (pending) {
    pendingGridModelUpdate = null;
  }
}

const gridFirstRowsLifecycle = createBrowserGridFirstRowsLifecycle({
  activeDocId,
  applyGlobalSelectionToLoadedRows,
  hasFirstDataBlockLoaded,
  loading,
  logger,
  measureUiUpdate: (operation, metadata) => measureRuntimePerformance('browser', 'grid.datasource-ui-update', operation, metadata),
  mergeLoadedRows,
  nextTick: (callback) => void nextTick(callback),
  onTotalCountLoaded: (count) => {
    applyGlobalStatsState(applyLoadedAllCardsTotal({
      dismissed: globalDismissedCount.value,
      lost: globalLostCount.value,
      total: globalTotalCount.value,
    }, currentGlobalStatsScope(), count));
    const queueId = normalizeBrowserQueueId(activeQueueId.value);
    if (
      queueId
      && activeDocId.value === null
      && !activeScopeDocIds.value?.length
      && currentPreset.value === 'all'
      && currentCardType.value === 'all'
      && !String(searchQuery.value || '').trim()
    ) {
      queueCounts.value = {
        ...queueCounts.value,
        [queueId]: Math.max(0, Number(count) || 0),
      };
    }
  },
  onStatusChange: (status) => {
    firstRowsStatus.value = status;
  },
  recordFirstRowsVisible: recordBrowserFirstRowsVisible,
  rows,
  rowsForFocus,
  scheduleUiUpdate: scheduleDatasourceUiUpdate,
  shouldFocusDocList,
  totalRowCount,
});

const gridDatasourceLifecycle = createBrowserGridDatasourceLifecycle({
  currentSortModel,
  firstRowsLifecycle: gridFirstRowsLifecycle,
  getCurrentVersion: () => browserQueueViewLifecycle.getDatasourceVersion(),
  getExpectedReadModelSnapshotMetadata: () => browserQueueViewLifecycle.getReadModelSnapshotMetadata(),
  getFirstRowsLoaded: () => hasFirstDataBlockLoaded.value,
  getGridApi: () => gridApi.value,
  getSortRevision: () => sortModelRevision.value,
  isGridApiAlive,
  measureRuntimePerformance,
  onReadModelSnapshotMetadata: (metadata) => {
    browserQueueViewLifecycle.acceptReadModelSnapshotMetadata(metadata);
  },
  randomSortRows,
  sortModelRevision,
  startGridModelUpdate,
  startRuntimePerformanceSpan,
});

function rebuildInfiniteDatasource(forceRefresh = false): void {
  const version = browserQueueViewLifecycle.advanceDatasourceVersion();
  loading.value = true;
  hasFirstDataBlockLoaded.value = false;
  firstRowsStatus.value = 'pending';
  clearLoadedRowsCache();
  gridDatasourceLifecycle.rebuildInfiniteDatasource({
    currentDataSource: currentDataSource.value,
    forceRefresh,
    totalRowCount,
    version,
  });
}

function applyQueueViewLifecycleState(result: BrowserQueueViewPrepareResult): void {
  if (result.status === 'ready' || result.status === 'stale') {
    return;
  }
  hasFirstDataBlockLoaded.value = false;
  if (result.status === 'preparing') {
    firstRowsStatus.value = 'read-model-preparing';
  } else if (result.status === 'repair-required') {
    firstRowsStatus.value = 'read-model-repair-required';
  } else {
    firstRowsStatus.value = 'read-model-unavailable';
  }
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
    const finishSnapshotSpan = startRuntimePerformanceSpan('browser', 'snapshot.all-rows', {
      taskId,
    });
    let status = 'started';
    let rowCount = 0;
    try {
      const fullRows = randomSortRows.value
        ? [...randomSortRows.value]
        : await measureRuntimePerformance('browser', 'snapshot.all-rows.load', () => loadAllRowsFromQueryableDataSource(dataSource, currentSortModel.value || [], {
          chunkSize: SNAPSHOT_HYDRATE_CHUNK_SIZE,
          shouldAbort: () => taskId !== allRowsSnapshotTaskId,
        }));
      if (taskId !== allRowsSnapshotTaskId) {
        status = 'stale';
        return;
      }
      rowCount = fullRows.length;
      allRows.value = fullRows;
      allRowsSnapshotReady.value = true;
      if (!shouldFocusDocList.value && !activeDocId.value) {
        rowsForFocus.value = fullRows;
      }
      status = 'ready';
    } catch (error) {
      status = 'error';
      if (taskId !== allRowsSnapshotTaskId) {
        return;
      }
      logger.error('[SiYuanMemo][SRSBrowser] Failed to build allRows snapshot:', error);
      allRows.value = [];
      allRowsSnapshotReady.value = true;
    } finally {
      finishSnapshotSpan({
        rowCount,
        status,
      }, {
        ok: status === 'ready' || status === 'stale',
        errorName: status === 'error' ? 'BrowserAllRowsSnapshotError' : undefined,
      });
    }
  })();
}

function scheduleAllRowsSnapshot(delayMs?: number): void {
  clearBackgroundSnapshotTimer();

  const normalizedDelay = normalizeHierarchySnapshotDelayMs(
    delayMs,
    DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
  );
  const maybeStartSnapshot = () => {
    backgroundSnapshotTimer = null;
    if (shouldFocusDocList.value || activeDocId.value) {
      return;
    }
    if (loading.value && !hasFirstDataBlockLoaded.value) {
      backgroundSnapshotTimer = setTimeout(maybeStartSnapshot, SNAPSHOT_FIRST_ROWS_POLL_MS);
      return;
    }
    startAllRowsSnapshot();
  };

  backgroundSnapshotTimer = setTimeout(maybeStartSnapshot, normalizedDelay);
}

function runFocusRowsSnapshot(): void {
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
      scopeDocIds: activeScopeDocIds.value,
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
    const finishSnapshotSpan = startRuntimePerformanceSpan('browser', 'snapshot.focus-rows', {
      taskId,
    });
    let status = 'started';
    let rowCount = 0;
    try {
      const focusRows = await measureRuntimePerformance('browser', 'snapshot.focus-rows.load', () => loadAllRowsFromQueryableDataSource(focusDataSource, [], {
        chunkSize: SNAPSHOT_HYDRATE_CHUNK_SIZE,
        shouldAbort: () => taskId !== focusRowsTaskId,
      }));
      if (taskId !== focusRowsTaskId) {
        status = 'stale';
        return;
      }
      rowCount = focusRows.length;
      rowsForFocus.value = focusRows;
      status = 'ready';
    } catch (error) {
      status = 'error';
      if (taskId !== focusRowsTaskId) {
        return;
      }
      logger.error('[SiYuanMemo][SRSBrowser] Failed to load focus rows:', error);
      rowsForFocus.value = [];
    } finally {
      finishSnapshotSpan({
        rowCount,
        status,
      }, {
        ok: status === 'ready' || status === 'stale',
        errorName: status === 'error' ? 'BrowserFocusRowsSnapshotError' : undefined,
      });
    }
  })();
}

function startFocusRowsSnapshot(delayMs?: number): void {
  clearBackgroundSnapshotTimer();

  const normalizedDelay = normalizeHierarchySnapshotDelayMs(
    delayMs,
    DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
  );
  const maybeStartSnapshot = () => {
    backgroundSnapshotTimer = null;
    if (!shouldFocusDocList.value) {
      return;
    }
    if (shouldDelayHierarchySnapshot({
      loading: loading.value,
      hasFirstDataBlockLoaded: hasFirstDataBlockLoaded.value,
      firstRowsStatus: firstRowsStatus.value,
    })) {
      backgroundSnapshotTimer = setTimeout(maybeStartSnapshot, SNAPSHOT_FIRST_ROWS_POLL_MS);
      return;
    }
    runFocusRowsSnapshot();
  };

  backgroundSnapshotTimer = setTimeout(maybeStartSnapshot, normalizedDelay);
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

let loadDataImpl: (forceRefresh?: boolean, options?: BrowserLoadDataOptions) => Promise<void> = async () => {};
let abortLoadData = () => {};
let docSelectionScopeTaskId = 0;

async function loadData(forceRefresh = false, options: BrowserLoadDataOptions = {}) {
  await loadDataImpl(forceRefresh, options);
  scheduleHierarchyDocumentCountsAfterFirstRows();
}

function buildHierarchyDocumentCountsScope(): BrowserDocumentCountsScope {
  const hierarchyDocId = shouldFocusDocList.value ? null : activeDocId.value;
  if (activeQueueId.value) {
    return {
      kind: 'queue',
      preset: currentPreset.value,
      searchText: searchQuery.value,
      docId: hierarchyDocId,
      scopeDocIds: activeScopeDocIds.value,
      cardType: currentCardType.value,
      queueType: currentQueueType.value,
    };
  }

  return {
    kind: 'deck',
    preset: currentPreset.value,
    searchText: searchQuery.value,
    docId: hierarchyDocId,
    scopeDocIds: activeScopeDocIds.value,
    cardType: currentCardType.value,
  };
}

async function refreshHierarchyDocumentCounts(): Promise<void> {
  const browserService = browserAppServiceRef.value;
  if (!browserService?.getBrowserDocumentCounts) {
    hierarchyDocumentCounts.value = null;
    hierarchyDocumentCountsStatus.value = 'unavailable';
    return;
  }

  const taskId = ++hierarchyDocumentCountsTaskId;
  const scope = buildHierarchyDocumentCountsScope();
  const readToken = captureBrowserAsyncReadToken();
  hierarchyDocumentCountsStatus.value = 'loading';
  const finishSpan = startRuntimePerformanceSpan('browser', 'hierarchy.document-counts', {
    kind: scope.kind,
  });
  let status: typeof hierarchyDocumentCountsStatus.value = 'loading';
  let rowCount = 0;
  try {
    const result = await browserService.getBrowserDocumentCounts(scope);
    if (taskId !== hierarchyDocumentCountsTaskId) {
      status = 'idle';
      return;
    }
    if (!isBrowserAsyncReadStillCurrent(readToken)) {
      status = 'idle';
      return;
    }
    status = result.status;
    if (result.status === 'ready') {
      rowCount = result.rows.length;
      hierarchyDocumentCounts.value = result.rows;
      hierarchyDocumentCountsStatus.value = 'ready';
      recordRuntimePerformanceSpan('browser', 'hierarchy.rows-hydrated-for-counts', 0, {
        rowsHydratedForHierarchy: result.diagnostics.rowsHydratedForHierarchy,
      });
      return;
    }
    hierarchyDocumentCounts.value = null;
    hierarchyDocumentCountsStatus.value = result.status;
    logger.info('[SiYuanMemo][SRSBrowser] Browser hierarchy document counts unavailable', {
      reason: result.reason,
      status: result.status,
    });
  } catch (error) {
    if (taskId !== hierarchyDocumentCountsTaskId) {
      status = 'idle';
      return;
    }
    if (!isBrowserAsyncReadStillCurrent(readToken)) {
      status = 'idle';
      return;
    }
    status = 'error';
    hierarchyDocumentCounts.value = null;
    hierarchyDocumentCountsStatus.value = 'error';
    logger.error('[SiYuanMemo][SRSBrowser] Failed to refresh hierarchy document counts:', error);
  } finally {
    finishSpan({
      rowCount,
      status,
    }, {
      ok: status === 'ready' || status === 'unsupported' || status === 'unavailable',
      errorName: status === 'error' ? 'BrowserHierarchyDocumentCountsError' : undefined,
    });
  }
}

function scheduleHierarchyDocumentCountsAfterFirstRows(): void {
  clearHierarchyDocumentCountsAfterFirstRowsTimer();
  const requestId = hierarchyDocumentCountsAfterFirstRowsSequence;

  const runWhenReady = () => {
    hierarchyDocumentCountsAfterFirstRowsTimer = null;
    if (requestId !== hierarchyDocumentCountsAfterFirstRowsSequence) {
      return;
    }
    if (loading.value && !hasFirstDataBlockLoaded.value) {
      hierarchyDocumentCountsAfterFirstRowsTimer = setTimeout(runWhenReady, SNAPSHOT_FIRST_ROWS_POLL_MS);
      return;
    }
    void refreshHierarchyDocumentCounts();
  };

  if (!loading.value || hasFirstDataBlockLoaded.value) {
    void refreshHierarchyDocumentCounts();
    return;
  }

  hierarchyDocumentCountsAfterFirstRowsTimer = setTimeout(runWhenReady, SNAPSHOT_FIRST_ROWS_POLL_MS);
}

function resolveActiveSqlStatement(queryText: string = searchQuery.value): string | null {
  if (activeDocId.value || hasActiveScopeDocIds.value) {
    return null;
  }
  return extractSqlStatement(queryText);
}

// Search handling
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSqlStmt: string | null = null;
let lastSearchQuery: string = '';
function handleSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const current = resolveActiveSqlStatement(searchQuery.value);
    const queryChanged = searchQuery.value !== lastSearchQuery;
    const sqlChanged = current !== lastSqlStmt;

    if (queryChanged || sqlChanged) {
      lastSqlStmt = current;
      lastSearchQuery = searchQuery.value;
      shouldFocusDocList.value = true;
      syncSelectionForQueryChange();
      recordRuntimePerformanceSpan('browser', 'search.reload-scheduled', 0, {
        queryChanged,
        queryLength: searchQuery.value.length,
        sqlChanged,
      });
      void loadData(false, {
        refreshQueueCounts: false,
        snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
      });
    }
  }, 150);
}

// Watch searchQuery changes
watch(searchQuery, () => {
  if (suspendBrowserStateBootstrap) {
    return;
  }
  handleSearchInput();
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
  if (!isNeuralHistorySubview.value) {
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

watch(() => neuralNavigationState.value?.engineMode, (engineMode) => {
  if (!engineMode || neuralWorkspaceMode.value === 'semantic') {
    return;
  }
  neuralWorkspaceMode.value = engineMode;
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
  persistBrowserChromePreference('viewMode', value);
});

watch(showPreview, (value) => {
  persistBrowserChromePreference('showPreview', value);
});

watch(navigatorOpen, (value) => {
  persistBrowserChromePreference('navigatorOpen', value);
});

watch(narrowRoamPane, (value) => {
  persistBrowserChromePreference('narrowRoamPane', value);
});

/*
watch(() => loading.value, async (isLoading) => {

  if (isLoading) {
    detectionTriggered = false;
  }

  if (!isLoading && !detectionTriggered && !cardTypeDetection.isDetecting.value && cardTypeDetection.unidentifiedCount.value > 0) {
    detectionTriggered = true;

    logger.info('[SiYuanMemo][SRSBrowser] Auto-detecting unidentified cards...');

    const unidentified = cardTypeDetection.getUnidentifiedCards();
    const blockIds = unidentified.map(c => c.blockId);


    if (blockIds.length === 0) {
      logger.info('[SiYuanMemo][SRSBrowser] No cards to detect (race condition detected)');
      return;
    }

    await cardTypeDetection.detect();


    const manager = pluginUnifiedDataSourceManager.value;
    const siyuanApi = browserSiyuanApi.value;
    const updatedCards = manager && siyuanApi
      ? await loadQueueCards(blockIds, searchQuery.value, manager, siyuanApi)
      : [];
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
  gridDatasourceLifecycle.applyPendingDatasourceToGrid();
  if (!gridDatasourceLifecycle.hasPendingDatasource() && currentDataSource.value) {
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

function getDisplayedRowCount(api: GridApi | null | undefined): number | null {
  if (!api || typeof api.getDisplayedRowCount !== 'function') {
    return null;
  }
  try {
    return api.getDisplayedRowCount();
  } catch {
    return null;
  }
}

function onFirstDataRendered(params: { api?: GridApi | null }) {
  const api = params?.api || gridApi.value;
  const endedAt = browserPerfNow();
  const pending = pendingGridModelUpdate;
  const startedAt = pending?.startedAt ?? browserOpenStartedAt;
  const displayedRowCount = getDisplayedRowCount(api);
  recordRuntimePerformanceSpan('browser', 'grid.first-data-rendered', Math.max(0, endedAt - startedAt), {
    displayedRowCount,
    elapsedMs: browserOpenElapsedMs(endedAt),
    firstRowsLoaded: hasFirstDataBlockLoaded.value,
    reason: pending?.reason ?? 'unknown',
    seq: pending?.seq ?? null,
    version: pending?.version ?? null,
  }, {
    startedAt,
    endedAt,
  });
  recordBrowserFirstRowsVisible({
    displayedRowCount,
    source: 'ag-grid-first-data-rendered',
    totalCount: totalRowCount.value,
  });
}

function onModelUpdated(params: { api?: GridApi | null }) {
  const api = params?.api || gridApi.value;
  recordGridModelUpdate('grid.model-updated', {
    displayedRowCount: getDisplayedRowCount(api),
    totalCount: totalRowCount.value,
  });
}

function onFilterChanged(params: { api?: GridApi | null }) {
  const api = params?.api || gridApi.value;
  const version = browserQueueViewLifecycle.getDatasourceVersion();
  startGridModelUpdate('filter', { version });
  recordRuntimePerformanceSpan('browser', 'grid.filter-changed', 0, {
    displayedRowCount: getDisplayedRowCount(api),
    elapsedMs: browserOpenElapsedMs(),
    firstRowsLoaded: hasFirstDataBlockLoaded.value,
    version,
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
    const version = browserQueueViewLifecycle.getDatasourceVersion();
    startGridModelUpdate('sort', { version });
    recordRuntimePerformanceSpan('browser', 'grid.sort-reload-scheduled', 0, {
      revision: sortModelRevision.value,
      sortCount: sortArray.length,
      version,
    });
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

  const { visibleIds, selectedIds } = collectScopedBrowserSelectionIds(api, {
    defaultPageSize: desktopPageSize.value,
    paginationEnabled: desktopPaginationEnabled.value,
  });

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
  void refreshCdfLiveRelationForBrowserOpen(event.data);
}

async function onRowDoubleClicked(event: RowDoubleClickedEvent<BrowserCard>) {
  await refreshCdfLiveRelationForBrowserOpen(event.data);
  const blockId = event.data?.blockId;
  if (!blockId) {
    logger.warn('[SiYuanMemo][CardBrowser] No blockId found in row data:', event.data);
    return;
  }

  await openDocumentTabById(blockId);
}

async function refreshCdfLiveRelationForBrowserOpen(card: BrowserCard | null | undefined): Promise<void> {
  const cardId = String(card?.fsrsCardId || card?.id || '').trim();
  if (!cardId) {
    return;
  }
  await browserAppServiceRef.value?.refreshCdfLiveRelationOnOpen?.(cardId);
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

function handlePreviewDeleteCard(card: BrowserCard): void {
  if (!card) {
    return;
  }
  void handleAction('delete-card', [card], card);
}

function convertToTab() {
  emit('convertToTab', captureCurrentBrowserOpenState());
}

let handleActionImpl: (actionId: string, targetCards: BrowserCard[], anchorRow?: BrowserCard) => Promise<void> = async () => {};
let onCellContextMenuImpl: (event: CellContextMenuEvent) => void = () => {};
let openPracticeMenuImpl: (event: MouseEvent) => void = () => {};

async function handleAction(actionId: string, targetCards: BrowserCard[], anchorRow?: BrowserCard) {
  return handleActionImpl(actionId, targetCards, anchorRow);
}

function onCellContextMenu(event: CellContextMenuEvent) {
  return onCellContextMenuImpl(event);
}

function openPracticeMenu(event: MouseEvent) {
  return openPracticeMenuImpl(event);
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

async function handleSelectCurrentPage(): Promise<void> {
  const api = gridApi.value;
  if (!isGridApiAlive(api)) {
    await pushErrMsg(t('selectCurrentPageUnavailable', 'Current page selection is unavailable'));
    return;
  }

  const { visibleIds } = collectScopedBrowserSelectionIds(api, {
    defaultPageSize: desktopPageSize.value,
    paginationEnabled: desktopPaginationEnabled.value,
  });
  if (visibleIds.length === 0) {
    await pushMsg(t('noCards', 'No cards'));
    return;
  }

  const existingSelectedIds = globalSelection.mode.value === 'explicit'
    ? globalSelection.explicitIds.value
    : [];
  const mergedExplicitIds = mergeExplicitSelectionByPage({
    existingSelectedIds,
    visibleIds,
    pageSelectedIds: visibleIds,
  });

  globalSelection.setExplicitByIds(Array.from(mergedExplicitIds));
  applyGlobalSelectionToLoadedRows();

  await pushMsg(
    t('currentPageSelected', 'Selected current page ({count})')
      .replace('{count}', String(visibleIds.length))
  );
}

function handleClearSelection(): void {
  clearSelectionState(false);
}

// Refresh data
async function refreshData(
  forceRefresh = false,
  preserveFocusState = false,
  options: BrowserLoadDataOptions = {}
) {
  const mergedOptions: BrowserLoadDataOptions = {
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
    return loadBrowserCardsByBlockIds(blockIds, {
      applyQueryFilter: false,
      manager: pluginUnifiedDataSourceManager.value || undefined,
      siyuanApi: browserSiyuanApi.value || undefined,
    });
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

    if (loading.value) {
      return;
    }

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
    if (loading.value) {
      return;
    }
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
  const finishForceRefreshSpan = startRuntimePerformanceSpan('browser', 'force-refresh.total');
  let status = 'started';
  try {
    await runBrowserForceRefresh({
      invalidateCardCache,
      refreshGlobalStats: refreshGlobalStatsAfterFirstRows,
      refreshData,
      refreshQueueCounts,
    });
    status = 'completed';
  } catch (error) {
    status = 'error';
    throw error;
  } finally {
    finishForceRefreshSpan({
      firstRowsLoaded: hasFirstDataBlockLoaded.value,
      status,
      totalCount: totalRowCount.value,
    }, {
      ok: status !== 'error',
      errorName: status === 'error' ? 'BrowserForceRefreshError' : undefined,
    });
  }
}

// 🆕 处理同步完成事件
function handleSyncComplete(type: 'incremental' | 'full') {
  logger.info('[SiYuanMemo][SRSBrowser] Sync completed:', type);
  void forceRefreshData();
}

// Show performance report
function showPerformanceReport() {
  PerformanceMonitor.printReport();
  printRuntimePerformanceDiagnosticsReport();

  // 显示缓存统计
  const cacheStats = getCacheStats();
  logger.info('缓存统计:', cacheStats);

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
        incrementRuntimePerformanceCounter('browser', 'longtask-count', longTaskCount);
      }
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch (error) {
    logger.debug('[SiYuanMemo][SRSBrowser] Longtask observer unavailable', error);
  }
}

// Cleanup
let unsubscribe: (() => void) | null = null;
let unsubscribeSourceExistence: (() => void) | null = null;
let unsubscribeQueueProjectionLiveIdentity: (() => void) | null = null;

onBeforeUnmount(() => {
  disposeIncrementalGridUpdates();
  destroyBrowserAdapter();

  abortLoadData();
  browserQueueViewLifecycle.advanceDatasourceVersion();
  currentDataSource.value = null;
  gridDatasourceLifecycle.clearPendingDatasource();
  clearBackgroundSnapshotTimer();
  clearGlobalStatsAfterFirstRowsTimer();
  clearHierarchyDocumentCountsAfterFirstRowsTimer();
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  if (loadedRowsFlushTimer) {
    clearTimeout(loadedRowsFlushTimer);
    loadedRowsFlushTimer = null;
  }
  if (sourceExistencePatchTimer) {
    clearTimeout(sourceExistencePatchTimer);
    sourceExistencePatchTimer = null;
  }
  pendingSourceExistenceStatuses.clear();
  pendingSourceExistenceSources.clear();
  sourceExistencePatchCoalescedCount = 0;
  sourceExistencePatchStartedAt = 0;
  sourceExistencePatchToken = null;
  loadedRowsDirty = false;

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (unsubscribeSourceExistence) {
    unsubscribeSourceExistence();
    unsubscribeSourceExistence = null;
  }
  if (unsubscribeQueueProjectionLiveIdentity) {
    unsubscribeQueueProjectionLiveIdentity();
    unsubscribeQueueProjectionLiveIdentity = null;
  }

  browserRootResizeObserver?.disconnect();
  browserRootResizeObserver = null;
  gridApi.value = null;
});

onMounted(() => {
  setupBrowserLayoutObserver();
  applyBrowserChromePreferences(layoutProfile.value);
  void nextTick(recordBrowserShellAttached);

  initBrowserAdapter();
  setupLongTaskMonitor();
  unsubscribeSourceExistence = browserAppServiceRef.value?.subscribeSourceExistenceUpdates?.(handleSourceExistenceUpdate) ?? null;
  unsubscribeQueueProjectionLiveIdentity = pluginUnifiedDataSourceManager.value
    ?.subscribeQueueProjectionLiveIdentityEvents?.(browserLoadDataRuntime.handleQueueProjectionLiveIdentityEvent) ?? null;

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
        logger.info('[SiYuanMemo][SRSBrowser] Reloading data due to WebSocket sync...');
        void loadData(true); // Force refresh cache
      } else {
        logger.error('[SiYuanMemo][SRSBrowser] WebSocket sync failed:', event.error);
        // 同步失败，也尝试刷新数据（使用缓存）
        void loadData();
      }
    });

    logger.info('[SiYuanMemo][SRSBrowser] Subscribed to HybridSyncService wsSync events');
  }

  // 🆕 触发同步（如果启用）
  if (hybridService) {
    const storage = pluginStorage.value;
    const riffConfig = storage?.getSettings?.()?.riffIntegration;


    logger.info('[SiYuanMemo][SRSBrowser] Checking auto-sync configuration:', {
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
      logger.info('[SiYuanMemo][SRSBrowser] Triggering incremental sync on browser open...');

      void (async () => {
        try {
          await hybridService.incrementalSync(undefined, {
            source: 'browser-open',
            persistIdleCheckpoint: false,
          });
          logger.info('[SiYuanMemo][SRSBrowser] Incremental sync completed, reloading data...');
          await applyInitialBrowserView(true);
        } catch (err) {
          logger.error('[SiYuanMemo][SRSBrowser] Incremental sync failed:', err);
          await applyInitialBrowserView(false);
        }
      })();

      return;
    } else {
      logger.info('[SiYuanMemo][SRSBrowser] Auto-sync not triggered, loading data without sync', {
        shouldSyncOnBrowserOpen,
        reason: !shouldSyncOnBrowserOpen ? 'browser-open trigger not configured' : 'browser-open trigger skipped'
      });
    }
  } else {
    logger.info('[SiYuanMemo][SRSBrowser] HybridSyncService not available');
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

function showMobileCardsPane() {
  navigatorOpen.value = false;
  showPreview.value = false;
}

function toggleMobileNavigator() {
  navigatorOpen.value = !navigatorOpen.value;
  if (navigatorOpen.value) {
    showPreview.value = false;
  }
}

function toggleMobilePreview() {
  showPreview.value = !showPreview.value;
  if (showPreview.value) {
    navigatorOpen.value = false;
  }
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

async function switchToBrowserSemanticWorkspace(): Promise<void> {
  neuralWorkspaceMode.value = 'semantic';
  if (!isNeuralRoamQueueActive.value) {
    await handleSelectQueue('neural-roam');
  }
  await refreshNeuralSubviewData();
}

async function handleStartBrowserSemantic(): Promise<void> {
  const targetCard = browserSemanticTargetCard.value;
  await switchToBrowserSemanticWorkspace();
  await browserSemanticWorkspaceRuntime.startFromCard(targetCard);
}

async function handleBrowserSemanticStartFromNeuralRoot(nodeId: string): Promise<void> {
  await browserSemanticWorkspaceRuntime.startFromNeuralRoot(nodeId);
}

async function handleSelectNeuralWorkspaceMode(mode: BrowserNeuralWorkspaceMode): Promise<void> {
  if (mode === 'semantic') {
    neuralWorkspaceMode.value = 'semantic';
    if (isNeuralRoamQueueActive.value) {
      await refreshNeuralSubviewData();
    }
    browserSemanticWorkspaceRuntime.activateEmptyWorkspace();
    return;
  }

  neuralWorkspaceMode.value = mode;
  const currentEngineMode = neuralNavigationState.value?.engineMode;
  if (currentEngineMode && currentEngineMode !== mode) {
    await handleNeuralToggleEngineMode();
  }
}

async function handleBrowserSemanticFollow(candidateId: string, lens: BackendSemanticLens): Promise<void> {
  await browserSemanticWorkspaceRuntime.follow(candidateId, lens);
}

async function handleBrowserSemanticCreateStation(stationType: BackendSemanticStationType): Promise<void> {
  await browserSemanticWorkspaceRuntime.createStation(stationType);
}

async function handleBrowserSemanticArchiveStation(stationId: string): Promise<void> {
  await browserSemanticWorkspaceRuntime.archiveStation(stationId);
}

async function handleBrowserSemanticOpenNodeStation(nodeId: string): Promise<void> {
  await browserSemanticWorkspaceRuntime.openNodeStation(nodeId);
}

async function handleBrowserSemanticRestorePathStation(stationId: string): Promise<void> {
  await browserSemanticWorkspaceRuntime.restorePathStation(stationId);
}

async function handleBrowserSemanticEndSession(): Promise<void> {
  await browserSemanticWorkspaceRuntime.endSession();
}

async function handleBrowserSemanticOpenInReview(): Promise<void> {
  await browserSemanticWorkspaceRuntime.openInReview();
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

const browserQueueProjectionWarmupRuntime = createBrowserQueueProjectionWarmupRuntime({
  activeDocId,
  activeQueueId,
  activeScopeDocIds,
  browserAppService: browserAppServiceRef,
  currentCardType,
  currentPreset,
  logger,
  onQueueReady: (status) => {
    void refreshQueueCounts({
      forceRefresh: true,
      affectedQueueTypes: [status.queueType],
    });
  },
  searchQuery,
});

const browserLoadDataRuntime = createBrowserLoadDataRuntime({
  activeDocId,
  activeQueueId,
  activeScopeDocIds,
  allRows,
  browserAppService: browserAppServiceRef,
  browserSiyuanApi,
  clearNeuralSubviewData,
  currentCardType,
  currentDataSource,
  currentPreset,
  currentQueueType,
  ensureSqlModeConfirmed,
  getCurrentDocId: () => props.currentDocId || null,
  getPlugin: () => props.plugin,
  globalSelection,
  hasRandomSort,
  invalidateHierarchySnapshots,
  loading,
  logger,
  previewCard,
  pluginUnifiedDataSourceManager,
  pushErrMsg,
  queueViewLifecycle: browserQueueViewLifecycle,
  randomSortRows,
  rebuildInfiniteDatasource,
  refreshNeuralSubviewData,
  refreshQueueCounts,
  resolveActiveSqlStatement,
  rows,
  rowsForFocus,
  abortQueueProjectionWarmup: browserQueueProjectionWarmupRuntime.abort,
  handleQueueProjectionWarmupLiveIdentityEvent: browserQueueProjectionWarmupRuntime.handleLiveIdentityEvent,
  onQueueViewLifecycleState: applyQueueViewLifecycleState,
  scheduleQueueProjectionWarmup: browserQueueProjectionWarmupRuntime.schedule,
  scheduleAllRowsSnapshot,
  searchQuery,
  selectedRows,
  shouldFocusDocList,
  startFocusRowsSnapshot,
  t,
  totalRowCount,
});
loadDataImpl = browserLoadDataRuntime.loadData;
abortLoadData = browserLoadDataRuntime.abortLoadData;

const browserActionMenuRuntime = createBrowserActionMenuRuntime({
  applyRandomSort,
  applySort,
  currentDataSource,
  describeCurrentFilterSummary,
  ensureAllRowsSnapshotReady,
  getDialogManager: () => pluginContext.value?.getDialogManager?.(),
  getNeuralRoamQueue,
  getPlugin: () => props.plugin,
  getQueueById,
  getStorage: () => pluginStorage.value,
  globalSelection,
  gridApi,
  i18n: props.i18n,
  invalidateCardCache,
  isMobileMode,
  isNeuralRoamQueueActive,
  loadAllRowsForCurrentView,
  loadData,
  logger,
  neuralSubview,
  openDocumentTabById,
  pushErrMsg,
  pushMsg,
  refreshGlobalStats: refreshGlobalStatsAfterFirstRows,
  refreshNeuralSubviewData,
  refreshQueueCounts,
  resolveNeuralSourceLabels,
  selectedRows,
  t,
});
handleActionImpl = browserActionMenuRuntime.handleAction;
onCellContextMenuImpl = browserActionMenuRuntime.onCellContextMenu;
openPracticeMenuImpl = browserActionMenuRuntime.openPracticeMenu;

const cardTypeDetection = useCardTypeDetection(() => rows.value, {
  siyuanApi: () => browserSiyuanApi.value || null,
});


async function refreshQueueCounts(request: BrowserQueueCountsRequest = {}) {
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

  logger.info('[SiYuanMemo][SRSBrowser] handleSelectQueue called:', {
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

    logger.info('[SiYuanMemo][SRSBrowser] After clearing activeDocId:', {
      activeDocId: activeDocId.value,
      shouldFocusDocList: shouldFocusDocList.value,
      currentCardType: currentCardType.value,
      previousNonNeuralCardType: previousNonNeuralCardType.value,
    });

    await loadData(false, {
      refreshQueueCounts: false,
      snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
    });
  });
}

async function applyInitialBrowserView(forceRefresh = false): Promise<void> {
  if (props.initialOpenState) {
    await applyInitialBrowserOpenState(props.initialOpenState, forceRefresh);
    return;
  }

  const initialQueueId = normalizeBrowserQueueId(props.initialQueueId);
  if (!initialQueueId) {
    await loadData(forceRefresh, {
      refreshQueueCounts: false,
      scheduleQueueProjectionWarmup: false,
    });
    await refreshGlobalStatsAfterFirstRows(forceRefresh);
    browserQueueProjectionWarmupRuntime.schedule('browser-open-after-first-rows');
    void refreshQueueCounts();
    return;
  }

  await handleSelectQueue(initialQueueId);

  if (forceRefresh) {
    await loadData(true, { refreshQueueCounts: false });
  }

  await refreshQueueCounts();
  await refreshGlobalStatsAfterFirstRows(forceRefresh);

  if (initialQueueId === 'neural-roam') {
    const initialSubview = normalizeBrowserNeuralSubview(props.initialNeuralSubview);
    if (initialSubview) {
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

    await loadData(false, {
      refreshQueueCounts: false,
      snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
    });
  });
}

function handleExitFocus() {
  if (!hasActiveScopeDocIds.value) {
    void handleSelectGlobal('__all__');
    return;
  }

  void runWithSuspendedBrowserStateBootstrap(async () => {
    syncSelectionForQueryChange();
    activeScopeDocIds.value = null;
    activeDocId.value = null;
    shouldFocusDocList.value = Boolean(activeQueueId.value);
    await loadData(false, {
      refreshQueueCounts: false,
      snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
    });
    await refreshGlobalStatsAfterFirstRows(false);
  });
}

function normalizeDocTreeScopeIds(docId: string, scope?: BrowserDocTreeReviewScope | null): string[] {
  const docIds = Array.isArray(scope?.docIds) ? scope.docIds : [];
  const normalized = Array.from(new Set(
    [docId, ...docIds]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ));
  return normalized.length > 0 ? normalized : [docId];
}

async function resolveSelectedDocTreeScopeIds(docId: string): Promise<string[]> {
  const service = pluginContext.value?.getDocTreeReviewScopeService?.();
  if (!service?.collectDocReviewScope) {
    return [docId];
  }

  try {
    let scope = service.collectDocReviewScope(docId);
    if (!scope && service.hydrate) {
      await service.hydrate();
      scope = service.collectDocReviewScope(docId);
    }
    return normalizeDocTreeScopeIds(docId, scope);
  } catch (error) {
    logger.error('[SiYuanMemo][SRSBrowser] Failed to resolve selected document tree scope:', error);
    return [docId];
  }
}

function handleSelectDoc(docId: string) {
  const id = String(docId || '').trim();

  if (id === '__lost__') {
    void runWithSuspendedBrowserStateBootstrap(async () => {
      syncSelectionForQueryChange();
      activeQueueId.value = null;
      activeScopeDocIds.value = null;
      clearNeuralSubviewData();
      activeDocId.value = null;
      currentPreset.value = 'all';
      currentCardType.value = 'all';
      searchQuery.value = '';
      shouldFocusDocList.value = false;

      await loadData(false, {
        refreshQueueCounts: false,
        snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
      });
      await refreshGlobalStatsAfterFirstRows(false);
    });
    return;
  }

  if (!id) {
    return;
  }

  const taskId = ++docSelectionScopeTaskId;
  void runWithSuspendedBrowserStateBootstrap(async () => {
    const scopeDocIds = await resolveSelectedDocTreeScopeIds(id);
    if (taskId !== docSelectionScopeTaskId) {
      return;
    }

    syncSelectionForQueryChange();
    activeScopeDocIds.value = scopeDocIds;
    activeDocId.value = null;
    shouldFocusDocList.value = false;

    await loadData(false, {
      refreshQueueCounts: false,
      snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
    });
    await refreshGlobalStatsAfterFirstRows(false);
  });
}

function handleFilterDoc(docId: string) {
  handleSelectDoc(docId);
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
 * Spread collects cards automatically:
 * - Default: collect Outstanding cards with due <= now
 * - considerFutureRepetitions: collect cards due <= now + collectingPeriod
 *
 * @see queue reschedule operations requirements 8.2, 10.4
 */
async function handleOpenSpreadDialog() {
  await openBrowserSpreadDialog({
    activeQueueId: activeQueueId.value,
    ensureAllRowsSnapshotReady,
    getStorage: () => pluginStorage.value,
    i18n: props.i18n,
    loadAllRowsForCurrentView: () => loadAllRowsForCurrentView([]),
    logger,
    plugin: props.plugin,
    pushErrMsg,
    pushMsg,
    refreshData: (forceRefresh = false) => refreshData(forceRefresh),
    t,
  });
}
</script>
