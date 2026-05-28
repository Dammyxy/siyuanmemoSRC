import type {
  BrowserQueueCountsRequest,
  IBrowserApplicationService,
} from '@/application/interfaces/IBrowserApplicationService';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import type {
  BrowserCardTypeFilter,
  IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';
import type { BrowserCard, CardTypeFilter } from './types';
import type { ICardDataSource } from './datasource/types';
import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';
import { resolveBrowserHierarchySnapshotMode } from './hierarchySnapshotPlan';
import {
  createDeckDataSource,
  createQueryDataSource,
} from './utils/dataSourceFactory';
import {
  createBrowserQueueViewModule,
  planQueueProjectionLiveIdentityForBrowserQueueView,
} from './BrowserQueueViewModule';
import { measureRuntimePerformance, startRuntimePerformanceSpan } from '@/utils/runtimePerformanceDiagnostics';
import type {
  QueueProjectionIdentity,
  QueueProjectionLiveIdentityEvent,
} from '@/types/queue-projection-live-identity';

type MutableRef<T> = {
  value: T;
};

type ReadonlyRef<T> = {
  readonly value: T;
};

type BrowserTranslate = (key: string, fallback: string) => string;

type BrowserLogger = {
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
};

type BrowserLoadGlobalSelection = {
  clear: () => void;
};

export type BrowserLoadDataOptions = {
  refreshQueueCounts?: boolean;
  snapshotDelayMs?: number;
  origin?: 'default' | 'queue-sync';
};

export type BrowserLoadDataRuntimeDeps = {
  activeDocId: MutableRef<string | null>;
  activeQueueId: MutableRef<string | null>;
  activeScopeDocIds: MutableRef<string[] | null>;
  allRows: MutableRef<BrowserCard[]>;
  browserAppService: ReadonlyRef<IBrowserApplicationService | null | undefined>;
  browserSiyuanApi: ReadonlyRef<BrowserSiyuanPort | null | undefined>;
  clearNeuralSubviewData: () => void;
  currentCardType: ReadonlyRef<CardTypeFilter>;
  currentDataSource: MutableRef<ICardDataSource | null>;
  currentPreset: ReadonlyRef<PresetFilter>;
  currentProjectionIdentity: MutableRef<QueueProjectionIdentity | null>;
  currentQueueType: ReadonlyRef<string>;
  ensureSqlModeConfirmed: () => Promise<boolean>;
  getCurrentDocId: () => string | null;
  getPlugin: () => unknown;
  globalSelection: BrowserLoadGlobalSelection;
  hasRandomSort: MutableRef<boolean>;
  invalidateHierarchySnapshots: () => void;
  loading: MutableRef<boolean>;
  logger: BrowserLogger;
  previewCard: MutableRef<BrowserCard | null>;
  pluginUnifiedDataSourceManager: ReadonlyRef<IUnifiedDataSourceManagerFacade | null | undefined>;
  pushErrMsg: (msg: string, duration?: number) => Promise<void>;
  randomSortRows: MutableRef<BrowserCard[] | null>;
  rebuildInfiniteDatasource: (forceRefresh?: boolean) => void;
  refreshNeuralSubviewData: () => Promise<void>;
  refreshQueueCounts: (request?: BrowserQueueCountsRequest) => Promise<void>;
  resolveActiveSqlStatement: (queryText?: string) => string | null;
  rows: MutableRef<BrowserCard[]>;
  rowsForFocus: MutableRef<BrowserCard[]>;
  scheduleAllRowsSnapshot: (delayMs?: number) => void;
  searchQuery: ReadonlyRef<string>;
  selectedRows: MutableRef<BrowserCard[]>;
  shouldFocusDocList: ReadonlyRef<boolean>;
  startFocusRowsSnapshot: (delayMs?: number) => void;
  t: BrowserTranslate;
  totalRowCount: MutableRef<number>;
};

function clearBrowserRows(deps: BrowserLoadDataRuntimeDeps): void {
  deps.rows.value = [];
  deps.rowsForFocus.value = [];
  deps.allRows.value = [];
  deps.totalRowCount.value = 0;
}

function getCardType(deps: BrowserLoadDataRuntimeDeps): BrowserCardTypeFilter {
  return deps.currentCardType.value as BrowserCardTypeFilter;
}

export function createBrowserLoadDataRuntime(deps: BrowserLoadDataRuntimeDeps) {
  let loadDataAbortController: AbortController | null = null;
  let liveIdentityReloadTimer: ReturnType<typeof setTimeout> | null = null;
  let queueViewRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingHiddenLiveIdentityEvent: QueueProjectionLiveIdentityEvent | null = null;
  const queueViewModule = createBrowserQueueViewModule({ logger: deps.logger });

  function abortLoadData(): void {
    if (loadDataAbortController) {
      loadDataAbortController.abort();
      loadDataAbortController = null;
    }
    if (liveIdentityReloadTimer) {
      clearTimeout(liveIdentityReloadTimer);
      liveIdentityReloadTimer = null;
    }
    if (queueViewRetryTimer) {
      clearTimeout(queueViewRetryTimer);
      queueViewRetryTimer = null;
    }
  }

  function flushPendingHiddenLiveIdentityEvent(): void {
    if (!pendingHiddenLiveIdentityEvent || !deps.activeQueueId.value) {
      return;
    }
    const event = pendingHiddenLiveIdentityEvent;
    pendingHiddenLiveIdentityEvent = null;
    const plan = planQueueProjectionLiveIdentityForBrowserQueueView({
      activeQueueId: deps.activeQueueId.value,
      currentQueueType: deps.currentQueueType.value,
      currentProjectionIdentity: deps.currentProjectionIdentity.value,
      event,
      visible: true,
    });
    if (plan.action === 'reattach') {
      deps.currentProjectionIdentity.value = plan.identity;
    }
  }

  function handleQueueProjectionLiveIdentityEvent(event: QueueProjectionLiveIdentityEvent): 'ignored' | 'scheduled' {
    const plan = planQueueProjectionLiveIdentityForBrowserQueueView({
      activeQueueId: deps.activeQueueId.value,
      currentQueueType: deps.currentQueueType.value,
      currentProjectionIdentity: deps.currentProjectionIdentity.value,
      event,
      visible: Boolean(deps.activeQueueId.value),
    });
    if (plan.action === 'ignore') {
      if (plan.reason === 'hidden-browser-mode') {
        pendingHiddenLiveIdentityEvent = event;
      }
      deps.logger.debug?.('[SiYuanMemo][SRSBrowser] Ignored queue projection live identity event', {
        event,
        reason: plan.reason,
      });
      return 'ignored';
    }
    if (liveIdentityReloadTimer) {
      return 'scheduled';
    }
    liveIdentityReloadTimer = setTimeout(() => {
      liveIdentityReloadTimer = null;
      void loadData(false, {
        origin: 'queue-sync',
        refreshQueueCounts: false,
      });
      }, 0);
    return 'scheduled';
  }

  async function loadData(forceRefresh = false, options: BrowserLoadDataOptions = {}): Promise<void> {
    const shouldRefreshQueueCounts = options.refreshQueueCounts ?? true;
    const origin = options.origin ?? 'default';
    const finishLoadSpan = startRuntimePerformanceSpan('browser', 'load-data.total', {
      forceRefresh,
      origin,
    });
    let status = 'started';
    let datasourceKind = 'none';

    if (loadDataAbortController) {
      loadDataAbortController.abort();
      deps.logger.info('[SiYuanMemo][SRSBrowser] Previous loadData() aborted');
    }
    if (queueViewRetryTimer) {
      clearTimeout(queueViewRetryTimer);
      queueViewRetryTimer = null;
    }
    deps.invalidateHierarchySnapshots();

    loadDataAbortController = new AbortController();
    const currentController = loadDataAbortController;
    let datasourceTriggered = false;

    deps.loading.value = true;
    deps.hasRandomSort.value = false;
    deps.randomSortRows.value = null;
    try {
      if (currentController.signal.aborted) {
        deps.logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted before execution');
        return;
      }

      if (origin !== 'queue-sync') {
        deps.selectedRows.value = [];
        deps.globalSelection.clear();
        deps.previewCard.value = null;
      }

      const unifiedDataSourceManager = deps.pluginUnifiedDataSourceManager.value;

      if (deps.activeQueueId.value) {
        datasourceKind = 'queue';
        if (!unifiedDataSourceManager) {
          deps.logger.error('[SiYuanMemo][SRSBrowser] UnifiedDataSourceManager not available');
          clearBrowserRows(deps);
          return;
        }

        deps.currentProjectionIdentity.value = null;
        flushPendingHiddenLiveIdentityEvent();

        const activeQueueId = deps.activeQueueId.value;
        const queueView = await measureRuntimePerformance('browser', 'load-data.prepare-queue-view', () => queueViewModule.prepareQueueView(
          unifiedDataSourceManager,
          {
            activeDocId: deps.activeDocId.value,
            activeQueueId,
            activeScopeDocIds: deps.activeScopeDocIds.value,
            browserAppService: deps.browserAppService.value || null,
            cardType: getCardType(deps),
            currentPreset: deps.currentPreset.value,
            currentQueueType: deps.currentQueueType.value,
            forceRefresh,
            plugin: deps.getPlugin(),
            searchText: deps.searchQuery.value,
          },
        ), { queueId: activeQueueId });

        if (queueView.status === 'refreshing') {
          datasourceTriggered = true;
          deps.currentDataSource.value = null;
          if (queueView.keepLoading && queueView.retryDelayMs != null && !currentController.signal.aborted) {
            queueViewRetryTimer = setTimeout(() => {
              queueViewRetryTimer = null;
              if (!currentController.signal.aborted) {
                void loadData(forceRefresh, { ...options, origin: 'queue-sync' });
              }
            }, queueView.retryDelayMs);
          } else {
            deps.loading.value = false;
          }
          return;
        }

        if (queueView.status === 'unavailable') {
          deps.currentDataSource.value = null;
          deps.currentProjectionIdentity.value = null;
          await deps.pushErrMsg(queueView.message);
          clearBrowserRows(deps);
          return;
        }

        if (queueView.status === 'missing-datasource') {
          deps.logger.error('[SiYuanMemo][SRSBrowser] Failed to create data source for queue:', queueView.queueId);
          deps.currentProjectionIdentity.value = null;
          clearBrowserRows(deps);
          return;
        }

        deps.currentDataSource.value = queueView.datasource;
        if (queueView.projectionIdentity) {
          deps.currentProjectionIdentity.value = queueView.projectionIdentity;
        }
      } else {
        deps.clearNeuralSubviewData();
        deps.currentProjectionIdentity.value = null;
        pendingHiddenLiveIdentityEvent = null;
        const sqlStmt = deps.resolveActiveSqlStatement(deps.searchQuery.value);
        if (sqlStmt != null) {
          datasourceKind = 'sql-query';
          const ok = await deps.ensureSqlModeConfirmed();
          if (!ok) return;
          deps.activeQueueId.value = null;
          deps.currentDataSource.value = measureRuntimePerformance('browser', 'load-data.create-query-datasource', () => createQueryDataSource(sqlStmt, {
            manager: unifiedDataSourceManager,
            plugin: deps.getPlugin(),
            siyuanApi: deps.browserSiyuanApi.value || undefined,
          }));
        } else {
          datasourceKind = 'deck';
          if (!unifiedDataSourceManager) {
            deps.logger.error('[SiYuanMemo][SRSBrowser] UnifiedDataSourceManager not available for deck mode');
            await deps.pushErrMsg(deps.t('envNotInit', 'Environment not initialized'));
            clearBrowserRows(deps);
            return;
          }

          deps.currentDataSource.value = measureRuntimePerformance('browser', 'load-data.create-deck-datasource', () => createDeckDataSource(
            unifiedDataSourceManager,
            {
              docId: deps.activeDocId.value,
              scopeDocIds: deps.activeScopeDocIds.value,
              preset: deps.currentPreset.value,
              queryText: deps.searchQuery.value,
              cardType: getCardType(deps),
            },
            deps.getCurrentDocId(),
            deps.getPlugin(),
            deps.browserAppService.value || null,
          ), {
            activeDocId: deps.activeDocId.value,
            hasScopeDocIds: Boolean(deps.activeScopeDocIds.value?.length),
          });
        }
      }

      if (!deps.currentDataSource.value) {
        deps.currentProjectionIdentity.value = null;
        clearBrowserRows(deps);
        return;
      }

      if (currentController.signal.aborted) {
        deps.logger.info('[SiYuanMemo][SRSBrowser] loadData() aborted before datasource apply');
        return;
      }

      measureRuntimePerformance('browser', 'load-data.rebuild-infinite-datasource', () => deps.rebuildInfiniteDatasource(forceRefresh), {
        datasourceKind,
      });
      datasourceTriggered = true;
      const hierarchySnapshotMode = resolveBrowserHierarchySnapshotMode({
        shouldFocusDocList: deps.shouldFocusDocList.value,
        activeDocId: deps.activeDocId.value,
      });
      if (hierarchySnapshotMode === 'focus') {
        measureRuntimePerformance('browser', 'load-data.schedule-focus-snapshot', () => deps.startFocusRowsSnapshot(options.snapshotDelayMs), {
          snapshotDelayMs: options.snapshotDelayMs ?? null,
        });
      } else if (hierarchySnapshotMode === 'all') {
        measureRuntimePerformance('browser', 'load-data.schedule-all-rows-snapshot', () => deps.scheduleAllRowsSnapshot(options.snapshotDelayMs), {
          snapshotDelayMs: options.snapshotDelayMs ?? null,
        });
      }
      void origin;

      if (deps.currentQueueType.value === 'neural-roam') {
        await measureRuntimePerformance('browser', 'load-data.refresh-neural-subview', () => deps.refreshNeuralSubviewData());
      } else {
        deps.clearNeuralSubviewData();
      }
      status = 'loaded';
    } catch (err) {
      status = 'error';
      deps.logger.error('[SiYuanMemo][CardBrowser] Load data error:', err);
      deps.rows.value = [];
      deps.totalRowCount.value = 0;
    } finally {
      if (!currentController.signal.aborted) {
        if (!datasourceTriggered) {
          deps.loading.value = false;
        }
        if (shouldRefreshQueueCounts) {
          void deps.refreshQueueCounts({ forceRefresh: false });
        }
      }

      if (loadDataAbortController === currentController) {
        loadDataAbortController = null;
      }
      finishLoadSpan({
        datasourceKind,
        status,
      }, {
        ok: status !== 'error',
        errorName: status === 'error' ? 'BrowserLoadDataError' : undefined,
      });
    }
  }

  return {
    abortLoadData,
    handleQueueProjectionLiveIdentityEvent,
    loadData,
  };
}
