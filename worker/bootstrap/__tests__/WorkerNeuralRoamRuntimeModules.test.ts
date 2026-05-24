import { describe, expect, it, vi } from 'vitest';
import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamCommand,
} from '../../../packages/contracts/src/backend-rpc';
import {
  resolveWorkerNeuralRoamCommandRouteMismatch,
  resolveWorkerNeuralRoamRouteMismatch,
} from '../neuralRoamRoutePolicy';
import {
  applyWorkerNeuralRoamCommand,
} from '../neuralRoamCommandPolicy';
import {
  buildWorkerNeuralRoamViewState,
  readWorkerNeuralRoamCounters,
} from '../neuralRoamViewStateBuilder';
import {
  WorkerNeuralRoamAdvanceResultCache,
  buildWorkerNeuralRoamUnavailableAdvanceResult,
} from '../neuralRoamAdvancePolicy';

function createViewStateQueue(overrides: Record<string, unknown> = {}) {
  return {
    getActiveRouteId: vi.fn(() => 'route-a'),
    getNavigationState: vi.fn(() => ({
      sessionId: 'session-a',
      engineSessionId: null,
      engineMode: 'orbit',
      currentNodeId: 'node-current',
      currentEventId: 'event-current',
      navigationMode: 'explore',
      canReturnToBookmark: false,
      bookmarkNodeId: null,
      currentPathIndex: 1,
      pathLength: 2,
    })),
    getEngineMode: vi.fn(() => 'orbit'),
    getSize: vi.fn(async () => 4),
    getSourceSnapshot: vi.fn(() => [{ nodeId: 'source-a' }, { nodeId: 'source-b' }]),
    getAnchorSnapshot: vi.fn(() => [{ nodeId: 'anchor-a' }]),
    listRoutes: vi.fn(async () => [
      {
        id: 'route-a',
        name: 'Route A',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: ['source-a'],
        createdAt: 1,
        updatedAt: 2,
        lastUsedAt: 3,
        stats: {
          routeId: 'route-a',
          seedCount: 2,
          anchorCount: 1,
          historyCount: 2,
          totalPoolEntries: 3,
        },
        isActive: true,
      },
    ]),
    getHistoryPage: vi.fn(() => ({
      entries: [{ nodeId: 'engine-history' }],
      total: 1,
      offset: 0,
      limit: 200,
    })),
    getRouteHistoryPage: vi.fn(async () => ({
      entries: [{ nodeId: 'route-history' }],
      total: 1,
      offset: 0,
      limit: 200,
    })),
    getCurrentBatchSnapshot: vi.fn(() => ({
      kind: 'orbit-round',
      engineMode: 'orbit',
      viewedCount: 2,
      roundSize: 5,
      remainingCount: 3,
    })),
    ...overrides,
  };
}

describe('Worker NeuralRoam runtime modules', () => {
  it('resolves stale route identity with the existing mismatch reason and message', () => {
    expect(resolveWorkerNeuralRoamRouteMismatch({
      requestKind: 'advance',
      requestedRouteId: 'route-old',
      activeRouteId: 'route-new',
    })).toEqual({
      reason: 'route-mismatch',
      message: 'NeuralRoam advance request route is no longer active',
    });

    expect(resolveWorkerNeuralRoamRouteMismatch({
      requestKind: 'view-state',
      requestedRouteId: 'route-old',
      activeRouteId: 'route-new',
    })).toEqual({
      reason: 'route-mismatch',
      message: 'NeuralRoam view-state request route is no longer active',
    });
  });

  it('allows switch-route commands while rejecting stale route-scoped mutations', () => {
    const staleCommand: BackendNeuralRoamCommand = {
      type: 'set-anchor',
      nodeId: 'node-a',
      enabled: true,
      routeId: 'route-old',
    };
    expect(resolveWorkerNeuralRoamCommandRouteMismatch(staleCommand, 'route-new')).toEqual({
      reason: 'route-mismatch',
      message: 'NeuralRoam command route is no longer active',
    });

    const staleBatchSourceCommand: BackendNeuralRoamCommand = {
      type: 'set-sources',
      nodeIds: ['source-a'],
      enabled: true,
      routeId: 'route-old',
    };
    expect(resolveWorkerNeuralRoamCommandRouteMismatch(staleBatchSourceCommand, 'route-new')).toEqual({
      reason: 'route-mismatch',
      message: 'NeuralRoam command route is no longer active',
    });

    const switchRoute: BackendNeuralRoamCommand = {
      type: 'switch-route',
      routeId: 'route-old',
    };
    expect(resolveWorkerNeuralRoamCommandRouteMismatch(switchRoute, 'route-new')).toBeNull();
  });

  it('applies backend route commands through the queue command interface', async () => {
    const queue = {
      setAnchorEntry: vi.fn(async () => undefined),
      setCurrentFocus: vi.fn(async () => undefined),
    };

    await applyWorkerNeuralRoamCommand(queue, {
      type: 'set-anchor',
      nodeId: 'anchor-a',
      enabled: false,
      routeId: 'route-a',
    });
    await applyWorkerNeuralRoamCommand(queue, {
      type: 'set-current-focus',
      nodeId: 'focus-a',
      includeFocusAsFirst: true,
      resetHistory: true,
      bookmarkCurrentPath: true,
      routeId: 'route-a',
    });

    expect(queue.setAnchorEntry).toHaveBeenCalledWith('anchor-a', false);
    expect(queue.setCurrentFocus).toHaveBeenCalledWith('focus-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
      bookmarkCurrentPath: true,
    });
  });

  it('applies batch source route commands with duplicate normalization and explicit remove', async () => {
    const queue = {
      setSourceEntries: vi.fn(async () => undefined),
    };

    await applyWorkerNeuralRoamCommand(queue, {
      type: 'set-sources',
      nodeIds: ['source-a', 'source-a', '', 'source-b'],
      routeId: 'route-a',
    });
    await applyWorkerNeuralRoamCommand(queue, {
      type: 'set-sources',
      nodeIds: ['source-b'],
      enabled: false,
      routeId: 'route-a',
    });

    expect(queue.setSourceEntries).toHaveBeenNthCalledWith(1, ['source-a', 'source-b'], true);
    expect(queue.setSourceEntries).toHaveBeenNthCalledWith(2, ['source-b'], false);
  });

  it('builds backend view-state with route counters and progress semantics', async () => {
    const queue = createViewStateQueue();

    const counters = await readWorkerNeuralRoamCounters(queue);
    const viewState = await buildWorkerNeuralRoamViewState(queue, counters);

    expect(counters).toEqual({
      routeId: 'route-a',
      remaining: 4,
      due: 4,
      total: 4,
      pendingAssociatedReview: 2,
      sourceNodes: 2,
    });
    expect(viewState).toMatchObject({
      queueType: 'neural-roam',
      route: {
        id: 'route-a',
        name: 'Route A',
      },
      routes: [
        expect.objectContaining({
          id: 'route-a',
          isActive: true,
        }),
      ],
      counters,
      batchProgress: {
        kind: 'orbit-round',
        viewedCount: 2,
        totalCount: 5,
        remainingCount: 3,
        label: 'orbit-round',
      },
      engineHistory: [{ nodeId: 'engine-history' }],
      routeHistory: [{ nodeId: 'route-history' }],
    });
  });

  it('builds parity view-state surfaces for Orbit and Hyperspace engines', async () => {
    const createEngineQueue = (engineMode: 'orbit' | 'hyperspace') => createViewStateQueue({
      getNavigationState: vi.fn(() => ({
        sessionId: `${engineMode}-session`,
        engineSessionId: `${engineMode}-engine-session`,
        engineMode,
        currentNodeId: `${engineMode}-current`,
        currentEventId: `${engineMode}-event-current`,
        navigationMode: engineMode === 'orbit' ? 'explore' : 'source',
        canReturnToBookmark: false,
        bookmarkNodeId: null,
        currentPathIndex: 1,
        pathLength: 2,
      })),
      getEngineMode: vi.fn(() => engineMode),
      getSourceSnapshot: vi.fn(() => [
        { nodeId: `${engineMode}-source`, nodeKind: 'concept' },
      ]),
      getAnchorSnapshot: vi.fn(() => [
        { nodeId: `${engineMode}-anchor`, nodeKind: 'concept' },
      ]),
      getHistoryPage: vi.fn(() => ({
        entries: [{ nodeId: `${engineMode}-engine-history` }],
        total: 1,
        offset: 0,
        limit: 200,
      })),
      getRouteHistoryPage: vi.fn(async () => ({
        entries: [{ nodeId: `${engineMode}-route-history` }],
        total: 1,
        offset: 0,
        limit: 200,
      })),
      getCurrentBatchSnapshot: vi.fn(() => ({
        kind: engineMode === 'orbit' ? 'orbit-round' : 'hyperspace-depth',
        engineMode,
        viewedCount: engineMode === 'orbit' ? 2 : 1,
        roundSize: engineMode === 'orbit' ? 5 : 3,
        remainingCount: engineMode === 'orbit' ? 3 : 2,
      })),
    });
    const orbitViewState = await buildWorkerNeuralRoamViewState(createEngineQueue('orbit'));
    const hyperspaceViewState = await buildWorkerNeuralRoamViewState(createEngineQueue('hyperspace'));

    expect(orbitViewState).toMatchObject({
      engineMode: 'orbit',
      currentNodeId: 'orbit-current',
      sources: [{ nodeId: 'orbit-source' }],
      anchors: [{ nodeId: 'orbit-anchor' }],
      engineHistory: [{ nodeId: 'orbit-engine-history' }],
      routeHistory: [{ nodeId: 'orbit-route-history' }],
      batchProgress: {
        kind: 'orbit-round',
        viewedCount: 2,
        totalCount: 5,
        remainingCount: 3,
        label: 'orbit-round',
      },
      counters: {
        sourceNodes: 1,
        total: 4,
      },
    });
    expect(hyperspaceViewState).toMatchObject({
      engineMode: 'hyperspace',
      currentNodeId: 'hyperspace-current',
      sources: [{ nodeId: 'hyperspace-source' }],
      anchors: [{ nodeId: 'hyperspace-anchor' }],
      engineHistory: [{ nodeId: 'hyperspace-engine-history' }],
      routeHistory: [{ nodeId: 'hyperspace-route-history' }],
      batchProgress: {
        kind: 'hyperspace-depth',
        viewedCount: 1,
        totalCount: 3,
        remainingCount: 2,
        label: 'depth',
      },
      counters: {
        sourceNodes: 1,
        total: 4,
      },
    });
  });

  it('returns explicit unavailable advance results without static projection fallback', async () => {
    const cache = new WorkerNeuralRoamAdvanceResultCache();
    const request: BackendNeuralRoamAdvanceRequest = {
      queueType: 'neural-roam',
      routeId: 'route-missing',
      sessionId: 'session-missing',
      idempotencyKey: 'same-advance',
    };

    const result = await buildWorkerNeuralRoamUnavailableAdvanceResult({
      request,
      queue: null,
      reason: 'advance-contract-unavailable',
      message: 'NeuralRoam graph query host effect is unavailable',
    });

    expect(result).toMatchObject({
      queueType: 'neural-roam',
      routeId: 'route-missing',
      sessionId: 'session-missing',
      status: 'unavailable',
      nextItem: null,
      queueState: null,
      viewState: null,
      unavailableReason: 'advance-contract-unavailable',
      message: 'NeuralRoam graph query host effect is unavailable',
      counters: {
        remaining: 0,
        due: 0,
        total: 0,
        pendingAssociatedReview: 0,
        sourceNodes: 0,
      },
    });

    expect(cache.remember(request.idempotencyKey, result)).toBe(result);
    expect(cache.get(request.idempotencyKey)).toEqual(result);
  });
});
