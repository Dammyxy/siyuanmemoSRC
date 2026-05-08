import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueType, type IDataRouter } from '@/types/unified-data-source';
import { UnifiedDataSourceManager } from '../UnifiedDataSourceManager';

function createRouterWithBackend(backend: unknown): IDataRouter {
  const plugin = {
    getContext: () => ({
      getSrsBackendClient: () => backend,
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

  it('reports projection-backed queues separately from existing strategy-read queues', () => {
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(null));

    const diagnostics = manager.getQueueProjectionRolloutDiagnostics();
    const diagnosticByQueue = new Map(diagnostics.map((entry) => [entry.queueType, entry]));

    expect(diagnosticByQueue.get(QueueType.RetrievalPractice)).toMatchObject({
      queueType: QueueType.RetrievalPractice,
      projectionBacked: true,
      readPath: 'backend-projection',
      reason: 'rollout-enabled',
    });
    expect(diagnosticByQueue.get(QueueType.IncrementalLearning)).toMatchObject({
      queueType: QueueType.IncrementalLearning,
      projectionBacked: true,
      readPath: 'backend-projection',
      reason: 'rollout-enabled',
    });

    for (const queueType of [
      QueueType.FilterGroup,
      QueueType.FinalDrill,
      QueueType.Leech,
      QueueType.NeuralRoam,
    ]) {
      expect(diagnosticByQueue.get(queueType)).toMatchObject({
        queueType,
        projectionBacked: false,
        readPath: 'existing-queue-strategy',
        reason: 'projection-rollout-pending',
      });
    }
  });

  it('does not call backend projection RPC for queues that are still on strategy reads', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        status: 'ready',
        rows: [],
        policyHash: 'unexpected',
        generation: 1,
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(backend.queueProjectionSnapshot).not.toHaveBeenCalled();
    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: false,
        readPath: 'existing-queue-strategy',
        reason: 'projection-rollout-pending',
      }),
    ]);
  });
});
