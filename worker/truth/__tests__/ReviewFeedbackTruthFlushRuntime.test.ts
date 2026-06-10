import { describe, expect, it, vi } from 'vitest';
import { createInMemoryReviewFeedbackJournalStore } from '../../db/ReviewFeedbackJournalStore';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../MessagePackTruthSegmentStore';
import { ReviewFeedbackTruthFlushRuntime } from '../ReviewFeedbackTruthFlushRuntime';

class MemoryTruthSegmentFileStore implements MessagePackTruthSegmentFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();
  failBinaryWrites = false;

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
    if (this.failBinaryWrites) {
      throw new Error('mock segment write failed');
    }
    this.binaryFiles.set(fileName, new Uint8Array(bytes));
  }
}

function reviewJournalEntry(input: {
  id: string;
  idempotencyKey: string;
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: number;
  recordedAt: number;
}) {
  return {
    id: input.id,
    requestId: null,
    cardId: input.cardId,
    idempotencyKey: input.idempotencyKey,
    status: 'projection-applied',
    recordedAt: input.recordedAt,
    request: {
      cardId: input.cardId,
      rating: input.rating,
      reviewedAt: input.reviewedAt,
      idempotencyKey: input.idempotencyKey,
      queueType: 'RetrievalPractice',
      queueMode: 'review',
      commitPolicy: 'formal',
    },
    appliedAt: input.reviewedAt,
    projectionAppliedAt: input.reviewedAt + 1,
    projectionFailedAt: null,
    lastError: null,
  };
}

function createRuntime() {
  const journalStore = createInMemoryReviewFeedbackJournalStore();
  const fileStore = new MemoryTruthSegmentFileStore();
  const truthStore = createMessagePackTruthSegmentStore({
    fileStore,
    family: 'review-events',
    deviceId: 'device-A',
    generationId: 'projection-gen-1',
    schemaVersion: 1,
    maxSegmentBytes: 4096,
  });
  const scheduledProjectionRefreshes: string[][] = [];
  const runtime = new ReviewFeedbackTruthFlushRuntime({
    journalStore,
    truthStore,
    batchLimit: 16,
    now: () => 1_700_000_000_999,
    scheduleProjectionRefresh: async (segments) => {
      scheduledProjectionRefreshes.push(segments.map((segment) => segment.path));
    },
  });
  return { fileStore, journalStore, runtime, scheduledProjectionRefreshes, truthStore };
}

describe('ReviewFeedbackTruthFlushRuntime', () => {
  it('flushes projection-applied journal entries to Review event segments before marking truth-flushed', async () => {
    const { journalStore, runtime, scheduledProjectionRefreshes, truthStore } = createRuntime();
    await journalStore.appendEntry(reviewJournalEntry({
      id: 'journal-entry-1',
      idempotencyKey: 'review:key-1',
      cardId: 'card-1',
      rating: 3,
      reviewedAt: 1_700_000_000_100,
      recordedAt: 1_700_000_000_001,
    }));
    await journalStore.appendEntry(reviewJournalEntry({
      id: 'journal-entry-2',
      idempotencyKey: 'review:key-2',
      cardId: 'card-2',
      rating: 4,
      reviewedAt: 1_700_000_000_200,
      recordedAt: 1_700_000_000_002,
    }));

    const result = await runtime.flushProjectionApplied();

    expect(result).toMatchObject({
      ok: true,
      journalQueued: 2,
      recordsWritten: 2,
      segmentWritten: true,
      manifestUpdated: true,
      projectionRefreshScheduled: true,
      idempotencyDuplicateSkipped: 0,
      flushedEntryIds: ['journal-entry-1', 'journal-entry-2'],
    });
    expect(result.segmentPaths.length).toBe(1);
    expect(scheduledProjectionRefreshes).toEqual([result.segmentPaths]);
    await expect(journalStore.getStats()).resolves.toMatchObject({
      pendingCount: 0,
      statusCounts: {
        'truth-flushed': 2,
      },
    });
    await expect(journalStore.listEntriesByStatus('truth-flushed', 10)).resolves.toMatchObject([
      {
        id: 'journal-entry-1',
        truthFlushDuplicate: false,
        truthSegmentPaths: result.segmentPaths,
      },
      {
        id: 'journal-entry-2',
        truthFlushDuplicate: false,
        truthSegmentPaths: result.segmentPaths,
      },
    ]);
    const replay = await truthStore.replayRecords();
    expect(replay.records).toMatchObject([
      {
        family: 'review-events',
        schemaVersion: 1,
        type: 'review.feedback.v1',
        journalEntryId: 'journal-entry-1',
        idempotencyKey: 'review:key-1',
        cardId: 'card-1',
        rating: 3,
        source: {
          cardId: 'card-1',
        },
        review: {
          action: 'rating',
          rating: 3,
        },
        memory: {
          projectionGeneration: null,
        },
      },
      {
        family: 'review-events',
        schemaVersion: 1,
        type: 'review.feedback.v1',
        journalEntryId: 'journal-entry-2',
        idempotencyKey: 'review:key-2',
        cardId: 'card-2',
        rating: 4,
        source: {
          cardId: 'card-2',
        },
        review: {
          action: 'rating',
          rating: 4,
        },
        memory: {
          projectionGeneration: null,
        },
      },
    ]);
  });

  it('does not mark entries truth-flushed when segment persistence fails', async () => {
    const { fileStore, journalStore, runtime } = createRuntime();
    await journalStore.appendEntry(reviewJournalEntry({
      id: 'journal-entry-fail',
      idempotencyKey: 'review:key-fail',
      cardId: 'card-fail',
      rating: 2,
      reviewedAt: 1_700_000_000_100,
      recordedAt: 1_700_000_000_001,
    }));
    fileStore.failBinaryWrites = true;

    const result = await runtime.flushProjectionApplied();

    expect(result).toMatchObject({
      ok: false,
      journalQueued: 1,
      recordsWritten: 0,
      segmentWritten: false,
      manifestUpdated: false,
      projectionRefreshScheduled: false,
      error: expect.stringContaining('mock segment write failed'),
    });
    await expect(journalStore.listEntriesByStatus('projection-applied', 10)).resolves.toMatchObject([
      { id: 'journal-entry-fail', status: 'projection-applied' },
    ]);
    await expect(journalStore.getStats()).resolves.toMatchObject({
      pendingCount: 1,
      statusCounts: {
        'projection-applied': 1,
      },
    });
  });

  it('reports durable truth writes when journal status update fails after segment persistence', async () => {
    const { journalStore, runtime, truthStore } = createRuntime();
    await journalStore.appendEntry(reviewJournalEntry({
      id: 'journal-entry-status-fail',
      idempotencyKey: 'review:key-status-fail',
      cardId: 'card-status-fail',
      rating: 2,
      reviewedAt: 1_700_000_000_100,
      recordedAt: 1_700_000_000_001,
    }));
    vi.spyOn(journalStore, 'updateEntryStatus').mockRejectedValueOnce(
      new Error('mock journal status update failed'),
    );

    const result = await runtime.flushProjectionApplied();

    expect(result).toMatchObject({
      ok: false,
      journalQueued: 1,
      recordsWritten: 1,
      segmentWritten: true,
      manifestUpdated: true,
      projectionRefreshScheduled: false,
      error: expect.stringContaining('mock journal status update failed'),
    });
    expect(result.segmentPaths.length).toBe(1);
    const replay = await truthStore.replayRecords();
    expect(replay.records).toMatchObject([
      {
        journalEntryId: 'journal-entry-status-fail',
        idempotencyKey: 'review:key-status-fail',
        cardId: 'card-status-fail',
      },
    ]);
    await expect(journalStore.listEntriesByStatus('projection-applied', 10)).resolves.toMatchObject([
      { id: 'journal-entry-status-fail', status: 'projection-applied' },
    ]);
  });

  it('marks duplicate idempotency entries flushed without writing another segment', async () => {
    const { fileStore, journalStore, runtime, truthStore } = createRuntime();
    await truthStore.appendRecords([{
      type: 'review.feedback.v1',
      journalEntryId: 'already-flushed',
      idempotencyKey: 'review:key-dupe',
      cardId: 'card-dupe',
      rating: 3,
      reviewedAt: 1_700_000_000_100,
      logicalTime: 1_700_000_000_100,
    }]);
    const binaryWriteCountBefore = fileStore.binaryFiles.size;
    await journalStore.appendEntry(reviewJournalEntry({
      id: 'journal-entry-dupe',
      idempotencyKey: 'review:key-dupe',
      cardId: 'card-dupe',
      rating: 3,
      reviewedAt: 1_700_000_000_100,
      recordedAt: 1_700_000_000_001,
    }));

    const result = await runtime.flushProjectionApplied();

    expect(result).toMatchObject({
      ok: true,
      journalQueued: 1,
      recordsWritten: 0,
      segmentWritten: false,
      manifestUpdated: false,
      projectionRefreshScheduled: false,
      idempotencyDuplicateSkipped: 1,
      flushedEntryIds: ['journal-entry-dupe'],
      segmentPaths: [],
    });
    expect(fileStore.binaryFiles.size).toBe(binaryWriteCountBefore);
    await expect(journalStore.getStats()).resolves.toMatchObject({
      pendingCount: 0,
      statusCounts: {
        'truth-flushed': 1,
      },
    });
    await expect(journalStore.listEntriesByStatus('truth-flushed', 10)).resolves.toMatchObject([
      {
        id: 'journal-entry-dupe',
        truthFlushDuplicate: true,
        truthSegmentPaths: [],
      },
    ]);
  });
});
