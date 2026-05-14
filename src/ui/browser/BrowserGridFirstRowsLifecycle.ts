import type { BrowserCard } from './types';
import { isQueueProjectionNotReadyError } from './utils/projectionReadiness';

type MutableRef<T> = {
  value: T;
};

type ReadonlyRef<T> = {
  readonly value: T;
};

type BrowserGridFirstRowsLogger = {
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
};

type BrowserGridFirstRowsLifecycleDeps = {
  activeDocId: ReadonlyRef<string | null>;
  applyGlobalSelectionToLoadedRows: () => void;
  hasFirstDataBlockLoaded: MutableRef<boolean>;
  loading: MutableRef<boolean>;
  logger: BrowserGridFirstRowsLogger;
  measureUiUpdate?: (operation: () => void, metadata: Record<string, unknown>) => void;
  mergeLoadedRows: (rows: BrowserCard[]) => void;
  nextTick: (callback: () => void) => void;
  onStatusChange?: (status: BrowserGridRowsLifecycleStatus) => void;
  recordFirstRowsVisible: (metadata: Record<string, unknown>) => void;
  rows: MutableRef<BrowserCard[]>;
  rowsForFocus: MutableRef<BrowserCard[]>;
  scheduleUiUpdate: (version: number, update: () => void) => void;
  shouldFocusDocList: ReadonlyRef<boolean>;
  totalRowCount: MutableRef<number>;
};

type GridCallback = () => void;
type GridSuccessCallback = (rows: BrowserCard[], totalCount: number) => void;

export type BrowserGridRowsLifecycleStatus =
  | 'empty-datasource'
  | 'loaded'
  | 'projection-not-ready'
  | 'error';

export function createBrowserGridFirstRowsLifecycle(deps: BrowserGridFirstRowsLifecycleDeps) {
  function applyEmptyDatasource(params: {
    isCurrentVersion: () => boolean;
    successCallback: GridSuccessCallback;
    version: number;
  }): BrowserGridRowsLifecycleStatus {
    deps.onStatusChange?.('empty-datasource');
    if (params.isCurrentVersion()) {
      deps.scheduleUiUpdate(params.version, () => {
        deps.totalRowCount.value = 0;
        deps.hasFirstDataBlockLoaded.value = true;
        deps.loading.value = false;
        deps.nextTick(() => deps.recordFirstRowsVisible({
          empty: true,
          rowCount: 0,
          source: 'empty-datasource',
          totalCount: 0,
          version: params.version,
        }));
      });
    }
    params.successCallback([], 0);
    return 'empty-datasource';
  }

  function applyLoadedRows(params: {
    isCurrentVersion: () => boolean;
    rowsForBlock: BrowserCard[];
    successCallback: GridSuccessCallback;
    totalCount: number;
    version: number;
  }): BrowserGridRowsLifecycleStatus {
    deps.onStatusChange?.('loaded');
    params.successCallback(params.rowsForBlock, params.totalCount);
    deps.scheduleUiUpdate(params.version, () => {
      if (!params.isCurrentVersion()) {
        return;
      }
      const applyUiUpdate = () => {
        deps.totalRowCount.value = params.totalCount;
        deps.hasFirstDataBlockLoaded.value = true;
        deps.rows.value = params.rowsForBlock;
        if (!deps.shouldFocusDocList.value && !deps.activeDocId.value) {
          deps.rowsForFocus.value = [...params.rowsForBlock];
        }
        deps.mergeLoadedRows(params.rowsForBlock);
        deps.applyGlobalSelectionToLoadedRows();
        deps.loading.value = false;
        deps.nextTick(() => deps.recordFirstRowsVisible({
          empty: params.totalCount === 0,
          rowCount: params.rowsForBlock.length,
          source: 'datasource-ui-update',
          totalCount: params.totalCount,
          version: params.version,
        }));
      };
      const metadata = {
        rowCount: params.rowsForBlock.length,
        totalCount: params.totalCount,
      };
      if (deps.measureUiUpdate) {
        deps.measureUiUpdate(applyUiUpdate, metadata);
      } else {
        applyUiUpdate();
      }
    });
    return 'loaded';
  }

  function applyRowsError(params: {
    error: unknown;
    failCallback: GridCallback;
    isCurrentVersion: () => boolean;
    version: number;
  }): BrowserGridRowsLifecycleStatus {
    if (isQueueProjectionNotReadyError(params.error)) {
      deps.onStatusChange?.('projection-not-ready');
      if (params.isCurrentVersion()) {
        deps.logger.info('[SiYuanMemo][SRSBrowser] Queue projection is still refreshing; grid request will fail without error noise:', params.error);
        deps.scheduleUiUpdate(params.version, () => {
          deps.loading.value = false;
        });
      }
      params.failCallback();
      return 'projection-not-ready';
    }

    if (params.isCurrentVersion()) {
      deps.onStatusChange?.('error');
      deps.logger.error('[SiYuanMemo][SRSBrowser] Infinite datasource getRows failed:', params.error);
      deps.scheduleUiUpdate(params.version, () => {
        deps.hasFirstDataBlockLoaded.value = true;
        deps.loading.value = false;
      });
    }
    params.failCallback();
    return 'error';
  }

  return {
    applyEmptyDatasource,
    applyLoadedRows,
    applyRowsError,
  };
}
