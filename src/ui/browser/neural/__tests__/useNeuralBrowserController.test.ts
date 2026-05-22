import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type {
  NeuralActivationTrace,
  NeuralNavigationState,
  NeuralRoamHistoryEntry,
} from '@/types/unified-data-source';
import type { BrowserCard } from '../../types';
import { useNeuralBrowserController } from '../useNeuralBrowserController';
import type { NeuralSubview } from '../types';

const t = (key: string, fallback: string) => `${key}:${fallback}`;

function createTrace(): NeuralActivationTrace {
  return {
    targetEventId: 'event-target',
    targetNodeId: 'target-node',
    branchRootNodeId: 'source-node',
    isExact: true,
    degradedReason: null,
    steps: [
      {
        eventId: 'event-source',
        nodeId: 'source-node',
        nodePreview: 'source-node',
        isVirtual: false,
        associationType: 'source',
        reason: 'source',
        activationKind: 'source-root',
        visitedAt: 10,
        focusId: 'source-node',
        engineMode: 'hyperspace',
        sourceRole: 'activation-source',
        sourceNodeId: null,
        sourceEventId: null,
        branchRootNodeId: 'source-node',
        traceQuality: 'exact',
        depth: 0,
        conductionScore: 1,
        isSyntheticRoot: false,
      },
      {
        eventId: 'event-target',
        nodeId: 'target-node',
        nodePreview: 'target-node',
        isVirtual: false,
        associationType: 'concept-link',
        reason: 'link',
        activationKind: 'graph-edge',
        visitedAt: 20,
        focusId: 'source-node',
        engineMode: 'hyperspace',
        sourceRole: null,
        origin: 'direct-ref',
        sourceNodeId: 'source-node',
        sourceEventId: 'event-source',
        branchRootNodeId: 'source-node',
        traceQuality: 'exact',
        depth: 1,
        conductionScore: 0.8,
        isSyntheticRoot: false,
      },
    ],
  };
}

function createHistoryEntry(
  eventId: string,
  nodeId: string,
  visitedAt: number,
): NeuralRoamHistoryEntry {
  return {
    eventId,
    nodeId,
    visitedAt,
    sessionId: 'session-a',
    title: nodeId,
    sourceRole: null,
    activationKind: 'graph-edge',
  } as NeuralRoamHistoryEntry;
}

function createQueue(overrides: Record<string, unknown> = {}) {
  const historyEntries = [
    createHistoryEntry('event-target', 'target-node', 20),
    createHistoryEntry('event-source', 'source-node', 10),
  ];
  const navState: NeuralNavigationState = {
    currentNodeId: 'target-node',
    currentEventId: 'event-target',
    sessionId: 'session-a',
    engineMode: 'hyperspace',
    navigationMode: 'follow',
    canReturnToBookmark: false,
    bookmarkNodeId: null,
  };

  return {
    listRoutes: vi.fn(async () => [
      {
        id: 'default',
        name: '默认航线',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 1,
        updatedAt: 1,
        lastUsedAt: 1,
        isActive: true,
        stats: {
          routeId: 'default',
          seedCount: 1,
          anchorCount: 1,
          historyCount: historyEntries.length,
          totalPoolEntries: 2,
        },
      },
      {
        id: 'route-b',
        name: 'Route B',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 2,
        updatedAt: 2,
        lastUsedAt: 2,
        isActive: false,
        stats: {
          routeId: 'route-b',
          seedCount: 0,
          anchorCount: 0,
          historyCount: 0,
          totalPoolEntries: 0,
        },
      },
    ]),
    switchRoute: vi.fn(async () => ({
      metadata: {
        id: 'route-b',
        name: 'Route B',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 2,
        updatedAt: 2,
        lastUsedAt: 2,
      },
      seedPool: [],
      anchorPool: [],
      sessions: { orbit: null, hyperspace: null },
      history: [],
    })),
    createRoute: vi.fn(async () => ({
      metadata: {
        id: 'route-created',
        name: 'Created',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 3,
        updatedAt: 3,
        lastUsedAt: 3,
      },
      seedPool: [],
      anchorPool: [],
      sessions: { orbit: null, hyperspace: null },
      history: [],
    })),
    renameRoute: vi.fn(async () => ({})),
    deleteRoute: vi.fn(async () => undefined),
    saveTemporaryRoute: vi.fn(async () => ({})),
    getEngineMode: vi.fn(() => 'hyperspace'),
    setEngineMode: vi.fn(async () => undefined),
    getSourceSnapshot: vi.fn(() => [
      { nodeId: 'source-node', title: 'Source', visitedAt: 10 },
    ]),
    setSourceEntry: vi.fn(async () => undefined),
    getSeedSnapshot: vi.fn(() => []),
    setSeedEntry: vi.fn(async () => undefined),
    getAnchorSnapshot: vi.fn(() => [
      { nodeId: 'target-node', title: 'Target', visitedAt: 20 },
    ]),
    setAnchorEntry: vi.fn(async () => undefined),
    clearAnchors: vi.fn(async () => undefined),
    getCurrentBatchSnapshot: vi.fn(() => null),
    getConceptBlocks: vi.fn(() => []),
    getFocusPoolSnapshot: vi.fn(() => []),
    setFocusPoolEntry: vi.fn(async () => undefined),
    clearFocusPool: vi.fn(async () => undefined),
    setCurrentFocus: vi.fn(async () => undefined),
    startRoamingFromFocus: vi.fn(async () => undefined),
    getHistoryCount: vi.fn(() => historyEntries.length),
    getHistoryPage: vi.fn(() => ({
      entries: historyEntries,
      totalCount: historyEntries.length,
      hasMore: false,
    })),
    getRouteHistoryPage: vi.fn(() => ({
      entries: historyEntries,
      totalCount: historyEntries.length,
      hasMore: false,
    })),
    getHistorySnapshot: vi.fn(() => historyEntries),
    getHistoryEntryByEventId: vi.fn((eventId: string) => historyEntries.find((entry) => entry.eventId === eventId) ?? null),
    getHistoryEntriesByNodeId: vi.fn((nodeId: string) => historyEntries.filter((entry) => entry.nodeId === nodeId)),
    getHistoryHitCount: vi.fn(() => 1),
    getActivationTrace: vi.fn((eventId: string) => eventId === 'event-target' ? createTrace() : null),
    getSessionFocusStack: vi.fn(() => []),
    getPinnedFocusBlocks: vi.fn(() => []),
    setPinnedFocusBlock: vi.fn(async () => undefined),
    jumpToHistoryNode: vi.fn(async () => true),
    getPathItemByNodeId: vi.fn(async () => null),
    getNavigationState: vi.fn(() => navState),
    setNavigationMode: vi.fn(),
    returnToBookmark: vi.fn(() => false),
    clearHistory: vi.fn(),
    ...overrides,
  };
}

function createController(
  queue: Record<string, unknown> | null = createQueue(),
  options: { getNeuralSubview?: () => NeuralSubview | null | undefined } = {},
) {
  const previewCard = ref<BrowserCard | null>(null);
  const refreshQueueCounts = vi.fn(async () => undefined);
  const confirmRouteSwitchReviewReset = vi.fn(async () => true);
  const promptRouteName = vi.fn(async () => 'Created Route');
  const confirmDeleteRoute = vi.fn(async () => true);
  const syncExistingNeuralReviewTabToCurrentNode = vi.fn(async () => 'synced' as const);
  const loadCardsByBlockIds = vi.fn(async (blockIds: string[]) => blockIds.map((blockId) => ({
    blockId,
    content: `Content ${blockId}`,
    fullContent: '',
  } as BrowserCard)));
  const controller = useNeuralBrowserController({
    getQueueById: vi.fn((id: string) => id === 'neural-roam' ? queue : null),
    loadCardsByBlockIds: loadCardsByBlockIds as never,
    getCardLoadOptions: () => ({}),
    previewCard,
    refreshQueueCounts,
    getReviewSurfaceDeps: () => ({
      tabManager: {
        hasOpenNeuralReviewTab: vi.fn(() => false),
        syncExistingNeuralReviewTabToCurrentNode,
      },
    }),
    confirmClearHistory: vi.fn(async () => true),
    confirmRouteSwitchReviewReset,
    promptRouteName,
    confirmDeleteRoute,
    close: vi.fn(),
    getMode: () => 'tab',
    pushMessage: vi.fn(async () => undefined),
    pushError: vi.fn(async () => undefined),
    logError: vi.fn(),
    t,
    historyPageSize: 2,
    getNeuralSubview: options.getNeuralSubview,
  });
  return {
    controller,
    previewCard,
    loadCardsByBlockIds,
    refreshQueueCounts,
    confirmRouteSwitchReviewReset,
    promptRouteName,
    confirmDeleteRoute,
    syncExistingNeuralReviewTabToCurrentNode,
  };
}

describe('useNeuralBrowserController', () => {
  it('refreshes neural lists and enriched activation trace from the active queue', async () => {
    const { controller, loadCardsByBlockIds } = createController();

    await controller.refreshNeuralSubviewData();

    expect(controller.neuralSourceEntries.value).toHaveLength(1);
    expect(controller.neuralHistoryEntries.value.map((entry) => entry.eventId)).toEqual([
      'event-target',
      'event-source',
    ]);
    expect(controller.neuralAnchorEntries.value[0]).toMatchObject({
      nodeId: 'target-node',
      inHistory: true,
      isCurrent: true,
    });
    expect(controller.neuralActivationTrace.value?.targetTitle).toBe('Content target-node');
    expect(controller.selectedNeuralHistoryEventId.value).toBe('event-target');
    expect(controller.neuralRoutes.value.map((route) => route.id)).toEqual(['default', 'route-b']);
    expect(loadCardsByBlockIds).toHaveBeenCalledWith([
      'source-node',
      'target-node',
    ], expect.objectContaining({ applyQueryFilter: false }));
  });

  it('clears projected state when neural queue is unavailable', async () => {
    const { controller } = createController(null);

    await controller.refreshNeuralSubviewData();

    expect(controller.neuralSourceEntries.value).toEqual([]);
    expect(controller.neuralActivationTrace.value).toBeNull();
    expect(controller.neuralCurrentNodeId.value).toBeNull();
  });

  it('routes jump handlers through preview, queue move, refresh, and current-node preview', async () => {
    const queue = createQueue({
      getNavigationState: vi.fn(() => ({
        currentNodeId: 'target-node',
        currentEventId: 'event-target',
        sessionId: 'session-a',
        engineMode: 'hyperspace',
        navigationMode: 'follow',
        canReturnToBookmark: false,
        bookmarkNodeId: null,
      })),
    });
    const { controller, previewCard } = createController(queue);

    await controller.handleNeuralJump('source-node');

    expect(queue.jumpToHistoryNode).toHaveBeenCalledWith('source-node');
    expect(previewCard.value?.blockId).toBe('target-node');
    expect(controller.selectedNeuralTraceNodeId.value).toBe('source-node');
  });

  it('uses route-level history for the Browser route log instead of engine-local history', async () => {
    const routeHistoryEntries = [
      createHistoryEntry('route-orbit', 'orbit-node', 30),
      createHistoryEntry('route-hyperspace', 'hyperspace-node', 20),
    ].map((entry, index) => ({
      ...entry,
      engineMode: index === 0 ? 'orbit' : 'hyperspace',
    }));
    const queue = createQueue({
      getHistoryPage: vi.fn(() => ({
        entries: [createHistoryEntry('engine-only', 'engine-node', 10)],
        totalCount: 1,
        hasMore: false,
      })),
      getRouteHistoryPage: vi.fn(() => ({
        entries: routeHistoryEntries,
        totalCount: routeHistoryEntries.length,
        hasMore: false,
      })),
      getHistoryHitCount: vi.fn((nodeId: string) => (
        routeHistoryEntries.filter((entry) => entry.nodeId === nodeId).length
      )),
    });
    const { controller } = createController(queue, {
      getNeuralSubview: () => 'roam-history',
    });

    await controller.refreshNeuralSubviewData();

    expect(queue.getRouteHistoryPage).toHaveBeenCalledWith({ offset: 0, limit: 2 });
    expect(queue.getHistoryPage).not.toHaveBeenCalled();
    expect(controller.neuralHistoryEntries.value.map((entry) => entry.eventId)).toEqual([
      'route-orbit',
      'route-hyperspace',
    ]);
  });

  it('uses engine-local history for the Browser trajectory path view', async () => {
    const engineHistoryEntries = [
      createHistoryEntry('engine-only', 'engine-node', 10),
    ];
    const queue = createQueue({
      getHistoryPage: vi.fn(() => ({
        entries: engineHistoryEntries,
        totalCount: engineHistoryEntries.length,
        hasMore: false,
      })),
      getRouteHistoryPage: vi.fn(() => ({
        entries: [
          createHistoryEntry('route-orbit', 'orbit-node', 30),
          createHistoryEntry('route-hyperspace', 'hyperspace-node', 20),
        ],
        totalCount: 2,
        hasMore: false,
      })),
    });
    const { controller } = createController(queue, {
      getNeuralSubview: () => 'engine-history',
    });

    await controller.refreshNeuralSubviewData();

    expect(queue.getHistoryPage).toHaveBeenCalledWith({ offset: 0, limit: 2 });
    expect(queue.getRouteHistoryPage).not.toHaveBeenCalled();
    expect(controller.neuralHistoryEntries.value.map((entry) => entry.eventId)).toEqual(['engine-only']);
  });

  it('switches routes through the queue contract and refreshes route-scoped pools and log', async () => {
    const queue = createQueue({
      listRoutes: vi.fn()
        .mockResolvedValueOnce([
          {
            id: 'default',
            name: '默认航线',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: 1,
            updatedAt: 1,
            lastUsedAt: 1,
            isActive: true,
            stats: { routeId: 'default', seedCount: 1, anchorCount: 1, historyCount: 2, totalPoolEntries: 2 },
          },
          {
            id: 'route-b',
            name: 'Route B',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: 2,
            updatedAt: 2,
            lastUsedAt: 2,
            isActive: false,
            stats: { routeId: 'route-b', seedCount: 1, anchorCount: 0, historyCount: 1, totalPoolEntries: 1 },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'route-b',
            name: 'Route B',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: 2,
            updatedAt: 2,
            lastUsedAt: 3,
            isActive: true,
            stats: { routeId: 'route-b', seedCount: 1, anchorCount: 0, historyCount: 1, totalPoolEntries: 1 },
          },
          {
            id: 'default',
            name: '默认航线',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: 1,
            updatedAt: 1,
            lastUsedAt: 1,
            isActive: false,
            stats: { routeId: 'default', seedCount: 1, anchorCount: 1, historyCount: 2, totalPoolEntries: 2 },
          },
        ]),
      getSourceSnapshot: vi.fn()
        .mockReturnValueOnce([{ nodeId: 'source-default', title: 'Default', visitedAt: 10 }])
        .mockReturnValueOnce([{ nodeId: 'source-b', title: 'Route B source', visitedAt: 30 }]),
      getAnchorSnapshot: vi.fn()
        .mockReturnValueOnce([{ nodeId: 'target-node', title: 'Target', visitedAt: 20 }])
        .mockReturnValueOnce([]),
      getHistoryPage: vi.fn()
        .mockReturnValueOnce({
          entries: [createHistoryEntry('event-target', 'target-node', 20)],
          totalCount: 1,
          hasMore: false,
        })
        .mockReturnValueOnce({
          entries: [createHistoryEntry('event-b', 'source-b', 30)],
          totalCount: 1,
          hasMore: false,
        }),
      getRouteHistoryPage: vi.fn()
        .mockReturnValueOnce({
          entries: [createHistoryEntry('event-target', 'target-node', 20)],
          totalCount: 1,
          hasMore: false,
        })
        .mockReturnValueOnce({
          entries: [createHistoryEntry('event-b', 'source-b', 30)],
          totalCount: 1,
          hasMore: false,
        }),
    });
    const { controller, refreshQueueCounts } = createController(queue);

    await controller.refreshNeuralSubviewData();
    await controller.handleNeuralSwitchRoute('route-b');

    expect(queue.switchRoute).toHaveBeenCalledWith('route-b');
    expect(controller.neuralRoutes.value[0]).toMatchObject({ id: 'route-b', isActive: true });
    expect(controller.neuralSourceEntries.value.map((entry) => entry.nodeId)).toEqual(['source-b']);
    expect(controller.neuralHistoryEntries.value.map((entry) => entry.eventId)).toEqual(['event-b']);
    expect(controller.neuralAnchorEntries.value).toEqual([]);
    expect(refreshQueueCounts).toHaveBeenCalled();
  });

  it('confirms and syncs an open NeuralRoam review surface before applying a Browser route switch', async () => {
    const queue = createQueue();
    const confirmRouteSwitchReviewReset = vi.fn(async () => true);
    const syncExistingNeuralReviewTabToCurrentNode = vi.fn(async () => 'synced' as const);
    const previewCard = ref<BrowserCard | null>(null);
    const controller = useNeuralBrowserController({
      getQueueById: vi.fn((id: string) => id === 'neural-roam' ? queue : null),
      loadCardsByBlockIds: vi.fn(async () => []) as never,
      getCardLoadOptions: () => ({}),
      previewCard,
      refreshQueueCounts: vi.fn(async () => undefined),
      getReviewSurfaceDeps: () => ({
        tabManager: {
          hasOpenNeuralReviewTab: () => true,
          syncExistingNeuralReviewTabToCurrentNode,
        },
      }),
      confirmClearHistory: vi.fn(async () => true),
      confirmRouteSwitchReviewReset,
      promptRouteName: vi.fn(async () => 'Route'),
      confirmDeleteRoute: vi.fn(async () => true),
      close: vi.fn(),
      getMode: () => 'tab',
      pushMessage: vi.fn(async () => undefined),
      pushError: vi.fn(async () => undefined),
      logError: vi.fn(),
      t,
      historyPageSize: 2,
    });

    await controller.refreshNeuralSubviewData();
    await controller.handleNeuralSwitchRoute('route-b');

    expect(confirmRouteSwitchReviewReset).toHaveBeenCalledTimes(1);
    expect(queue.switchRoute).toHaveBeenCalledWith('route-b');
    expect(syncExistingNeuralReviewTabToCurrentNode).toHaveBeenCalledWith({
      fallbackNodeId: 'target-node',
      focus: true,
    });
  });

  it('does not switch routes when the open review reset confirmation is cancelled', async () => {
    const queue = createQueue();
    const previewCard = ref<BrowserCard | null>(null);
    const controller = useNeuralBrowserController({
      getQueueById: vi.fn((id: string) => id === 'neural-roam' ? queue : null),
      loadCardsByBlockIds: vi.fn(async () => []) as never,
      getCardLoadOptions: () => ({}),
      previewCard,
      refreshQueueCounts: vi.fn(async () => undefined),
      getReviewSurfaceDeps: () => ({
        tabManager: {
          hasOpenNeuralReviewTab: () => true,
          syncExistingNeuralReviewTabToCurrentNode: vi.fn(async () => 'synced' as const),
        },
      }),
      confirmClearHistory: vi.fn(async () => true),
      confirmRouteSwitchReviewReset: vi.fn(async () => false),
      promptRouteName: vi.fn(async () => 'Route'),
      confirmDeleteRoute: vi.fn(async () => true),
      close: vi.fn(),
      getMode: () => 'tab',
      pushMessage: vi.fn(async () => undefined),
      pushError: vi.fn(async () => undefined),
      logError: vi.fn(),
      t,
      historyPageSize: 2,
    });

    await controller.refreshNeuralSubviewData();
    await controller.handleNeuralSwitchRoute('route-b');

    expect(queue.switchRoute).not.toHaveBeenCalled();
  });
});
