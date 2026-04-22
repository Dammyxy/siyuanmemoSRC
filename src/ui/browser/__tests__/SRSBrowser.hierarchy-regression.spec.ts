// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, h, nextTick, onMounted, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../types';
import { CardState } from '@/types/card';

const setGlobalBrowserContextMock = vi.fn();
const clearGlobalBrowserContextMock = vi.fn();
const subscribeCacheUpdateMock = vi.fn(() => vi.fn());
const getCacheStatsMock = vi.fn(() => ({ count: 0, age: 0, valid: false }));
const createDeckDataSourceMock = vi.fn();
const createQueueDataSourceMock = vi.fn();
const createQueryDataSourceMock = vi.fn();
const createFocusDataSourceMock = vi.fn();

function triggerDatasourceFetch(datasource: { getRows?: (params: Record<string, unknown>) => void } | null | undefined): void {
  datasource?.getRows?.({
    startRow: 0,
    endRow: 50,
    sortModel: [],
    filterModel: {},
    successCallback: vi.fn(),
    failCallback: vi.fn(),
  });
}

function createGridApi() {
  let currentDatasource: { getRows?: (params: Record<string, unknown>) => void } | null = null;

  return {
    isDestroyed: () => false,
    setGridOption: vi.fn((key: string, value: { getRows?: (params: Record<string, unknown>) => void }) => {
      if (key === 'datasource') {
        currentDatasource = value;
        triggerDatasourceFetch(currentDatasource);
      }
    }),
    getColumns: () => [],
    getColumnState: () => [],
    forEachNode: vi.fn(),
    deselectAll: vi.fn(),
    refreshCells: vi.fn(),
    refreshInfiniteCache: vi.fn(() => triggerDatasourceFetch(currentDatasource)),
    purgeInfiniteCache: vi.fn(() => triggerDatasourceFetch(currentDatasource)),
    getSelectedRows: vi.fn(() => []),
  };
}

vi.mock('ag-grid-vue3', () => ({
  AgGridVue: defineComponent({
    name: 'AgGridVue',
    emits: ['grid-ready'],
    setup(_props, { emit }) {
      onMounted(() => {
        emit('grid-ready', { api: createGridApi() });
      });
      return () => h('div', { class: 'ag-grid-stub' });
    },
  }),
}));

vi.mock('ag-grid-community', () => ({
  ModuleRegistry: { registerModules: vi.fn() },
  AllCommunityModule: {},
}));

vi.mock('siyuan', () => ({
  openTab: vi.fn(),
  Menu: class {
    addItem() {}
    open() {}
    destroy() {}
  },
  Protyle: class {},
}));

vi.mock('@/utils/dialog', () => ({
  confirmDialog: vi.fn(async () => true),
  createVueDialog: vi.fn(() => ({ dialog: {}, destroy: vi.fn() })),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/utils/performance', () => ({
  PerformanceMonitor: {
    measure: async (_label: string, task: () => Promise<unknown>) => task(),
    incrementCounter: vi.fn(),
  },
}));

vi.mock('../browserService', () => ({
  loadBrowserCardsByBlockIds: vi.fn(async () => []),
  setGlobalBrowserContext: (...args: unknown[]) => setGlobalBrowserContextMock(...args),
  clearGlobalBrowserContext: (...args: unknown[]) => clearGlobalBrowserContextMock(...args),
  invalidateCardCache: vi.fn(),
  getCacheStats: (...args: unknown[]) => getCacheStatsMock(...args),
  subscribeCacheUpdate: (...args: unknown[]) => subscribeCacheUpdateMock(...args),
  pushBrowserErrMsg: vi.fn(async () => {}),
  pushBrowserMsg: vi.fn(async () => {}),
  getDocTree: vi.fn(async () => []),
}));

vi.mock('../config', () => ({
  createColumnDefs: vi.fn(() => []),
}));

vi.mock('../BrowserHierarchy.vue', () => ({
  default: defineComponent({
    name: 'BrowserHierarchy',
    props: {
      cards: {
        type: Array,
        default: () => [],
      },
      globalStats: {
        type: Object,
        default: () => ({ total: 0, dismissed: 0 }),
      },
    },
    emits: ['selectGlobal'],
    setup(props, { emit }) {
      const docSummaries = computed(() => {
        const counts = new Map<string, number>();
        for (const card of props.cards as BrowserCard[]) {
          const rootId = String(card.rootId || '').trim();
          if (!rootId) {
            continue;
          }
          counts.set(rootId, (counts.get(rootId) || 0) + 1);
        }
        return Array.from(counts.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, count]) => `${id}:${count}`);
      });

      return () => h('div', { class: 'browser-hierarchy-stub' }, [
        h('button', {
          class: 'select-global-all',
          onClick: () => emit('selectGlobal', '__all__'),
        }, `All flashcards ${String((props.globalStats as { total: number }).total ?? 0)}`),
        h('button', {
          class: 'select-global-suspended',
          onClick: () => emit('selectGlobal', '__dismissed__'),
        }, `Suspended ${String((props.globalStats as { dismissed: number }).dismissed ?? 0)}`),
        ...docSummaries.value.map((summary) => h('div', { class: 'doc-entry' }, summary)),
      ]);
    },
  }),
}));

vi.mock('../composables/useQueueBridge', () => ({
  EMPTY_QUEUE_COUNTS: {
    retrieval: 0,
    'incremental-learning': 0,
    'final-drill': 0,
    'neural-roam': 0,
    'filter-group': 0,
  },
  useQueueBridge: () => ({
    getQueueById: vi.fn(),
    refreshQueueCounts: vi.fn(async (queueCountsRef: { value: Record<string, number> }) => {
      queueCountsRef.value = {
        retrieval: 0,
        'incremental-learning': 0,
        'final-drill': 0,
        'neural-roam': 0,
        'filter-group': 0,
      };
    }),
    setFilterGroupFilter: vi.fn(async () => {}),
    rebuildFilterGroupQueue: vi.fn(async () => {}),
  }),
}));

vi.mock('../composables/useSorting', () => ({
  useSorting: () => ({
    hasRandomSort: ref(false),
    applySort: vi.fn(),
    applyRandomSort: vi.fn(),
    canApplySortToQueue: ref(false),
    handleApplySortToQueue: vi.fn(),
  }),
}));

vi.mock('../composables/useCardActions', () => ({
  useCardActions: () => ({
    migrateTopicItem: vi.fn(async () => {}),
    buildCardTypeSubmenu: vi.fn(() => []),
  }),
}));

vi.mock('../composables/useCardTypeDetection', () => ({
  useCardTypeDetection: () => ({
    isDetecting: ref(false),
    unidentifiedCount: ref(0),
    getUnidentifiedCards: vi.fn(() => []),
    detect: vi.fn(async () => {}),
  }),
}));

vi.mock('../composables/useIncrementalGridUpdates', () => ({
  useIncrementalGridUpdates: () => ({
    handleCardUpdatedIncremental: vi.fn(async () => ({
      updatedVisibleRows: 0,
      removedRowIds: [],
      requiresReorder: false,
    })),
    handleCardDeletedIncremental: vi.fn(async () => ({
      updatedVisibleRows: 0,
      removedRowIds: [],
      requiresReorder: false,
    })),
    disposeIncrementalGridUpdates: vi.fn(),
  }),
}));

vi.mock('../composables/useBrowserAdapterSync', () => ({
  useBrowserAdapterSync: () => ({
    initBrowserAdapter: vi.fn(),
    destroyBrowserAdapter: vi.fn(),
  }),
}));

vi.mock('../utils/dataSourceFactory', () => ({
  createQueueDataSource: (...args: unknown[]) => createQueueDataSourceMock(...args),
  createDeckDataSource: (...args: unknown[]) => createDeckDataSourceMock(...args),
  createQueryDataSource: (...args: unknown[]) => createQueryDataSourceMock(...args),
  createFocusDataSource: (...args: unknown[]) => createFocusDataSourceMock(...args),
}));

import SRSBrowser from '../SRSBrowser.vue';

function buildBrowserCard(id: string, rootId: string): BrowserCard {
  const now = new Date('2026-04-13T00:00:00.000Z');
  return {
    id,
    fsrsCardId: id,
    blockId: id,
    deckId: 'deck-1',
    content: `${id} content`,
    fullContent: `${id} content`,
    rootId,
    state: CardState.Review,
    stateLabel: 'Review',
    due: now,
    dueFormatted: '2026-04-13',
    stability: 3,
    difficulty: 5,
    retrievability: 0.8,
    reps: 2,
    lapses: 0,
    elapsedDays: 1,
    scheduledDays: 3,
    lastReview: now,
    lastReviewFormatted: '2026-04-12',
    interval: 3,
    firstReview: now,
    firstReviewFormatted: '2026-04-10',
    priority: 50,
    suspended: false,
    tags: [],
    note: '',
    meta: { rootId },
  };
}

function createQueryableDataSource(allRows: BrowserCard[]) {
  return {
    fetchRows: vi.fn(async ({ startRow, endRow }: { startRow: number; endRow: number }) => ({
      rows: allRows.slice(startRow, endRow),
      totalCount: allRows.length,
    })),
    getQueryFingerprint: vi.fn(() => 'browser-test-query'),
    getAllMatchedIds: vi.fn(async () => allRows.map((row) => row.id)),
    getRowsByIds: vi.fn(async (ids: string[]) => {
      const idSet = new Set(ids);
      return allRows.filter((row) => idSet.has(row.id));
    }),
    getActionTargetsByIds: vi.fn(async () => []),
    getSupportedActions: vi.fn(() => []),
  };
}

function createBrowserService() {
  return {
    getStats: vi.fn(async () => ({
      totalCards: 3,
      suspendedCards: 1,
    })),
    getUnifiedDataSourceManager: vi.fn(() => ({
      getCard: vi.fn(async () => null),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => {}),
      getQueue: vi.fn(() => null),
      getAvailableQueueTypes: vi.fn(() => []),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    })),
    getSiyuanApi: vi.fn(() => ({
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    })),
  };
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await flushPromises();
  await nextTick();
}

function mountBrowser(propOverrides: Record<string, unknown> = {}) {
  return mount(SRSBrowser, {
    props: {
      mode: 'dialog',
      browserService: createBrowserService() as never,
      i18n: {},
      ...propOverrides,
    },
    global: {
      stubs: {
        BrowserToolbar: defineComponent({
          name: 'BrowserToolbar',
          props: {
            activeScopeDocIds: {
              type: Array,
              default: () => [],
            },
            showExitFocus: {
              type: Boolean,
              default: false,
            },
          },
          emits: ['convertToTab', 'exitFocus'],
          setup(props, { emit }) {
            return () => h('div', { class: 'toolbar-stub' }, [
              h('div', { class: 'toolbar-scope-count' }, String((props.activeScopeDocIds as unknown[])?.length ?? 0)),
              props.showExitFocus
                ? h('button', { class: 'toolbar-exit', onClick: () => emit('exitFocus') }, 'exit')
                : null,
              h('button', { class: 'toolbar-open-tab', onClick: () => emit('convertToTab') }, 'tab'),
            ]);
          },
        }),
        BrowserPreview: { template: '<div class="preview-stub"></div>' },
        SyncStatusIndicator: { template: '<div class="sync-stub"></div>' },
        NeuralSubviewTabs: { template: '<div class="neural-tabs-stub"></div>' },
        NeuralNavigationBar: { template: '<div></div>' },
        NeuralFocusList: { template: '<div></div>' },
        NeuralHistoryList: { template: '<div></div>' },
        NeuralActivationTracePanel: { template: '<div></div>' },
        NeuralAnchorList: { template: '<div></div>' },
        FilterDialog: { template: '<div></div>' },
      },
    },
  });
}

describe('SRSBrowser hierarchy regressions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('fsrs-card-browser:dialog:viewMode', 'hierarchy');
    setGlobalBrowserContextMock.mockReset();
    clearGlobalBrowserContextMock.mockReset();
    subscribeCacheUpdateMock.mockClear();
    getCacheStatsMock.mockReset();
    getCacheStatsMock.mockReturnValue({ count: 0, age: 0, valid: false });
    createDeckDataSourceMock.mockReset();
    createQueueDataSourceMock.mockReset();
    createQueryDataSourceMock.mockReset();
    createFocusDataSourceMock.mockReset();
    createFocusDataSourceMock.mockReturnValue(null);
  });

  it('upgrades the left document list from the first page to the full all-cards snapshot', async () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, index) => buildBrowserCard(`card-a-${index}`, 'doc-1')),
      ...Array.from({ length: 25 }, (_, index) => buildBrowserCard(`card-b-${index}`, 'doc-2')),
      buildBrowserCard('card-c-0', 'doc-3'),
    ];
    const queryable = createQueryableDataSource(rows);
    createDeckDataSourceMock.mockReturnValue(queryable);

    const wrapper = mountBrowser();

    await advance(0);
    await advance(0);
    await advance(80);
    expect(wrapper.text()).toContain('doc-1:25');
    expect(wrapper.text()).toContain('doc-2:25');
    expect(wrapper.text()).not.toContain('doc-3:1');

    await advance(40);
    await advance(80);

    expect(wrapper.text()).toContain('doc-3:1');
    expect(queryable.getAllMatchedIds).toHaveBeenCalledTimes(1);
    expect(queryable.getRowsByIds).toHaveBeenCalledWith(rows.map((row) => row.id));
  });

  it('switches all and suspended views without triggering duplicate reloads from watchers', async () => {
    const activeRows = [
      buildBrowserCard('card-1', 'doc-1'),
      buildBrowserCard('card-2', 'doc-2'),
    ];
    const suspendedRows = [buildBrowserCard('card-3', 'doc-3')];

    createDeckDataSourceMock.mockImplementation((_manager, options: { preset?: string }) => {
      if (options?.preset === 'suspended') {
        return createQueryableDataSource(suspendedRows);
      }
      return createQueryableDataSource(activeRows);
    });

    const wrapper = mountBrowser();

    await advance(0);
    await advance(0);
    await advance(200);
    expect(createDeckDataSourceMock).toHaveBeenCalledTimes(1);

    await wrapper.get('.select-global-suspended').trigger('click');

    await advance(0);
    await advance(0);
    await advance(300);
    expect(createDeckDataSourceMock).toHaveBeenCalledTimes(2);
    expect(createDeckDataSourceMock.mock.calls[1]?.[1]).toMatchObject({ preset: 'suspended' });

    await wrapper.get('.select-global-all').trigger('click');

    await advance(0);
    await advance(0);
    await advance(300);
    expect(createDeckDataSourceMock).toHaveBeenCalledTimes(3);
    expect(createDeckDataSourceMock.mock.calls[2]?.[1]).toMatchObject({ preset: 'all' });
  });

  it('preserves scopeDocIds across global selection changes and clears them when exiting scope', async () => {
    const rows = [
      buildBrowserCard('card-1', 'doc-1'),
      buildBrowserCard('card-2', 'doc-1-child'),
    ];
    createDeckDataSourceMock.mockImplementation(() => createQueryableDataSource(rows));

    const wrapper = mountBrowser({
      initialOpenState: {
        scopeDocIds: ['doc-1', 'doc-1-child'],
        preset: 'all',
      },
    });

    await advance(0);
    await advance(0);
    await advance(200);

    expect(createDeckDataSourceMock.mock.calls[0]?.[1]).toMatchObject({
      scopeDocIds: ['doc-1', 'doc-1-child'],
      preset: 'all',
    });
    expect(wrapper.get('.toolbar-scope-count').text()).toBe('2');

    await wrapper.get('.select-global-all').trigger('click');
    await advance(0);
    await advance(0);
    await advance(240);

    expect(createDeckDataSourceMock.mock.calls.at(-1)?.[1]).toMatchObject({
      scopeDocIds: ['doc-1', 'doc-1-child'],
      preset: 'all',
    });

    await wrapper.get('.toolbar-open-tab').trigger('click');

    expect(wrapper.emitted('convertToTab')?.[0]?.[0]).toMatchObject({
      scopeDocIds: ['doc-1', 'doc-1-child'],
      preset: 'all',
    });

    await wrapper.get('.toolbar-exit').trigger('click');
    await advance(0);
    await advance(0);
    await advance(240);

    expect(createDeckDataSourceMock.mock.calls.at(-1)?.[1]).toMatchObject({
      preset: 'all',
      scopeDocIds: null,
    });
    expect(wrapper.get('.toolbar-scope-count').text()).toBe('0');
  });
});
