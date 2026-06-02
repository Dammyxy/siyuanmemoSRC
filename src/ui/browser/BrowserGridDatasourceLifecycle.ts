import type { GridApi, IDatasource, IGetRowsParams } from 'ag-grid-community';
import type { FetchRowsOptions, FetchRowsResult, ICardDataSource, SortModel } from './datasource/types';
import type { BrowserCard } from './types';
import type { BrowserReadModelSnapshotMetadata } from '@/application/queries/browser/browser-read-model';
import type { BrowserGridRowsLifecycleStatus } from './BrowserGridFirstRowsLifecycle';
import { fetchRowsWithProjectionReadinessRetry } from './utils/projectionReadiness';
import { resolveEffectiveSortModel } from './utils/sortModel';

type MutableRef<T> = {
  value: T;
};

type ReadonlyRef<T> = {
  readonly value: T;
};

type BrowserGridFirstRowsLifecycleLike = {
  applyEmptyDatasource: (params: {
    isCurrentVersion: () => boolean;
    successCallback: (rows: BrowserCard[], totalCount: number) => void;
    version: number;
  }) => BrowserGridRowsLifecycleStatus;
  applyLoadedRows: (params: {
    isCurrentVersion: () => boolean;
    rowsForBlock: BrowserCard[];
    successCallback: (rows: BrowserCard[], totalCount: number) => void;
    totalCount: number;
    version: number;
  }) => BrowserGridRowsLifecycleStatus;
  applyRowsError: (params: {
    error: unknown;
    failCallback: () => void;
    isCurrentVersion: () => boolean;
    version: number;
  }) => BrowserGridRowsLifecycleStatus;
};

type BrowserGridDatasourceLifecycleDeps = {
  currentSortModel: ReadonlyRef<SortModel[]>;
  fetchRowsWithReadinessRetry?: (
    dataSource: ICardDataSource,
    options: FetchRowsOptions,
    shouldContinue: () => boolean,
  ) => Promise<FetchRowsResult>;
  firstRowsLifecycle: BrowserGridFirstRowsLifecycleLike;
  getCurrentVersion: () => number;
  getExpectedReadModelSnapshotMetadata?: () => BrowserReadModelSnapshotMetadata | null | undefined;
  getFirstRowsLoaded: () => boolean;
  getGridApi: () => GridApi | null;
  getSortRevision: () => number;
  isGridApiAlive: (api: GridApi | null | undefined) => boolean;
  measureRuntimePerformance: <T>(category: string, operation: string, fn: () => T | Promise<T>, metadata?: Record<string, unknown>) => T | Promise<T>;
  randomSortRows: ReadonlyRef<BrowserCard[] | null>;
  resolveEffectiveSortModel?: typeof resolveEffectiveSortModel;
  sortModelRevision: ReadonlyRef<number>;
  onReadModelSnapshotMetadata?: (metadata: BrowserReadModelSnapshotMetadata) => void;
  startGridModelUpdate: (reason: string, metadata?: { version?: number }) => void;
  startRuntimePerformanceSpan: (
    category: string,
    operation: string,
    metadata?: Record<string, unknown>,
  ) => (metadata?: Record<string, unknown>, result?: { ok?: boolean; errorName?: string }) => void;
};

type BrowserGridReadModelResponseMetadata = Pick<
  FetchRowsResult,
  'generation' | 'queryFingerprint' | 'readOwner'
>;

export type BrowserGridDatasourceLifecycle = ReturnType<typeof createBrowserGridDatasourceLifecycle>;

function stableMetadataString(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableMetadataString).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableMetadataString(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hasReadModelMetadata(result: BrowserGridReadModelResponseMetadata): boolean {
  return typeof result.queryFingerprint === 'string'
    && Object.prototype.hasOwnProperty.call(result, 'generation')
    && Boolean(result.readOwner);
}

function toBrowserGridReadModelSnapshotMetadata(
  result: BrowserGridReadModelResponseMetadata,
): BrowserReadModelSnapshotMetadata | null {
  if (!hasReadModelMetadata(result)) {
    return null;
  }
  return {
    queryFingerprint: result.queryFingerprint as string,
    generation: result.generation ?? null,
    readOwner: result.readOwner as BrowserReadModelSnapshotMetadata['readOwner'],
  };
}

export function isBrowserGridReadModelResponseCurrent(input: {
  expected?: BrowserReadModelSnapshotMetadata | null;
  result: BrowserGridReadModelResponseMetadata;
}): boolean {
  if (!input.expected) {
    return true;
  }
  if (!hasReadModelMetadata(input.result)) {
    return false;
  }
  return input.result.queryFingerprint === input.expected.queryFingerprint
    && (input.result.generation ?? null) === (input.expected.generation ?? null)
    && stableMetadataString(input.result.readOwner ?? null) === stableMetadataString(input.expected.readOwner ?? null);
}

export function createBrowserGridDatasourceLifecycle(deps: BrowserGridDatasourceLifecycleDeps) {
  const fetchRows = deps.fetchRowsWithReadinessRetry ?? fetchRowsWithProjectionReadinessRetry;
  const resolveSort = deps.resolveEffectiveSortModel ?? resolveEffectiveSortModel;
  let pendingGridDatasource: IDatasource | null = null;
  let gridDatasourceApplyTimer: ReturnType<typeof setTimeout> | null = null;

  function isCurrentVersion(version: number): boolean {
    return version === deps.getCurrentVersion();
  }

  function createInfiniteDatasource(
    version: number,
    dataSourceSnapshot: ICardDataSource | null,
    forceRefresh = false,
  ): IDatasource {
    let shouldForceRefreshNextFetch = forceRefresh;
    return {
      getRows: (params: IGetRowsParams) => {
        void (async () => {
          const finishGetRowsSpan = deps.startRuntimePerformanceSpan('browser', 'grid.get-rows', {
            endRow: params.endRow,
            startRow: params.startRow,
            version,
          });
          let status = 'started';
          let rowsForBlockCount = 0;
          let totalCount = 0;
          try {
            const dataSource = dataSourceSnapshot;
            if (!dataSource) {
              status = deps.firstRowsLifecycle.applyEmptyDatasource({
                isCurrentVersion: () => isCurrentVersion(version),
                successCallback: params.successCallback,
                version,
              });
              return;
            }

            let rowsForBlock: BrowserCard[] = [];
            let requestSortRevision = deps.sortModelRevision.value;
            let readModelSnapshotMetadata: BrowserReadModelSnapshotMetadata | null = null;

            if (deps.randomSortRows.value) {
              const fullRows = deps.randomSortRows.value;
              totalCount = fullRows.length;
              const start = Math.max(0, Math.min(params.startRow, totalCount));
              const end = Math.max(start, Math.min(params.endRow, totalCount));
              rowsForBlock = fullRows.slice(start, end);
            } else {
              const effectiveSortModel = resolveSort({
                requestSortModel: (params.sortModel || []) as SortModel[],
                currentSortModel: deps.currentSortModel.value,
                api: deps.getGridApi(),
              });
              requestSortRevision = deps.getSortRevision();
              const requestForceRefresh = shouldForceRefreshNextFetch;
              shouldForceRefreshNextFetch = false;
              const fetchOptions = {
                sortModel: effectiveSortModel,
                filterModel: params.filterModel || {},
                startRow: params.startRow,
                endRow: params.endRow,
                forceRefresh: requestForceRefresh,
              };
              const result = await deps.measureRuntimePerformance('browser', 'grid.fetch-rows', () => fetchRows(
                dataSource,
                fetchOptions,
                () => isCurrentVersion(version),
              ), {
                endRow: params.endRow,
                filterKeys: Object.keys(params.filterModel || {}).length,
                sortCount: effectiveSortModel.length,
                startRow: params.startRow,
              });
              rowsForBlock = result.rows;
              totalCount = result.totalCount;
              readModelSnapshotMetadata = toBrowserGridReadModelSnapshotMetadata(result);
              if (!isBrowserGridReadModelResponseCurrent({
                expected: deps.getExpectedReadModelSnapshotMetadata?.() ?? null,
                result,
              })) {
                params.failCallback();
                status = 'stale-read-model';
                return;
              }
            }
            rowsForBlockCount = rowsForBlock.length;

            if (!isCurrentVersion(version)) {
              params.failCallback();
              status = 'stale-version';
              return;
            }

            if (requestSortRevision !== deps.getSortRevision()) {
              params.failCallback();
              status = 'stale-sort';
              return;
            }

            if (readModelSnapshotMetadata) {
              deps.onReadModelSnapshotMetadata?.(readModelSnapshotMetadata);
            }

            status = deps.measureRuntimePerformance('browser', 'grid.success-callback', () => deps.firstRowsLifecycle.applyLoadedRows({
              isCurrentVersion: () => isCurrentVersion(version),
              rowsForBlock,
              successCallback: params.successCallback,
              totalCount,
              version,
            }), {
              rowCount: rowsForBlock.length,
              totalCount,
            }) as string;
          } catch (error) {
            status = deps.firstRowsLifecycle.applyRowsError({
              error,
              failCallback: params.failCallback,
              isCurrentVersion: () => isCurrentVersion(version),
              version,
            });
          } finally {
            finishGetRowsSpan({
              firstRowsLoaded: deps.getFirstRowsLoaded(),
              rowCount: rowsForBlockCount,
              status,
              totalCount,
            }, {
              ok: status === 'loaded'
                || status === 'empty-datasource'
                || status === 'projection-not-ready'
                || status === 'read-model-preparing'
                || status === 'read-model-repair-required'
                || status === 'read-model-unavailable',
              errorName: status === 'error' ? 'BrowserGridGetRowsError' : undefined,
            });
          }
        })();
      },
    };
  }

  function applyPendingDatasourceToGrid(): void {
    if (!deps.isGridApiAlive(deps.getGridApi()) || !pendingGridDatasource) {
      return;
    }
    if (gridDatasourceApplyTimer) {
      clearTimeout(gridDatasourceApplyTimer);
      gridDatasourceApplyTimer = null;
    }
    const datasource = pendingGridDatasource;
    gridDatasourceApplyTimer = setTimeout(() => {
      gridDatasourceApplyTimer = null;
      const api = deps.getGridApi();
      if (!deps.isGridApiAlive(api) || !datasource) {
        return;
      }
      deps.startGridModelUpdate('apply-datasource', { version: deps.getCurrentVersion() });
      deps.measureRuntimePerformance('browser', 'grid.apply-datasource', () => api?.setGridOption?.('datasource', datasource));
      if (pendingGridDatasource === datasource) {
        pendingGridDatasource = null;
      }
    }, 0);
  }

  function rebuildInfiniteDatasource(params: {
    currentDataSource: ICardDataSource | null;
    totalRowCount: MutableRef<number>;
    forceRefresh?: boolean;
    version: number;
  }): void {
    params.totalRowCount.value = deps.randomSortRows.value?.length || 0;
    pendingGridDatasource = createInfiniteDatasource(params.version, params.currentDataSource, Boolean(params.forceRefresh));
    applyPendingDatasourceToGrid();
  }

  function clearPendingDatasource(): void {
    pendingGridDatasource = null;
    if (gridDatasourceApplyTimer) {
      clearTimeout(gridDatasourceApplyTimer);
      gridDatasourceApplyTimer = null;
    }
  }

  return {
    applyPendingDatasourceToGrid,
    clearPendingDatasource,
    createInfiniteDatasource,
    hasPendingDatasource: () => Boolean(pendingGridDatasource),
    rebuildInfiniteDatasource,
  };
}
