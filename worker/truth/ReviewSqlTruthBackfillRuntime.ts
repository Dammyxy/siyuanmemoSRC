import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
} from '../../packages/contracts/src/backend-rpc';
import type {
  MessagePackTruthRecord,
  MessagePackTruthSegmentManifestEntry,
  MessagePackTruthSegmentStore,
} from './MessagePackTruthSegmentStore';

export interface ReviewSqlTruthBackfillRow {
  id: string | null;
  cardId: string | null;
  attemptId: string | null;
  rating: number | null;
  reviewedAt: number | null;
  eventType: string | null;
  commitIdempotencyKey: string | null;
  payloadJson: string | null;
  msgpackRef: string | null;
  truthHash: string | null;
  truthSchemaVersion: number | null;
  projectionGeneration: number | null;
}

export interface ReviewSqlTruthBackfillProjectionPatch {
  eventId: string;
  msgpackRef: string;
  truthHash: string;
  truthSchemaVersion: number;
  projectionGeneration: number;
}

export interface ReviewSqlTruthBackfillRuntimeOptions {
  truthStore: Pick<MessagePackTruthSegmentStore, 'appendRecords' | 'replayRecords'>;
  deviceId: string;
  generationId: string;
  schemaVersion?: number;
  maxSegmentBytes?: number;
  limit?: number;
  sourceId?: string | null;
  now?: () => number;
  listRows: (limit: number) => ReviewSqlTruthBackfillRow[] | Promise<ReviewSqlTruthBackfillRow[]>;
  patchRows: (patches: ReviewSqlTruthBackfillProjectionPatch[]) => void | Promise<void>;
  scheduleProjectionRefresh?: (segments: MessagePackTruthSegmentManifestEntry[]) => Promise<void> | void;
}

export interface ReviewSqlTruthBackfillResult {
  ok: boolean;
  at: number;
  source: 'review_events';
  sqlRowsRead: number;
  recordsWritten: number;
  segmentWritten: boolean;
  manifestUpdated: boolean;
  projectionRefreshScheduled: boolean;
  idempotencyDuplicateSkipped: number;
  backfilledEventIds: string[];
  duplicateEventIds: string[];
  repairRequiredEventIds: string[];
  segmentPaths: string[];
  syncVisible: boolean;
  error: string | null;
}

type NormalizedBackfillRow = {
  row: ReviewSqlTruthBackfillRow;
  eventId: string;
  cardId: string;
  attemptId: string | null;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: number;
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

type NormalizeResult =
  | { ok: true; value: NormalizedBackfillRow }
  | { ok: false; eventId: string; reason: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integerOrDefault(value: unknown, defaultValue: number): number {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) ? normalized : defaultValue;
}

function parsePayloadJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return null;
  }
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function payloadString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = stringOrNull(payload[key]);
    if (direct) {
      return direct;
    }
  }
  return null;
}

function normalizeBackfillRow(row: ReviewSqlTruthBackfillRow): NormalizeResult {
  const eventId = stringOrNull(row.id) ?? 'unknown';
  const cardId = stringOrNull(row.cardId);
  const reviewedAt = numberOrNull(row.reviewedAt);
  const rating = integerOrDefault(row.rating, 0);
  const eventType = stringOrNull(row.eventType) ?? 'review-v2';
  const payload = parsePayloadJson(row.payloadJson);
  if (!stringOrNull(row.id)) {
    return { ok: false, eventId, reason: 'missing-event-id' };
  }
  if (!cardId) {
    return { ok: false, eventId, reason: 'missing-card-id' };
  }
  if (reviewedAt === null) {
    return { ok: false, eventId, reason: 'invalid-reviewed-at' };
  }
  if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) {
    return { ok: false, eventId, reason: 'invalid-rating' };
  }
  if (payload === null) {
    return { ok: false, eventId, reason: 'invalid-payload-json' };
  }
  return {
    ok: true,
    value: {
      row,
      eventId,
      cardId,
      attemptId: stringOrNull(row.attemptId),
      rating,
      reviewedAt,
      eventType,
      idempotencyKey: stringOrNull(row.commitIdempotencyKey) ?? `review_events:${eventId}`,
      payload,
    },
  };
}

function toReviewEventTruthRecord(
  input: NormalizedBackfillRow,
  options: {
    at: number;
    sourceId: string | null;
    schemaVersion: number;
  },
): MessagePackTruthRecord {
  const sourceBlockId = payloadString(input.payload, ['sourceBlockId', 'blockId']);
  const queueType = payloadString(input.payload, ['queueType']);
  const queueMode = payloadString(input.payload, ['queueMode']);
  const commitPolicy = payloadString(input.payload, ['commitPolicy']);
  const scheduler = payloadString(input.payload, ['schedulerType', 'scheduler', 'algorithm']);
  return {
    family: 'review-events',
    schemaVersion: options.schemaVersion,
    type: 'review.feedback.v1',
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    logicalTime: input.reviewedAt,
    recordedAt: input.reviewedAt,
    cardId: input.cardId,
    attemptId: input.attemptId,
    rating: input.rating,
    reviewedAt: input.reviewedAt,
    source: {
      cardId: input.cardId,
      blockId: payloadString(input.payload, ['blockId']) ?? sourceBlockId,
      sourceBlockId,
      deckId: payloadString(input.payload, ['deckId']),
      xiuyuanId: payloadString(input.payload, ['xiuyuanId']),
      sourceHash: payloadString(input.payload, ['sourceHash']),
    },
    review: {
      action: 'rating',
      rating: input.rating,
      reviewedAt: input.reviewedAt,
      scheduler,
    },
    memory: {
      baseMemoryHash: payloadString(input.payload, ['baseMemoryHash']),
      afterMemoryHash: payloadString(input.payload, ['afterMemoryHash']),
      projectionGeneration: numberOrNull(input.row.projectionGeneration),
    },
    queue: {
      queueType,
      queueMode,
      commitPolicy,
    },
    sqlLineage: {
      sourceId: options.sourceId,
      table: 'review_events',
      eventId: input.eventId,
      eventType: input.eventType,
      importedAt: options.at,
    },
  };
}

function emptyResult(at: number): ReviewSqlTruthBackfillResult {
  return {
    ok: true,
    at,
    source: 'review_events',
    sqlRowsRead: 0,
    recordsWritten: 0,
    segmentWritten: false,
    manifestUpdated: false,
    projectionRefreshScheduled: false,
    idempotencyDuplicateSkipped: 0,
    backfilledEventIds: [],
    duplicateEventIds: [],
    repairRequiredEventIds: [],
    segmentPaths: [],
    syncVisible: false,
    error: null,
  };
}

export class ReviewSqlTruthBackfillRuntime {
  private readonly truthStore: Pick<MessagePackTruthSegmentStore, 'appendRecords' | 'replayRecords'>;
  private readonly deviceId: string;
  private readonly generationId: string;
  private readonly schemaVersion: number;
  private readonly limit: number;
  private readonly sourceId: string | null;
  private readonly now: () => number;
  private readonly listRows: ReviewSqlTruthBackfillRuntimeOptions['listRows'];
  private readonly patchRows: ReviewSqlTruthBackfillRuntimeOptions['patchRows'];
  private readonly scheduleProjectionRefresh?: ReviewSqlTruthBackfillRuntimeOptions['scheduleProjectionRefresh'];
  private lastResult: ReviewSqlTruthBackfillResult | null = null;

  constructor(options: ReviewSqlTruthBackfillRuntimeOptions) {
    this.truthStore = options.truthStore;
    this.deviceId = String(options.deviceId || '').trim();
    this.generationId = String(options.generationId || '').trim();
    this.schemaVersion = Math.max(1, Math.floor(Number(options.schemaVersion) || MESSAGEPACK_TRUTH_SCHEMA_VERSION));
    this.limit = Math.max(1, Math.floor(Number(options.limit) || 64));
    this.sourceId = stringOrNull(options.sourceId);
    this.now = options.now ?? Date.now;
    this.listRows = options.listRows;
    this.patchRows = options.patchRows;
    this.scheduleProjectionRefresh = options.scheduleProjectionRefresh;
  }

  getLastResult(): ReviewSqlTruthBackfillResult | null {
    return this.lastResult ? structuredClone(this.lastResult) : null;
  }

  async backfill(): Promise<ReviewSqlTruthBackfillResult> {
    const at = this.now();
    let rows: ReviewSqlTruthBackfillRow[] = [];
    try {
      rows = (await this.listRows(this.limit)).slice(0, this.limit);
      if (rows.length === 0) {
        this.lastResult = emptyResult(at);
        return this.lastResult;
      }

      const normalized = rows.map(normalizeBackfillRow);
      const invalid = normalized.filter((item): item is Extract<NormalizeResult, { ok: false }> => !item.ok);
      if (invalid.length > 0) {
        this.lastResult = {
          ...emptyResult(at),
          ok: false,
          sqlRowsRead: rows.length,
          repairRequiredEventIds: invalid.map((item) => item.eventId),
          error: `repair-required: ${invalid.map((item) => `${item.eventId}:${item.reason}`).join(', ')}`,
        };
        return this.lastResult;
      }

      const candidates = normalized.map((item) => item.value);
      const replay = await this.truthStore.replayRecords({ dedupeByIdempotencyKey: true });
      const existingIdempotencyKeys = new Set(
        replay.records
          .map((record) => stringOrNull(record.idempotencyKey))
          .filter((key): key is string => Boolean(key)),
      );
      const duplicateRows: NormalizedBackfillRow[] = [];
      const rowsToWrite: NormalizedBackfillRow[] = [];
      for (const candidate of candidates) {
        if (existingIdempotencyKeys.has(candidate.idempotencyKey)) {
          duplicateRows.push(candidate);
          continue;
        }
        rowsToWrite.push(candidate);
      }

      const records = rowsToWrite.map((row) => toReviewEventTruthRecord(row, {
        at,
        sourceId: this.sourceId,
        schemaVersion: this.schemaVersion,
      }));
      const appendResult = records.length > 0
        ? await this.truthStore.appendRecords(records)
        : { segments: [] as MessagePackTruthSegmentManifestEntry[] };
      const segmentPaths = appendResult.segments.map((segment) => segment.path);
      if (appendResult.segments.length > 0) {
        await this.scheduleProjectionRefresh?.(appendResult.segments);
      }

      if (records.length > 0) {
        const segmentPath = segmentPaths[0] ?? '';
        await this.patchRows(rowsToWrite.map((row, index) => {
          const record = records[index];
          const msgpackRef = {
            family: 'review-events',
            deviceId: this.deviceId,
            generationId: this.generationId,
            schemaVersion: this.schemaVersion,
            segmentPath,
            recordId: row.eventId,
            idempotencyKey: row.idempotencyKey,
          };
          return {
            eventId: row.eventId,
            msgpackRef: JSON.stringify(msgpackRef),
            truthHash: stableHash(JSON.stringify(record)),
            truthSchemaVersion: this.schemaVersion,
            projectionGeneration: at,
          };
        }));
      }

      this.lastResult = {
        ok: true,
        at,
        source: 'review_events',
        sqlRowsRead: rows.length,
        recordsWritten: records.length,
        segmentWritten: appendResult.segments.length > 0,
        manifestUpdated: appendResult.segments.length > 0,
        projectionRefreshScheduled: appendResult.segments.length > 0,
        idempotencyDuplicateSkipped: duplicateRows.length,
        backfilledEventIds: rowsToWrite.map((row) => row.eventId),
        duplicateEventIds: duplicateRows.map((row) => row.eventId),
        repairRequiredEventIds: [],
        segmentPaths,
        syncVisible: appendResult.segments.length > 0 || duplicateRows.length > 0,
        error: null,
      };
      return this.lastResult;
    } catch (error) {
      this.lastResult = {
        ...emptyResult(at),
        ok: false,
        sqlRowsRead: rows.length,
        error: errorMessage(error),
      };
      return this.lastResult;
    }
  }
}
