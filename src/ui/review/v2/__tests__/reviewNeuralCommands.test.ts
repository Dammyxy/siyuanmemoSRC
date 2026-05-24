import { describe, expect, it, vi } from 'vitest';
import {
  buildReviewNeuralEngineModeMenuItems,
  buildReviewNeuralFocusMenuItems,
  buildReviewNeuralHistoryMenuItems,
  handleReviewNeuralEngineModeSelection,
  handleReviewNeuralToolbarAction,
} from '../reviewNeuralCommands';
import type {
  NeuralNavigationState,
  NeuralRoamHistoryEntry,
  NeuralRoamSessionQueue,
  NeuralRoamSourceEntry,
} from '@/types/unified-data-source';
import type {
  BackendNeuralRoamCommand,
  BackendNeuralRoamCommandResult,
} from '../../../../../packages/contracts/src/backend-rpc';

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
    clearHistory: vi.fn(async () => undefined),
  } as unknown as NeuralRoamSessionQueue;
}

function commandResult(): BackendNeuralRoamCommandResult {
  return {
    queueType: 'neural-roam',
    status: 'ok',
    viewState: null,
    queueState: null,
  };
}

function createCommandRunner() {
  return vi.fn(async (_command: BackendNeuralRoamCommand) => commandResult());
}

describe('reviewNeuralCommands', () => {
  it('builds a Neural Roam picker without Semantic Activation', async () => {
    const onSelect = vi.fn(async () => undefined);
    const items = buildReviewNeuralEngineModeMenuItems({
      t,
      currentMode: 'orbit',
      onSelect,
    });

    expect(items.map((item) => item.label)).toEqual([
      'Orbit ✓',
      'Hyperspace Expedition',
    ]);
    expect(items[0].disabled).toBe(true);

    await items[1].click?.();
    expect(onSelect).toHaveBeenCalledWith('hyperspace');
  });

  it('routes Orbit and Hyperspace selections through the existing engine switch path', async () => {
    const queue = createQueue({ navState: navigationState({ engineMode: 'orbit' }) });
    const persistPreferredMode = vi.fn(async () => undefined);
    const loadCardByBlockId = vi.fn(async () => undefined);
    const refreshNavigationState = vi.fn();
    const runNeuralRoamCommand = createCommandRunner();

    await handleReviewNeuralEngineModeSelection({
      t,
      selectedMode: 'hyperspace',
      neuralQueue: queue,
      currentBlockId: 'block-1',
      loadCardByBlockId,
      refreshNavigationState,
      showMessage: vi.fn(),
      logger: {},
      persistPreferredMode,
      runNeuralRoamCommand,
    });

    expect(persistPreferredMode).toHaveBeenCalledWith('hyperspace');
    expect(runNeuralRoamCommand).toHaveBeenCalledWith({
      type: 'switch-engine-mode',
      mode: 'hyperspace',
      carryCurrentNode: true,
    });
    expect(queue.setEngineMode).not.toHaveBeenCalled();
    expect(refreshNavigationState).toHaveBeenCalledTimes(1);
    expect(loadCardByBlockId).toHaveBeenCalledWith('node-current');
  });

  it('coerces direct Semantic Activation selection to Orbit', async () => {
    const queue = createQueue({ navState: navigationState({ engineMode: 'hyperspace' }) });
    const persistPreferredMode = vi.fn(async () => undefined);
    const runNeuralRoamCommand = createCommandRunner();

    await handleReviewNeuralEngineModeSelection({
      t,
      selectedMode: 'semantic-activation',
      neuralQueue: queue,
      currentBlockId: 'block-1',
      loadCardByBlockId: vi.fn(async () => undefined),
      refreshNavigationState: vi.fn(),
      showMessage: vi.fn(),
      logger: {},
      persistPreferredMode,
      runNeuralRoamCommand,
    });

    expect(persistPreferredMode).toHaveBeenCalledWith('orbit');
    expect(runNeuralRoamCommand).toHaveBeenCalledWith({
      type: 'switch-engine-mode',
      mode: 'orbit',
      carryCurrentNode: true,
    });
    expect(queue.setEngineMode).not.toHaveBeenCalled();
  });

  it('does not mutate local queue when backend command runner is missing', async () => {
    const queue = createQueue({ navState: navigationState({ engineMode: 'orbit' }) });
    const showMessage = vi.fn();

    await handleReviewNeuralEngineModeSelection({
      t,
      selectedMode: 'hyperspace',
      neuralQueue: queue,
      currentBlockId: 'block-1',
      loadCardByBlockId: vi.fn(async () => undefined),
      refreshNavigationState: vi.fn(),
      showMessage,
      logger: {},
      persistPreferredMode: vi.fn(async () => undefined),
    });

    expect(queue.setEngineMode).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith('神经漫游动作不可用', 3000, 'error');
  });

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
    const runNeuralRoamCommand = createCommandRunner();

    const items = buildReviewNeuralFocusMenuItems({
      t,
      neuralQueue: queue,
      loadCardByBlockId,
      refreshNavigationState,
      showMessage,
      logger: {},
      openNeuralBrowserSubview: vi.fn(),
      runNeuralRoamCommand,
    });

    expect(items[1].submenu?.map((item) => item.label)).toEqual([
      'New — 概念卡：轨道中心节点',
      'Old — 概念卡：轨道中心节点',
    ]);

    await items[1].submenu?.[0].click?.();
    expect(runNeuralRoamCommand).toHaveBeenCalledWith({
      type: 'set-current-focus',
      nodeId: 'new',
      includeFocusAsFirst: true,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    expect(queue.setCurrentFocus).not.toHaveBeenCalled();
    expect(loadCardByBlockId).toHaveBeenCalledWith('new');
    expect(refreshNavigationState).toHaveBeenCalledTimes(1);

    await items[2].submenu?.[0].click?.();
    expect(runNeuralRoamCommand).toHaveBeenCalledWith({
      type: 'set-source',
      nodeId: 'new',
      enabled: false,
    });
    expect(queue.setSourceEntry).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenLastCalledWith('已移除概念卡：轨道中心 new', 3000, 'info');
  });

  it('handles neural toolbar mode changes and bookmark return', async () => {
    const queue = createQueue();
    const loadCardByBlockId = vi.fn(async () => undefined);
    const refreshNavigationState = vi.fn();
    const showMessage = vi.fn();
    const runNeuralRoamCommand = createCommandRunner();

    await handleReviewNeuralToolbarAction('neural-nav-mode', {
      t,
      neuralQueue: queue,
      currentBlockId: 'block-1',
      loadCardByBlockId,
      refreshNavigationState,
      showMessage,
      logger: {},
      runNeuralRoamCommand,
    });

    expect(runNeuralRoamCommand).toHaveBeenCalledWith({
      type: 'set-anchor',
      nodeId: 'block-1',
      enabled: true,
    });
    expect(runNeuralRoamCommand).toHaveBeenCalledWith({
      type: 'set-current-focus',
      nodeId: 'block-1',
      includeFocusAsFirst: false,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    expect(queue.setAnchorEntry).not.toHaveBeenCalled();
    expect(queue.setCurrentFocus).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenLastCalledWith('已切换为：自由航行', 2000, 'info');

    await handleReviewNeuralToolbarAction('neural-return-bookmark', {
      t,
      neuralQueue: queue,
      currentBlockId: 'block-1',
      loadCardByBlockId,
      refreshNavigationState,
      showMessage,
      logger: {},
      runNeuralRoamCommand,
    });

    expect(runNeuralRoamCommand).toHaveBeenCalledWith({ type: 'return-to-bookmark' });
    expect(queue.returnToBookmark).not.toHaveBeenCalled();
    expect(loadCardByBlockId).toHaveBeenCalledWith('node-current');
  });

  it('builds history menu actions for jump and clear', async () => {
    const queue = createQueue({
      history: [historyEntry({ nodeId: 'history-1', nodePreview: 'History one' })],
    });
    const loadCardByBlockId = vi.fn(async () => undefined);
    const refreshNavigationState = vi.fn();
    const showMessage = vi.fn();
    const openNeuralBrowserSubview = vi.fn();
    const runNeuralRoamCommand = createCommandRunner();

    const items = buildReviewNeuralHistoryMenuItems({
      t,
      neuralQueue: queue,
      loadCardByBlockId,
      refreshNavigationState,
      showMessage,
      logger: {},
      openNeuralBrowserSubview,
      runNeuralRoamCommand,
    });

    items[0].click?.();
    items[1].click?.();
    expect(openNeuralBrowserSubview).toHaveBeenNthCalledWith(1, 'engine-history');
    expect(openNeuralBrowserSubview).toHaveBeenNthCalledWith(2, 'roam-history');

    await items[3].submenu?.[0].click?.();
    expect(runNeuralRoamCommand).toHaveBeenCalledWith({
      type: 'jump-history-node',
      nodeId: 'history-1',
    });
    expect(queue.jumpToHistoryNode).not.toHaveBeenCalled();
    expect(loadCardByBlockId).toHaveBeenCalledWith('node-current');

    await items[4].click?.();
    expect(runNeuralRoamCommand).toHaveBeenCalledWith({
      type: 'clear-history',
      scope: 'all',
    });
    expect(queue.clearHistory).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenLastCalledWith('轨迹历史已清空', 3000, 'info');
  });
});
