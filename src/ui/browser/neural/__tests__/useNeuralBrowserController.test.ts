import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type {
  NeuralActivationTrace,
  NeuralNavigationState,
  NeuralRoamHistoryEntry,
} from '@/types/unified-data-source';
import type { BrowserCard } from '../../types';
import { useNeuralBrowserController } from '../useNeuralBrowserController';

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

function createController(queue: Record<string, unknown> | null = createQueue()) {
  const previewCard = ref<BrowserCard | null>(null);
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
    refreshQueueCounts: vi.fn(async () => undefined),
    getReviewSurfaceDeps: () => ({}),
    confirmClearHistory: vi.fn(async () => true),
    close: vi.fn(),
    getMode: () => 'tab',
    pushMessage: vi.fn(async () => undefined),
    pushError: vi.fn(async () => undefined),
    logError: vi.fn(),
    t,
    historyPageSize: 2,
  });
  return { controller, previewCard, loadCardsByBlockIds };
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
});
