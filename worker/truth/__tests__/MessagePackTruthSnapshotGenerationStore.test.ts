import { describe, expect, it } from 'vitest';
import type {
  MessagePackCardAggregateSnapshotTruthRecord,
} from '../../../packages/contracts/src/backend-rpc';
import type { MessagePackTruthSegmentFileStore } from '../MessagePackTruthSegmentStore';
import {
  MessagePackTruthSnapshotGenerationStore,
} from '../MessagePackTruthSnapshotGenerationStore';

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

function snapshot(
  aggregateId: string,
  journalSequence: number,
): MessagePackCardAggregateSnapshotTruthRecord {
  return {
    family: 'card-memory-facts',
    schemaVersion: 1,
    type: 'card-aggregate.snapshot.v1',
    idempotencyKey: `snapshot:${aggregateId}:${journalSequence}`,
    mutationId: `snapshot-mutation:${journalSequence}`,
    aggregateId,
    causalBaseRevision: null,
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
      priority: 10,
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
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: 0,
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

function createStore(fileStore: MemoryFileStore): MessagePackTruthSnapshotGenerationStore {
  return new MessagePackTruthSnapshotGenerationStore({
    fileStore,
    family: 'card-memory-facts',
    deviceId: 'device-A',
    schemaVersion: 1,
    maxSegmentBytes: 64 * 1024,
    maxSegmentRecords: 2,
  });
}

describe('MessagePackTruthSnapshotGenerationStore', () => {
  it('verifies a generation when segment replay orders records by logical time', async () => {
    const fileStore = new MemoryFileStore();
    const store = createStore(fileStore);

    const result = await store.publishGeneration({
      generationId: 'snapshot-reordered-replay',
      records: [snapshot('card-later', 20), snapshot('card-earlier', 10)],
      expectedCurrentGenerationId: null,
    });

    expect(result.generation.recordCount).toBe(2);
    expect(result.fence.current).toMatchObject({
      generationId: 'snapshot-reordered-replay',
    });
  });

  it('publishes verified immutable generations through one device-owned fence', async () => {
    const fileStore = new MemoryFileStore();
    const store = createStore(fileStore);

    const first = await store.publishGeneration({
      generationId: 'snapshot-1',
      records: [snapshot('card-1', 1), snapshot('card-2', 1), snapshot('card-3', 1)],
      expectedCurrentGenerationId: null,
    });
    const second = await store.publishGeneration({
      generationId: 'snapshot-2',
      records: [snapshot('card-1', 2), snapshot('card-2', 2)],
      expectedCurrentGenerationId: 'snapshot-1',
    });

    expect(first.generation.manifest.segments.map((segment) => segment.recordCount)).toEqual([2, 1]);
    expect(second.fence).toMatchObject({
      fence: 2,
      current: { generationId: 'snapshot-2' },
      previous: { generationId: 'snapshot-1' },
    });
    expect(second.retainedGenerationIds).toEqual(['snapshot-2', 'snapshot-1']);
    expect(second.generation.manifestChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.generation.manifest.segments.every((segment) => (
      fileStore.json.has(`${segment.path}.checksum.json`)
    ))).toBe(true);
  });

  it('keeps previous fence authoritative and classifies interrupted candidate files as orphans', async () => {
    const fileStore = new MemoryFileStore();
    const store = createStore(fileStore);
    await store.publishGeneration({
      generationId: 'snapshot-1',
      records: [snapshot('card-1', 1)],
      expectedCurrentGenerationId: null,
    });
    await store.publishGeneration({
      generationId: 'snapshot-2',
      records: [snapshot('card-1', 2)],
      expectedCurrentGenerationId: 'snapshot-1',
    });
    fileStore.failWritePathOnce = store.fencePath;

    await expect(store.publishGeneration({
      generationId: 'snapshot-3',
      records: [snapshot('card-1', 3)],
      expectedCurrentGenerationId: 'snapshot-2',
    })).rejects.toThrow('fence-write-interrupted');

    const inspection = await store.inspectGenerations();

    expect(inspection.fence).toMatchObject({
      current: { generationId: 'snapshot-2' },
      previous: { generationId: 'snapshot-1' },
    });
    expect(inspection.retainedGenerationIds).toEqual(['snapshot-2', 'snapshot-1']);
    expect(inspection.orphanPaths).toEqual(expect.arrayContaining([
      expect.stringContaining('/snapshot-3/'),
    ]));
    expect(inspection.orphanPaths).not.toEqual(expect.arrayContaining([
      expect.stringContaining('/snapshot-2/'),
      expect.stringContaining('/snapshot-1/'),
    ]));
  });

  it('retains only current and previous verified generations', async () => {
    const fileStore = new MemoryFileStore();
    const store = createStore(fileStore);
    await store.publishGeneration({
      generationId: 'snapshot-1',
      records: [snapshot('card-1', 1)],
      expectedCurrentGenerationId: null,
    });
    await store.publishGeneration({
      generationId: 'snapshot-2',
      records: [snapshot('card-1', 2)],
      expectedCurrentGenerationId: 'snapshot-1',
    });
    await store.publishGeneration({
      generationId: 'snapshot-3',
      records: [snapshot('card-1', 3)],
      expectedCurrentGenerationId: 'snapshot-2',
    });

    const result = await store.reclaimObsoleteGenerations();

    expect(result.retainedGenerationIds).toEqual(['snapshot-3', 'snapshot-2']);
    expect(result.deletedPaths).toEqual(expect.arrayContaining([
      expect.stringContaining('/snapshot-1/'),
    ]));
    expect((await store.inspectGenerations()).orphanPaths).toEqual([]);
  });
});
