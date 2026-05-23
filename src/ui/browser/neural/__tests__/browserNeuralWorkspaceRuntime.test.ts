import { describe, expect, it, vi } from 'vitest';
import type {
  BackendNeuralRoamCommand,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewState,
} from '../../../../../packages/contracts/src/backend-rpc';
import { createBrowserNeuralWorkspaceRuntime } from '../browserNeuralWorkspaceRuntime';

const t = (key: string, fallback: string) => `${key}:${fallback}`;

function createViewState(): BackendNeuralRoamViewState {
  return {
    version: 1,
    queueType: 'neural-roam',
    route: {
      id: 'route-a',
      name: 'Route A',
      temporary: false,
      previousRouteId: null,
    },
    routes: [],
    engineMode: 'orbit',
    currentNodeId: 'node-a',
    currentEventId: 'event-a',
    navigationState: {
      currentNodeId: 'node-a',
      currentEventId: 'event-a',
      sessionId: 'session-a',
      engineMode: 'orbit',
      navigationMode: 'explore',
    },
    counters: {
      routeId: 'route-a',
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
  };
}

function createCommandResult(overrides: Partial<BackendNeuralRoamCommandResult> = {}): BackendNeuralRoamCommandResult {
  return {
    queueType: 'neural-roam',
    status: 'ok',
    viewState: createViewState(),
    queueState: null,
    unavailableReason: null,
    message: null,
    ...overrides,
  } as BackendNeuralRoamCommandResult;
}

describe('browserNeuralWorkspaceRuntime', () => {
  it('reads backend NeuralRoam view-state through the manager command/read interface', async () => {
    const viewState = createViewState();
    const readNeuralRoamViewState = vi.fn(async () => ({
      queueType: 'neural-roam' as const,
      status: 'ready' as const,
      viewState,
      unavailableReason: null,
      message: null,
    }));
    const runtime = createBrowserNeuralWorkspaceRuntime({
      getManager: () => ({ readNeuralRoamViewState }),
      t,
    });

    await expect(runtime.readViewState()).resolves.toBe(viewState);

    expect(readNeuralRoamViewState).toHaveBeenCalledWith({ queueType: 'neural-roam' });
  });

  it('returns explicit unavailable when backend command capability is missing', async () => {
    const runtime = createBrowserNeuralWorkspaceRuntime({
      getManager: () => ({}),
      t,
    });
    const command: BackendNeuralRoamCommand = { type: 'set-source', nodeId: 'node-a', enabled: true };

    const result = await runtime.runCommand(command);

    expect(result).toMatchObject({
      queueType: 'neural-roam',
      status: 'unavailable',
      viewState: null,
      queueState: null,
      unavailableReason: 'advance-contract-unavailable',
      message: 'neuralRoamEntryActionUnavailable:神经漫游动作不可用',
    });
  });

  it('preserves backend unavailable command messages instead of synthesizing local fallback work', async () => {
    const unavailable = createCommandResult({
      status: 'mismatch',
      viewState: null,
      unavailableReason: 'route-mismatch',
      message: 'NeuralRoam command route is no longer active',
    });
    const neuralRoamCommand = vi.fn(async () => unavailable);
    const runtime = createBrowserNeuralWorkspaceRuntime({
      getManager: () => ({ neuralRoamCommand }),
      t,
    });

    const result = await runtime.runCommand({ type: 'set-anchor', nodeId: 'node-a', enabled: false });

    expect(result).toBe(unavailable);
    expect(neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'set-anchor', nodeId: 'node-a', enabled: false },
    });
  });

  it('returns null view-state when backend read capability is unavailable', async () => {
    const runtime = createBrowserNeuralWorkspaceRuntime({
      getManager: () => null,
      t,
    });

    await expect(runtime.readViewState()).resolves.toBeNull();
  });
});
