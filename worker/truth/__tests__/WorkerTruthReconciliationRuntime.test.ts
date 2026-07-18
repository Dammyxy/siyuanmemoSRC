import { describe, expect, it, vi } from 'vitest';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../MessagePackTruthSegmentStore';
import { MessagePackTruthSnapshotGenerationStore } from '../MessagePackTruthSnapshotGenerationStore';
import { WorkerTruthReconciliationRuntime } from '../WorkerTruthReconciliationRuntime';

function createTrackedFileStore(): MessagePackTruthSegmentFileStore & {
  writeJSON: ReturnType<typeof vi.fn>;
  writeBinary: ReturnType<typeof vi.fn>;
} {
  const json = new Map<string, unknown>();
  const binary = new Map<string, Uint8Array>();
  return {
    async readJSON<T>(path: string): Promise<T | null> {
      return (json.get(path) as T | undefined) ?? null;
    },
    writeJSON: vi.fn(async (path: string, value: unknown): Promise<void> => {
      json.set(path, structuredClone(value));
    }),
    async readBinary(path: string): Promise<Uint8Array | null> {
      const value = binary.get(path);
      return value ? new Uint8Array(value) : null;
    },
    writeBinary: vi.fn(async (path: string, value: Uint8Array): Promise<void> => {
      binary.set(path, new Uint8Array(value));
    }),
    async listFiles(prefix: string): Promise<string[]> {
      return [...new Set([...json.keys(), ...binary.keys()])]
        .filter((path) => path.startsWith(prefix))
        .sort();
    },
  };
}

describe('WorkerTruthReconciliationRuntime', () => {
  it('keeps the prior device namespace read-only after complete identity loss creates a new epoch', async () => {
    const fileStore = createTrackedFileStore();
    const local = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-local',
      generationId: 'review-events-v1',
      schemaVersion: 1,
    });
    const prior = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-prior',
      generationId: 'review-events-v1',
      schemaVersion: 1,
    });
    await local.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'storage.review.append.v1',
      idempotencyKey: 'review-local',
      mutationId: 'mutation-local',
      deviceId: 'device-local',
      identityEpoch: 'epoch-local',
      logicalTime: 1,
      recordedAt: 1,
    }]);
    await prior.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'storage.review.append.v1',
      idempotencyKey: 'review-prior',
      mutationId: 'mutation-prior',
      deviceId: 'device-prior',
      identityEpoch: 'epoch-prior',
      logicalTime: 2,
      recordedAt: 2,
    }]);
    const jsonWritesBefore = fileStore.writeJSON.mock.calls.length;
    const binaryWritesBefore = fileStore.writeBinary.mock.calls.length;

    const runtime = new WorkerTruthReconciliationRuntime({
      fileStore,
      localDeviceId: 'device-local',
      localIdentityEpoch: 'epoch-local',
      schemaVersion: 1,
    });
    const inspection = await runtime.inspectSources();

    expect(inspection.diagnostics).toEqual([]);
    expect(inspection.sources.map((source) => ({
      deviceId: source.deviceId,
      identityEpoch: source.identityEpoch,
      writable: source.writable,
      mutationIds: source.records.map((record) => record.mutationId),
    }))).toEqual([
      {
        deviceId: 'device-local',
        identityEpoch: 'epoch-local',
        writable: true,
        mutationIds: ['mutation-local'],
      },
      {
        deviceId: 'device-prior',
        identityEpoch: 'epoch-prior',
        writable: false,
        mutationIds: ['mutation-prior'],
      },
    ]);
    expect(fileStore.writeJSON).toHaveBeenCalledTimes(jsonWritesBefore);
    expect(fileStore.writeBinary).toHaveBeenCalledTimes(binaryWritesBefore);
  });

  it('publishes verified reconciliation generations before rebuilding projections', async () => {
    const fileStore = createTrackedFileStore();
    const deviceA = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      schemaVersion: 1,
    });
    const deviceB = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-B',
      generationId: 'card-memory-facts-v1',
      schemaVersion: 1,
    });
    await deviceA.appendRecords([cardRecord('mutation-A', 'card-A', 'revision-A', 1)]);
    await deviceB.appendRecords([cardRecord('mutation-B', 'card-B', 'revision-B', 2)]);
    const rebuildProjection = vi.fn(async () => undefined);
    const runtime = new WorkerTruthReconciliationRuntime({
      fileStore,
      localDeviceId: 'device-A',
      localIdentityEpoch: 'epoch-A',
      schemaVersion: 1,
      rebuildProjection,
    });

    const publication = await runtime.reconcile();

    expect(publication.reconciliation.acceptedMutationIds).toEqual(['mutation-A', 'mutation-B']);
    expect(publication.generationIds.card).toMatch(/^reconcile-card-memory-facts-/);
    expect(publication.projectionRebuilt).toBe(true);
    expect(rebuildProjection).toHaveBeenCalledTimes(1);
    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      schemaVersion: 1,
    });
    const inspection = await generationStore.inspectGenerations();
    expect(inspection.fence.current?.generationId).toBe(publication.generationIds.card);
    await expect(
      generationStore.replayVerifiedGeneration(inspection.fence.current!),
    ).resolves.toMatchObject({
      records: [
        expect.objectContaining({ aggregateId: 'card-A' }),
        expect.objectContaining({ aggregateId: 'card-B' }),
      ],
    });
  });

  it('keeps the current equivalent generation when a deterministic reconcile generation is previous', async () => {
    const fileStore = createTrackedFileStore();
    const source = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      schemaVersion: 1,
    });
    await source.appendRecords([cardRecord('mutation-A', 'card-A', 'revision-A', 1)]);
    const runtime = new WorkerTruthReconciliationRuntime({
      fileStore,
      localDeviceId: 'device-A',
      localIdentityEpoch: 'epoch-A',
      schemaVersion: 1,
    });
    const first = await runtime.reconcile();
    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      schemaVersion: 1,
    });
    const firstInspection = await generationStore.inspectGenerations();
    const firstReplay = await generationStore.replayVerifiedGeneration(firstInspection.fence.current!);
    await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-equivalent',
      records: firstReplay.records,
      expectedCurrentGenerationId: first.generationIds.card,
    });
    const writeJsonCount = fileStore.writeJSON.mock.calls.length;
    const writeBinaryCount = fileStore.writeBinary.mock.calls.length;

    const second = await runtime.reconcile();

    expect(second.generationIds.card).toBe('compact-card-memory-facts-equivalent');
    expect(second.reconciliation.conflicts).toEqual([]);
    expect(fileStore.writeJSON).toHaveBeenCalledTimes(writeJsonCount);
    expect(fileStore.writeBinary).toHaveBeenCalledTimes(writeBinaryCount);
  });

  it('does not rebuild projections when reconciliation publication fails', async () => {
    const fileStore = createTrackedFileStore();
    const source = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      schemaVersion: 1,
    });
    await source.appendRecords([cardRecord('mutation-A', 'card-A', 'revision-A', 1)]);
    const rebuildProjection = vi.fn(async () => undefined);
    fileStore.writeBinary.mockImplementationOnce(async () => {
      throw new Error('simulated-reconciliation-segment-failure');
    });
    const runtime = new WorkerTruthReconciliationRuntime({
      fileStore,
      localDeviceId: 'device-A',
      localIdentityEpoch: 'epoch-A',
      schemaVersion: 1,
      rebuildProjection,
    });

    await expect(runtime.reconcile()).rejects.toThrow(
      'simulated-reconciliation-segment-failure',
    );
    expect(rebuildProjection).not.toHaveBeenCalled();
    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      schemaVersion: 1,
    });
    const inspection = await generationStore.inspectGenerations();
    expect(inspection.fence.current).toBeNull();
  });
});

function cardRecord(
  mutationId: string,
  aggregateId: string,
  revision: string,
  logicalTime: number,
): Record<string, unknown> {
  return {
    family: 'card-memory-facts',
    schemaVersion: 1,
    type: 'card-aggregate.changeset.v1',
    idempotencyKey: `card:${mutationId}`,
    mutationId,
    aggregateId,
    identityEpoch: mutationId === 'mutation-A' ? 'epoch-A' : 'epoch-B',
    causalBaseRevision: null,
    revision,
    journalSequence: logicalTime,
    logicalTime,
    recordedAt: logicalTime,
    card: {
      id: aggregateId,
      blockId: `block-${aggregateId}`,
      type: 'item',
      meta: {},
      tags: [],
      priority: 50,
      createdAt: 1,
      updatedAt: logicalTime,
    },
    schedule: {
      due: logicalTime,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      state: 2,
      lastReview: logicalTime,
      schedulerType: 'fsrs-v6',
      skipped: false,
      skipUntil: null,
      skipNote: null,
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      riffCardId: null,
      schedulerMeta: null,
      postponeCount: 0,
      lastPostponeDate: null,
      rescheduleHistory: [],
    },
    tombstone: null,
  };
}
