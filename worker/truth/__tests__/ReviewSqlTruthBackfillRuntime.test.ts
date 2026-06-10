import { describe, expect, it, vi } from 'vitest';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../MessagePackTruthSegmentStore';
import {
  ReviewSqlTruthBackfillRuntime,
  type ReviewSqlTruthBackfillRuntimeOptions,
  type ReviewSqlTruthBackfillProjectionPatch,
  type ReviewSqlTruthBackfillRow,
} from '../ReviewSqlTruthBackfillRuntime';

class MemoryTruthSegmentFileStore implements MessagePackTruthSegmentFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.jsonFiles.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.jsonFiles.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binaryFiles.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binaryFiles.set(fileName, new Uint8Array(bytes));
  }
}

function reviewSqlRow(overrides: Partial<ReviewSqlTruthBackfillRow> = {}): ReviewSqlTruthBackfillRow {
  return {
    id: overrides.id ?? 'event-new',
    cardId: overrides.cardId ?? 'card-new',
    attemptId: overrides.attemptId ?? 'attempt-new',
    rating: overrides.rating ?? 3,
    reviewedAt: overrides.reviewedAt ?? 1_700_000_000_100,
    eventType: overrides.eventType ?? 'review-v2',
    commitIdempotencyKey: overrides.commitIdempotencyKey ?? 'review:key-new',
    payloadJson: overrides.payloadJson ?? JSON.stringify({
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      schedulerType: 'fsrs-v6',
      sourceBlockId: 'block-new',
    }),
    msgpackRef: overrides.msgpackRef ?? null,
    truthHash: overrides.truthHash ?? null,
    truthSchemaVersion: overrides.truthSchemaVersion ?? null,
    projectionGeneration: overrides.projectionGeneration ?? null,
  };
}

function createRuntime(
  rows: ReviewSqlTruthBackfillRow[],
  overrides: Partial<Pick<ReviewSqlTruthBackfillRuntimeOptions, 'patchRows'>> = {},
) {
  const fileStore = new MemoryTruthSegmentFileStore();
  const truthStore = createMessagePackTruthSegmentStore({
    fileStore,
    family: 'review-events',
    deviceId: 'device-A',
    generationId: 'projection-gen-1',
    schemaVersion: 1,
    maxSegmentBytes: 4096,
  });
  const patches: ReviewSqlTruthBackfillProjectionPatch[] = [];
  const scheduledProjectionRefreshes: string[][] = [];
  const runtime = new ReviewSqlTruthBackfillRuntime({
    truthStore,
    deviceId: 'device-A',
    generationId: 'projection-gen-1',
    schemaVersion: 1,
    listRows: () => rows,
    patchRows: overrides.patchRows ?? (async (nextPatches) => {
      patches.push(...nextPatches);
    }),
    sourceId: 'local-sql-fixture',
    limit: 16,
    now: () => 1_700_000_001_000,
    scheduleProjectionRefresh: async (segments) => {
      scheduledProjectionRefreshes.push(segments.map((segment) => segment.path));
    },
  });
  return { fileStore, patches, runtime, scheduledProjectionRefreshes, truthStore };
}

describe('ReviewSqlTruthBackfillRuntime', () => {
  it('imports Review SQL rows into MessagePack truth without duplicate idempotency records', async () => {
    const rows = [
      reviewSqlRow({
        id: 'event-existing',
        cardId: 'card-existing',
        commitIdempotencyKey: 'review:key-existing',
      }),
      reviewSqlRow({
        id: 'event-new',
        cardId: 'card-new',
        commitIdempotencyKey: 'review:key-new',
      }),
    ];
    const { patches, runtime, scheduledProjectionRefreshes, truthStore } = createRuntime(rows);
    await truthStore.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'review.feedback.v1',
      idempotencyKey: 'review:key-existing',
      logicalTime: 1_700_000_000_000,
      recordedAt: 1_700_000_000_000,
      source: { cardId: 'card-existing' },
      review: { action: 'rating', rating: 3, reviewedAt: 1_700_000_000_000 },
      memory: { projectionGeneration: null },
    }]);

    const result = await runtime.backfill();

    expect(result).toMatchObject({
      ok: true,
      source: 'review_events',
      sqlRowsRead: 2,
      recordsWritten: 1,
      segmentWritten: true,
      manifestUpdated: true,
      projectionRefreshScheduled: true,
      idempotencyDuplicateSkipped: 1,
      backfilledEventIds: ['event-new'],
      duplicateEventIds: ['event-existing'],
      repairRequiredEventIds: [],
      syncVisible: true,
      error: null,
    });
    expect(result.segmentPaths[0]).toMatch(/^truth\/review-events\/projection-gen-1\/device-device-A\/seg-\d{6}-[a-z0-9-]+\.msgpack$/);
    expect(scheduledProjectionRefreshes).toEqual([result.segmentPaths]);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      eventId: 'event-new',
      truthSchemaVersion: 1,
      projectionGeneration: 1_700_000_001_000,
    });
    expect(JSON.parse(patches[0].msgpackRef)).toMatchObject({
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      recordId: 'event-new',
      idempotencyKey: 'review:key-new',
    });

    const replay = await truthStore.replayRecords({ dedupeByIdempotencyKey: true });
    expect(replay.records.map((record) => record.idempotencyKey)).toEqual([
      'review:key-existing',
      'review:key-new',
    ]);
  });

  it('returns repair-required diagnostics and writes no segment for invalid SQL rows', async () => {
    const { fileStore, patches, runtime } = createRuntime([
      reviewSqlRow({
        id: 'event-invalid',
        cardId: '',
      }),
    ]);

    const result = await runtime.backfill();

    expect(result).toMatchObject({
      ok: false,
      sqlRowsRead: 1,
      recordsWritten: 0,
      segmentWritten: false,
      manifestUpdated: false,
      projectionRefreshScheduled: false,
      repairRequiredEventIds: ['event-invalid'],
      syncVisible: false,
      error: expect.stringContaining('repair-required'),
    });
    expect(fileStore.binaryFiles.size).toBe(0);
    expect(patches).toEqual([]);
  });

  it('reports duplicate SQL evidence as sync-visible without appending a duplicate truth record', async () => {
    const { fileStore, runtime, scheduledProjectionRefreshes, truthStore } = createRuntime([
      reviewSqlRow({
        id: 'event-duplicate-only',
        cardId: 'card-duplicate-only',
        commitIdempotencyKey: 'review:key-duplicate-only',
      }),
    ]);
    await truthStore.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'review.feedback.v1',
      eventId: 'event-already-truth',
      idempotencyKey: 'review:key-duplicate-only',
      logicalTime: 1_700_000_000_000,
      recordedAt: 1_700_000_000_000,
      source: { cardId: 'card-duplicate-only' },
      review: { action: 'rating', rating: 3, reviewedAt: 1_700_000_000_000 },
      memory: { projectionGeneration: null },
    }]);
    const binaryWriteCountBefore = fileStore.binaryFiles.size;

    const result = await runtime.backfill();

    expect(result).toMatchObject({
      ok: true,
      sqlRowsRead: 1,
      recordsWritten: 0,
      segmentWritten: false,
      manifestUpdated: false,
      projectionRefreshScheduled: false,
      idempotencyDuplicateSkipped: 1,
      backfilledEventIds: [],
      duplicateEventIds: ['event-duplicate-only'],
      repairRequiredEventIds: [],
      syncVisible: true,
      error: null,
    });
    expect(fileStore.binaryFiles.size).toBe(binaryWriteCountBefore);
    expect(scheduledProjectionRefreshes).toEqual([]);
    const replay = await truthStore.replayRecords({ dedupeByIdempotencyKey: true });
    expect(replay.records.map((record) => record.idempotencyKey)).toEqual([
      'review:key-duplicate-only',
    ]);
  });

  it('reports durable truth writes when SQL projection ref patching fails after segment persistence', async () => {
    const patchRows = vi.fn(async () => {
      throw new Error('mock SQL projection ref patch failed');
    });
    const { runtime, scheduledProjectionRefreshes, truthStore } = createRuntime([
      reviewSqlRow({
        id: 'event-patch-fail',
        cardId: 'card-patch-fail',
        commitIdempotencyKey: 'review:key-patch-fail',
      }),
    ], { patchRows });

    const result = await runtime.backfill();

    expect(result).toMatchObject({
      ok: false,
      source: 'review_events',
      sqlRowsRead: 1,
      recordsWritten: 1,
      segmentWritten: true,
      manifestUpdated: true,
      projectionRefreshScheduled: true,
      idempotencyDuplicateSkipped: 0,
      backfilledEventIds: ['event-patch-fail'],
      duplicateEventIds: [],
      repairRequiredEventIds: [],
      syncVisible: true,
      error: expect.stringContaining('mock SQL projection ref patch failed'),
    });
    expect(result.segmentPaths.length).toBe(1);
    expect(scheduledProjectionRefreshes).toEqual([result.segmentPaths]);
    expect(patchRows).toHaveBeenCalledTimes(1);
    const replay = await truthStore.replayRecords();
    expect(replay.records).toMatchObject([
      {
        eventId: 'event-patch-fail',
        idempotencyKey: 'review:key-patch-fail',
        cardId: 'card-patch-fail',
      },
    ]);
  });
});
