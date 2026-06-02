import { describe, expect, it, vi } from 'vitest';
import { createBrowserGridDatasourceLifecycle } from '../BrowserGridDatasourceLifecycle';
import type { BrowserCard } from '../types';
import type { ICardDataSource } from '../datasource/types';
import { QueueProjectionNotReadyError } from '@/types/unified-data-source';

function ref<T>(value: T): { value: T } {
  return { value };
}

function createParams(overrides: Record<string, unknown> = {}) {
  return {
    endRow: 2,
    failCallback: vi.fn(),
    filterModel: {},
    sortModel: [],
    startRow: 0,
    successCallback: vi.fn(),
    ...overrides,
  } as any;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness(overrides: {
  currentVersion?: number;
  fetchRowsWithReadinessRetry?: any;
  getExpectedReadModelSnapshotMetadata?: any;
  gridApi?: any;
  onReadModelSnapshotMetadata?: any;
  randomRows?: BrowserCard[] | null;
  sortRevision?: { value: number };
} = {}) {
  const currentVersion = ref(overrides.currentVersion ?? 1);
  const sortRevision = overrides.sortRevision ?? ref(0);
  const firstRowsLifecycle = {
    applyEmptyDatasource: vi.fn(() => 'empty-datasource' as const),
    applyLoadedRows: vi.fn((params: any) => {
      params.successCallback(params.rowsForBlock, params.totalCount);
      return 'loaded' as const;
    }),
    applyRowsError: vi.fn((params: any) => {
      params.failCallback();
      return params.error instanceof QueueProjectionNotReadyError ? 'projection-not-ready' as const : 'error' as const;
    }),
  };
  const gridApi = {
    isDestroyed: vi.fn(() => false),
    setGridOption: vi.fn(),
  } as any;
  const gridApiRef = ref(overrides.gridApi === undefined ? gridApi : overrides.gridApi);
  const lifecycle = createBrowserGridDatasourceLifecycle({
    currentSortModel: ref([]),
    fetchRowsWithReadinessRetry: overrides.fetchRowsWithReadinessRetry,
    firstRowsLifecycle,
    getCurrentVersion: () => currentVersion.value,
    getExpectedReadModelSnapshotMetadata: overrides.getExpectedReadModelSnapshotMetadata,
    getFirstRowsLoaded: () => false,
    getGridApi: () => gridApiRef.value,
    getSortRevision: () => sortRevision.value,
    isGridApiAlive: (api) => Boolean(api && !api.isDestroyed?.()),
    measureRuntimePerformance: (_category, _operation, fn) => fn(),
    onReadModelSnapshotMetadata: overrides.onReadModelSnapshotMetadata,
    randomSortRows: ref(overrides.randomRows ?? null),
    sortModelRevision: sortRevision,
    startGridModelUpdate: vi.fn(),
    startRuntimePerformanceSpan: vi.fn(() => vi.fn()),
  });
  return { currentVersion, firstRowsLifecycle, gridApi, gridApiRef, lifecycle, sortRevision };
}

describe('BrowserGridDatasourceLifecycle', () => {
  it('routes normal datasource fetch through success callback and first-row lifecycle', async () => {
    const rows = [{ id: 'a', blockId: 'a' }] as BrowserCard[];
    const dataSource = {
      fetchRows: vi.fn(async () => ({ rows, totalCount: 3 })),
    } as unknown as ICardDataSource;
    const fetchRowsWithReadinessRetry = vi.fn((source, options) => source.fetchRows(options));
    const { firstRowsLifecycle, lifecycle } = createHarness({ fetchRowsWithReadinessRetry });
    const datasource = lifecycle.createInfiniteDatasource(1, dataSource);
    const params = createParams();

    datasource.getRows!(params);
    await flush();

    expect(fetchRowsWithReadinessRetry).toHaveBeenCalledWith(dataSource, expect.objectContaining({
      endRow: 2,
      startRow: 0,
    }), expect.any(Function));
    expect(firstRowsLifecycle.applyLoadedRows).toHaveBeenCalledWith(expect.objectContaining({
      rowsForBlock: rows,
      totalCount: 3,
      version: 1,
    }));
    expect(params.successCallback).toHaveBeenCalledWith(rows, 3);
  });

  it('pages random-sort rows without fetching datasource rows', async () => {
    const randomRows = [
      { id: 'a', blockId: 'a' },
      { id: 'b', blockId: 'b' },
      { id: 'c', blockId: 'c' },
    ] as BrowserCard[];
    const dataSource = {
      fetchRows: vi.fn(async () => ({ rows: [], totalCount: 0 })),
    } as unknown as ICardDataSource;
    const fetchRowsWithReadinessRetry = vi.fn();
    const { firstRowsLifecycle, lifecycle } = createHarness({ fetchRowsWithReadinessRetry, randomRows });
    const datasource = lifecycle.createInfiniteDatasource(1, dataSource);
    const params = createParams({ startRow: 1, endRow: 3 });

    datasource.getRows!(params);
    await flush();

    expect(fetchRowsWithReadinessRetry).not.toHaveBeenCalled();
    expect(firstRowsLifecycle.applyLoadedRows).toHaveBeenCalledWith(expect.objectContaining({
      rowsForBlock: randomRows.slice(1, 3),
      totalCount: 3,
    }));
  });

  it('fails stale datasource version without applying rows', async () => {
    const dataSource = {
      fetchRows: vi.fn(async () => ({ rows: [{ id: 'a', blockId: 'a' }] as BrowserCard[], totalCount: 1 })),
    } as unknown as ICardDataSource;
    const { currentVersion, firstRowsLifecycle, lifecycle } = createHarness();
    const datasource = lifecycle.createInfiniteDatasource(1, dataSource);
    const params = createParams();
    currentVersion.value = 2;

    datasource.getRows!(params);
    await flush();

    expect(params.failCallback).toHaveBeenCalledTimes(1);
    expect(firstRowsLifecycle.applyLoadedRows).not.toHaveBeenCalled();
  });

  it('fails old generation row requests after live identity reattach advances datasource version', async () => {
    let resolveFetch: ((value: { rows: BrowserCard[]; totalCount: number }) => void) | null = null;
    const dataSource = {
      fetchRows: vi.fn(() => new Promise((resolve) => {
        resolveFetch = resolve;
      })),
    } as unknown as ICardDataSource;
    const { currentVersion, firstRowsLifecycle, lifecycle } = createHarness({ currentVersion: 1 });
    const oldDatasource = lifecycle.createInfiniteDatasource(1, dataSource);
    const params = createParams();

    oldDatasource.getRows!(params);
    currentVersion.value = 2;
    lifecycle.rebuildInfiniteDatasource({
      currentDataSource: dataSource,
      totalRowCount: ref(0),
      version: 2,
    });
    resolveFetch?.({ rows: [{ id: 'old', blockId: 'old' }] as BrowserCard[], totalCount: 1 });
    await flush();

    expect(params.failCallback).toHaveBeenCalledTimes(1);
    expect(firstRowsLifecycle.applyLoadedRows).not.toHaveBeenCalled();
  });

  it('fails stale sort revision without applying rows', async () => {
    const sortRevision = ref(0);
    const dataSource = {
      fetchRows: vi.fn(async () => {
        sortRevision.value = 1;
        return { rows: [{ id: 'a', blockId: 'a' }] as BrowserCard[], totalCount: 1 };
      }),
    } as unknown as ICardDataSource;
    const { firstRowsLifecycle, lifecycle } = createHarness({ sortRevision });
    const datasource = lifecycle.createInfiniteDatasource(1, dataSource);
    const params = createParams();

    datasource.getRows!(params);
    await flush();

    expect(params.failCallback).toHaveBeenCalledTimes(1);
    expect(firstRowsLifecycle.applyLoadedRows).not.toHaveBeenCalled();
  });

  it('fails stale read model metadata without applying rows', async () => {
    const dataSource = {
      fetchRows: vi.fn(async () => ({
        rows: [{ id: 'a', blockId: 'a' }] as BrowserCard[],
        totalCount: 1,
        queryFingerprint: 'query-old',
        generation: 2,
        readOwner: { kind: 'sql-card-universe' },
      })),
    } as unknown as ICardDataSource;
    const { firstRowsLifecycle, lifecycle } = createHarness({
      getExpectedReadModelSnapshotMetadata: () => ({
        queryFingerprint: 'query-new',
        generation: 2,
        readOwner: { kind: 'sql-card-universe' },
      }),
    });
    const datasource = lifecycle.createInfiniteDatasource(1, dataSource);
    const params = createParams();

    datasource.getRows!(params);
    await flush();

    expect(params.failCallback).toHaveBeenCalledTimes(1);
    expect(firstRowsLifecycle.applyLoadedRows).not.toHaveBeenCalled();
  });

  it('publishes accepted read model metadata and rejects later generation or read owner drift', async () => {
    const expectedMetadata = ref<any>(null);
    const dataSource = {
      fetchRows: vi.fn()
        .mockResolvedValueOnce({
          rows: [{ id: 'a', blockId: 'a' }] as BrowserCard[],
          totalCount: 2,
          queryFingerprint: 'query-a',
          generation: 7,
          readOwner: { kind: 'queue-projection', queueId: 'retrieval' },
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'b', blockId: 'b' }] as BrowserCard[],
          totalCount: 2,
          queryFingerprint: 'query-a',
          generation: 8,
          readOwner: { kind: 'queue-projection', queueId: 'retrieval' },
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'c', blockId: 'c' }] as BrowserCard[],
          totalCount: 2,
          queryFingerprint: 'query-a',
          generation: 7,
          readOwner: { kind: 'queue-projection', queueId: 'filter-group' },
        }),
    } as unknown as ICardDataSource;
    const { firstRowsLifecycle, lifecycle } = createHarness({
      getExpectedReadModelSnapshotMetadata: () => expectedMetadata.value,
      onReadModelSnapshotMetadata: (metadata: any) => {
        expectedMetadata.value = metadata;
      },
    });
    const datasource = lifecycle.createInfiniteDatasource(1, dataSource);
    const acceptedParams = createParams({ startRow: 0, endRow: 1 });
    const staleGenerationParams = createParams({ startRow: 1, endRow: 2 });
    const staleOwnerParams = createParams({ startRow: 1, endRow: 2 });

    datasource.getRows!(acceptedParams);
    await flush();
    datasource.getRows!(staleGenerationParams);
    await flush();
    datasource.getRows!(staleOwnerParams);
    await flush();

    expect(expectedMetadata.value).toEqual({
      queryFingerprint: 'query-a',
      generation: 7,
      readOwner: { kind: 'queue-projection', queueId: 'retrieval' },
    });
    expect(acceptedParams.successCallback).toHaveBeenCalledTimes(1);
    expect(staleGenerationParams.failCallback).toHaveBeenCalledTimes(1);
    expect(staleOwnerParams.failCallback).toHaveBeenCalledTimes(1);
    expect(firstRowsLifecycle.applyLoadedRows).toHaveBeenCalledTimes(1);
  });

  it('routes projection-not-ready and hard errors through first-row lifecycle', async () => {
    const projectionError = new QueueProjectionNotReadyError('refreshing');
    const hardError = new Error('boom');
    const projectionSource = { fetchRows: vi.fn(async () => { throw projectionError; }) } as unknown as ICardDataSource;
    const hardSource = { fetchRows: vi.fn(async () => { throw hardError; }) } as unknown as ICardDataSource;
    const fetchRowsWithReadinessRetry = vi.fn((source, options) => source.fetchRows(options));
    const { firstRowsLifecycle, lifecycle } = createHarness({ fetchRowsWithReadinessRetry });

    lifecycle.createInfiniteDatasource(1, projectionSource).getRows!(createParams());
    await flush();
    lifecycle.createInfiniteDatasource(1, hardSource).getRows!(createParams());
    await flush();

    expect(firstRowsLifecycle.applyRowsError).toHaveBeenCalledWith(expect.objectContaining({ error: projectionError }));
    expect(firstRowsLifecycle.applyRowsError).toHaveBeenCalledWith(expect.objectContaining({ error: hardError }));
  });

  it('applies pending datasource to a live grid api', () => {
    vi.useFakeTimers();
    const { gridApi, lifecycle } = createHarness();
    lifecycle.rebuildInfiniteDatasource({
      currentDataSource: null,
      totalRowCount: ref(9),
      version: 1,
    });

    vi.runOnlyPendingTimers();

    expect(gridApi.setGridOption).toHaveBeenCalledWith('datasource', expect.any(Object));
    expect(lifecycle.hasPendingDatasource()).toBe(false);
    vi.useRealTimers();
  });

  it('passes rebuild forceRefresh to the applied infinite datasource fetch', async () => {
    vi.useFakeTimers();
    const dataSource = {
      fetchRows: vi.fn(async () => ({ rows: [] as BrowserCard[], totalCount: 0 })),
    } as unknown as ICardDataSource;
    const fetchRowsWithReadinessRetry = vi.fn((source, options) => source.fetchRows(options));
    const { gridApi, lifecycle } = createHarness({ fetchRowsWithReadinessRetry });

    lifecycle.rebuildInfiniteDatasource({
      currentDataSource: dataSource,
      forceRefresh: true,
      totalRowCount: ref(0),
      version: 1,
    });
    vi.runOnlyPendingTimers();
    const appliedDatasource = gridApi.setGridOption.mock.calls[0]?.[1];
    appliedDatasource.getRows(createParams());
    await flush();

    expect(fetchRowsWithReadinessRetry).toHaveBeenCalledWith(dataSource, expect.objectContaining({
      forceRefresh: true,
    }), expect.any(Function));
    vi.useRealTimers();
  });

  it('consumes rebuild forceRefresh only once per infinite datasource generation', async () => {
    vi.useFakeTimers();
    const dataSource = {
      fetchRows: vi.fn(async () => ({ rows: [] as BrowserCard[], totalCount: 0 })),
    } as unknown as ICardDataSource;
    const fetchRowsWithReadinessRetry = vi.fn((source, options) => source.fetchRows(options));
    const { gridApi, lifecycle } = createHarness({ fetchRowsWithReadinessRetry });

    lifecycle.rebuildInfiniteDatasource({
      currentDataSource: dataSource,
      forceRefresh: true,
      totalRowCount: ref(0),
      version: 1,
    });
    vi.runOnlyPendingTimers();
    const appliedDatasource = gridApi.setGridOption.mock.calls[0]?.[1];
    appliedDatasource.getRows(createParams({ startRow: 0, endRow: 1 }));
    appliedDatasource.getRows(createParams({ startRow: 1, endRow: 2 }));
    await flush();

    expect(fetchRowsWithReadinessRetry).toHaveBeenNthCalledWith(1, dataSource, expect.objectContaining({
      forceRefresh: true,
    }), expect.any(Function));
    expect(fetchRowsWithReadinessRetry).toHaveBeenNthCalledWith(2, dataSource, expect.objectContaining({
      forceRefresh: false,
    }), expect.any(Function));
    vi.useRealTimers();
  });

  it('keeps latest datasource pending until grid api becomes alive', () => {
    vi.useFakeTimers();
    const { gridApi, gridApiRef, lifecycle } = createHarness({ gridApi: null });
    const dataSourceA = { fetchRows: vi.fn() } as unknown as ICardDataSource;
    const dataSourceB = { fetchRows: vi.fn() } as unknown as ICardDataSource;

    lifecycle.rebuildInfiniteDatasource({
      currentDataSource: dataSourceA,
      totalRowCount: ref(0),
      version: 1,
    });
    lifecycle.rebuildInfiniteDatasource({
      currentDataSource: dataSourceB,
      totalRowCount: ref(0),
      version: 2,
    });
    vi.runOnlyPendingTimers();

    expect(gridApi.setGridOption).not.toHaveBeenCalled();
    expect(lifecycle.hasPendingDatasource()).toBe(true);

    gridApiRef.value = gridApi;
    lifecycle.applyPendingDatasourceToGrid();
    vi.runOnlyPendingTimers();

    expect(gridApi.setGridOption).toHaveBeenCalledTimes(1);
    const appliedDatasource = gridApi.setGridOption.mock.calls[0]?.[1];
    appliedDatasource.getRows(createParams());
    expect(dataSourceA.fetchRows).not.toHaveBeenCalled();
    expect(dataSourceB.fetchRows).toHaveBeenCalledTimes(1);
    expect(lifecycle.hasPendingDatasource()).toBe(false);
    vi.useRealTimers();
  });

  it('coalesces repeated datasource rebuilds and applies only the latest generation', () => {
    vi.useFakeTimers();
    const { gridApi, lifecycle } = createHarness();
    const dataSourceA = { fetchRows: vi.fn() } as unknown as ICardDataSource;
    const dataSourceB = { fetchRows: vi.fn() } as unknown as ICardDataSource;

    lifecycle.rebuildInfiniteDatasource({
      currentDataSource: dataSourceA,
      totalRowCount: ref(0),
      version: 1,
    });
    lifecycle.rebuildInfiniteDatasource({
      currentDataSource: dataSourceB,
      totalRowCount: ref(0),
      version: 2,
    });

    vi.runOnlyPendingTimers();

    expect(gridApi.setGridOption).toHaveBeenCalledTimes(1);
    const appliedDatasource = gridApi.setGridOption.mock.calls[0]?.[1];
    appliedDatasource.getRows(createParams());
    expect(dataSourceA.fetchRows).not.toHaveBeenCalled();
    expect(dataSourceB.fetchRows).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
