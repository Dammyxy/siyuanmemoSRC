import { describe, expect, it, vi } from 'vitest';
import {
  runNeuralClearHistory,
  runNeuralClearRouteHistory,
  runNeuralJump,
  runNeuralSetCurrentFocus,
  runNeuralToggleAnchor,
  runNeuralToggleSource,
} from '../neuralBrowserCommands';

function createDeps(queue: Record<string, unknown> | null = {}) {
  return {
    getQueue: vi.fn(() => queue as never),
    setSelectedTraceState: vi.fn(),
    previewNode: vi.fn(async () => undefined),
    refreshNeuralSubviewData: vi.fn(async () => undefined),
    refreshQueueCounts: vi.fn(async () => undefined),
    handoffReviewSurface: vi.fn(async () => undefined),
    pushMessage: vi.fn(async () => undefined),
    pushError: vi.fn(async () => undefined),
    confirmClearHistory: vi.fn(async () => true),
    resetHistoryRequest: vi.fn(),
    logError: vi.fn(),
  };
}

describe('neuralBrowserCommands', () => {
  it('jumps to a history node, refreshes browser state, previews current node, and hands off review', async () => {
    const queue = {
      jumpToHistoryNode: vi.fn(async () => true),
      getNavigationState: vi.fn(() => ({ currentNodeId: 'node-current' })),
    };
    const deps = createDeps(queue);

    await runNeuralJump('node-target', deps);

    expect(deps.setSelectedTraceState).toHaveBeenCalledWith({
      selectedTraceEventId: null,
      selectedTraceNodeId: 'node-target',
    });
    expect(deps.previewNode).toHaveBeenNthCalledWith(1, 'node-target');
    expect(queue.jumpToHistoryNode).toHaveBeenCalledWith('node-target');
    expect(deps.refreshNeuralSubviewData).toHaveBeenCalledTimes(1);
    expect(deps.refreshQueueCounts).toHaveBeenCalledTimes(1);
    expect(deps.previewNode).toHaveBeenNthCalledWith(2, 'node-current');
    expect(deps.handoffReviewSurface).toHaveBeenCalledWith('node-current');
    expect(deps.pushError).not.toHaveBeenCalled();
  });

  it('reports failed jumps after refresh while preserving preview flow', async () => {
    const queue = {
      jumpToHistoryNode: vi.fn(async () => false),
      getNavigationState: vi.fn(() => ({ currentNodeId: null })),
    };
    const deps = createDeps(queue);

    await runNeuralJump('node-target', deps);

    expect(deps.refreshNeuralSubviewData).toHaveBeenCalledTimes(1);
    expect(deps.pushError).toHaveBeenCalledWith('jumpHistoryNodeFailed:Failed to jump trajectory node');
    expect(deps.handoffReviewSurface).not.toHaveBeenCalled();
  });

  it('runs source, anchor, focus, and clear-history commands through injected queue deps', async () => {
    const queue = {
      setSourceEntry: vi.fn(async () => undefined),
      setAnchorEntry: vi.fn(async () => undefined),
      setCurrentFocus: vi.fn(async () => undefined),
      clearHistory: vi.fn(),
    };
    const deps = createDeps(queue);

    await runNeuralToggleSource('node-a', true, deps);
    await runNeuralToggleAnchor('node-a', false, deps);
    await runNeuralSetCurrentFocus('node-a', deps);
    await runNeuralClearHistory(deps);

    expect(queue.setSourceEntry).toHaveBeenCalledWith('node-a', true);
    expect(queue.setAnchorEntry).toHaveBeenCalledWith('node-a', false);
    expect(queue.setCurrentFocus).toHaveBeenCalledWith('node-a', {
      includeFocusAsFirst: false,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    expect(queue.clearHistory).toHaveBeenCalledWith('all');
    expect(deps.resetHistoryRequest).toHaveBeenCalledTimes(1);
    expect(deps.pushMessage).toHaveBeenCalledWith('historyClearedSuccess:轨迹历史已清空');
  });

  it('clears route history through the dedicated route confirmation', async () => {
    const queue = {
      clearRouteHistory: vi.fn(async () => undefined),
    };
    const deps = {
      ...createDeps(queue),
      confirmClearRouteHistory: vi.fn(async () => true),
    };

    await runNeuralClearRouteHistory(deps);

    expect(deps.confirmClearRouteHistory).toHaveBeenCalledTimes(1);
    expect(deps.confirmClearHistory).not.toHaveBeenCalled();
    expect(queue.clearRouteHistory).toHaveBeenCalledTimes(1);
    expect(deps.resetHistoryRequest).toHaveBeenCalledTimes(1);
    expect(deps.pushMessage).toHaveBeenCalledWith('routeHistoryClearedSuccess:航线日志已清空');
  });

  it('no-ops when neural queue is unavailable', async () => {
    const deps = createDeps(null);

    await runNeuralToggleSource('node-a', true, deps);
    await runNeuralToggleAnchor('node-a', true, deps);
    await runNeuralSetCurrentFocus('node-a', deps);
    await runNeuralClearHistory(deps);

    expect(deps.refreshNeuralSubviewData).not.toHaveBeenCalled();
    expect(deps.confirmClearHistory).not.toHaveBeenCalled();
  });
});
