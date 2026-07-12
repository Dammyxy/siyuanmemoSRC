import { describe, expect, it, vi } from 'vitest';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import {
  isValidReviewAdmissionTicket,
  ReviewAdmissionModule,
} from '../ReviewAdmissionModule';
import type { ProjectionQueueEntryTarget } from '../ReviewEntryTargetResolver';

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
    readQueueProjection: vi.fn(),
    repairQueueProjection: vi.fn(),
    getQueue: vi.fn(() => createQueue()),
    ...overrides,
  } as unknown as UnifiedDataSourceManager;
}

function createProjectionTarget(
  queueType: ProjectionQueueEntryTarget['queueType'] = QueueType.RetrievalPractice,
  entrySurface = 'topbar:retrieval-practice',
): ProjectionQueueEntryTarget {
  return {
    kind: 'projection-queue',
    queueType,
    entrySurface,
    admission: { kind: 'required' },
  };
}

describe('ReviewAdmissionModule', () => {
  it('returns a ticket from a ready canonical projection without materializing', async () => {
    const manager = createManager({
      readQueueProjection: vi.fn(async () => ({
        type: 'readiness',
        readiness: {
          status: 'ready',
          queueId: QueueType.RetrievalPractice,
          policyId: 'ready-policy',
          generation: 11,
        },
      })),
    });
    const module = new ReviewAdmissionModule(manager);
    const target = createProjectionTarget();

    const ticket = await module.admitReviewSession({
      target,
    });

    expect(ticket).toMatchObject({
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'topbar:retrieval-practice',
      entryTargetIdentity: 'projection-queue:retrieval-practice:topbar:retrieval-practice',
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
    expect(manager.repairQueueProjection).not.toHaveBeenCalled();
    expect(manager.getQueue).not.toHaveBeenCalled();
  });

  it('materializes a recoverable projection and returns the materialized ticket', async () => {
    const queue = createQueue();
    const manager = createManager({
      readQueueProjection: vi.fn(async () => ({
        type: 'readiness',
        readiness: {
          status: 'unavailable',
          queueId: QueueType.RetrievalPractice,
          policyId: 'stale-policy',
          cause: 'projection_unavailable',
          reason: 'projection snapshot unavailable',
          recoverable: true,
        },
      })),
      repairQueueProjection: vi.fn(async () => ({
        status: 'ready',
        queueType: QueueType.RetrievalPractice,
        policyHash: 'materialized-policy',
        generation: 12,
        result: {
          queueType: QueueType.RetrievalPractice,
          policyHash: 'materialized-policy',
          generation: 12,
          status: 'ready',
          rows: 2,
          counters: createCounters(),
        },
      })),
    });
    const module = new ReviewAdmissionModule(manager);
    const target = createProjectionTarget(
      QueueType.RetrievalPractice,
      'browser-toolbar:retrieval-practice',
    );

    const ticket = await module.admitReviewSession({
      target,
      queueInstance: queue,
    });

    expect(ticket).toMatchObject({
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'browser-toolbar:retrieval-practice',
      projectionPolicyHash: 'materialized-policy',
      projectionGeneration: 12,
      source: 'materialized-projection',
    });
    expect(manager.repairQueueProjection).toHaveBeenCalledWith(expect.objectContaining({
      type: 'materialize',
      queueType: QueueType.RetrievalPractice,
      queueOverride: queue,
      readinessRequest: expect.objectContaining({ queueType: QueueType.RetrievalPractice }),
      reason: 'review-admission',
    }));
  });

  it('admits explicit read-only recovery queue-state without materializing projection', async () => {
    const manager = createManager({
      readQueueProjection: vi.fn(async () => ({
        type: 'readiness',
        readiness: {
          status: 'unavailable',
          queueId: QueueType.RetrievalPractice,
          policyId: 'stale-policy',
          cause: 'projection_unavailable',
          reason: 'projection snapshot unavailable',
          recoverable: true,
        },
      })),
      repairQueueProjection: vi.fn(async () => {
        throw new Error('repair must not run during read-only recovery');
      }),
    });
    const module = new ReviewAdmissionModule(manager, {
      isStartupWriteCapable: () => false,
      now: () => NOW,
    });
    const target = createProjectionTarget(
      QueueType.RetrievalPractice,
      'browser-toolbar:retrieval-practice',
    );

    const ticket = await module.admitReviewSession({
      target,
      queueInstance: createQueue(),
    });

    expect(ticket).toMatchObject({
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'browser-toolbar:retrieval-practice',
      entryTargetIdentity: 'projection-queue:retrieval-practice:browser-toolbar:retrieval-practice',
      projectionPolicyHash: null,
      projectionGeneration: null,
      source: 'read-only-recovery-queue-state',
      admittedAt: NOW,
    });
    expect(manager.repairQueueProjection).not.toHaveBeenCalled();
    expect(manager.getQueue).not.toHaveBeenCalled();
    expect(isValidReviewAdmissionTicket(ticket, target)).toBe(true);
  });

  it('fails closed for unrecoverable projection readiness', async () => {
    const manager = createManager({
      readQueueProjection: vi.fn(async () => ({
        type: 'readiness',
        readiness: {
          status: 'unavailable',
          queueId: QueueType.RetrievalPractice,
          policyId: 'missing-policy',
          cause: 'backend_unavailable',
          reason: 'backend unavailable',
          recoverable: false,
        },
      })),
    });
    const module = new ReviewAdmissionModule(manager);
    const target = createProjectionTarget();

    await expect(module.admitReviewSession({
      target,
    })).rejects.toThrow('REVIEW_ADMISSION_UNAVAILABLE');

    expect(manager.repairQueueProjection).not.toHaveBeenCalled();
    expect(manager.getQueue).not.toHaveBeenCalled();
  });

  it('does not admit non projection-backed review queues', async () => {
    const manager = createManager({});
    const module = new ReviewAdmissionModule(manager);

    await expect(module.admitReviewSession({
      target: {
        kind: 'managed-queue',
        queueType: QueueType.FilterGroup,
        entrySurface: 'dialog-manager:filter-group',
        admission: { kind: 'not-required' },
      },
    })).resolves.toBeNull();

    expect(manager.readQueueProjection).not.toHaveBeenCalled();
  });

  it('rejects stale admission evidence from another resolved target', () => {
    const target = createProjectionTarget(
      QueueType.RetrievalPractice,
      'topbar:retrieval-practice',
    );
    const staleTicket = {
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'browser-toolbar:retrieval-practice',
      entryTargetIdentity: 'projection-queue:retrieval-practice:browser-toolbar:retrieval-practice',
      projectionPolicyHash: 'ready-policy',
      projectionGeneration: 11,
      readinessRequest: {
        queueType: QueueType.RetrievalPractice,
        preset: 'all',
        searchText: null,
        docId: null,
        scopeDocIds: [],
        cardType: 'all',
        source: 'browser',
      },
      admittedAt: NOW,
      source: 'ready-projection' as const,
    };

    expect(isValidReviewAdmissionTicket(staleTicket, target)).toBe(false);
  });
});
