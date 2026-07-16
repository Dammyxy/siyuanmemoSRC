import { describe, expect, it } from 'vitest';
import type {
  MessagePackCardAggregateChangesetTruthRecord,
  MessagePackQueueChangesetTruthRecord,
} from '../../../packages/contracts/src/backend-rpc';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../MessagePackTruthSegmentStore';
import { WorkerTruthCompactionModule } from '../WorkerTruthCompactionModule';

class MemoryFileStore implements MessagePackTruthSegmentFileStore {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  failWritePathOnce: string | null = null;

  async readJSON<T>(fileName: string): Promise<T | null> {
    return this.json.has(fileName) ? structuredClone(this.json.get(fileName)) as T : null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    if (this.failWritePathOnce === fileName) {
      this.failWritePathOnce = null;
      throw new Error('fence-write-interrupted');
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
    return [...this.json.keys(), ...this.binary.keys()]
      .filter((path) => path.startsWith(prefix))
      .sort();
  }
}

function cardChange(
  aggregateId: string,
  journalSequence: number,
  causalBaseRevision: string | null,
): MessagePackCardAggregateChangesetTruthRecord {
  return {
    family: 'card-memory-facts',
    schemaVersion: 1,
    type: 'card-aggregate.changeset.v1',
    idempotencyKey: `card:${aggregateId}:${journalSequence}`,
    mutationId: `mutation:${journalSequence}`,
    aggregateId,
    causalBaseRevision,
    revision: `revision:${journalSequence}:${aggregateId}`,
    journalSequence,
    logicalTime: journalSequence,
    recordedAt: journalSequence,
    card: {
      id: aggregateId,
      blockId: `block-${aggregateId}`,
      xiuyuanId: null,
      faceKey: null,
      type: 'item',
      priority: journalSequence,
      tags: [],
      cardTypeMarker: null,
      neuralRoamSeed: false,
      skipped: false,
      skipNote: null,
      skipUntil: null,
      sourceUrl: null,
      extractedFrom: null,
      createdAt: 1,
      updatedAt: journalSequence,
      meta: null,
    },
    schedule: {
      schedulerType: 'fsrs-v6',
      due: journalSequence,
      stability: 1,
      difficulty: 1,
      reps: journalSequence,
      lapses: 0,
      state: 0,
      lastReview: journalSequence,
      elapsedDays: 0,
      scheduledDays: 0,
      learningStep: null,
      leechCount: 0,
      isLeech: false,
      aFactor: null,
      riffCardId: null,
      schedulerMeta: null,
      postponeCount: 0,
      lastPostponeDate: null,
      rescheduleHistory: [],
    },
    tombstone: null,
  };
}

function queueChange(
  journalSequence: number,
  causalBaseRevision: string | null,
): MessagePackQueueChangesetTruthRecord {
  return {
    family: 'queue-facts',
    schemaVersion: 1,
    type: 'queue-family.changeset.v1',
    idempotencyKey: `queue:formal:${journalSequence}`,
    mutationId: `queue-mutation:${journalSequence}`,
    queueFamily: 'formal',
    causalBaseRevision,
    revision: `queue-revision:${journalSequence}`,
    journalSequence,
    logicalTime: journalSequence,
    recordedAt: journalSequence,
    members: null,
    changes: [{
      operation: 'upsert',
      cardId: 'card-1',
      member: {
        cardId: 'card-1',
        due: journalSequence,
        priority: journalSequence,
        state: 0,
        schedulerType: 'fsrs-v6',
        membershipReason: 'due',
        sortKey: String(journalSequence),
      },
    }],
  };
}

function createModule(fileStore: MemoryFileStore): WorkerTruthCompactionModule {
  return new WorkerTruthCompactionModule({
    fileStore,
    deviceId: 'device-A',
    schemaVersion: 1,
    sourceGenerationIds: {
      'card-memory-facts': 'card-memory-facts-v1',
      'queue-facts': 'queue-facts-v1',
    },
    reviewGenerationId: 'review-events-v1',
    maxSegmentBytes: 64 * 1024,
    maxSegmentRecords: 2,
  });
}

describe('WorkerTruthCompactionModule', () => {
  it('publishes verified card and queue snapshots through generation fences', async () => {
    const fileStore = new MemoryFileStore();
    const cardSource = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      schemaVersion: 1,
    });
    const queueSource = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'queue-facts',
      deviceId: 'device-A',
      generationId: 'queue-facts-v1',
      schemaVersion: 1,
    });
    await cardSource.appendRecords([
      cardChange('card-1', 1, null),
      cardChange('card-1', 2, 'revision:1:card-1'),
    ]);
    await queueSource.appendRecords([
      queueChange(1, null),
      queueChange(2, 'queue-revision:1'),
    ]);

    const result = await createModule(fileStore).compactAll();

    expect(result.families).toEqual([
      expect.objectContaining({
        family: 'card-memory-facts',
        status: 'compacted',
        sourceRecordCount: 2,
        snapshotRecordCount: 1,
        coveredJournalSequence: 2,
      }),
      expect.objectContaining({
        family: 'queue-facts',
        status: 'compacted',
        sourceRecordCount: 2,
        snapshotRecordCount: 1,
        coveredJournalSequence: 2,
      }),
    ]);
    expect(result.reviewEvents).toMatchObject({
      status: 'noop',
      remainingSegmentCount: 0,
    });
    for (const family of result.families) {
      expect(family.generationId).toBeTruthy();
      const snapshotStore = createMessagePackTruthSegmentStore({
        fileStore,
        family: family.family,
        deviceId: 'device-A',
        generationId: family.generationId!,
        schemaVersion: 1,
      });
      const replay = await snapshotStore.replayRecords({ dedupeByIdempotencyKey: false });
      expect(replay.records).toHaveLength(1);
      expect(replay.diagnostics).toEqual([]);
    }
  });

  it('leaves interrupted candidates orphaned and retries the same deterministic generation', async () => {
    const fileStore = new MemoryFileStore();
    const source = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      schemaVersion: 1,
    });
    await source.appendRecords([cardChange('card-1', 1, null)]);
    const module = createModule(fileStore);
    const fencePath = 'truth/card-memory-facts/device-device-A/generation-fence.v1.json';
    fileStore.failWritePathOnce = fencePath;

    await expect(module.compactFamily('card-memory-facts')).rejects.toThrow('fence-write-interrupted');
    const retried = await module.compactFamily('card-memory-facts');

    expect(retried.status).toBe('compacted');
    expect(retried.generationId).toBe('compact-card-memory-facts-1-1');
    expect(retried.orphanPaths).toEqual([]);
  });

  it('re-fences the same recovered state without deleting the corrupt current generation', async () => {
    const fileStore = new MemoryFileStore();
    const source = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      schemaVersion: 1,
    });
    const module = createModule(fileStore);
    await source.appendRecords([cardChange('card-1', 1, null)]);
    const previous = await module.compactFamily('card-memory-facts');
    await source.appendRecords([cardChange('card-1', 2, 'revision:1:card-1')]);
    const current = await module.compactFamily('card-memory-facts');
    const currentManifest = fileStore.json.get(
      `truth/card-memory-facts/${current.generationId}/device-device-A/manifest.v1.json`,
    ) as { segments: Array<{ path: string }> };
    const corruptPath = currentManifest.segments[0].path;
    const corruptBytes = fileStore.binary.get(corruptPath)!;
    corruptBytes[0] ^= 0xff;

    const recovered = await module.compactFamily('card-memory-facts');

    expect(recovered).toMatchObject({
      status: 'compacted',
      generationId: 'compact-card-memory-facts-2-1-recovered-3',
      previousGenerationId: previous.generationId,
      reclaimedPaths: [],
    });
    expect(recovered.orphanPaths).toContain(corruptPath);
    expect(fileStore.binary.has(corruptPath)).toBe(true);
    expect(fileStore.json.get(
      'truth/card-memory-facts/device-device-A/generation-fence.v1.json',
    )).toMatchObject({
      current: {
        generationId: 'compact-card-memory-facts-2-1-recovered-3',
      },
      previous: {
        generationId: previous.generationId,
      },
    });
  });
});
