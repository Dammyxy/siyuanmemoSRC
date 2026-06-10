import type {
  ReviewFeedbackJournalEntryStatus,
  ReviewFeedbackJournalStore,
} from '../db/ReviewFeedbackJournalStore';
import type {
  MessagePackTruthRecord,
  MessagePackTruthSegmentManifestEntry,
  MessagePackTruthSegmentStore,
} from './MessagePackTruthSegmentStore';
import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type MessagePackReviewEventTruthRecord,
  type MessagePackTruthSourceRef,
} from '../../packages/contracts/src/backend-rpc';

export interface ReviewFeedbackTruthFlushRuntimeOptions {
  journalStore: ReviewFeedbackJournalStore;
  truthStore: Pick<MessagePackTruthSegmentStore, 'appendRecords' | 'replayRecords'>;
  batchLimit?: number;
  now?: () => number;
  scheduleProjectionRefresh?: (segments: MessagePackTruthSegmentManifestEntry[]) => Promise<void> | void;
}

export interface ReviewFeedbackTruthFlushResult {
  ok: boolean;
  at: number;
  journalQueued: number;
  recordsWritten: number;
  segmentWritten: boolean;
  manifestUpdated: boolean;
  projectionRefreshScheduled: boolean;
  idempotencyDuplicateSkipped: number;
  flushedEntryIds: string[];
  segmentPaths: string[];
  error: string | null;
}

type ReviewFeedbackJournalEntry = {
  id: string;
  cardId: string;
  blockId?: string | null;
  idempotencyKey?: string | null;
  status: ReviewFeedbackJournalEntryStatus;
  recordedAt: number;
  request: {
    cardId?: unknown;
    blockId?: unknown;
    sourceBlockId?: unknown;
    deckId?: unknown;
    xiuyuanId?: unknown;
    sourceHash?: unknown;
    baseMemoryHash?: unknown;
    afterMemoryHash?: unknown;
    projectionGeneration?: unknown;
    scheduler?: unknown;
    rating?: unknown;
    reviewedAt?: unknown;
    idempotencyKey?: unknown;
    queueType?: unknown;
    queueMode?: unknown;
    commitPolicy?: unknown;
  };
  appliedAt?: number | null;
  projectionAppliedAt?: number | null;
  projectionGeneration?: number | null;
  truthCandidate?: MessagePackReviewEventTruthRecord | null;
  lastError?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeEntry(value: unknown): ReviewFeedbackJournalEntry | null {
  if (!isRecord(value) || !isRecord(value.request)) {
    return null;
  }
  const id = String(value.id || '').trim();
  const cardId = String(value.cardId || value.request.cardId || '').trim();
  const recordedAt = Number(value.recordedAt);
  if (!id || !cardId || !Number.isFinite(recordedAt)) {
    return null;
  }
  return {
    id,
    cardId,
    blockId: stringOrNull(value.blockId) ?? stringOrNull(value.request.blockId),
    idempotencyKey: typeof value.idempotencyKey === 'string' && value.idempotencyKey.trim()
      ? value.idempotencyKey.trim()
      : null,
    status: value.status === 'projection-applied' ? 'projection-applied' : 'prepared',
    recordedAt,
    request: value.request,
    appliedAt: typeof value.appliedAt === 'number' && Number.isFinite(value.appliedAt) ? value.appliedAt : null,
    projectionAppliedAt: typeof value.projectionAppliedAt === 'number' && Number.isFinite(value.projectionAppliedAt)
      ? value.projectionAppliedAt
      : null,
    projectionGeneration: finiteNumberOrNull(value.projectionGeneration)
      ?? finiteNumberOrNull(value.request.projectionGeneration),
    truthCandidate: normalizeTruthCandidate(value.truthCandidate),
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
  };
}

function normalizeTruthCandidate(value: unknown): MessagePackReviewEventTruthRecord | null {
  if (!isRecord(value)
    || value.family !== 'review-events'
    || value.type !== 'review.feedback.v2'
    || typeof value.idempotencyKey !== 'string'
    || !value.idempotencyKey.trim()
    || !isRecord(value.source)
    || typeof value.source.cardId !== 'string'
    || !value.source.cardId.trim()
    || !isRecord(value.review)
    || !Number.isFinite(Number(value.review.reviewedAt))
    || !isRecord(value.beforeCard)
    || !isRecord(value.afterCard)) {
    return null;
  }
  return value as MessagePackReviewEventTruthRecord;
}

function getIdempotencyKey(entry: ReviewFeedbackJournalEntry): string {
  if (entry.idempotencyKey) {
    return entry.idempotencyKey;
  }
  const requestKey = entry.request.idempotencyKey;
  return typeof requestKey === 'string' && requestKey.trim() ? requestKey.trim() : entry.id;
}

function toSourceRef(entry: ReviewFeedbackJournalEntry): MessagePackTruthSourceRef & { cardId: string } {
  return {
    cardId: entry.cardId,
    blockId: entry.blockId ?? null,
    sourceBlockId: stringOrNull(entry.request.sourceBlockId) ?? entry.blockId ?? null,
    deckId: stringOrNull(entry.request.deckId),
    xiuyuanId: stringOrNull(entry.request.xiuyuanId),
    sourceHash: stringOrNull(entry.request.sourceHash),
  };
}

function toReviewEventTruthRecord(entry: ReviewFeedbackJournalEntry, flushedAt: number): MessagePackReviewEventTruthRecord & MessagePackTruthRecord {
  if (entry.truthCandidate) {
    return {
      ...entry.truthCandidate,
      journalEntryId: entry.id,
      flushedAt,
    } as MessagePackReviewEventTruthRecord & MessagePackTruthRecord;
  }
  const reviewedAt = Number(entry.request.reviewedAt || entry.appliedAt || entry.recordedAt);
  const rating = Number(entry.request.rating || 0);
  const normalizedReviewedAt = Number.isFinite(reviewedAt) ? reviewedAt : entry.recordedAt;
  const normalizedRating = rating === 1 || rating === 2 || rating === 3 || rating === 4
    ? rating
    : null;
  return {
    family: 'review-events',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    type: 'review.feedback.v1',
    journalEntryId: entry.id,
    idempotencyKey: getIdempotencyKey(entry),
    cardId: entry.cardId,
    rating: normalizedRating,
    reviewedAt: normalizedReviewedAt,
    logicalTime: normalizedReviewedAt,
    recordedAt: entry.recordedAt,
    projectionAppliedAt: entry.projectionAppliedAt ?? null,
    flushedAt,
    queueType: typeof entry.request.queueType === 'string' ? entry.request.queueType : null,
    queueMode: typeof entry.request.queueMode === 'string' ? entry.request.queueMode : null,
    commitPolicy: typeof entry.request.commitPolicy === 'string' ? entry.request.commitPolicy : null,
    request: {
      cardId: entry.cardId,
      rating: entry.request.rating ?? null,
      reviewedAt: entry.request.reviewedAt ?? null,
      idempotencyKey: getIdempotencyKey(entry),
      queueType: entry.request.queueType ?? null,
      queueMode: entry.request.queueMode ?? null,
      commitPolicy: entry.request.commitPolicy ?? null,
    },
    source: toSourceRef(entry),
    review: {
      action: 'rating',
      rating: normalizedRating,
      reviewedAt: normalizedReviewedAt,
      scheduler: stringOrNull(entry.request.scheduler),
    },
    memory: {
      baseMemoryHash: stringOrNull(entry.request.baseMemoryHash),
      afterMemoryHash: stringOrNull(entry.request.afterMemoryHash),
      projectionGeneration: entry.projectionGeneration,
    },
    queue: {
      queueType: typeof entry.request.queueType === 'string' ? entry.request.queueType : null,
      queueMode: typeof entry.request.queueMode === 'string' ? entry.request.queueMode : null,
      commitPolicy: typeof entry.request.commitPolicy === 'string' ? entry.request.commitPolicy : null,
    },
  };
}

function emptyResult(at: number): ReviewFeedbackTruthFlushResult {
  return {
    ok: true,
    at,
    journalQueued: 0,
    recordsWritten: 0,
    segmentWritten: false,
    manifestUpdated: false,
    projectionRefreshScheduled: false,
    idempotencyDuplicateSkipped: 0,
    flushedEntryIds: [],
    segmentPaths: [],
    error: null,
  };
}

export class ReviewFeedbackTruthFlushRuntime {
  private readonly journalStore: ReviewFeedbackJournalStore;
  private readonly truthStore: Pick<MessagePackTruthSegmentStore, 'appendRecords' | 'replayRecords'>;
  private readonly batchLimit: number;
  private readonly now: () => number;
  private readonly scheduleProjectionRefresh?: (segments: MessagePackTruthSegmentManifestEntry[]) => Promise<void> | void;
  private lastResult: ReviewFeedbackTruthFlushResult | null = null;

  constructor(options: ReviewFeedbackTruthFlushRuntimeOptions) {
    this.journalStore = options.journalStore;
    this.truthStore = options.truthStore;
    this.batchLimit = Math.max(1, Math.floor(Number(options.batchLimit) || 64));
    this.now = options.now ?? Date.now;
    this.scheduleProjectionRefresh = options.scheduleProjectionRefresh;
  }

  getLastResult(): ReviewFeedbackTruthFlushResult | null {
    return this.lastResult ? structuredClone(this.lastResult) : null;
  }

  async flushProjectionApplied(): Promise<ReviewFeedbackTruthFlushResult> {
    const at = this.now();
    const projectionApplied = (await this.journalStore.listEntriesByStatus('projection-applied', this.batchLimit))
      .map(normalizeEntry)
      .filter((entry): entry is ReviewFeedbackJournalEntry => entry !== null)
      .sort((left, right) => left.recordedAt - right.recordedAt)
      .slice(0, this.batchLimit);
    if (projectionApplied.length === 0) {
      this.lastResult = emptyResult(at);
      return this.lastResult;
    }

    let recordsWritten = 0;
    let segmentPaths: string[] = [];
    let idempotencyDuplicateSkipped = 0;
    let flushedEntryIds: string[] = [];
    let projectionRefreshScheduled = false;

    try {
      const replay = await this.truthStore.replayRecords({ dedupeByIdempotencyKey: true });
      const existingIdempotencyKeys = new Set(
        replay.records
          .map((record) => typeof record.idempotencyKey === 'string' ? record.idempotencyKey : null)
          .filter((key): key is string => Boolean(key)),
      );
      const duplicateEntries: ReviewFeedbackJournalEntry[] = [];
      const entriesToFlush: ReviewFeedbackJournalEntry[] = [];
      for (const entry of projectionApplied) {
        if (existingIdempotencyKeys.has(getIdempotencyKey(entry))) {
          duplicateEntries.push(entry);
          continue;
        }
        entriesToFlush.push(entry);
      }
      const records = entriesToFlush.map((entry) => toReviewEventTruthRecord(entry, at));
      const appendResult = records.length > 0
        ? await this.truthStore.appendRecords(records)
        : { segments: [] as MessagePackTruthSegmentManifestEntry[] };
      recordsWritten = records.length;
      segmentPaths = appendResult.segments.map((segment) => segment.path);
      idempotencyDuplicateSkipped = duplicateEntries.length;
      for (const entry of [...entriesToFlush, ...duplicateEntries]) {
        await this.journalStore.updateEntryStatus(entry.id, 'truth-flushed', {
          truthFlushedAt: at,
          truthFlushDuplicate: duplicateEntries.includes(entry),
          truthSegmentPaths: duplicateEntries.includes(entry)
            ? []
            : segmentPaths,
          lastError: null,
        });
        flushedEntryIds.push(entry.id);
      }
      if (appendResult.segments.length > 0) {
        await this.scheduleProjectionRefresh?.(appendResult.segments);
        projectionRefreshScheduled = true;
      }
      this.lastResult = {
        ok: true,
        at,
        journalQueued: projectionApplied.length,
        recordsWritten,
        segmentWritten: segmentPaths.length > 0,
        manifestUpdated: segmentPaths.length > 0,
        projectionRefreshScheduled,
        idempotencyDuplicateSkipped,
        flushedEntryIds,
        segmentPaths,
        error: null,
      };
      return this.lastResult;
    } catch (error) {
      this.lastResult = {
        ...emptyResult(at),
        ok: false,
        journalQueued: projectionApplied.length,
        recordsWritten,
        segmentWritten: segmentPaths.length > 0,
        manifestUpdated: segmentPaths.length > 0,
        projectionRefreshScheduled,
        idempotencyDuplicateSkipped,
        flushedEntryIds,
        segmentPaths,
        error: errorMessage(error),
      };
      return this.lastResult;
    }
  }
}
