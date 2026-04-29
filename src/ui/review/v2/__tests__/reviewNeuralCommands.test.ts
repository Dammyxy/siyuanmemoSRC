import { describe, expect, it, vi } from 'vitest';
import {
  buildReviewNeuralFocusMenuItems,
  buildReviewNeuralHistoryMenuItems,
  handleReviewNeuralToolbarAction,
} from '../reviewNeuralCommands';
import type {
  NeuralNavigationState,
  NeuralRoamHistoryEntry,
  NeuralRoamSessionQueue,
  NeuralRoamSourceEntry,
} from '@/types/unified-data-source';

const t = (_key: string, fallback: string) => fallback;

function navigationState(overrides: Partial<NeuralNavigationState> = {}): NeuralNavigationState {
  return {
    currentPathIndex: 0,
    currentNodeId: 'node-current',
    currentEventId: 'event-current',
    navigationMode: 'follow',
    engineMode: 'orbit',
    engineSessionId: 'engine-1',
    hasBookmark: true,
    pathLength: 3,
    sessionId: 'session-1',
    ...overrides,
  };
}

function sourceEntry(overrides: Partial<NeuralRoamSourceEntry> = {}): NeuralRoamSourceEntry {
  return {
    nodeId: 'source-1',
    nodePreview: 'Source one',
    nodeKind: 'concept',
    role: 'orbit-center',
    priority: 1,
    addedAt: 1,
    visitedAt: 2,
    ...overrides,
  };
}

function historyEntry(overrides: Partial<NeuralRoamHistoryEntry> = {}): NeuralRoamHistoryEntry {
  return {
    eventId: 'event-1',
    nodeId: 'history-1',
    focusId: null,
    sessionId: 'session-1',
    associationType: 'backlink',
    reason: '',
    visitedAt: 1,
    isVirtual: false,
    nodePreview: 'History one',
    traceQuality: 'exact',
    engineMode: 'orbit',
    sourceRole: null,
    sourceNodeId: null,
    sourceEventId: null,
    branchRootNodeId: null,
    activationKind: 'manual-jump',
    depth: 1,
    conductionScore: null,
    ...overrides,
  };
}

function createQueue(options?: {
  navState?: NeuralNavigationState;
  sources?: NeuralRoamSourceEntry[];
  history?: NeuralRoamHistoryEntry[];
}): NeuralRoamSessionQueue {
  let navState = options?.navState || navigationState();
  const history = options?.history || [historyEntry()];
  return {
    getEngineMode: vi.fn(() => navState.engineMode),
    setEngineMode: vi.fn(async (mode) => {
      navState = { ...navState, engineMode: mode };
    }),
    getSourceSnapshot: vi.fn(() => options?.sources || [sourceEntry()]),
    setSourceEntry: vi.fn(async () => undefined),
    injectExcerptIntoHyperspace: vi.fn(async () => true),
    getSeedSnapshot: vi.fn(() => []),
    setSeedEntry: vi.fn(async () => undefined),
    getAnchorSnapshot: vi.fn(() => []),
    setAnchorEntry: vi.fn(async () => undefined),
    clearAnchors: vi.fn(async () => undefined),
    getCurrentBatchSnapshot: vi.fn(() => null),
    getConceptBlocks: vi.fn(() => []),
    getFocusPoolSnapshot: vi.fn(() => []),
    setFocusPoolEntry: vi.fn(async () => undefined),
    clearFocusPool: vi.fn(async () => undefined),
    setCurrentFocus: vi.fn(async (nodeId) => {
      navState = { ...navState, currentNodeId: nodeId };
    }),
    startRoamingFromFocus: vi.fn(async () => undefined),
    getHistoryCount: vi.fn(() => history.length),
    getHistoryPage: vi.fn(() => ({ entries: history, totalCount: history.length, hasMore: false })),
    getHistorySnapshot: vi.fn(() => history),
    getHistoryEntryByEventId: vi.fn(() => null),
    getHistoryEntriesByNodeId: vi.fn(() => []),
    getHistoryHitCount: vi.fn(() => 0),
    getActivationTrace: vi.fn(() => null),
    getSessionFocusStack: vi.fn(() => []),
    getPinnedFocusBlocks: vi.fn(() => []),
    setPinnedFocusBlock: vi.fn(async () => undefined),
    jumpToHistoryNode: vi.fn(async () => true),
    getPathItemByNodeId: vi.fn(async () => null),
    getNavigationState: vi.fn(() => navState),
    setNavigationMode: vi.fn((mode) => {
      navState = { ...navState, navigationMode: mode };
    }),
    returnToBookmark: vi.fn(() => true),
    clearHistory: vi.fn(() => undefined),
  } as unknown as NeuralRoamSessionQueue;
}

describe('reviewNeuralCommands', () => {
  it('builds focus menu actions that start from and remove source nodes', async () => {
    const queue = createQueue({
      sources: [
        sourceEntry({ nodeId: 'old', nodePreview: 'Old', visitedAt: 1 }),
        sourceEntry({ nodeId: 'new', nodePreview: 'New', visitedAt: 3 }),
      ],
    });
    const loadCardByBlockId = vi.fn(async () => undefined);
    const refreshNavigationState = vi.fn();
    const showMessage = vi.fn();

    const items = buildReviewNeuralFocusMenuItems({
      t,
      neuralQueue: queue,
      loadCardByBlockId,
      refreshNavigationState,
      showMessage,
      logger: {},
      openNeuralBrowserSubview: vi.fn(),
    });

    expect(items[1].submenu?.map((item) => item.label)).toEqual([
      'New — 概念卡：轨道中心节点',
      'Old — 概念卡：轨道中心节点',
    ]);

    await items[1].submenu?.[0].click?.();
    expect(queue.setCurrentFocus).toHaveBeenCalledWith('new', {
      includeFocusAsFirst: true,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    expect(loadCardByBlockId).toHaveBeenCalledWith('new');
    expect(refreshNavigationState).toHaveBeenCalledTimes(1);

    await items[2].submenu?.[0].click?.();
    expect(queue.setSourceEntry).toHaveBeenCalledWith('new', false);
    expect(showMessage).toHaveBeenLastCalledWith('已移除概念卡：轨道中心 new', 3000, 'info');
  });

  it('handles neural toolbar mode changes and bookmark return', async () => {
    const queue = createQueue();
    const loadCardByBlockId = vi.fn(async () => undefined);
    const refreshNavigationState = vi.fn();
    const showMessage = vi.fn();

    await handleReviewNeuralToolbarAction('neural-nav-mode', {
      t,
      neuralQueue: queue,
      currentBlockId: 'block-1',
      loadCardByBlockId,
      refreshNavigationState,
      showMessage,
      logger: {},
    });

    expect(queue.setAnchorEntry).toHaveBeenCalledWith('block-1', true);
    expect(queue.setCurrentFocus).toHaveBeenCalledWith('block-1', {
      includeFocusAsFirst: false,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    expect(showMessage).toHaveBeenLastCalledWith('已切换为：自由航行', 2000, 'info');

    await handleReviewNeuralToolbarAction('neural-return-bookmark', {
      t,
      neuralQueue: queue,
      currentBlockId: 'block-1',
      loadCardByBlockId,
      refreshNavigationState,
      showMessage,
      logger: {},
    });

    expect(queue.returnToBookmark).toHaveBeenCalled();
    expect(loadCardByBlockId).toHaveBeenCalledWith('block-1');
  });

  it('builds history menu actions for jump and clear', async () => {
    const queue = createQueue({
      history: [historyEntry({ nodeId: 'history-1', nodePreview: 'History one' })],
    });
    const loadCardByBlockId = vi.fn(async () => undefined);
    const refreshNavigationState = vi.fn();
    const showMessage = vi.fn();

    const items = buildReviewNeuralHistoryMenuItems({
      t,
      neuralQueue: queue,
      loadCardByBlockId,
      refreshNavigationState,
      showMessage,
      logger: {},
      openNeuralBrowserSubview: vi.fn(),
    });

    await items[2].submenu?.[0].click?.();
    expect(queue.jumpToHistoryNode).toHaveBeenCalledWith('history-1');
    expect(loadCardByBlockId).toHaveBeenCalledWith('node-current');

    items[3].click?.();
    expect(queue.clearHistory).toHaveBeenCalledWith('all');
    expect(showMessage).toHaveBeenLastCalledWith('轨迹历史已清空', 3000, 'info');
  });
});
