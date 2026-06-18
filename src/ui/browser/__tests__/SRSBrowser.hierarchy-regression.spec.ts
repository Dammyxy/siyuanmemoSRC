// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, h, nextTick, onMounted, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../types';
import { CardState } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';

const setGlobalBrowserContextMock = vi.fn();
const clearGlobalBrowserContextMock = vi.fn();
const subscribeCacheUpdateMock = vi.fn(() => vi.fn());
const getCacheStatsMock = vi.fn(() => ({ count: 0, age: 0, valid: false }));
const createDeckDataSourceMock = vi.fn();
const createQueueDataSourceMock = vi.fn();
const createQueryDataSourceMock = vi.fn();
const createFocusDataSourceMock = vi.fn();
const getQueueByIdBridgeMock = vi.fn();
const refreshQueueCountsBridgeMock = vi.fn(async (queueCountsRef: { value: Record<string, number> }) => {
  queueCountsRef.value = {
    retrieval: 0,
    'incremental-learning': 0,
    'final-drill': 0,
    'neural-roam': 0,
    'filter-group': 0,
  };
});
const loadBrowserCardsByBlockIdsMock = vi.fn(async () => []);
const browserAdapterSyncHarness = vi.hoisted(() => ({
  options: null as null | {
    onQueueChanged: (payload: {
      affectedQueueTypes: QueueType[] | null;
      invalidateAllCounts: boolean;
      requiresFullRefresh: boolean;
      forceRefreshCounts: boolean;
    }) => void;
    onModeSwitched: () => void;
  },
}));
const agGridAttrsSeen: Array<Record<string, unknown>> = [];
let agGridClickRow: BrowserCard | null = null;

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
    emits: ['grid-ready', 'row-clicked'],
    setup(_props, { attrs, emit }) {
      agGridAttrsSeen.push(attrs as Record<string, unknown>);
      onMounted(() => {
        emit('grid-ready', { api: createGridApi() });
      });
      return () => h('div', {
        class: 'ag-grid-stub',
        onClick: () => {
          if (agGridClickRow) {
            emit('row-clicked', { data: agGridClickRow, event: {} });
          }
        },
      });
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
  loadBrowserCardsByBlockIds: (...args: unknown[]) => loadBrowserCardsByBlockIdsMock(...args),
  loadQueueCards: vi.fn(async () => []),
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
  getBrowserRowClass: vi.fn(() => ''),
}));

vi.mock('../BrowserHierarchy.vue', () => ({
  default: defineComponent({
    name: 'BrowserHierarchy',
    props: {
      cards: {
        type: Array,
        default: () => [],
      },
      documentCounts: {
        type: Array,
        default: null,
      },
      globalStats: {
        type: Object,
        default: () => ({ total: 0, dismissed: 0, lost: 0 }),
      },
      queues: {
        type: Object,
        default: () => ({ active: '', counts: {} }),
      },
      activeDocId: {
        type: String,
        default: null,
      },
    },
    emits: ['selectGlobal', 'selectDoc'],
    setup(props, { emit }) {
      const queueSummaries = computed(() => {
        const queues = props.queues as { counts?: Record<string, number> };
        return [
          'retrieval',
          'incremental-learning',
          'final-drill',
          'neural-roam',
          'filter-group',
        ].map((id) => `${id}:${queues.counts?.[id] ?? 0}`);
      });
      const docSummaries = computed(() => {
        const counts = new Map<string, number>();
        if (Array.isArray(props.documentCounts)) {
          for (const item of props.documentCounts as Array<{ rootId?: string; count?: number }>) {
            const rootId = String(item.rootId || '').trim();
            if (!rootId) {
              continue;
            }
            counts.set(rootId, Math.max(0, Number(item.count) || 0));
          }
        } else {
          for (const card of props.cards as BrowserCard[]) {
            const rootId = String(card.rootId || '').trim();
            if (!rootId) {
              continue;
            }
            counts.set(rootId, (counts.get(rootId) || 0) + 1);
          }
        }
        return Array.from(counts.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, count]) => ({
            id,
            summary: `${id}:${count}`,
          }));
      });

      return () => h('div', { class: 'browser-hierarchy-stub' }, [
        h('button', {
          class: 'select-global-all',
          onClick: () => emit('selectGlobal', '__all__'),
        }, `All flashcards ${String((props.globalStats as { total: number | null }).total ?? '...')}`),
        h('button', {
          class: 'select-global-suspended',
          onClick: () => emit('selectGlobal', '__dismissed__'),
        }, `Suspended ${String((props.globalStats as { dismissed: number }).dismissed ?? 0)}`),
        ...queueSummaries.value.map((summary) => h('div', { class: 'queue-entry' }, summary)),
        ...docSummaries.value.map((doc) => h('button', {
          class: 'doc-entry',
          'data-doc-id': doc.id,
          onClick: () => emit('selectDoc', doc.id),
        }, doc.summary)),
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
    getQueueById: (...args: unknown[]) => getQueueByIdBridgeMock(...args),
    refreshQueueCounts: (...args: unknown[]) => refreshQueueCountsBridgeMock(...args),
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
  useBrowserAdapterSync: (options: typeof browserAdapterSyncHarness.options) => {
    browserAdapterSyncHarness.options = options;
    return {
      initBrowserAdapter: vi.fn(),
      destroyBrowserAdapter: vi.fn(),
    };
  },
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

function buildConceptBrowserCard(id: string, rootId = id): BrowserCard {
  const card = buildBrowserCard(id, rootId) as BrowserCard & {
    cardType?: string;
    meta?: Record<string, unknown>;
  };
  card.cardType = 'concept';
  card.meta = { ...(card.meta || {}), cardTypeMarker: 'concept' };
  return card;
}

function semanticReadResult(sessionId: string, rootNodeId: string) {
  const session = {
    sessionId,
    rootFocusNodeId: rootNodeId,
    currentNodeId: rootNodeId,
    activeLens: 'assimilation',
    narrativePath: [{ nodeId: rootNodeId, lens: 'assimilation', eventId: 'event-root', visitedAt: 1 }],
    startedAt: 1,
    endedAt: null,
  };
  const rootNode = {
    nodeId: rootNodeId,
    nodeType: 'concept',
    title: 'Visible Semantic Root',
    preview: 'Semantic preview',
    location: { blockId: rootNodeId, cardId: null, deckId: null, breadcrumb: [], backlinkBlockIds: [] },
  };
  return {
    status: 'ok',
    requestId: 'semantic-read',
    activeSession: null,
    session,
    rootNode,
    currentNode: rootNode,
    candidates: { assimilation: [], accommodation: [], free: [] },
    stations: [],
    stationNodes: [],
    rootScopedStations: [],
    diagnosticEventId: 'semantic-read-ok',
  };
}

function mountSemanticPlugin(readMock: ReturnType<typeof vi.fn>, executeMock: ReturnType<typeof vi.fn>) {
  return {
    getContext: () => ({
      getSemanticActivationBrowserReadClient: () => ({ read: readMock }),
      getSemanticActivationCommandClient: () => ({ execute: executeMock }),
    }),
  };
}

function createQueryableDataSource(
  allRows: BrowserCard[],
  metadata: Record<string, unknown> = {},
) {
  return {
    fetchRows: vi.fn(async ({ startRow, endRow }: { startRow: number; endRow: number }) => ({
      rows: allRows.slice(startRow, endRow),
      totalCount: allRows.length,
      ...metadata,
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
    getBrowserDocumentCounts: vi.fn(async () => ({
      status: 'unsupported',
      owner: 'none',
      scope: { kind: 'deck' },
      rows: [],
      reason: 'test service does not provide document counts',
      diagnostics: {
        countOnly: true,
        rowsHydratedForHierarchy: 0,
      },
    })),
    getStats: vi.fn(async () => ({
      totalCards: 3,
      suspendedCards: 1,
      lostCards: 1,
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

function createNeuralQueueMock(overrides: Record<string, unknown> = {}) {
  return {
    getEngineMode: vi.fn(() => 'orbit'),
    setEngineMode: vi.fn(),
    getCards: vi.fn(async () => []),
    getSourceSnapshot: vi.fn(() => []),
    setSourceEntry: vi.fn(),
    getSeedSnapshot: vi.fn(() => []),
    setSeedEntry: vi.fn(),
    getAnchorSnapshot: vi.fn(() => []),
    setAnchorEntry: vi.fn(),
    clearAnchors: vi.fn(),
    getCurrentBatchSnapshot: vi.fn(() => []),
    getConceptBlocks: vi.fn(() => []),
    getFocusPoolSnapshot: vi.fn(() => []),
    setFocusPoolEntry: vi.fn(),
    clearFocusPool: vi.fn(),
    setCurrentFocus: vi.fn(),
    startRoamingFromFocus: vi.fn(),
    getHistoryCount: vi.fn(() => 0),
    getHistoryPage: vi.fn(() => ({ entries: [], totalCount: 0, hasMore: false })),
    getHistorySnapshot: vi.fn(() => []),
    getHistoryEntryByEventId: vi.fn(() => null),
    getHistoryEntriesByNodeId: vi.fn(() => []),
    getHistoryHitCount: vi.fn(() => 0),
    getActivationTrace: vi.fn(() => null),
    getSessionFocusStack: vi.fn(() => []),
    getPinnedFocusBlocks: vi.fn(() => []),
    setPinnedFocusBlock: vi.fn(),
    jumpToHistoryNode: vi.fn(),
    getPathItemByNodeId: vi.fn(),
    getNavigationState: vi.fn(() => ({
      currentPathIndex: 0,
      currentNodeId: null,
      currentEventId: null,
      navigationMode: 'follow',
      engineMode: 'orbit',
      engineSessionId: null,
      hasBookmark: false,
      pathLength: 0,
      sessionId: null,
    })),
    setNavigationMode: vi.fn(),
    returnToBookmark: vi.fn(() => false),
    clearHistory: vi.fn(async () => undefined),
    ...overrides,
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
            canStartSemantic: {
              type: Boolean,
              default: false,
            },
            semanticActive: {
              type: Boolean,
              default: false,
            },
          },
          emits: ['convertToTab', 'exitFocus', 'startSemantic'],
          setup(props, { emit }) {
            return () => h('div', { class: 'toolbar-stub' }, [
              h('div', { class: 'toolbar-scope-count' }, String((props.activeScopeDocIds as unknown[])?.length ?? 0)),
              props.showExitFocus
                ? h('button', { class: 'toolbar-exit', onClick: () => emit('exitFocus') }, 'exit')
                : null,
              h('button', {
                class: 'toolbar-start-semantic',
                disabled: !props.canStartSemantic,
                'data-active': String(props.semanticActive),
                onClick: () => emit('startSemantic'),
              }, 'semantic'),
              h('button', { class: 'toolbar-open-tab', onClick: () => emit('convertToTab') }, 'tab'),
            ]);
          },
        }),
        BrowserSemanticNavigator: defineComponent({
          name: 'BrowserSemanticNavigator',
          props: {
            model: {
              type: Object,
              required: true,
            },
          },
          setup(props) {
            return () => h('div', { class: 'semantic-workbench-stub' }, String((props.model as { currentNode?: { title?: string } }).currentNode?.title || ''));
          },
        }),
        BrowserPreview: { template: '<div class="preview-stub"></div>' },
        SyncStatusIndicator: { template: '<div class="sync-stub"></div>' },
        NeuralSubviewTabs: { template: '<div class="neural-tabs-stub"></div>' },
        NeuralNavigationBar: defineComponent({
          name: 'NeuralNavigationBar',
          props: {
            workspaceMode: {
              type: String,
              default: 'orbit',
            },
          },
          emits: ['select-workspace-mode', 'toggle-engine-mode', 'toggle-nav-mode', 'return-bookmark'],
          setup(props, { emit }) {
            return () => h('div', { class: 'neural-nav-stub' }, [
              ...(['orbit', 'hyperspace', 'semantic'] as const).map((mode) => h('button', {
                class: ['neural-mode-stub', `neural-mode-${mode}`],
                'data-active': String(props.workspaceMode === mode),
                onClick: () => emit('select-workspace-mode', mode),
              }, mode)),
            ]);
          },
        }),
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
    getQueueByIdBridgeMock.mockReset();
    getQueueByIdBridgeMock.mockReturnValue(null);
    refreshQueueCountsBridgeMock.mockClear();
    loadBrowserCardsByBlockIdsMock.mockReset();
    loadBrowserCardsByBlockIdsMock.mockResolvedValue([]);
    createDeckDataSourceMock.mockReset();
    createQueueDataSourceMock.mockReset();
    createQueryDataSourceMock.mockReset();
    createFocusDataSourceMock.mockReset();
    createFocusDataSourceMock.mockReturnValue(null);
    browserAdapterSyncHarness.options = null;
    agGridAttrsSeen.length = 0;
    agGridClickRow = null;
  });

  it('passes stable row identity into AG Grid', async () => {
    createDeckDataSourceMock.mockReturnValue(createQueryableDataSource([
      buildBrowserCard('card-row-id', 'doc-1'),
    ]));

    const wrapper = mountBrowser();
    await advance(0);

    const getRowId = agGridAttrsSeen.find((attrs) => typeof attrs.getRowId === 'function')?.getRowId as
      | ((params: { data?: BrowserCard | null }) => string)
      | undefined;

    expect(getRowId).toBeTypeOf('function');
    expect(getRowId?.({ data: buildBrowserCard('card-row-id', 'doc-1') })).toBe('card-row-id');

    wrapper.unmount();
  });

  it('defers default global queue count refresh until first deck rows load', async () => {
    let resolveFetchRows: ((value: { rows: BrowserCard[]; totalCount: number }) => void) | null = null;
    const datasource = {
      fetchRows: vi.fn(() => new Promise<{ rows: BrowserCard[]; totalCount: number }>((resolve) => {
        resolveFetchRows = resolve;
      })),
      getQueryFingerprint: vi.fn(() => 'pending-first-rows'),
      getAllMatchedIds: vi.fn(async () => []),
      getRowsByIds: vi.fn(async () => []),
      getActionTargetsByIds: vi.fn(async () => []),
      getSupportedActions: vi.fn(() => []),
    };
    createDeckDataSourceMock.mockReturnValue(datasource);

    mountBrowser();
    await advance(0);

    expect(datasource.fetchRows).toHaveBeenCalled();
    expect(refreshQueueCountsBridgeMock).not.toHaveBeenCalled();
    expect(createDeckDataSourceMock).toHaveBeenCalled();

    resolveFetchRows?.({
      rows: [buildBrowserCard('card-first-row', 'doc-1')],
      totalCount: 1,
    });
    await advance(250);

    expect(refreshQueueCountsBridgeMock).toHaveBeenCalledTimes(1);
  });

  it('keeps queue count refreshes alive across datasource version changes', async () => {
    let releaseQueueCounts!: () => void;
    refreshQueueCountsBridgeMock.mockImplementation(async (queueCountsRef: { value: Record<string, number> }) => {
      await new Promise<void>((resolve) => {
        releaseQueueCounts = () => {
          queueCountsRef.value = {
            retrieval: 3,
            'incremental-learning': 1,
            'final-drill': 2,
            'neural-roam': 0,
            'filter-group': 4,
          };
          resolve();
        };
      });
    });
    createQueueDataSourceMock.mockReturnValue({
      id: 'retrieval',
      label: 'retrieval',
      fetchRows: vi.fn(async () => ({
        rows: [buildBrowserCard('retrieval-row', 'doc-1')],
        totalCount: 1,
      })),
      getQueryFingerprint: vi.fn(() => 'retrieval-first-rows'),
      getAllMatchedIds: vi.fn(async () => []),
      getRowsByIds: vi.fn(async () => []),
      getActionTargetsByIds: vi.fn(async () => []),
      getSupportedActions: vi.fn(() => []),
    });
    createDeckDataSourceMock.mockReturnValue({
      id: 'deck',
      label: 'deck',
      fetchRows: vi.fn(async () => ({
        rows: [buildBrowserCard('global-row', 'doc-1')],
        totalCount: 1,
      })),
      getQueryFingerprint: vi.fn(() => 'global-first-rows'),
      getAllMatchedIds: vi.fn(async () => []),
      getRowsByIds: vi.fn(async () => []),
      getActionTargetsByIds: vi.fn(async () => []),
      getSupportedActions: vi.fn(() => []),
    });

    const wrapper = mountBrowser({ initialQueueId: 'retrieval' });
    await advance(0);
    await advance(250);
    expect(refreshQueueCountsBridgeMock).toHaveBeenCalled();

    await wrapper.find('.select-global-all').trigger('click');
    await advance(0);
    releaseQueueCounts();
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).toContain('retrieval:3');
    expect(wrapper.text()).toContain('incremental-learning:1');

    wrapper.unmount();
  });

  it('runs browser-open Riff incremental sync without persisting idle checkpoints', async () => {
    const incrementalSync = vi.fn(async () => ({
      success: true,
      addedCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
      detectedCount: 0,
    }));
    createDeckDataSourceMock.mockReturnValue(createQueryableDataSource([
      buildBrowserCard('browser-open-sync-card', 'doc-1'),
    ]));

    const wrapper = mountBrowser({
      plugin: {
        getContext: () => ({
          getHybridSyncService: () => ({
            incrementalSync,
            on: vi.fn(),
            off: vi.fn(),
          }),
          getStorage: () => ({
            getSettings: () => ({
              riffIntegration: {
                mode: 'hybrid',
                incrementalSync: {
                  enabled: true,
                  triggers: ['browser-open'],
                },
                fullSync: {
                  enabled: true,
                },
              },
            }),
          }),
        }),
      } as never,
    });

    await advance(0);
    await flushPromises();
    await nextTick();

    expect(incrementalSync).toHaveBeenCalledWith(undefined, {
      source: 'browser-open',
      persistIdleCheckpoint: false,
    });

    wrapper.unmount();
  });

  it('defers hierarchy document counts until first deck rows load', async () => {
    let resolveFetchRows: ((value: { rows: BrowserCard[]; totalCount: number }) => void) | null = null;
    const datasource = {
      fetchRows: vi.fn(() => new Promise<{ rows: BrowserCard[]; totalCount: number }>((resolve) => {
        resolveFetchRows = resolve;
      })),
      getQueryFingerprint: vi.fn(() => 'pending-first-rows'),
      getAllMatchedIds: vi.fn(async () => []),
      getRowsByIds: vi.fn(async () => []),
      getActionTargetsByIds: vi.fn(async () => []),
      getSupportedActions: vi.fn(() => []),
    };
    createDeckDataSourceMock.mockReturnValue(datasource);
    const browserService = createBrowserService();

    mountBrowser({ browserService: browserService as never });
    await advance(0);
    await advance(150);

    expect(datasource.fetchRows).toHaveBeenCalled();
    expect(browserService.getBrowserDocumentCounts).not.toHaveBeenCalled();

    resolveFetchRows?.({
      rows: [buildBrowserCard('card-first-row', 'doc-1')],
      totalCount: 1,
    });
    await advance(100);

    expect(browserService.getBrowserDocumentCounts).toHaveBeenCalledTimes(1);
  });

  it('shows Orbit, Hyperspace, and Semantic choices in the Neural Roam workspace', async () => {
    const wrapper = mountBrowser({ initialQueueId: 'neural-roam' });
    await advance(0);
    await advance(0);

    expect(wrapper.find('.neural-mode-orbit').exists()).toBe(true);
    expect(wrapper.find('.neural-mode-hyperspace').exists()).toBe(true);
    expect(wrapper.find('.neural-mode-semantic').exists()).toBe(true);

    wrapper.unmount();
  });

  it('selects Semantic without mutating Neural engine state', async () => {
    const neuralQueue = createNeuralQueueMock();
    getQueueByIdBridgeMock.mockReturnValue(neuralQueue);

    const wrapper = mountBrowser({ initialQueueId: 'neural-roam' });
    await advance(0);
    await advance(0);
    await wrapper.get('.neural-mode-semantic').trigger('click');
    await flushPromises();
    await nextTick();

    expect(neuralQueue.setEngineMode).not.toHaveBeenCalled();
    expect(neuralQueue.setSourceEntry).not.toHaveBeenCalled();
    expect(neuralQueue.setAnchorEntry).not.toHaveBeenCalled();
    expect(neuralQueue.startRoamingFromFocus).not.toHaveBeenCalled();
    expect(neuralQueue.clearHistory).not.toHaveBeenCalled();
    expect(wrapper.get('.neural-mode-semantic').attributes('data-active')).toBe('true');

    wrapper.unmount();
  });

  it('starts Semantic from a Neural concept-pool root without adding implicit nodes to the pool', async () => {
    const conceptCard = buildConceptBrowserCard('pool-root');
    const neuralQueue = createNeuralQueueMock({
      getSourceSnapshot: vi.fn(() => [{
        nodeId: 'pool-root',
        nodePreview: 'Pool Root Concept',
        nodeKind: 'concept',
        visitedAt: 10,
        addedAt: 5,
        priority: 50,
      }]),
    });
    getQueueByIdBridgeMock.mockReturnValue(neuralQueue);
    loadBrowserCardsByBlockIdsMock.mockResolvedValue([conceptCard]);
    const readMock = vi.fn(async (request: { rootFocusNodeId?: string; sessionId?: string }) => {
      if (request.rootFocusNodeId) {
        return { ...semanticReadResult('session-pool', request.rootFocusNodeId), activeSession: null, session: null, rootNode: null, currentNode: null };
      }
      return semanticReadResult('session-pool', conceptCard.blockId);
    });
    const executeMock = vi.fn(async () => ({
      status: 'ok',
      commandId: 'semantic-start',
      writerInstanceId: 'writer-1',
      changed: {},
      session: {
        sessionId: 'session-pool',
        rootFocusNodeId: conceptCard.blockId,
        currentNodeId: conceptCard.blockId,
        activeLens: 'assimilation',
        narrativePath: [{ nodeId: conceptCard.blockId, lens: 'assimilation', eventId: 'event-root', visitedAt: 1 }],
        startedAt: 1,
        endedAt: null,
      },
      diagnosticEventId: 'semantic-start-ok',
    }));

    const wrapper = mountBrowser({
      initialQueueId: 'neural-roam',
      plugin: mountSemanticPlugin(readMock, executeMock) as never,
    });
    await advance(0);
    await advance(0);
    await wrapper.get('.neural-mode-semantic').trigger('click');
    await flushPromises();
    await nextTick();
    await wrapper.get('.card-browser__semantic-root').trigger('click');
    await flushPromises();
    await nextTick();

    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({
      callerIntent: 'semantic.browser-concept.start',
      command: expect.objectContaining({
        type: 'start-session',
        rootFocusNodeId: conceptCard.blockId,
      }),
    }));
    expect(neuralQueue.setSourceEntry).not.toHaveBeenCalled();
    expect(wrapper.get('.semantic-workbench-stub').text()).toContain('Visible Semantic Root');

    wrapper.unmount();
  });

  it('keeps the first NeuralRoam load from reentering while the queue initial load is still materializing', async () => {
    let resolveProjectionReady: ((value: {
      status: 'ready';
      queueId: QueueType.NeuralRoam;
      policyId: string;
      generation: number;
    }) => void) | null = null;
    const projectionReady = new Promise<{
      status: 'ready';
      queueId: QueueType.NeuralRoam;
      policyId: string;
      generation: number;
    }>((resolve) => {
      resolveProjectionReady = resolve;
    });
    const neuralQueue = createNeuralQueueMock({
      getSize: vi.fn(async () => projectionReady.then(() => 0)),
      getCards: vi.fn(async () => []),
      listRoutes: vi.fn(async () => []),
      getRouteHistoryPage: vi.fn(() => ({ entries: [], totalCount: 0, hasMore: false })),
    });
    const manager = {
      getQueue: vi.fn(() => neuralQueue),
      ensureQueueProjectionReady: vi.fn(async () => projectionReady),
    };
    getQueueByIdBridgeMock.mockReturnValue(neuralQueue);
    createQueueDataSourceMock.mockReturnValue(createQueryableDataSource([]));
    const wrapper = mountBrowser({
      initialQueueId: 'neural-roam',
      browserService: {
        getBrowserDocumentCounts: vi.fn(async () => ({
          status: 'unsupported',
          owner: 'none',
          scope: { kind: 'queue' },
          rows: [],
          reason: 'test queue counts unavailable',
          diagnostics: {
            countOnly: true,
            rowsHydratedForHierarchy: 0,
          },
        })),
        getStats: vi.fn(async () => ({
          totalCards: 3,
          suspendedCards: 1,
          lostCards: 1,
        })),
        getUnifiedDataSourceManager: vi.fn(() => manager),
        getSiyuanApi: vi.fn(() => ({
          pushMsg: vi.fn(),
          pushErrMsg: vi.fn(),
        })),
      } as never,
    });

    await advance(0);
    expect(neuralQueue.getSize).toHaveBeenCalledTimes(1);
    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();

    browserAdapterSyncHarness.options?.onQueueChanged({
      affectedQueueTypes: [QueueType.NeuralRoam],
      invalidateAllCounts: false,
      requiresFullRefresh: false,
      forceRefreshCounts: true,
    });

    await flushPromises();
    await nextTick();

    expect(neuralQueue.getSize).toHaveBeenCalledTimes(1);
    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();

    resolveProjectionReady?.({
      status: 'ready',
      queueId: QueueType.NeuralRoam,
      policyId: 'policy-neural',
      generation: 1,
    });
    await advance(0);

    wrapper.unmount();
  });

  it('populates the left document list from count-only document counts without all-row hydration', async () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, index) => buildBrowserCard(`card-a-${index}`, 'doc-1')),
      ...Array.from({ length: 25 }, (_, index) => buildBrowserCard(`card-b-${index}`, 'doc-2')),
      buildBrowserCard('card-c-0', 'doc-3'),
    ];
    const queryable = createQueryableDataSource(rows);
    createDeckDataSourceMock.mockReturnValue(queryable);
    const browserService = createBrowserService();
    browserService.getBrowserDocumentCounts.mockResolvedValue({
      status: 'ready',
      owner: 'sql-card-universe',
      scope: { kind: 'deck' },
      rows: [
        { rootId: 'doc-1', count: 25 },
        { rootId: 'doc-2', count: 25 },
        { rootId: 'doc-3', count: 1 },
      ],
      diagnostics: {
        countOnly: true,
        rowsHydratedForHierarchy: 0,
      },
    });

    const wrapper = mountBrowser({
      browserService: browserService as never,
    });

    await advance(0);
    await advance(0);
    await advance(80);
    expect(wrapper.text()).toContain('doc-1:25');
    expect(wrapper.text()).toContain('doc-2:25');
    expect(wrapper.text()).toContain('doc-3:1');
    expect(browserService.getBrowserDocumentCounts).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'deck',
      preset: 'all',
      cardType: 'all',
    }));
    expect(queryable.getAllMatchedIds).not.toHaveBeenCalled();
    expect(queryable.getRowsByIds).not.toHaveBeenCalled();
  });

  it('discards stale hierarchy document counts after read metadata changes', async () => {
    let resolveFirstCounts: ((value: unknown) => void) | null = null;
    const firstRows = [buildBrowserCard('card-old', 'doc-old')];
    const secondRows = [buildBrowserCard('card-new', 'doc-new')];
    createDeckDataSourceMock.mockImplementation((_manager, options: { preset?: string }) => {
      if (options?.preset === 'suspended') {
        return createQueryableDataSource(secondRows, {
          queryFingerprint: 'query-new',
          generation: 2,
          readOwner: { kind: 'sql-card-universe' },
        });
      }
      return createQueryableDataSource(firstRows, {
        queryFingerprint: 'query-old',
        generation: 1,
        readOwner: { kind: 'sql-card-universe' },
      });
    });
    const browserService = createBrowserService();
    browserService.getBrowserDocumentCounts
      .mockImplementationOnce(async () => new Promise((resolve) => {
        resolveFirstCounts = resolve;
      }))
      .mockResolvedValueOnce({
        status: 'ready',
        owner: 'sql-card-universe',
        scope: { kind: 'deck' },
        rows: [{ rootId: 'doc-new', count: 1 }],
        diagnostics: {
          countOnly: true,
          rowsHydratedForHierarchy: 0,
        },
      });

    const wrapper = mountBrowser({ browserService: browserService as never });
    await advance(0);
    await advance(0);
    await advance(80);

    expect(browserService.getBrowserDocumentCounts).toHaveBeenCalledTimes(1);

    await wrapper.get('.select-global-suspended').trigger('click');
    await advance(0);
    await advance(0);
    await advance(80);

    resolveFirstCounts?.({
      status: 'ready',
      owner: 'sql-card-universe',
      scope: { kind: 'deck' },
      rows: [{ rootId: 'doc-stale', count: 99 }],
      diagnostics: {
        countOnly: true,
        rowsHydratedForHierarchy: 0,
      },
    });
    await flushPromises();
    await nextTick();
    await advance(0);

    expect(wrapper.text()).toContain('doc-new:1');
    expect(wrapper.text()).not.toContain('doc-stale:99');
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

  it('shows the all-flashcards total without subtracting missing-block cards', async () => {
    const browserService = createBrowserService();
    browserService.getStats.mockResolvedValue({
      totalCards: 12,
      suspendedCards: 2,
      lostCards: 5,
    });
    createDeckDataSourceMock.mockImplementation(() => createQueryableDataSource([]));

    const wrapper = mountBrowser({
      browserService: browserService as never,
    });

    await advance(0);
    await advance(0);
    await advance(200);

    expect(wrapper.get('.select-global-all').text()).toBe('All flashcards 12');
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

  it('scopes hierarchy document clicks to the selected document tree', async () => {
    const rows = [
      buildBrowserCard('card-1', 'doc-1'),
      buildBrowserCard('card-2', 'doc-1-child'),
    ];
    const collectDocReviewScope = vi.fn(() => ({
      cards: [],
      docIds: ['doc-1', 'doc-1-child'],
    }));
    createDeckDataSourceMock.mockImplementation(() => createQueryableDataSource(rows));

    const wrapper = mountBrowser({
      plugin: {
        getContext: () => ({
          getDocTreeReviewScopeService: () => ({
            collectDocReviewScope,
            hydrate: vi.fn(async () => {}),
          }),
        }),
      } as never,
    });

    await advance(0);
    await advance(0);
    await advance(200);

    expect(wrapper.text()).toContain('doc-1:1');
    await wrapper.get('[data-doc-id="doc-1"]').trigger('click');
    await advance(0);
    await advance(0);
    await advance(240);

    expect(collectDocReviewScope).toHaveBeenCalledWith('doc-1');
    expect(createDeckDataSourceMock.mock.calls.at(-1)?.[1]).toMatchObject({
      docId: null,
      scopeDocIds: ['doc-1', 'doc-1-child'],
      preset: 'all',
    });
    expect(wrapper.get('.toolbar-scope-count').text()).toBe('2');
  });

  it('hydrates a cold document-tree scope before applying hierarchy document clicks', async () => {
    const rows = [
      buildBrowserCard('card-1', 'doc-1'),
      buildBrowserCard('card-2', 'doc-1-child'),
    ];
    const hydrate = vi.fn(async () => {});
    const collectDocReviewScope = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        cards: [],
        docIds: ['doc-1', 'doc-1-child'],
      });
    createDeckDataSourceMock.mockImplementation(() => createQueryableDataSource(rows));

    const wrapper = mountBrowser({
      plugin: {
        getContext: () => ({
          getDocTreeReviewScopeService: () => ({
            collectDocReviewScope,
            hydrate,
          }),
        }),
      } as never,
    });

    await advance(0);
    await advance(0);
    await advance(200);
    await wrapper.get('[data-doc-id="doc-1"]').trigger('click');
    await advance(0);
    await advance(0);
    await advance(240);

    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(collectDocReviewScope).toHaveBeenCalledTimes(2);
    expect(createDeckDataSourceMock.mock.calls.at(-1)?.[1]).toMatchObject({
      docId: null,
      scopeDocIds: ['doc-1', 'doc-1-child'],
    });
  });

  it('keeps an unresolved hierarchy document click scoped to the clicked document', async () => {
    const rows = [
      buildBrowserCard('card-1', 'doc-1'),
    ];
    const collectDocReviewScope = vi.fn(() => null);
    createDeckDataSourceMock.mockImplementation(() => createQueryableDataSource(rows));

    const wrapper = mountBrowser({
      plugin: {
        getContext: () => ({
          getDocTreeReviewScopeService: () => ({
            collectDocReviewScope,
            hydrate: vi.fn(async () => {}),
          }),
        }),
      } as never,
    });

    await advance(0);
    await advance(0);
    await advance(200);
    await wrapper.get('[data-doc-id="doc-1"]').trigger('click');
    await advance(0);
    await advance(0);
    await advance(240);

    expect(createDeckDataSourceMock.mock.calls.at(-1)?.[1]).toMatchObject({
      docId: null,
      scopeDocIds: ['doc-1'],
    });
    expect(wrapper.get('.toolbar-scope-count').text()).toBe('1');
  });

  it('normalizes legacy missing-block browser state back to the default global view', async () => {
    const rows = [
      buildBrowserCard('card-1', 'doc-1'),
      buildBrowserCard('card-2', 'doc-1-child'),
    ];
    createDeckDataSourceMock.mockImplementation(() => createQueryableDataSource(rows));

    const wrapper = mountBrowser({
      initialOpenState: {
        docId: '__lost__',
        scopeDocIds: ['doc-1', 'doc-1-child'],
        preset: 'due',
        queryText: 'alpha',
        cardType: 'topic-only',
      },
    });

    await advance(0);
    await advance(0);
    await advance(200);

    expect(createDeckDataSourceMock.mock.calls.at(-1)?.[1]).toMatchObject({
      docId: null,
      scopeDocIds: null,
      preset: 'all',
      queryText: '',
      cardType: 'all',
    });
    expect(wrapper.text()).not.toContain('Missing');
  });
});
