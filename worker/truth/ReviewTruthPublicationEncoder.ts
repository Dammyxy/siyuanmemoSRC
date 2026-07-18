import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type MessagePackReviewEventTruthRecord,
  type StorageMutationEnvelope,
  type StorageMutationOperation,
} from '../../packages/contracts/src/backend-rpc';
import type { MessagePackTruthRecord } from './MessagePackTruthSegmentStore';

export const REVIEW_TRUTH_PUBLICATION_MAX_RECORD_BYTES = 64 * 1024;

const utf8 = new TextEncoder();

export type ReviewTruthPublicationRecord = MessagePackReviewEventTruthRecord & MessagePackTruthRecord;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function readNumber(source: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = source[key];
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }
  return fallback;
}

function readNullableNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }
  return null;
}

function readRating(source: Record<string, unknown>, payload: Record<string, unknown>): 1 | 2 | 3 | 4 | null {
  const value = readNumber(source, ['rating'], readNumber(payload, ['rating'], 0));
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

function parsePayload(row: Record<string, unknown>): Record<string, unknown> {
  const raw = row.payload_json ?? row.payloadJson ?? row.payload;
  if (isRecord(raw)) {
    return structuredClone(raw);
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function operationRow(operation: StorageMutationOperation): Record<string, unknown> | null {
  return isRecord(operation.row) ? operation.row : null;
}

function operationId(operation: StorageMutationOperation, row: Record<string, unknown>, fallback: string): string {
  return readString(row, ['id', 'event_id', 'eventId'])
    ?? readString(operation.primaryKey, ['id', 'event_id', 'eventId'])
    ?? fallback;
}

function firstReviewAggregateId(envelope: StorageMutationEnvelope): string | null {
  return envelope.requiredTruthOutputs
    .filter((output) => output.family === 'review')
    .flatMap((output) => output.aggregateIds)
    .map((aggregateId) => String(aggregateId || '').trim())
    .find(Boolean) ?? null;
}

function eventOperationToRecord(
  envelope: StorageMutationEnvelope,
  operation: StorageMutationOperation,
  index: number,
): ReviewTruthPublicationRecord | null {
  const row = operationRow(operation);
  if (!row || operation.operation === 'delete') {
    return null;
  }
  const payload = parsePayload(row);
  const eventId = operationId(operation, row, `${envelope.mutationId}:review-event:${index}`);
  const cardId = readString(row, ['card_id', 'cardId'])
    ?? readString(payload, ['cardId', 'card_id'])
    ?? firstReviewAggregateId(envelope)
    ?? eventId;
  const reviewedAt = readNumber(row, ['reviewed_at', 'reviewedAt'], readNumber(payload, ['reviewedAt'], envelope.createdAt));
  const rating = readRating(row, payload);
  const eventType = readString(row, ['event_type', 'eventType'])
    ?? readString(payload, ['eventType', 'type']);
  const idempotencyKey = readString(row, ['commit_idempotency_key', 'commitIdempotencyKey', 'idempotencyKey'])
    ?? readString(payload, ['commitIdempotencyKey', 'idempotencyKey'])
    ?? `review-event:${envelope.mutationId}:${eventId}`;
  const action = rating === null ? 'custom-feedback' : 'rating';
  const projectionGeneration = readNullableNumber(row, ['projection_generation', 'projectionGeneration'])
    ?? readNullableNumber(payload, ['projectionGeneration']);
  return {
    family: 'review-events',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    type: rating === null ? 'review.custom-feedback.v1' : 'review.feedback.v1',
    eventId,
    attemptId: readString(row, ['attempt_id', 'attemptId']) ?? readString(payload, ['attemptId']),
    journalEntryId: null,
    idempotencyKey,
    mutationId: envelope.mutationId,
    mutationFamily: envelope.family,
    journalSequence: envelope.journalSequence,
    logicalTime: reviewedAt,
    recordedAt: envelope.createdAt,
    source: {
      cardId,
      blockId: readString(payload, ['blockId', 'block_id']),
      sourceBlockId: readString(payload, ['sourceBlockId', 'source_block_id', 'blockId', 'block_id']),
      deckId: readString(payload, ['deckId', 'deck_id']),
      xiuyuanId: readString(payload, ['xiuyuanId', 'xiuyuanID', 'xiuyuan_id']),
      cardFaceId: readString(payload, ['cardFaceId', 'card_face_id']),
      sourceHash: readString(payload, ['sourceHash', 'source_hash']),
    },
    review: {
      action,
      rating,
      customActionId: action === 'custom-feedback' ? eventType ?? 'review-event' : null,
      reviewedAt,
      scheduler: readString(payload, ['scheduler', 'schedulerType', 'algorithm']),
    },
    memory: {
      baseMemoryHash: readString(payload, ['baseMemoryHash', 'base_memory_hash']),
      afterMemoryHash: readString(payload, ['afterMemoryHash', 'after_memory_hash']),
      projectionGeneration,
    },
    queue: {
      queueType: readString(payload, ['queueType', 'queue_type']),
      queueMode: readString(payload, ['queueMode', 'queue_mode']),
      commitPolicy: readString(payload, ['commitPolicy', 'commit_policy']),
    },
    scheduler: {
      schedulerType: readString(payload, ['schedulerType', 'scheduler']),
      algorithm: readString(payload, ['algorithm']),
      configHash: readString(payload, ['schedulerConfigHash', 'configHash']),
    },
    projection: {
      generation: projectionGeneration,
      policyHash: readString(payload, ['projectionPolicyHash', 'policyHash']),
      schemaVersion: readNullableNumber(payload, ['projectionSchemaVersion', 'schemaVersion']),
    },
  };
}

export function encodeReviewTruthPublicationRecords(
  envelope: StorageMutationEnvelope,
): ReviewTruthPublicationRecord[] {
  if (envelope.journalSequence === null || envelope.journalSequence < 1) {
    throw new Error(`review-truth-journal-sequence-missing:${envelope.mutationId}`);
  }
  const requiresReviewEventFact = envelope.requiredTruthOutputs.some((output) => (
    output.family === 'review' && output.kind === 'event'
  ));
  const records = envelope.operations
    .filter((operation) => operation.table === 'review_events')
    .map((operation, index) => eventOperationToRecord(envelope, operation, index))
    .filter((record): record is ReviewTruthPublicationRecord => Boolean(record));
  if (requiresReviewEventFact && records.length === 0) {
    throw new Error(`review-truth-current-event-missing:${envelope.mutationId}`);
  }
  for (const record of records) {
    assertReviewTruthPublicationRecord(envelope.mutationId, record);
  }
  return records;
}

export function assertReviewTruthPublicationRecord(
  mutationId: string,
  record: MessagePackTruthRecord,
): void {
  if (record.family !== 'review-events') {
    throw new Error(`review-truth-publication-family-mismatch:${mutationId}`);
  }
  if ('operations' in record) {
    throw new Error(`review-truth-bloated-record:${mutationId}:operations`);
  }
  if ('affectedAggregates' in record) {
    throw new Error(`review-truth-bloated-record:${mutationId}:affectedAggregates`);
  }
  const type = typeof record.type === 'string' ? record.type : '';
  if (!type.startsWith('review.')) {
    throw new Error(`review-truth-record-type-unsupported:${mutationId}:${type}`);
  }
  const byteSize = utf8.encode(JSON.stringify(record)).byteLength;
  if (byteSize > REVIEW_TRUTH_PUBLICATION_MAX_RECORD_BYTES) {
    throw new Error(`review-truth-record-too-large:${mutationId}:${type}:${byteSize}`);
  }
}
