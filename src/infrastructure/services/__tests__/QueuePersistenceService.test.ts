import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  type BackendQueueStateBatchMutateRequest,
} from '../../../../packages/contracts/src/backend-rpc';
import {
  QueuePersistenceError,
  QueuePersistenceService,
} from '../QueuePersistenceService';

describe('QueuePersistenceService', () => {
  it('loads and commits queue state through Worker durability receipts', async () => {
    const loadAll = vi.fn(async () => ({
      values: {
        retrievalPracticeQueue: { remaining: 1 },
      },
    }));
    const batchMutate = vi.fn(async (request: BackendQueueStateBatchMutateRequest) => ({
      updatedKeys: ['retrievalPracticeQueue'],
      deletedKeys: [],
      durabilityReceipt: createQueueReceipt(request.mutationId, ['retrievalPracticeQueue']),
    }));
    const service = new QueuePersistenceService(
      { loadAll, batchMutate },
      () => 'queue:test-persistence-1',
    );

    await service.init();
    expect(service.get<{ remaining: number }>('retrievalPracticeQueue')).toEqual({ remaining: 1 });

    await service.set('retrievalPracticeQueue', { remaining: 2 });

    expect(batchMutate).toHaveBeenCalledWith({
      mutationId: 'queue:test-persistence-1',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: { remaining: 2 },
      }],
    });
    expect(service.get('retrievalPracticeQueue')).toEqual({ remaining: 2 });
  });

  it('does not submit a Worker mutation when queue state is unchanged after cleanup', async () => {
    const loadAll = vi.fn(async () => ({
      values: {
        retrievalPracticeQueue: { remaining: 1 },
      },
    }));
    const batchMutate = vi.fn();
    const service = new QueuePersistenceService(
      { loadAll, batchMutate },
      () => 'queue:test-persistence-unchanged',
    );

    await service.init();
    await service.set('retrievalPracticeQueue', { remaining: 1 });

    expect(batchMutate).not.toHaveBeenCalled();
  });

  it('keeps prior queue cache when Worker durability fails', async () => {
    const loadAll = vi.fn(async () => ({
      values: {
        retrievalPracticeQueue: { remaining: 1 },
      },
    }));
    const batchMutate = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: queue writer offline');
    });
    const service = new QueuePersistenceService(
      { loadAll, batchMutate },
      () => 'queue:test-persistence-unavailable',
    );

    await service.init();
    await expect(service.set('retrievalPracticeQueue', { remaining: 2 }))
      .rejects.toThrow('BACKEND_UNAVAILABLE: queue writer offline');

    expect(service.get('retrievalPracticeQueue')).toEqual({ remaining: 1 });
  });

  it('fails closed when Worker queue state is unavailable', async () => {
    const service = new QueuePersistenceService({
      loadAll: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: queue reader offline');
      }),
      batchMutate: vi.fn(),
    });

    await expect(service.init()).rejects.toMatchObject({
      operation: 'init',
      key: 'all',
      message: expect.stringContaining('BACKEND_UNAVAILABLE: queue reader offline'),
    } satisfies Partial<QueuePersistenceError>);
  });
});

function createQueueReceipt(mutationId: string, aggregateIds: string[]) {
  return {
    version: STORAGE_DURABILITY_RECEIPT_VERSION,
    mutationId,
    family: 'queue' as const,
    stage: 'journaled' as const,
    journalSequence: 3,
    affectedAggregates: aggregateIds.map((aggregateId) => ({
      family: 'queue',
      aggregateId,
      causalBaseRevision: null,
    })),
    requiredTruthOutputs: [{
      family: 'queue',
      kind: 'changeset' as const,
      aggregateIds,
    }],
    truthGenerationId: null,
    retry: {
      attemptCount: 0,
      nextAttemptAt: null,
      lastError: null,
    },
    diagnosticCode: null,
    diagnosticMessage: null,
    updatedAt: 1_786_000_000_000,
  };
}
