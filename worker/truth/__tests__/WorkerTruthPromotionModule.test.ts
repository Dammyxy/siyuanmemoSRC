import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  STORAGE_MUTATION_ENVELOPE_VERSION,
  type StorageDurabilityReceipt,
  type StorageMutationEnvelope,
} from '../../../packages/contracts/src/backend-rpc';
import {
  WorkerTruthPromotionModule,
  type WorkerTruthPromotionJournalEntry,
  type WorkerTruthPromotionState,
} from '../WorkerTruthPromotionModule';

function journalEntry(sequence: number): WorkerTruthPromotionJournalEntry {
  const mutationEnvelope: StorageMutationEnvelope = {
    version: STORAGE_MUTATION_ENVELOPE_VERSION,
    mutationId: `mutation-${sequence}`,
    family: 'review',
    deviceId: 'device-A',
    identityEpoch: 'epoch-A',
    journalSequence: sequence,
    createdAt: sequence * 1_000,
    affectedAggregates: [{
      family: 'card-schedule',
      aggregateId: `card-${sequence}`,
      causalBaseRevision: null,
    }],
    operations: [],
    requiredTruthOutputs: [{
      family: 'review',
      kind: 'event',
      aggregateIds: [`card-${sequence}`],
    }],
  };
  const durabilityReceipt: StorageDurabilityReceipt = {
    version: STORAGE_DURABILITY_RECEIPT_VERSION,
    mutationId: mutationEnvelope.mutationId,
    family: mutationEnvelope.family,
    stage: 'journaled',
    journalSequence: sequence,
    affectedAggregates: mutationEnvelope.affectedAggregates,
    requiredTruthOutputs: mutationEnvelope.requiredTruthOutputs,
    truthGenerationId: null,
    retry: {
      attemptCount: 0,
      nextAttemptAt: null,
      lastError: null,
    },
    diagnosticCode: null,
    diagnosticMessage: null,
    updatedAt: sequence * 1_000,
  };
  return {
    createdAt: mutationEnvelope.createdAt,
    mutationEnvelope,
    durabilityReceipt,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('WorkerTruthPromotionModule', () => {
  it('promotes one bounded consecutive batch in journal sequence order', async () => {
    let state: WorkerTruthPromotionState | null = null;
    const publishBatch = vi.fn(async (entries: WorkerTruthPromotionJournalEntry[]) => ({
      generationId: 'review-events-v1',
      verifiedMutationIds: entries.map((entry) => entry.mutationEnvelope.mutationId),
    }));
    const module = new WorkerTruthPromotionModule({
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      maxBatchSize: 2,
      now: () => 10_000,
      journalSource: {
        listJournaledMutations: async () => [journalEntry(3), journalEntry(1), journalEntry(2)],
      },
      stateStore: {
        read: async () => state,
        write: async (nextState) => {
          state = structuredClone(nextState);
        },
      },
      publisher: { publishBatch },
    });

    const result = await module.promotePending();

    expect(publishBatch).toHaveBeenCalledTimes(1);
    expect(publishBatch.mock.calls[0][0].map((entry) => entry.mutationEnvelope.journalSequence)).toEqual([1, 2]);
    expect(result.promotedMutationIds).toEqual(['mutation-1', 'mutation-2']);
    expect(result.coveredJournalSequence).toBe(2);
    expect(state?.coverage).toMatchObject({
      coveredJournalSequence: 2,
      coveredMutationId: 'mutation-2',
      truthGenerationId: 'review-events-v1',
    });
  });

  it('allows storage recovery to request a larger bounded promotion batch', async () => {
    let state: WorkerTruthPromotionState | null = null;
    const publishBatch = vi.fn(async (entries: WorkerTruthPromotionJournalEntry[]) => ({
      generationId: 'review-events-v1',
      verifiedMutationIds: entries.map((entry) => entry.mutationEnvelope.mutationId),
    }));
    const module = new WorkerTruthPromotionModule({
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      maxBatchSize: 2,
      journalSource: {
        listJournaledMutations: async () => [
          journalEntry(1),
          journalEntry(2),
          journalEntry(3),
          journalEntry(4),
        ],
      },
      stateStore: {
        read: async () => state,
        write: async (nextState) => {
          state = structuredClone(nextState);
        },
      },
      publisher: { publishBatch },
    });

    await expect(module.promotePending({ maxBatchSize: 4 })).resolves.toMatchObject({
      ok: true,
      promotedMutationIds: ['mutation-1', 'mutation-2', 'mutation-3', 'mutation-4'],
      coveredJournalSequence: 4,
    });
    expect(publishBatch).toHaveBeenCalledOnce();
  });

  it('fails closed when the next journal sequence is missing', async () => {
    let state: WorkerTruthPromotionState | null = null;
    const publishBatch = vi.fn();
    const module = new WorkerTruthPromotionModule({
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      journalSource: {
        listJournaledMutations: async () => [journalEntry(2), journalEntry(3)],
      },
      stateStore: {
        read: async () => state,
        write: async (nextState) => {
          state = structuredClone(nextState);
        },
      },
      publisher: { publishBatch },
    });

    const result = await module.promotePending();

    expect(result).toMatchObject({
      ok: false,
      coveredJournalSequence: 0,
      error: 'journal-sequence-gap:1:2',
    });
    expect(publishBatch).not.toHaveBeenCalled();
    expect(state?.retry).toMatchObject({
      mutationId: 'mutation-2',
      journalSequence: 2,
      attemptCount: 1,
      lastError: 'journal-sequence-gap:1:2',
    });
  });

  it('keeps coverage unchanged after partial truth verification and retries idempotently', async () => {
    let state: WorkerTruthPromotionState | null = null;
    const publishBatch = vi.fn()
      .mockResolvedValueOnce({
        generationId: 'review-events-v1',
        verifiedMutationIds: ['mutation-1'],
      })
      .mockResolvedValueOnce({
        generationId: 'review-events-v1',
        verifiedMutationIds: ['mutation-1', 'mutation-2'],
      });
    const module = new WorkerTruthPromotionModule({
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      journalSource: {
        listJournaledMutations: async () => [journalEntry(1), journalEntry(2)],
      },
      stateStore: {
        read: async () => state,
        write: async (nextState) => {
          state = structuredClone(nextState);
        },
      },
      publisher: { publishBatch },
    });

    await expect(module.promotePending()).resolves.toMatchObject({
      ok: false,
      coveredJournalSequence: 0,
      error: 'truth-publication-incomplete-verification',
    });
    expect(state?.coverage).toBeNull();
    expect(state?.retry).toMatchObject({
      mutationId: 'mutation-1',
      attemptCount: 1,
    });

    await expect(module.promotePending()).resolves.toMatchObject({
      ok: true,
      promotedMutationIds: ['mutation-1', 'mutation-2'],
      coveredJournalSequence: 2,
    });
    expect(publishBatch).toHaveBeenCalledTimes(2);
    expect(state?.retry).toBeNull();
    expect(state?.coverage?.coveredJournalSequence).toBe(2);
  });

  it('waits for an active batch during shutdown and rejects new promotion intake', async () => {
    const publication = deferred<{
      generationId: string;
      verifiedMutationIds: string[];
    }>();
    const publishBatch = vi.fn(() => publication.promise);
    const module = new WorkerTruthPromotionModule({
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      journalSource: {
        listJournaledMutations: async () => [journalEntry(1)],
      },
      stateStore: {
        read: async () => null,
        write: async () => undefined,
      },
      publisher: { publishBatch },
    });

    const promotion = module.promotePending();
    await vi.waitFor(() => expect(publishBatch).toHaveBeenCalledOnce());
    let shutdownFinished = false;
    const shutdown = module.shutdown().then(() => {
      shutdownFinished = true;
    });
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);

    publication.resolve({
      generationId: 'review-events-v1',
      verifiedMutationIds: ['mutation-1'],
    });
    await expect(promotion).resolves.toMatchObject({ ok: true });
    await shutdown;
    await expect(module.promotePending()).resolves.toMatchObject({
      ok: false,
      error: 'truth-promotion-shutdown',
    });
  });

  it('serializes legacy maintenance publication behind active mutation promotion', async () => {
    const publication = deferred<{
      generationId: string;
      verifiedMutationIds: string[];
    }>();
    const order: string[] = [];
    const module = new WorkerTruthPromotionModule({
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      journalSource: {
        listJournaledMutations: async () => [journalEntry(1)],
      },
      stateStore: {
        read: async () => null,
        write: async () => undefined,
      },
      publisher: {
        publishBatch: async () => {
          order.push('promotion-start');
          const result = await publication.promise;
          order.push('promotion-end');
          return result;
        },
      },
    });

    const promotion = module.promotePending();
    await vi.waitFor(() => expect(order).toEqual(['promotion-start']));
    const maintenance = module.runExclusivePublication(async () => {
      order.push('maintenance');
      return 'done';
    });
    await Promise.resolve();
    expect(order).toEqual(['promotion-start']);

    publication.resolve({
      generationId: 'review-events-v1',
      verifiedMutationIds: ['mutation-1'],
    });
    await promotion;
    await expect(maintenance).resolves.toBe('done');
    expect(order).toEqual(['promotion-start', 'promotion-end', 'maintenance']);
  });

  it('advances a journaled receipt only after persisted coverage includes its sequence', async () => {
    let state: WorkerTruthPromotionState | null = null;
    const entry = journalEntry(1);
    const module = new WorkerTruthPromotionModule({
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      now: () => 5_000,
      journalSource: {
        listJournaledMutations: async () => [entry],
      },
      stateStore: {
        read: async () => state,
        write: async (nextState) => {
          state = structuredClone(nextState);
        },
      },
      publisher: {
        publishBatch: async () => ({
          generationId: 'review-events-v1',
          verifiedMutationIds: ['mutation-1'],
        }),
      },
    });

    await expect(module.resolveReceipt(entry.durabilityReceipt)).resolves.toMatchObject({
      stage: 'journaled',
      truthGenerationId: null,
    });
    await module.promotePending();
    await expect(module.resolveReceipt(entry.durabilityReceipt)).resolves.toMatchObject({
      stage: 'truth-committed',
      truthGenerationId: 'review-events-v1',
      retry: {
        attemptCount: 0,
        nextAttemptAt: null,
        lastError: null,
      },
    });
  });
});
