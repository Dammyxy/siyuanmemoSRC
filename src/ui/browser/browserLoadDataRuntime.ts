import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
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
  createQueueDataSource,
} from './utils/dataSourceFactory';
import { measureRuntimePerformance, startRuntimePerformanceSpan } from '@/utils/runtimePerformanceDiagnostics';

type MutableRef<T> = {
  value: T;
};

type ReadonlyRef<T> = {
  readonly value: T;
};

type BrowserTranslate = (key: string, fallback: string) => string;

type BrowserLogger = {
  error: (...args: unknown[]) => void;
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
  refreshQueueCounts: () => Promise<void>;
  resolveActiveSqlStatement: (queryText?: string) => string | null;
  rows: MutableRef<BrowserCard[]>;
  rowsForFocus: MutableRef<BrowserCard[]>;
  scheduleAllRowsSnapshot: (delayMs?: number) => void;
  searchQuery: ReadonlyRef<string>;
  selectedRows: MutableRef<BrowserCard[]>;
  shouldFocusDocList: ReadonlyRef<boolean>;
  startFocusRowsSnapshot: () => void;
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

  function abortLoadData(): void {
    if (loadDataAbortController) {
      loadDataAbortController.abort();
      loadDataAbortController = null;
    }
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

        deps.currentDataSource.value = measureRuntimePerformance('browser', 'load-data.create-queue-datasource', () => createQueueDataSource(
          deps.activeQueueId.value,
          unifiedDataSourceManager,
          {
            docId: deps.activeDocId.value,
            scopeDocIds: deps.activeScopeDocIds.value,
            preset: deps.currentPreset.value,
            queryText: deps.searchQuery.value,
            cardType: getCardType(deps),
          },
          deps.getPlugin(),
          deps.browserAppService.value || null,
        ), { queueId: deps.activeQueueId.value });

        if (!deps.currentDataSource.value) {
          deps.logger.error('[SiYuanMemo][SRSBrowser] Failed to create data source for queue:', deps.activeQueueId.value);
          clearBrowserRows(deps);
          return;
        }
      } else {
        deps.clearNeuralSubviewData();
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
        measureRuntimePerformance('browser', 'load-data.start-focus-snapshot', () => deps.startFocusRowsSnapshot());
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
          void deps.refreshQueueCounts();
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
    loadData,
  };
}
