import { describe, expect, it } from 'vitest';
import type {
  MessagePackCardAggregateChangesetTruthRecord,
  MessagePackQueueChangesetTruthRecord,
} from '../../../packages/contracts/src/backend-rpc';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../MessagePackTruthSegmentStore';
import { MessagePackTruthSnapshotGenerationStore } from '../MessagePackTruthSnapshotGenerationStore';
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

  async deleteFile(path: string): Promise<void> {
    this.json.delete(path);
    this.binary.delete(path);
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

  it('does not republish a stale deterministic orphan when the current generation is already equivalent', async () => {
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
    const initial = await module.compactFamily('card-memory-facts');
    expect(initial.generationId).toBe('compact-card-memory-facts-1-1');

    const deterministicGenerationId = initial.generationId!;
    const snapshotStore = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: deterministicGenerationId,
      schemaVersion: 1,
    });
    const snapshot = await snapshotStore.replayRecords({ dedupeByIdempotencyKey: false });
    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      schemaVersion: 1,
      maxSegmentBytes: 64 * 1024,
      maxSegmentRecords: 2,
    });
    await generationStore.publishGeneration({
      generationId: 'reconcile-card-memory-facts-equivalent',
      records: snapshot.records,
      expectedCurrentGenerationId: deterministicGenerationId,
    });
    await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-1-1-recovered-3',
      records: snapshot.records,
      expectedCurrentGenerationId: 'reconcile-card-memory-facts-equivalent',
    });
    await generationStore.publishGeneration({
      generationId: 'reconcile-card-memory-facts-equivalent-2',
      records: snapshot.records,
      expectedCurrentGenerationId: 'compact-card-memory-facts-1-1-recovered-3',
    });
    fileStore.json.delete(
      `truth/card-memory-facts/${deterministicGenerationId}/device-device-A/manifest.v1.json`,
    );

    const result = await module.compactFamily('card-memory-facts');

    expect(result).toMatchObject({
      status: 'noop',
      generationId: 'reconcile-card-memory-facts-equivalent-2',
      previousGenerationId: 'compact-card-memory-facts-1-1-recovered-3',
      snapshotRecordCount: 1,
    });
    expect(result.reclaimedPaths).toEqual(expect.arrayContaining([
      expect.stringContaining(`/compact-card-memory-facts-1-1/`),
    ]));
    expect(result.orphanPaths).toEqual([]);
  });

  it('reclaims stale deterministic orphans when publish hits an immutable descriptor conflict', async () => {
    const fileStore = new MemoryFileStore();
    const source = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      schemaVersion: 1,
    });
    const compactedRecord = cardChange('card-1', 1, null);
    await source.appendRecords([compactedRecord]);

    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      schemaVersion: 1,
      maxSegmentBytes: 64 * 1024,
      maxSegmentRecords: 2,
    });
    await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-1-1',
      records: [compactedRecord],
      expectedCurrentGenerationId: null,
    });
    await generationStore.publishGeneration({
      generationId: 'reconcile-card-memory-facts-current-1',
      records: [cardChange('card-2', 2, null)],
      expectedCurrentGenerationId: 'compact-card-memory-facts-1-1',
    });
    await generationStore.publishGeneration({
      generationId: 'reconcile-card-memory-facts-current-2',
      records: [cardChange('card-3', 3, null)],
      expectedCurrentGenerationId: 'reconcile-card-memory-facts-current-1',
    });

    const staleDescriptorPath = 'truth/card-memory-facts/compact-card-memory-facts-1-1/device-device-A/generation.v1.json';
    const staleDescriptor = fileStore.json.get(staleDescriptorPath) as Record<string, unknown>;
    fileStore.json.set(staleDescriptorPath, {
      ...structuredClone(staleDescriptor),
      recordCount: 999,
    });

    const result = await createModule(fileStore).compactFamily('card-memory-facts');

    expect(result).toMatchObject({
      status: 'compacted',
      generationId: 'compact-card-memory-facts-1-1',
      previousGenerationId: 'reconcile-card-memory-facts-current-2',
      snapshotRecordCount: 1,
    });
    expect(result.reclaimedPaths).toEqual(expect.arrayContaining([
      staleDescriptorPath,
    ]));
    expect(result.orphanPaths).toEqual([]);
    expect(fileStore.json.get(
      'truth/card-memory-facts/device-device-A/generation-fence.v1.json',
    )).toMatchObject({
      current: {
        generationId: 'compact-card-memory-facts-1-1',
      },
      previous: {
        generationId: 'reconcile-card-memory-facts-current-2',
      },
    });
  });

  it('publishes a recovered generation when the deterministic target is retained as previous', async () => {
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
    const initial = await module.compactFamily('card-memory-facts');
    expect(initial.generationId).toBe('compact-card-memory-facts-1-1');

    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      schemaVersion: 1,
      maxSegmentBytes: 64 * 1024,
      maxSegmentRecords: 2,
    });
    await generationStore.publishGeneration({
      generationId: 'reconcile-card-memory-facts-current',
      records: [cardChange('card-2', 2, null)],
      expectedCurrentGenerationId: initial.generationId,
    });

    const result = await module.compactFamily('card-memory-facts');

    expect(result).toMatchObject({
      status: 'compacted',
      generationId: 'compact-card-memory-facts-1-1-recovered-3',
      previousGenerationId: 'reconcile-card-memory-facts-current',
      snapshotRecordCount: 1,
    });
    expect(result.reclaimedPaths).toEqual(expect.arrayContaining([
      expect.stringContaining('/compact-card-memory-facts-1-1/'),
    ]));
    expect(result.orphanPaths).toEqual([]);
    expect(fileStore.json.get(
      'truth/card-memory-facts/device-device-A/generation-fence.v1.json',
    )).toMatchObject({
      current: {
        generationId: 'compact-card-memory-facts-1-1-recovered-3',
      },
      previous: {
        generationId: 'reconcile-card-memory-facts-current',
      },
    });
  });

  it('rewrites bloated review-events operation records into a verified skinny generation', async () => {
    const fileStore = new MemoryFileStore();
    const source = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'review-events-v1',
      schemaVersion: 1,
      maxSegmentBytes: 64 * 1024,
      maxSegmentRecords: 2,
    });
    await source.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'storage.review.event.v1',
      idempotencyKey: 'legacy-review-event',
      mutationId: 'legacy-review-mutation',
      journalSequence: 3,
      logicalTime: 3_000,
      affectedAggregates: Array.from({ length: 20 }, (_, index) => ({
        family: 'review',
        aggregateId: `card-${index}`,
        causalBaseRevision: null,
      })),
      operations: [{
        table: 'review_events',
        operation: 'insert',
        primaryKey: { id: 'review-event-1' },
        row: {
          id: 'review-event-1',
          card_id: 'card-1',
          rating: 3,
          reviewed_at: 3_000,
          commit_idempotency_key: 'review-feedback:1',
          payload_json: JSON.stringify({ blockId: 'block-1', queueType: 'incremental-learning' }),
        },
      }],
    }]);

    const result = await createModule(fileStore).cleanupReviewEvents();

    expect(result).toMatchObject({
      family: 'review-events',
      status: 'compacted',
      sourceRecordCount: 1,
      skinnyRecordCount: 1,
      bloatedRecordCount: 1,
      verifiedProjectionRows: 1,
    });
    expect(result.generationId).toMatch(/^slim-review-events-3-1-/);
    expect(await fileStore.listFiles('truth/review-events/review-events-v1/device-device-A/')).toEqual([]);
    const skinnyStore = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: result.generationId!,
      schemaVersion: 1,
    });
    const replay = await skinnyStore.replayRecords({ dedupeByIdempotencyKey: false });
    expect(replay.records).toEqual([
      expect.objectContaining({
        family: 'review-events',
        type: 'review.feedback.v1',
        idempotencyKey: 'review-feedback:1',
        source: expect.objectContaining({ cardId: 'card-1', blockId: 'block-1' }),
        review: expect.objectContaining({ action: 'rating', rating: 3, reviewedAt: 3_000 }),
      }),
    ]);
    expect(replay.records[0]).not.toHaveProperty('operations');
    expect(replay.records[0]).not.toHaveProperty('affectedAggregates');
  });

  it('leaves legacy review-events source untouched when verified generation publish fails', async () => {
    const fileStore = new MemoryFileStore();
    const source = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'review-events-v1',
      schemaVersion: 1,
    });
    await source.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'storage.review.event.v1',
      idempotencyKey: 'legacy-review-event',
      journalSequence: 1,
      operations: [{
        table: 'review_events',
        operation: 'insert',
        primaryKey: { id: 'review-event-1' },
        row: {
          id: 'review-event-1',
          card_id: 'card-1',
          rating: 4,
          reviewed_at: 1_000,
        },
      }],
    }]);
    const sourcePaths = await fileStore.listFiles('truth/review-events/review-events-v1/device-device-A/');
    fileStore.failWritePathOnce = 'truth/review-events/device-device-A/generation-fence.v1.json';

    await expect(createModule(fileStore).cleanupReviewEvents()).rejects.toThrow('fence-write-interrupted');

    expect(await fileStore.listFiles('truth/review-events/review-events-v1/device-device-A/')).toEqual(sourcePaths);
  });
});
