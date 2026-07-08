import { describe, expect, it, vi } from 'vitest';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import { ReviewAdmissionModule } from '../ReviewAdmissionModule';

const NOW = 1_779_300_000_000;

function createCounters(queueType = QueueType.RetrievalPractice) {
  return {
    queueType,
    policyHash: 'materialized-policy',
    generation: 12,
    version: 12,
    remaining: 2,
    due: 2,
    total: 2,
    buckets: { all: 2 },
    updatedAt: NOW,
  };
}

function createQueue(): Pick<IReviewQueue, 'getCards'> {
  return {
    getCards: vi.fn(async () => []),
  };
}

function createManager(overrides: Partial<UnifiedDataSourceManager>): UnifiedDataSourceManager {
  return {
    ensureQueueProjectionReady: vi.fn(),
    materializeQueueProjection: vi.fn(),
    getQueue: vi.fn(() => createQueue()),
    ...overrides,
  } as unknown as UnifiedDataSourceManager;
}

describe('ReviewAdmissionModule', () => {
  it('returns a ticket from a ready canonical projection without materializing', async () => {
    const manager = createManager({
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
        policyId: 'ready-policy',
        generation: 11,
      })),
    });
    const module = new ReviewAdmissionModule(manager);

    const ticket = await module.admitReviewSession({
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'topbar:retrieval-practice',
    });

    expect(ticket).toMatchObject({
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'topbar:retrieval-practice',
      projectionPolicyHash: 'ready-policy',
      projectionGeneration: 11,
      source: 'ready-projection',
      readinessRequest: {
        queueType: QueueType.RetrievalPractice,
        preset: 'all',
        searchText: null,
        docId: null,
        scopeDocIds: [],
        cardType: 'all',
        source: 'browser',
      },
    });
    expect(manager.materializeQueueProjection).not.toHaveBeenCalled();
    expect(manager.getQueue).not.toHaveBeenCalled();
  });

  it('materializes a recoverable projection and returns the materialized ticket', async () => {
    const queue = createQueue();
    const manager = createManager({
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'unavailable',
        queueId: QueueType.RetrievalPractice,
        policyId: 'stale-policy',
        cause: 'projection_unavailable',
        reason: 'projection snapshot unavailable',
        recoverable: true,
      })),
      materializeQueueProjection: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        policyHash: 'materialized-policy',
        generation: 12,
        status: 'ready',
        rows: 2,
        counters: createCounters(),
      })),
    });
    const module = new ReviewAdmissionModule(manager);

    const ticket = await module.admitReviewSession({
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'browser-toolbar:retrieval-practice',
      queueInstance: queue,
    });

    expect(ticket).toMatchObject({
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'browser-toolbar:retrieval-practice',
      projectionPolicyHash: 'materialized-policy',
      projectionGeneration: 12,
      source: 'materialized-projection',
    });
    expect(manager.materializeQueueProjection).toHaveBeenCalledWith(
      QueueType.RetrievalPractice,
      queue,
      expect.objectContaining({
        readinessRequest: expect.objectContaining({ queueType: QueueType.RetrievalPractice }),
        reason: 'review-admission',
      }),
    );
  });

  it('fails closed for unrecoverable projection readiness', async () => {
    const manager = createManager({
      ensureQueueProjectionReady: vi.fn(async () => ({
        status: 'unavailable',
        queueId: QueueType.RetrievalPractice,
        policyId: 'missing-policy',
        cause: 'backend_unavailable',
        reason: 'backend unavailable',
        recoverable: false,
      })),
    });
    const module = new ReviewAdmissionModule(manager);

    await expect(module.admitReviewSession({
      queueType: QueueType.RetrievalPractice,
    })).rejects.toThrow('REVIEW_ADMISSION_UNAVAILABLE');

    expect(manager.materializeQueueProjection).not.toHaveBeenCalled();
    expect(manager.getQueue).not.toHaveBeenCalled();
  });

  it('does not admit non projection-backed review queues', async () => {
    const manager = createManager({});
    const module = new ReviewAdmissionModule(manager);

    await expect(module.admitReviewSession({
      queueType: QueueType.FilterGroup,
    })).resolves.toBeNull();

    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
  });
});
