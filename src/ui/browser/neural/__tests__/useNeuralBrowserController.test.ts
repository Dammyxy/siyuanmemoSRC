import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type {
  NeuralActivationTrace,
  NeuralNavigationState,
  NeuralRoamHistoryEntry,
} from '@/types/unified-data-source';
import type { BackendNeuralRoamCommand, BackendNeuralRoamCommandResult } from '../../../../../packages/contracts/src/backend-rpc';
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
    getCards: vi.fn(async () => []),
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
    clearHistory: vi.fn(async () => undefined),
    clearRouteHistory: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createBackendRouteCommandResult(
  routeId: string,
  routeName: string,
): BackendNeuralRoamCommandResult {
  return {
    status: 'ok',
    viewState: {
      version: 1,
      queueType: 'neural-roam',
      route: {
        id: routeId,
        name: routeName,
        temporary: false,
        previousRouteId: null,
      },
      engineMode: 'orbit',
      currentNodeId: null,
      currentEventId: null,
      navigationState: {
        currentNodeId: null,
        currentEventId: null,
        sessionId: 'session-a',
        engineMode: 'orbit',
        navigationMode: 'explore',
        canReturnToBookmark: false,
        bookmarkNodeId: null,
        currentPathIndex: -1,
        pathLength: 0,
      },
      counters: {
        routeId,
        remaining: 0,
        due: 0,
        total: 0,
        pendingAssociatedReview: 0,
        sourceNodes: 0,
      },
      sources: [],
      anchors: [],
      engineHistory: [],
      routeHistory: [],
      batchProgress: {
        kind: 'none',
        viewedCount: 0,
        totalCount: 0,
        remainingCount: 0,
        label: '',
      },
      updatedAt: 1,
      routes: [
        {
          id: routeId,
          name: routeName,
          temporary: false,
          previousRouteId: null,
          initialSeedNodeIds: [],
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: 1,
          isActive: true,
          stats: {
            routeId,
            seedCount: 0,
            anchorCount: 0,
            historyCount: 0,
            totalPoolEntries: 0,
          },
        },
      ],
    },
  };
}

function createController(
  queue: Record<string, unknown> | null = createQueue(),
  options: {
    getNeuralSubview?: () => NeuralSubview | null | undefined;
    readNeuralRoamViewState?: () => Promise<{ version: 1; queueType: 'neural-roam'; routes?: unknown[] } | null>;
    runNeuralRoamCommand?: (command: BackendNeuralRoamCommand) => Promise<BackendNeuralRoamCommandResult>;
  } = {},
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
    readNeuralRoamViewState: options.readNeuralRoamViewState,
    runNeuralRoamCommand: options.runNeuralRoamCommand,
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

  it('reads neural source snapshot without forcing queue warm-up', async () => {
    let hydrated = false;
    const queue = createQueue({
      getCards: vi.fn(async () => {
        hydrated = true;
        return [];
      }),
      getSourceSnapshot: vi.fn(() => (hydrated
        ? [{ nodeId: 'source-node', title: 'Source', visitedAt: 10 }]
        : [])),
    });
    const { controller } = createController(queue);

    await controller.refreshNeuralSubviewData();

    expect(queue.getCards).not.toHaveBeenCalled();
    expect(controller.neuralSourceEntries.value).toHaveLength(0);
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

  it('syncs the wake panel from the Browser route log selection', async () => {
    const routeTrace = createTrace();
    const routeEntry = createHistoryEntry('route-target', 'target-node', 30);
    const queue = createQueue({
      getRouteHistoryPage: vi.fn(() => ({
        entries: [routeEntry],
        totalCount: 1,
        hasMore: false,
      })),
      getActivationTrace: vi.fn((eventId: string) => (
        eventId === 'route-target'
          ? { ...routeTrace, targetEventId: 'route-target' }
          : null
      )),
      getHistoryEntryByEventId: vi.fn((eventId: string) => (
        eventId === 'route-target' ? routeEntry : null
      )),
    });
    const { controller } = createController(queue, {
      getNeuralSubview: () => 'roam-history',
    });

    await controller.refreshNeuralSubviewData();
    await controller.handleNeuralSelectHistoryEntry(routeEntry);

    expect(queue.getRouteHistoryPage).toHaveBeenCalled();
    expect(queue.getActivationTrace).toHaveBeenCalledWith('route-target');
    expect(controller.selectedNeuralHistoryEventId.value).toBe('route-target');
    expect(controller.neuralActivationTrace.value?.targetEventId).toBe('route-target');
  });

  it('syncs the wake panel from the Browser double-link track selection', async () => {
    const engineEntry = createHistoryEntry('engine-target', 'target-node', 30);
    const queue = createQueue({
      getHistoryPage: vi.fn(() => ({
        entries: [engineEntry],
        totalCount: 1,
        hasMore: false,
      })),
      getActivationTrace: vi.fn((eventId: string) => (
        eventId === 'engine-target'
          ? { ...createTrace(), targetEventId: 'engine-target' }
          : null
      )),
      getHistoryEntryByEventId: vi.fn((eventId: string) => (
        eventId === 'engine-target' ? engineEntry : null
      )),
    });
    const { controller } = createController(queue, {
      getNeuralSubview: () => 'engine-history',
    });

    await controller.refreshNeuralSubviewData();
    await controller.handleNeuralSelectHistoryEntry(engineEntry);

    expect(queue.getHistoryPage).toHaveBeenCalled();
    expect(queue.getActivationTrace).toHaveBeenCalledWith('engine-target');
    expect(controller.selectedNeuralHistoryEventId.value).toBe('engine-target');
    expect(controller.neuralActivationTrace.value?.targetEventId).toBe('engine-target');
  });

  it('clears the Browser route log through the route-level history contract', async () => {
    const queue = createQueue();
    const { controller, refreshQueueCounts } = createController(queue, {
      getNeuralSubview: () => 'roam-history',
    });

    await controller.handleNeuralClearHistory();

    expect(queue.clearRouteHistory).toHaveBeenCalledTimes(1);
    expect(queue.clearHistory).not.toHaveBeenCalled();
    expect(refreshQueueCounts).toHaveBeenCalled();
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

  it('switches routes through the backend route command and refreshes route-scoped pools and log', async () => {
    let activeRouteId = 'default';
    const queue = createQueue({
      listRoutes: vi.fn(async () => [
        {
          id: 'route-b',
          name: 'Route B',
          temporary: false,
          previousRouteId: null,
          initialSeedNodeIds: [],
          createdAt: 2,
          updatedAt: activeRouteId === 'route-b' ? 3 : 2,
          lastUsedAt: activeRouteId === 'route-b' ? 3 : 2,
          isActive: activeRouteId === 'route-b',
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
          isActive: activeRouteId !== 'route-b',
          stats: { routeId: 'default', seedCount: 1, anchorCount: 1, historyCount: 2, totalPoolEntries: 2 },
        },
      ]),
      getSourceSnapshot: vi.fn(() => (activeRouteId === 'route-b'
        ? [{ nodeId: 'source-b', title: 'Route B source', visitedAt: 30 }]
        : [{ nodeId: 'source-default', title: 'Default', visitedAt: 10 }])),
      getAnchorSnapshot: vi.fn(() => (activeRouteId === 'route-b'
        ? []
        : [{ nodeId: 'target-node', title: 'Target', visitedAt: 20 }])),
      getHistoryPage: vi.fn(() => (activeRouteId === 'route-b'
        ? {
            entries: [createHistoryEntry('event-b', 'source-b', 30)],
            totalCount: 1,
            hasMore: false,
          }
        : {
            entries: [createHistoryEntry('event-target', 'target-node', 20)],
            totalCount: 1,
            hasMore: false,
          })),
      getRouteHistoryPage: vi.fn(() => (activeRouteId === 'route-b'
        ? {
            entries: [createHistoryEntry('event-b', 'source-b', 30)],
            totalCount: 1,
            hasMore: false,
          }
        : {
            entries: [createHistoryEntry('event-target', 'target-node', 20)],
            totalCount: 1,
            hasMore: false,
          })),
    });
    const routeCommand = vi.fn(async () => createBackendRouteCommandResult('route-b', 'Route B'));
    const { controller, refreshQueueCounts } = createController(queue, {
      runNeuralRoamCommand: routeCommand,
      readNeuralRoamViewState: async () => ({
        version: 1,
        queueType: 'neural-roam',
        route: {
          id: 'route-b',
          name: 'Route B',
          temporary: false,
          previousRouteId: null,
        },
        engineMode: 'orbit',
        currentNodeId: 'target-node',
        currentEventId: 'event-target',
        navigationState: {
          currentNodeId: 'target-node',
          currentEventId: 'event-target',
          sessionId: 'session-a',
          engineMode: 'orbit',
          navigationMode: 'explore',
          canReturnToBookmark: false,
          bookmarkNodeId: null,
          currentPathIndex: -1,
          pathLength: 0,
        },
        counters: {
          routeId: 'route-b',
          remaining: 0,
          due: 0,
          total: 0,
          pendingAssociatedReview: 0,
          sourceNodes: 0,
        },
        sources: [
          { nodeId: 'source-b', title: 'Route B source', visitedAt: 30 },
        ],
        anchors: [],
        engineHistory: [
          createHistoryEntry('event-b', 'source-b', 30),
        ],
        routeHistory: [
          createHistoryEntry('event-b', 'source-b', 30),
        ],
        batchProgress: {
          kind: 'none',
          viewedCount: 0,
          totalCount: 0,
          remainingCount: 0,
          label: '',
        },
        updatedAt: 3,
        routes: [
          {
            id: 'route-b',
            name: 'Route B',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: 2,
            updatedAt: 3,
            lastUsedAt: 3,
            isActive: true,
            stats: {
              routeId: 'route-b',
              seedCount: 1,
              anchorCount: 0,
              historyCount: 1,
              totalPoolEntries: 1,
            },
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
            stats: {
              routeId: 'default',
              seedCount: 1,
              anchorCount: 1,
              historyCount: 2,
              totalPoolEntries: 2,
            },
          },
        ],
      }),
    });

    await controller.refreshNeuralSubviewData();
    activeRouteId = 'route-b';
    await controller.handleNeuralSwitchRoute('route-b');

    expect(routeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'switch-route', routeId: 'route-b' }));
    expect(controller.neuralRoutes.value[0]).toMatchObject({ id: 'route-b', isActive: true });
    expect(controller.neuralSourceEntries.value.map((entry) => entry.nodeId)).toEqual(['source-b']);
    expect(controller.neuralHistoryEntries.value.map((entry) => entry.eventId)).toEqual(['event-b']);
    expect(controller.neuralAnchorEntries.value).toEqual([]);
    expect(refreshQueueCounts).toHaveBeenCalled();
  });

  it('uses backend view-state routes for the Browser route selector when available', async () => {
    const queue = createQueue({
      listRoutes: vi.fn(async () => [
        {
          id: 'stale-route',
          name: 'Stale Route',
          temporary: false,
          previousRouteId: null,
          initialSeedNodeIds: [],
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: 1,
          isActive: true,
          stats: {
            routeId: 'stale-route',
            seedCount: 0,
            anchorCount: 0,
            historyCount: 0,
            totalPoolEntries: 0,
          },
        },
      ]),
    });
    const { controller } = createController(queue, {
      readNeuralRoamViewState: async () => ({
        version: 1,
        queueType: 'neural-roam',
        routes: [
          {
            id: 'route-backend',
            name: 'Backend Route',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: 2,
            updatedAt: 3,
            lastUsedAt: 4,
            isActive: true,
            stats: {
              routeId: 'route-backend',
              seedCount: 1,
              anchorCount: 0,
              historyCount: 2,
              totalPoolEntries: 1,
            },
          },
        ],
        route: {
          id: 'route-backend',
          name: 'Backend Route',
          temporary: false,
          previousRouteId: null,
        },
        engineMode: 'orbit',
        currentNodeId: null,
        currentEventId: null,
        navigationState: {
          currentNodeId: null,
          currentEventId: null,
          sessionId: 'session-a',
          engineMode: 'orbit',
          navigationMode: 'explore',
          canReturnToBookmark: false,
          bookmarkNodeId: null,
          currentPathIndex: -1,
          pathLength: 0,
        },
        counters: {
          routeId: 'route-backend',
          remaining: 0,
          due: 0,
          total: 0,
          pendingAssociatedReview: 0,
          sourceNodes: 0,
        },
        sources: [],
        anchors: [],
        engineHistory: [],
        routeHistory: [],
        batchProgress: {
          kind: 'none',
          viewedCount: 0,
          totalCount: 0,
          remainingCount: 0,
          label: '',
        },
        updatedAt: 5,
      }),
    });

    await controller.refreshNeuralSubviewData();

    expect(controller.neuralRoutes.value).toEqual([
      expect.objectContaining({
        id: 'route-backend',
        name: 'Backend Route',
        isActive: true,
      }),
    ]);
  });

  it('uses backend route commands for Browser route management instead of local mutation', async () => {
    const queue = createQueue({
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
          stats: { routeId: 'default', seedCount: 1, anchorCount: 1, historyCount: 1, totalPoolEntries: 1 },
        },
        {
          id: 'route-temp',
          name: 'Temp Route',
          temporary: true,
          previousRouteId: null,
          initialSeedNodeIds: [],
          createdAt: 2,
          updatedAt: 2,
          lastUsedAt: 2,
          isActive: false,
          stats: { routeId: 'route-temp', seedCount: 0, anchorCount: 0, historyCount: 0, totalPoolEntries: 0 },
        },
      ]),
    });
    const routeCommand = vi.fn(async (command: BackendNeuralRoamCommand) => {
      if (command.type === 'create-route') {
        return createBackendRouteCommandResult('route-created', command.name ?? 'Created');
      }
      if (command.type === 'rename-route') {
        return createBackendRouteCommandResult(command.routeId, command.name);
      }
      if (command.type === 'delete-route') {
        return createBackendRouteCommandResult('default', '默认航线');
      }
      return createBackendRouteCommandResult(command.routeId, 'Saved Route');
    });
    const { controller, promptRouteName, confirmDeleteRoute } = createController(queue, {
      runNeuralRoamCommand: routeCommand,
    });

    await controller.handleNeuralCreateRoute();
    await controller.refreshNeuralSubviewData();
    await controller.handleNeuralRenameRoute('route-temp');
    await controller.handleNeuralSaveTemporaryRoute('route-temp');
    await controller.handleNeuralDeleteRoute('route-temp');

    expect(routeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'create-route' }));
    expect(routeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'rename-route' }));
    expect(routeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'save-temporary-route' }));
    expect(routeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'delete-route' }));
    expect(queue.createRoute).not.toHaveBeenCalled();
    expect(queue.renameRoute).not.toHaveBeenCalled();
    expect(queue.saveTemporaryRoute).not.toHaveBeenCalled();
    expect(queue.deleteRoute).not.toHaveBeenCalled();
    expect(promptRouteName).toHaveBeenCalled();
    expect(confirmDeleteRoute).toHaveBeenCalled();
  });

  it('confirms and syncs an open NeuralRoam review surface before applying a Browser route switch', async () => {
    const queue = createQueue();
    const confirmRouteSwitchReviewReset = vi.fn(async () => true);
    const syncExistingNeuralReviewTabToCurrentNode = vi.fn(async () => 'synced' as const);
    const routeCommand = vi.fn(async () => createBackendRouteCommandResult('route-b', 'Route B'));
    const previewCard = ref<BrowserCard | null>(null);
    const controller = useNeuralBrowserController({
      getQueueById: vi.fn((id: string) => id === 'neural-roam' ? queue : null),
      loadCardsByBlockIds: vi.fn(async () => []) as never,
      getCardLoadOptions: () => ({}),
      previewCard,
      refreshQueueCounts: vi.fn(async () => undefined),
      runNeuralRoamCommand: routeCommand,
      readNeuralRoamViewState: async () => ({
        ...createBackendRouteCommandResult('route-b', 'Route B').viewState,
        currentNodeId: 'target-node',
        currentEventId: 'event-target',
        navigationState: {
          currentNodeId: 'target-node',
          currentEventId: 'event-target',
          sessionId: 'session-a',
          engineMode: 'orbit',
          navigationMode: 'explore',
          canReturnToBookmark: false,
          bookmarkNodeId: null,
          currentPathIndex: -1,
          pathLength: 0,
        },
      }),
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
    expect(routeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'switch-route', routeId: 'route-b' }));
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
