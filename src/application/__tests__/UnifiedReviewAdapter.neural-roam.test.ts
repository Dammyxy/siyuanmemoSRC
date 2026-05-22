import { describe, expect, it, vi } from 'vitest';
import { UnifiedReviewAdapter } from '@/application/adapters/UnifiedReviewAdapter';
import { QueueType, type NeuralRoamBatchSnapshot } from '@/types/unified-data-source';
import type { BackendNeuralRoamViewState } from '../../../packages/contracts/src/backend-rpc';

function createOrbitBatchSnapshot(overrides: Partial<NeuralRoamBatchSnapshot> = {}): NeuralRoamBatchSnapshot {
  return {
    kind: 'orbit-round',
    engineMode: 'orbit',
    navigationState: {
      currentPathIndex: 0,
      currentNodeId: 'local-node',
      currentEventId: 'local-event',
      navigationMode: 'explore',
      engineMode: 'orbit',
      engineSessionId: 'orbit-session',
      hasBookmark: false,
      pathLength: 1,
      sessionId: 'orbit-session',
    },
    focusNodeId: 'local-focus',
    focusNodePreview: 'Local Focus',
    currentNodeId: 'local-node',
    roundSize: 12,
    viewedCount: 9,
    remainingCount: 3,
    roundNodes: [],
    recentPath: [],
    sourceSnapshot: [],
    seedSnapshot: [],
    anchorSnapshot: [],
    ...overrides,
  };
}

function createBackendViewState(overrides: Partial<BackendNeuralRoamViewState> = {}): BackendNeuralRoamViewState {
  return {
    version: 1,
    queueType: 'neural-roam',
    route: {
      id: 'route-a',
      name: 'Route A',
      temporary: false,
      previousRouteId: null,
    },
    engineMode: 'orbit',
    currentNodeId: 'backend-node',
    currentEventId: 'backend-event',
    navigationState: createOrbitBatchSnapshot().navigationState as unknown as Record<string, unknown>,
    counters: {
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
      kind: 'orbit-round',
      viewedCount: 2,
      totalCount: 5,
      remainingCount: 3,
      label: 'orbit-round',
    },
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('UnifiedReviewAdapter neural-roam backend view state', () => {
  it('uses backend orbit progress instead of stale local batch snapshot for review header counts', async () => {
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const queue = {
      getType: () => QueueType.NeuralRoam,
      getStats: vi.fn(async () => ({ size: 2, label: '已看 2', extra: '本轮总数 5' })),
      getCounterSnapshot: vi.fn(async () => null),
      getUnderlyingQueue: () => ({
        getNavigationState: () => createOrbitBatchSnapshot().navigationState,
        getCurrentBatchSnapshot: () => createOrbitBatchSnapshot(),
        getBackendViewState: () => createBackendViewState(),
      }),
    };

    const state = await adapter.fetchAuxiliaryData(null, queue as never, { showAnswer: false } as never);

    expect(state.header?.counterSummary).toMatchObject({
      kind: 'value',
      label: '已看',
      value: 2,
    });
    expect(state.header?.stats.label).toBe('已看 2/5');
  });
});
