import { describe, expect, it, vi } from 'vitest';
import {
  runNeuralReviewSurfaceHandoff,
  runNeuralReturnToBookmark,
  runNeuralToggleEngineMode,
  runNeuralToggleNavigationMode,
} from '../neuralNavigationCommands';

const t = (key: string, fallback: string) => `${key}:${fallback}`;

function createDeps(queue: Record<string, unknown> | null = {}) {
  return {
    getQueue: vi.fn(() => queue as never),
    setSelectedTraceState: vi.fn(),
    previewNode: vi.fn(async () => undefined),
    refreshNeuralSubviewData: vi.fn(async () => undefined),
    refreshQueueCounts: vi.fn(async () => undefined),
    pushMessage: vi.fn(async () => undefined),
    pushError: vi.fn(async () => undefined),
    t,
  };
}

describe('neuralNavigationCommands', () => {
  it('toggles engine mode and refreshes current node preview plus message', async () => {
    const queue = {
      getEngineMode: vi.fn(() => 'orbit'),
      setEngineMode: vi.fn(async () => undefined),
      getNavigationState: vi.fn(() => ({ currentNodeId: 'node-current' })),
    };
    const deps = createDeps(queue);

    await runNeuralToggleEngineMode(deps);

    expect(queue.setEngineMode).toHaveBeenCalledWith('hyperspace', { carryCurrentNode: true });
    expect(deps.refreshNeuralSubviewData).toHaveBeenCalledTimes(1);
    expect(deps.refreshQueueCounts).toHaveBeenCalledTimes(1);
    expect(deps.setSelectedTraceState).toHaveBeenCalledWith({
      selectedTraceEventId: null,
      selectedTraceNodeId: 'node-current',
    });
    expect(deps.previewNode).toHaveBeenCalledWith('node-current');
    expect(deps.pushMessage).toHaveBeenCalledWith(expect.stringContaining('engineModeSwitched:已切换引擎：'));
  });

  it('toggles navigation mode without queue count refresh', async () => {
    const queue = {
      getNavigationState: vi.fn(() => ({ navigationMode: 'follow' })),
      setNavigationMode: vi.fn(),
    };
    const deps = createDeps(queue);

    await runNeuralToggleNavigationMode(deps);

    expect(queue.setNavigationMode).toHaveBeenCalledWith('explore');
    expect(deps.refreshNeuralSubviewData).toHaveBeenCalledTimes(1);
    expect(deps.refreshQueueCounts).not.toHaveBeenCalled();
    expect(deps.pushMessage).toHaveBeenCalledWith('navModeSwitched:已切换为：navModeExplore:自由航行');
  });

  it('returns to bookmark and previews current node only when queue moves', async () => {
    const queue = {
      returnToBookmark: vi.fn(() => true),
      getNavigationState: vi.fn(() => ({ currentNodeId: 'node-bookmark' })),
    };
    const deps = createDeps(queue);

    await runNeuralReturnToBookmark(deps);

    expect(deps.refreshNeuralSubviewData).toHaveBeenCalledTimes(1);
    expect(deps.refreshQueueCounts).toHaveBeenCalledTimes(1);
    expect(deps.previewNode).toHaveBeenCalledWith('node-bookmark');
  });

  it('handles review handoff results with dialog close and failure message', async () => {
    const close = vi.fn();
    const pushError = vi.fn(async () => undefined);

    await runNeuralReviewSurfaceHandoff({
      result: 'tab',
      mode: 'dialog',
      close,
      pushError,
      t,
    });
    await runNeuralReviewSurfaceHandoff({
      result: 'failed',
      mode: 'tab',
      close,
      pushError,
      t,
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(pushError).toHaveBeenCalledWith('syncOpenReviewTabFailed:Failed to sync the open review tab');
  });
});
