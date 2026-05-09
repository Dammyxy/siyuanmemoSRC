import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueType, type IDataRouter } from '@/types/unified-data-source';
import { UnifiedDataSourceManager } from '../UnifiedDataSourceManager';

function createRouterWithBackend(
  backend: unknown,
  options: {
    rolloutState?: (queueType: QueueType) => string | null | undefined;
  } = {},
): IDataRouter {
  const plugin = {
    getContext: () => ({
      getSrsBackendClient: () => backend,
      getQueueProjectionRolloutState: options.rolloutState,
    }),
  };

  return {
    plugin,
    getCard: vi.fn(),
    getCards: vi.fn(async () => []),
    updateCard: vi.fn(async () => {}),
    deleteCard: vi.fn(async () => {}),
    getAvailableQueueTypes: vi.fn(() => Object.values(QueueType)),
  } as unknown as IDataRouter;
}

describe('UnifiedDataSourceManager queue projection rollout diagnostics', () => {
  beforeEach(() => {
    UnifiedDataSourceManager.resetInstance();
  });

  it('reports every review queue as backend-projection by default', () => {
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(null));

    const diagnostics = manager.getQueueProjectionRolloutDiagnostics();
    const diagnosticByQueue = new Map(diagnostics.map((entry) => [entry.queueType, entry]));

    for (const queueType of [
      QueueType.RetrievalPractice,
      QueueType.IncrementalLearning,
      QueueType.FilterGroup,
      QueueType.FinalDrill,
      QueueType.Leech,
      QueueType.NeuralRoam,
    ]) {
      expect(diagnosticByQueue.get(queueType)).toMatchObject({
        queueType,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
      });
    }
  });

  it('does not call backend projection RPC for queues explicitly rolled back to strategy reads', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        status: 'ready',
        rows: [],
        policyHash: 'unexpected',
        generation: 1,
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend, {
      rolloutState: (queueType) => queueType === QueueType.FilterGroup ? 'existing-queue-strategy' : null,
    }));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(backend.queueProjectionSnapshot).not.toHaveBeenCalled();
    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: false,
        state: 'existing-queue-strategy',
        readPath: 'existing-queue-strategy',
        reason: 'projection-rollout-pending',
      }),
    ]);
  });

  it('uses backend projection reads for deferred queues by default', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        status: 'ready',
        rows: [],
        counters: null,
        policyHash: 'filter-policy',
        generation: 2,
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toMatchObject({
      queueType: QueueType.FilterGroup,
      policyHash: 'filter-policy',
      generation: 2,
      rows: [],
      counters: null,
    });

    expect(backend.queueProjectionSnapshot).toHaveBeenCalledWith({ queueType: QueueType.FilterGroup });
    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
      }),
    ]);
  });

  it('reports projection-unavailable for a promoted deferred queue when backend is missing', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(null));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: 'backend-unavailable',
        unavailableReason: 'backend-unavailable',
      }),
    ]);
  });

  it.each([
    ['missing policy hash', { status: 'ready', policyHash: null, generation: 2 }],
    ['missing generation', { status: 'ready', policyHash: 'filter-policy', generation: null }],
    ['invalidated status', { status: 'invalidated', policyHash: 'filter-policy', generation: 2 }],
  ])('reports projection-unavailable for a promoted deferred queue with %s', async (_name, result) => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        rows: [],
        counters: null,
        ...result,
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: 'refresh-required',
        unavailableReason: 'refresh-required',
      }),
    ]);
  });
});
