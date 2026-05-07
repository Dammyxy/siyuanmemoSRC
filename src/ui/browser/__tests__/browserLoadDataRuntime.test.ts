import { describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../types';
import type { ICardDataSource } from '../datasource/types';
import { createBrowserLoadDataRuntime, type BrowserLoadDataRuntimeDeps } from '../browserLoadDataRuntime';

function ref<T>(value: T): { value: T } {
  return { value };
}

function createLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
  };
}

function createManager() {
  return {
    getQueue: vi.fn(() => ({
      getConceptBlocks: vi.fn(() => []),
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
    expect(deps.rebuildInfiniteDatasource).toHaveBeenCalledWith(true);
    expect(deps.startFocusRowsSnapshot).toHaveBeenCalledWith(25);
    expect(deps.scheduleAllRowsSnapshot).not.toHaveBeenCalled();
    expect(deps.globalSelection.clear).not.toHaveBeenCalled();
    expect(deps.previewCard.value?.blockId).toBe('preview');
  });

  it('creates SQL datasource after confirmation and schedules all-row snapshot', async () => {
    const deps = createDeps({
      resolveActiveSqlStatement: vi.fn(() => 'select * from blocks'),
      shouldFocusDocList: ref(false),
    });
    const runtime = createBrowserLoadDataRuntime(deps);

    await runtime.loadData(false, { snapshotDelayMs: 50 });

    expect(deps.ensureSqlModeConfirmed).toHaveBeenCalledTimes(1);
    expect(deps.currentDataSource.value?.id).toBe('query');
    expect(deps.clearNeuralSubviewData).toHaveBeenCalled();
    expect(deps.scheduleAllRowsSnapshot).toHaveBeenCalledWith(50);
    expect(deps.selectedRows.value).toEqual([]);
    expect(deps.globalSelection.clear).toHaveBeenCalledTimes(1);
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
});
