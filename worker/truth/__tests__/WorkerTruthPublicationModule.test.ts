import { describe, expect, it } from 'vitest';
import { decode } from '@msgpack/msgpack';
import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  STORAGE_MUTATION_ENVELOPE_VERSION,
  type StorageDurabilityReceipt,
  type StorageMutationEnvelope,
} from '../../../packages/contracts/src/backend-rpc';
import type { MessagePackTruthSegmentFileStore } from '../MessagePackTruthSegmentStore';
import { WorkerTruthPublicationModule } from '../WorkerTruthPublicationModule';
import type { WorkerTruthPromotionJournalEntry } from '../WorkerTruthPromotionModule';

class MemoryFileStore implements MessagePackTruthSegmentFileStore {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  failManifestWriteBeforePersistOnce: string | null = null;

  async readJSON<T>(fileName: string): Promise<T | null> {
    return structuredClone(this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    if (
      this.failManifestWriteBeforePersistOnce
      && fileName === this.failManifestWriteBeforePersistOnce
    ) {
      this.failManifestWriteBeforePersistOnce = null;
      throw new Error('manifest-write-interrupted');
    }
    this.json.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? bytes.slice() : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, bytes.slice());
  }

  async listFiles(prefix: string): Promise<string[]> {
    return [...this.json.keys(), ...this.binary.keys()].filter((path) => path.startsWith(prefix));
  }
}

function entry(sequence: number): WorkerTruthPromotionJournalEntry {
  const mutationEnvelope: StorageMutationEnvelope = {
    version: STORAGE_MUTATION_ENVELOPE_VERSION,
    mutationId: `mutation-${sequence}`,
    family: 'review',
    deviceId: 'device-A',
    identityEpoch: 'epoch-A',
    journalSequence: sequence,
    createdAt: 1_000 * sequence,
    affectedAggregates: [{
      family: 'card-schedule',
      aggregateId: `card-${sequence}`,
      causalBaseRevision: null,
    }],
    operations: [{
      table: 'review_events',
      operation: 'insert',
      primaryKey: { id: `event-${sequence}` },
      row: { id: `event-${sequence}`, card_id: `card-${sequence}`, reviewed_at: 1_000 * sequence },
    }, {
      table: 'cards',
      operation: 'update',
      primaryKey: { id: `card-${sequence}` },
      row: {
        id: `card-${sequence}`,
        payload_json: JSON.stringify({
          id: `card-${sequence}`,
          blockId: `block-${sequence}`,
          xiuyuanID: `xiuyuan-${sequence}`,
          due: 2_000 * sequence,
          stability: 3,
          difficulty: 4,
          reps: sequence,
          lapses: 0,
          state: 2,
          lastReview: 1_000 * sequence,
          elapsedDays: 1,
          scheduledDays: 5,
          priority: 10,
          type: 'item',
          tags: [],
          leechCount: 0,
          isLeech: false,
          skipped: false,
          createdAt: 100,
          updatedAt: 1_000 * sequence,
          schedulerType: 'fsrs-v6',
        }),
      },
    }],
    requiredTruthOutputs: [
      { family: 'review', kind: 'event', aggregateIds: [`card-${sequence}`] },
      { family: 'card-schedule', kind: 'changeset', aggregateIds: [`card-${sequence}`] },
      { family: 'queue', kind: 'changeset', aggregateIds: ['review'] },
    ],
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
    retry: { attemptCount: 0, nextAttemptAt: null, lastError: null },
    diagnosticCode: null,
    diagnosticMessage: null,
    updatedAt: 1_000 * sequence,
  };
  return { createdAt: 1_000 * sequence, mutationEnvelope, durabilityReceipt };
}

describe('WorkerTruthPublicationModule', () => {
  it('publishes all required families and retries without duplicate logical records', async () => {
    const fileStore = new MemoryFileStore();
    const publisher = new WorkerTruthPublicationModule({
      fileStore,
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      schemaVersion: 1,
      maxSegmentBytes: 64 * 1024,
      generationIds: {
        'review-events': 'review-events-v1',
        'card-memory-facts': 'card-memory-facts-v1',
        'queue-facts': 'queue-facts-v1',
      },
    });

    const first = await publisher.publishBatch([entry(1), entry(2)]);
    const segmentCountAfterFirst = fileStore.binary.size;
    const second = await publisher.publishBatch([entry(1), entry(2)]);

    expect(first.verifiedMutationIds).toEqual(['mutation-1', 'mutation-2']);
    expect(second.verifiedMutationIds).toEqual(['mutation-1', 'mutation-2']);
    expect(fileStore.binary.size).toBe(segmentCountAfterFirst);
    expect([...fileStore.json.keys()].filter((path) => path.endsWith('/manifest.v1.json')).sort()).toEqual([
      'truth/card-memory-facts/card-memory-facts-v1/device-device-A/manifest.v1.json',
      'truth/queue-facts/queue-facts-v1/device-device-A/manifest.v1.json',
      'truth/review-events/review-events-v1/device-device-A/manifest.v1.json',
    ]);
    const records = [...fileStore.binary.values()].flatMap((bytes) => {
      const envelope = decode(bytes) as { records: Array<{ mutationId?: string }> };
      return envelope.records;
    });
    expect(records.filter((record) => record.mutationId === 'mutation-1')).toHaveLength(3);
    expect(records.filter((record) => record.mutationId === 'mutation-2')).toHaveLength(3);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'card-memory-facts',
        type: 'card-aggregate.changeset.v1',
        aggregateId: 'card-1',
        revision: 'device-A:epoch-A:1:mutation-1:card-1',
        card: expect.objectContaining({ blockId: 'block-1' }),
        schedule: expect.objectContaining({ schedulerType: 'fsrs-v6' }),
      }),
      expect.objectContaining({
        family: 'queue-facts',
        type: 'queue-family.changeset.v1',
        queueFamily: 'review',
        changes: [
          expect.objectContaining({
            operation: 'upsert',
            cardId: 'card-1',
          }),
        ],
      }),
    ]));
  });

  it('retries an interrupted manifest publication without duplicate logical records', async () => {
    const fileStore = new MemoryFileStore();
    const publisher = new WorkerTruthPublicationModule({
      fileStore,
      deviceId: 'device-A',
      identityEpoch: 'epoch-A',
      schemaVersion: 1,
      maxSegmentBytes: 64 * 1024,
      generationIds: {
        'review-events': 'review-events-v1',
        'card-memory-facts': 'card-memory-facts-v1',
        'queue-facts': 'queue-facts-v1',
      },
    });
    fileStore.failManifestWriteBeforePersistOnce =
      'truth/review-events/review-events-v1/device-device-A/manifest.v1.json';

    await expect(publisher.publishBatch([entry(1)])).rejects.toThrow('manifest-write-interrupted');
    const binaryCountAfterInterruption = fileStore.binary.size;
    await expect(publisher.publishBatch([entry(1)])).resolves.toMatchObject({
      verifiedMutationIds: ['mutation-1'],
    });

    expect(fileStore.binary.size).toBe(binaryCountAfterInterruption + 2);
    const records = (await Promise.all([
      publisher.getFamilyStore('review-events').replayRecords({ dedupeByIdempotencyKey: true }),
      publisher.getFamilyStore('card-memory-facts').replayRecords({ dedupeByIdempotencyKey: true }),
      publisher.getFamilyStore('queue-facts').replayRecords({ dedupeByIdempotencyKey: true }),
    ])).flatMap((replay) => replay.records);
    expect(new Set(records.map((record) => record.idempotencyKey)).size).toBe(3);
    expect(records.filter((record) => record.mutationId === 'mutation-1')).toHaveLength(3);
  });
});
