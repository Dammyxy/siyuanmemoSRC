import { describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../types';
import type { ICardDataSource } from '../datasource/types';
import { createBrowserLoadDataRuntime, type BrowserLoadDataRuntimeDeps } from '../browserLoadDataRuntime';
import { QueueType } from '@/types/unified-data-source';

function ref<T>(value: T): { value: T } {
  return { value };
}

function createLogger() {
  return {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  };
}

function createManager() {
  return {
    getQueue: vi.fn(() => ({
      getConceptBlocks: vi.fn(() => []),
    })),
    ensureQueueProjectionReady: vi.fn(async () => ({
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 1,
    })),
  };
}

function createDeps(overrides: Partial<BrowserLoadDataRuntimeDeps> = {}): BrowserLoadDataRuntimeDeps {
  const deps: BrowserLoadDataRuntimeDeps = {
    activeDocId: ref<string | null>(null),
    activeQueueId: ref<string | null>(null),
    activeScopeDocIds: ref<string[] | null>(null),
    allRows: ref<BrowserCard[]>([]),
    browserAppService: ref({ getSiyuanApi: vi.fn(() => ({})) } as any),
    browserSiyuanApi: ref({} as any),
    clearNeuralSubviewData: vi.fn(),
    currentCardType: ref('all' as any),
    currentDataSource: ref<ICardDataSource | null>(null),
    currentPreset: ref('all' as any),
    currentProjectionIdentity: ref(null),
    currentQueueType: ref(''),
    ensureSqlModeConfirmed: vi.fn(async () => true),
    getCurrentDocId: vi.fn(() => null),
    getPlugin: vi.fn(() => ({})),
    globalSelection: { clear: vi.fn() },
    hasRandomSort: ref(false),
    invalidateHierarchySnapshots: vi.fn(),
    loading: ref(false),
    logger: createLogger(),
    previewCard: ref<BrowserCard | null>({ id: 'preview', blockId: 'preview' } as BrowserCard),
    pluginUnifiedDataSourceManager: ref(createManager() as any),
    pushErrMsg: vi.fn(async () => undefined),
    randomSortRows: ref<BrowserCard[] | null>([{ id: 'r', blockId: 'r' } as BrowserCard]),
    rebuildInfiniteDatasource: vi.fn(),
    refreshNeuralSubviewData: vi.fn(async () => undefined),
    refreshQueueCounts: vi.fn(async () => undefined),
    resolveActiveSqlStatement: vi.fn(() => null),
    rows: ref<BrowserCard[]>([]),
    rowsForFocus: ref<BrowserCard[]>([]),
    abortQueueProjectionWarmup: vi.fn(),
    scheduleQueueProjectionWarmup: vi.fn(),
    scheduleAllRowsSnapshot: vi.fn(),
    searchQuery: ref(''),
    selectedRows: ref<BrowserCard[]>([{ id: 'selected', blockId: 'selected' } as BrowserCard]),
    shouldFocusDocList: ref(false),
    startFocusRowsSnapshot: vi.fn(),
    t: (_key, fallback) => fallback,
    totalRowCount: ref(0),
    ...overrides,
  };
  return deps;
}

describe('browserLoadDataRuntime', () => {
  it('creates queue datasource and preserves queue-sync selection state', async () => {
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      activeDocId: ref(null),
      activeScopeDocIds: ref(['root-a']),
      currentQueueType: ref('retrieval-practice'),
      shouldFocusDocList: ref(true),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData(true, { origin: 'queue-sync', snapshotDelayMs: 25 });

    expect(deps.currentDataSource.value?.id).toBe('retrieval');
    expect(deps.currentProjectionIdentity.value).toBeNull();
    expect(deps.rebuildInfiniteDatasource).toHaveBeenCalledWith(true);
    expect(deps.startFocusRowsSnapshot).not.toHaveBeenCalled();
    expect(deps.scheduleQueueProjectionWarmup).toHaveBeenCalledWith('queue-sync');
    expect(deps.scheduleAllRowsSnapshot).not.toHaveBeenCalled();
    expect(deps.globalSelection.clear).not.toHaveBeenCalled();
    expect(deps.previewCard.value?.blockId).toBe('preview');
  });

  it('canonicalizes browser queue aliases before attaching queue datasource', async () => {
    const deps = createDeps({
      activeQueueId: ref('retrieval-practice'),
      currentQueueType: ref('retrieval-practice'),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData(true);

    expect(deps.currentDataSource.value?.id).toBe('retrieval');
  });

  it('creates SQL datasource after confirmation without scheduling the default all-row hierarchy snapshot', async () => {
    const deps = createDeps({
      resolveActiveSqlStatement: vi.fn(() => 'select * from blocks'),
      shouldFocusDocList: ref(false),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData(false, { snapshotDelayMs: 50 });

    expect(deps.ensureSqlModeConfirmed).toHaveBeenCalledTimes(1);
    expect(deps.currentDataSource.value?.id).toBe('query');
    expect(deps.clearNeuralSubviewData).toHaveBeenCalled();
    expect(deps.scheduleQueueProjectionWarmup).toHaveBeenCalledWith('browser-open');
    expect(deps.scheduleAllRowsSnapshot).not.toHaveBeenCalled();
    expect(deps.selectedRows.value).toEqual([]);
    expect(deps.globalSelection.clear).toHaveBeenCalledTimes(1);
  });

  it('refreshes queue counts passively after default browser open', async () => {
    const deps = createDeps();
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData();

    expect(deps.refreshQueueCounts).toHaveBeenCalledWith({ forceRefresh: false });
  });

  it('can defer queue projection warmup for first-row critical opens', async () => {
    const deps = createDeps();
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData(false, {
      refreshQueueCounts: false,
      scheduleQueueProjectionWarmup: false,
    });

    expect(deps.rebuildInfiniteDatasource).toHaveBeenCalledWith(false);
    expect(deps.refreshQueueCounts).not.toHaveBeenCalled();
    expect(deps.scheduleQueueProjectionWarmup).not.toHaveBeenCalled();
  });

  it('clears rows and reports when deck manager is missing', async () => {
    const deps = createDeps({
      allRows: ref([{ id: 'a', blockId: 'a' } as BrowserCard]),
      pluginUnifiedDataSourceManager: ref(null),
      rows: ref([{ id: 'b', blockId: 'b' } as BrowserCard]),
      rowsForFocus: ref([{ id: 'c', blockId: 'c' } as BrowserCard]),
      totalRowCount: ref(3),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData();

    expect(deps.pushErrMsg).toHaveBeenCalledWith('Environment not initialized');
    expect(deps.rows.value).toEqual([]);
    expect(deps.rowsForFocus.value).toEqual([]);
    expect(deps.allRows.value).toEqual([]);
    expect(deps.totalRowCount.value).toBe(0);
    expect(deps.loading.value).toBe(false);
  });

  it('prewarms queue projections in background without attaching a datasource', async () => {
    vi.useFakeTimers();
    const browserAppService = {
      getSiyuanApi: vi.fn(() => ({})),
      ensureQueueReadModelReady: vi.fn(async () => ({
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        cause: 'materialization_in_progress',
        retryAfterMs: 300,
      })),
    };
    const manager = {
      ...createManager(),
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'refreshing',
        queueId: 'retrieval-practice',
        policyId: 'policy-a',
        cause: 'materialization_in_progress',
        retryAfterMs: 300,
      })),
    };
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref(browserAppService as any),
      currentQueueType: ref('retrieval-practice'),
      pluginUnifiedDataSourceManager: ref(manager as any),
      rows: ref([{ id: 'existing', blockId: 'existing' } as BrowserCard]),
      totalRowCount: ref(1),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData();

    expect(deps.currentDataSource.value).toBeNull();
    expect(deps.rebuildInfiniteDatasource).not.toHaveBeenCalled();
    expect(browserAppService.ensureQueueReadModelReady).toHaveBeenCalledWith(expect.objectContaining({
      source: 'browser',
    }));
    expect(deps.scheduleQueueProjectionWarmup).not.toHaveBeenCalled();
    expect(deps.loading.value).toBe(true);
    vi.useRealTimers();
  });

  it('attaches queue datasource automatically when readiness retry becomes ready', async () => {
    vi.useFakeTimers();
    const browserAppService = {
      getSiyuanApi: vi.fn(() => ({})),
      ensureQueueReadModelReady: vi.fn()
        .mockResolvedValueOnce({
          status: 'refreshing',
          queueId: QueueType.RetrievalPractice,
          policyId: 'policy-a',
          cause: 'materialization_in_progress',
          retryAfterMs: 10,
        })
        .mockResolvedValueOnce({
          status: 'ready',
          queueId: QueueType.RetrievalPractice,
          policyId: 'policy-a',
          generation: 2,
        }),
    };
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref(browserAppService as any),
      currentQueueType: ref('retrieval-practice'),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData();

    expect(deps.currentDataSource.value).toBeNull();
    await vi.advanceTimersByTimeAsync(10);

    expect(browserAppService.ensureQueueReadModelReady).toHaveBeenCalledTimes(2);
    expect(deps.currentDataSource.value?.id).toBe('retrieval');
    expect(deps.rebuildInfiniteDatasource).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('loads neural-roam queue view without waiting for projection readiness', async () => {
    const manager = {
      ...createManager(),
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'refreshing',
        queueId: QueueType.NeuralRoam,
        policyId: 'policy-neural',
        cause: 'materialization_in_progress',
        retryAfterMs: 25,
      })),
    };
    const deps = createDeps({
      activeQueueId: ref('neural-roam'),
      currentQueueType: ref('neural-roam'),
      pluginUnifiedDataSourceManager: ref(manager as any),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData();

    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
    expect(deps.refreshNeuralSubviewData).toHaveBeenCalledTimes(1);
    expect(deps.currentDataSource.value?.id).toBe('neural-roam');
  });

  it('loads retrieval queue view when Browser read model readiness service is unavailable', async () => {
    const manager = {
      ...createManager(),
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-retrieval',
        cause: 'materialization_in_progress',
        retryAfterMs: 25,
      })),
    };
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      currentQueueType: ref('retrieval-practice'),
      pluginUnifiedDataSourceManager: ref(manager as any),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData();

    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
    expect(deps.currentDataSource.value?.id).toBe('retrieval');
    expect(deps.rebuildInfiniteDatasource).toHaveBeenCalledTimes(1);
    expect(deps.scheduleQueueProjectionWarmup).toHaveBeenCalledWith('browser-open');
  });

  it('does not hold stale queue-view retries open during a newer load', async () => {
    vi.useFakeTimers();
    const browserAppService = {
      getSiyuanApi: vi.fn(() => ({})),
      ensureQueueReadModelReady: vi.fn()
        .mockResolvedValueOnce({
          status: 'refreshing',
          queueId: QueueType.RetrievalPractice,
          policyId: 'policy-retrieval',
          cause: 'materialization_in_progress',
          retryAfterMs: 10,
        })
        .mockResolvedValue({
          status: 'refreshing',
          queueId: QueueType.RetrievalPractice,
          policyId: 'policy-retrieval',
          cause: 'materialization_in_progress',
          retryAfterMs: 50,
        }),
    };
    const manager = {
      ...createManager(),
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-retrieval',
        cause: 'materialization_in_progress',
        retryAfterMs: 25,
      })),
    };
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref(browserAppService as any),
      currentQueueType: ref('retrieval-practice'),
      pluginUnifiedDataSourceManager: ref(manager as any),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData();
    await runtime.loadData(false, { origin: 'queue-sync' });
    await vi.advanceTimersByTimeAsync(10);

    expect(browserAppService.ensureQueueReadModelReady).toHaveBeenCalledTimes(2);
    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
    expect(deps.rebuildInfiniteDatasource).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('maps terminal projection unavailable to an explicit error state', async () => {
    const manager = {
      ...createManager(),
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'unavailable',
        queueId: 'retrieval-practice',
        policyId: 'policy-a',
        cause: 'contract_mismatch',
        reason: 'bad contract',
        recoverable: false,
      })),
    };
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      currentQueueType: ref('retrieval-practice'),
      pluginUnifiedDataSourceManager: ref(manager as any),
      rows: ref([{ id: 'existing', blockId: 'existing' } as BrowserCard]),
      totalRowCount: ref(1),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData();

    expect(deps.pushErrMsg).not.toHaveBeenCalled();
    expect(deps.currentDataSource.value?.id).toBe('retrieval');
    expect(deps.rows.value).toEqual([{ id: 'existing', blockId: 'existing' }]);
    expect(deps.totalRowCount.value).toBe(1);
  });

  it('schedules one queue-sync reload for matching live identity events', async () => {
    vi.useFakeTimers();
    const manager = {
      ...createManager(),
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 3,
      })),
    };
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      currentQueueType: ref('retrieval-practice'),
      currentProjectionIdentity: ref({
        queueId: QueueType.RetrievalPractice,
        queueType: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 2,
      }),
      pluginUnifiedDataSourceManager: ref(manager as any),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    expect(runtime.handleQueueProjectionLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 3,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 1,
    })).toBe('scheduled');
    expect(runtime.handleQueueProjectionLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 4,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 2,
    })).toBe('scheduled');

    await vi.runOnlyPendingTimersAsync();

    expect(deps.rebuildInfiniteDatasource).toHaveBeenCalledTimes(1);
    expect(deps.globalSelection.clear).not.toHaveBeenCalled();
    expect(deps.currentProjectionIdentity.value).toBeNull();
    vi.useRealTimers();
  });

  it('reattaches live identity even before the browser has an attached projection identity', async () => {
    vi.useFakeTimers();
    const manager = {
      ...createManager(),
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-retrieval',
        generation: 4,
      })),
    };
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      currentQueueType: ref('retrieval-practice'),
      currentProjectionIdentity: ref(null),
      pluginUnifiedDataSourceManager: ref(manager as any),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    expect(runtime.handleQueueProjectionLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-retrieval',
      generation: 4,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 1,
    })).toBe('scheduled');

    await vi.runOnlyPendingTimersAsync();

    expect(deps.rebuildInfiniteDatasource).toHaveBeenCalledTimes(1);
    expect(deps.currentProjectionIdentity.value).toBeNull();
    vi.useRealTimers();
  });

  it('replays hidden live identity after the browser becomes visible on retrieval selection', async () => {
    vi.useFakeTimers();
    const manager = {
      ...createManager(),
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-retrieval',
        generation: 5,
      })),
    };
    const deps = createDeps({
      activeQueueId: ref<string | null>(null),
      currentQueueType: ref(''),
      currentProjectionIdentity: ref(null),
      pluginUnifiedDataSourceManager: ref(manager as any),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    expect(runtime.handleQueueProjectionLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-retrieval',
      generation: 5,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 1,
    })).toBe('ignored');

    deps.activeQueueId.value = 'retrieval';
    deps.currentQueueType.value = 'retrieval-practice';
    await runtime.loadData(false, { origin: 'queue-sync' });
    await vi.runOnlyPendingTimersAsync();

    expect(deps.rebuildInfiniteDatasource).toHaveBeenCalledTimes(1);
    expect(deps.currentProjectionIdentity.value).toEqual({
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-retrieval',
      generation: 5,
    });
    vi.useRealTimers();
  });

  it('ignores live identity events outside the visible queue identity', () => {
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      currentQueueType: ref('retrieval-practice'),
      currentProjectionIdentity: ref({
        queueId: QueueType.RetrievalPractice,
        queueType: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 2,
      }),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    expect(runtime.handleQueueProjectionLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: QueueType.FilterGroup,
      queueType: QueueType.FilterGroup,
      policyId: 'policy-a',
      generation: 3,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 1,
    })).toBe('ignored');

    expect(deps.rebuildInfiniteDatasource).not.toHaveBeenCalled();
    expect(deps.logger.info).not.toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Ignored queue projection live identity event',
      expect.anything(),
    );
    expect(deps.logger.debug).toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Ignored queue projection live identity event',
      expect.objectContaining({ reason: 'queue-mismatch' }),
    );
  });
});
