import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type MessagePackCardAggregateSnapshotTruthRecord,
  type MessagePackCardAggregateTombstoneTruthRecord,
  type MessagePackQueueSnapshotTruthRecord,
  type MessagePackQueueStateChangesetTruthRecord,
  type MessagePackReviewEventTruthRecord,
} from '../../packages/contracts/src/backend-rpc';
import {
  reconstructCanonicalTruthState,
  replayCardAggregateTruthRecords,
  replayQueueFamilyTruthRecords,
} from './CompactableCanonicalTruth';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthRecord,
  type MessagePackTruthCompactionResult,
  type MessagePackTruthSegmentFileStore,
  type MessagePackTruthSegmentStore,
} from './MessagePackTruthSegmentStore';
import {
  MessagePackTruthSnapshotGenerationStore,
  type MessagePackTruthPublishGenerationResult,
} from './MessagePackTruthSnapshotGenerationStore';
import { assertReviewTruthPublicationRecord } from './ReviewTruthPublicationEncoder';

export type WorkerCompactableTruthFamily = 'card-memory-facts' | 'queue-facts';

export interface WorkerTruthCompactionModuleOptions {
  fileStore: MessagePackTruthSegmentFileStore;
  deviceId: string;
  schemaVersion: number;
  sourceGenerationIds: Record<WorkerCompactableTruthFamily, string>;
  reviewGenerationId: string;
  maxSegmentBytes?: number;
  maxSegmentRecords?: number;
}

export interface WorkerTruthFamilyCompactionResult {
  family: WorkerCompactableTruthFamily;
  status: 'compacted' | 'noop';
  generationId: string | null;
  previousGenerationId: string | null;
  sourceRecordCount: number;
  snapshotRecordCount: number;
  coveredJournalSequence: number;
  orphanPaths: string[];
  reclaimedPaths: string[];
}

export interface WorkerTruthCompactionResult {
  families: WorkerTruthFamilyCompactionResult[];
  reviewEvents: WorkerReviewTruthCleanupResult;
}

export interface WorkerReviewTruthCleanupResult extends MessagePackTruthCompactionResult {
  family: 'review-events';
  generationId: string | null;
  previousGenerationId: string | null;
  sourceRecordCount: number;
  skinnyRecordCount: number;
  bloatedRecordCount: number;
  coveredJournalSequence: number;
  verifiedProjectionRows: number;
  orphanPaths: string[];
  reclaimedPaths: string[];
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid truth compaction ${label}: ${value}`);
  }
  return normalized;
}

function normalizeSchemaVersion(value: number): number {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized !== MESSAGEPACK_TRUTH_SCHEMA_VERSION) {
    throw new Error(`Unsupported truth compaction schema version: ${value}`);
  }
  return normalized;
}

function recordJournalSequence(record: MessagePackTruthRecord): number {
  const sequence = Math.floor(Number(record.journalSequence) || 0);
  return Math.max(0, sequence);
}

function deterministicGenerationId(
  family: WorkerCompactableTruthFamily,
  coveredJournalSequence: number,
  snapshotRecordCount: number,
): string {
  return `compact-${family}-${coveredJournalSequence}-${snapshotRecordCount}`;
}

function deterministicReviewGenerationId(
  coveredJournalSequence: number,
  snapshotRecordCount: number,
  records: MessagePackTruthRecord[],
): string {
  return `slim-review-events-${coveredJournalSequence}-${snapshotRecordCount}-${shortStableHash(records)}`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue((value as Record<string, unknown>)[key])]),
  );
}

function recordsEquivalent(left: MessagePackTruthRecord[], right: MessagePackTruthRecord[]): boolean {
  return left.length === right.length
    && JSON.stringify(left.map(stableValue)) === JSON.stringify(right.map(stableValue));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function parsePayload(record: Record<string, unknown>): Record<string, unknown> {
  const raw = record.payload_json ?? record.payloadJson ?? record.payload;
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

function reviewRecordHasBloat(record: MessagePackTruthRecord): boolean {
  const type = typeof record.type === 'string' ? record.type : '';
  return 'operations' in record
    || 'affectedAggregates' in record
    || type.startsWith('storage.review.');
}

function reviewProjectionSignature(record: Record<string, unknown>, index: number): Record<string, unknown> {
  const source = isRecord(record.source) ? record.source : {};
  const review = isRecord(record.review) ? record.review : {};
  const eventId = readString(record, ['eventId', 'id', 'journalEntryId', 'idempotencyKey'])
    ?? `review:${index}`;
  return {
    eventId,
    cardId: readString(record, ['card_id', 'cardId']) ?? readString(source, ['cardId', 'card_id']),
    rating: readNumber(record, ['rating']) ?? readNumber(review, ['rating']),
    reviewedAt: readNumber(record, ['reviewed_at', 'reviewedAt', 'logicalTime'])
      ?? readNumber(review, ['reviewedAt', 'reviewed_at']),
  };
}

function reviewProjectionSignatures(records: Array<Record<string, unknown>>): string[] {
  return records
    .map((record, index) => JSON.stringify(stableValue(reviewProjectionSignature(record, index))))
    .sort();
}

function stableReviewFactsEquivalent(
  left: Array<Record<string, unknown>>,
  right: Array<Record<string, unknown>>,
): boolean {
  return JSON.stringify(reviewProjectionSignatures(left)) === JSON.stringify(reviewProjectionSignatures(right));
}

function reviewRating(record: Record<string, unknown>, payload: Record<string, unknown>, review: Record<string, unknown>): 1 | 2 | 3 | 4 | null {
  const value = readNumber(record, ['rating'])
    ?? readNumber(payload, ['rating'])
    ?? readNumber(review, ['rating']);
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

function normalizeReviewFact(
  record: Record<string, unknown>,
  index: number,
): MessagePackReviewEventTruthRecord & MessagePackTruthRecord {
  const payload = parsePayload(record);
  const source = isRecord(record.source) ? record.source : {};
  const review = isRecord(record.review) ? record.review : {};
  const eventId = readString(record, ['eventId', 'id', 'journalEntryId', 'idempotencyKey'])
    ?? `review-cleanup:${index}`;
  const cardId = readString(record, ['card_id', 'cardId'])
    ?? readString(source, ['cardId', 'card_id'])
    ?? readString(payload, ['cardId', 'card_id'])
    ?? eventId;
  const reviewedAt = readNumber(record, ['reviewed_at', 'reviewedAt', 'logicalTime'])
    ?? readNumber(review, ['reviewedAt', 'reviewed_at'])
    ?? 0;
  const rating = reviewRating(record, payload, review);
  const typedRecord = {
    family: 'review-events' as const,
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    type: rating === null ? 'review.custom-feedback.v1' as const : 'review.feedback.v1' as const,
    idempotencyKey: readString(record, ['idempotencyKey', 'commit_idempotency_key', 'commitIdempotencyKey'])
      ?? eventId,
    eventId,
    attemptId: readString(record, ['attemptId', 'attempt_id']) ?? readString(payload, ['attemptId', 'attempt_id']),
    journalEntryId: readString(record, ['journalEntryId', 'journal_entry_id']),
    logicalTime: reviewedAt,
    recordedAt: readNumber(record, ['recordedAt', 'recorded_at']) ?? reviewedAt,
    source: {
      cardId,
      blockId: readString(source, ['blockId', 'block_id']) ?? readString(payload, ['blockId', 'block_id']),
      sourceBlockId: readString(source, ['sourceBlockId', 'source_block_id'])
        ?? readString(payload, ['sourceBlockId', 'source_block_id', 'blockId', 'block_id']),
      deckId: readString(source, ['deckId', 'deck_id']) ?? readString(payload, ['deckId', 'deck_id']),
      xiuyuanId: readString(source, ['xiuyuanId', 'xiuyuanID', 'xiuyuan_id'])
        ?? readString(payload, ['xiuyuanId', 'xiuyuanID', 'xiuyuan_id']),
      cardFaceId: readString(source, ['cardFaceId', 'card_face_id'])
        ?? readString(payload, ['cardFaceId', 'card_face_id']),
      sourceHash: readString(source, ['sourceHash', 'source_hash']) ?? readString(payload, ['sourceHash', 'source_hash']),
    },
    review: {
      action: rating === null ? 'custom-feedback' as const : 'rating' as const,
      rating,
      customActionId: rating === null
        ? readString(record, ['event_type', 'eventType', 'type']) ?? 'review-event'
        : null,
      reviewedAt,
      scheduler: readString(review, ['scheduler']) ?? readString(payload, ['scheduler', 'schedulerType']),
    },
    memory: {
      baseMemoryHash: readString(payload, ['baseMemoryHash', 'base_memory_hash']),
      afterMemoryHash: readString(payload, ['afterMemoryHash', 'after_memory_hash']),
      projectionGeneration: readNumber(record, ['projection_generation', 'projectionGeneration'])
        ?? readNumber(payload, ['projectionGeneration']),
    },
    queue: {
      queueType: readString(payload, ['queueType', 'queue_type']) ?? readString(record, ['queueType', 'queue_type']),
      queueMode: readString(payload, ['queueMode', 'queue_mode']) ?? readString(record, ['queueMode', 'queue_mode']),
      commitPolicy: readString(payload, ['commitPolicy', 'commit_policy']) ?? readString(record, ['commitPolicy', 'commit_policy']),
    },
    scheduler: {
      schedulerType: readString(payload, ['schedulerType', 'scheduler']) ?? readString(review, ['scheduler']),
      algorithm: readString(payload, ['algorithm']),
      configHash: readString(payload, ['schedulerConfigHash', 'configHash']),
    },
    projection: {
      generation: readNumber(record, ['projection_generation', 'projectionGeneration'])
        ?? readNumber(payload, ['projectionGeneration']),
      policyHash: readString(payload, ['projectionPolicyHash', 'policyHash']),
      schemaVersion: readNumber(payload, ['projectionSchemaVersion', 'schemaVersion']),
    },
  };
  assertReviewTruthPublicationRecord(`review-cleanup:${eventId}`, typedRecord);
  return typedRecord;
}

function normalizeReviewFacts(records: MessagePackTruthRecord[]): MessagePackTruthRecord[] {
  const reconstructed = reconstructCanonicalTruthState({
    truthRecords: records,
    uncoveredMutations: [],
  });
  const deduped = new Map<string, MessagePackTruthRecord>();
  reconstructed.reviewEvents.forEach((record, index) => {
    const normalized = normalizeReviewFact(record, index);
    deduped.set(String(normalized.idempotencyKey || normalized.eventId), normalized);
  });
  return [...deduped.values()].sort((left, right) => (
    (Number(left.logicalTime) || 0) - (Number(right.logicalTime) || 0)
    || String(left.idempotencyKey || '').localeCompare(String(right.idempotencyKey || ''))
  ));
}

function shortStableHash(value: unknown): string {
  const text = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isRecoverableOrphanGenerationConflict(error: unknown): boolean {
  const message = errorMessage(error);
  return message.startsWith('snapshot-generation-descriptor-immutable-conflict:')
    || message.startsWith('snapshot-generation-immutable-conflict:');
}

export class WorkerTruthCompactionModule {
  private readonly fileStore: MessagePackTruthSegmentFileStore;
  private readonly deviceId: string;
  private readonly schemaVersion: number;
  private readonly sourceGenerationIds: Record<WorkerCompactableTruthFamily, string>;
  private readonly reviewGenerationId: string;
  private readonly maxSegmentBytes?: number;
  private readonly maxSegmentRecords?: number;
  private readonly sourceStores = new Map<WorkerCompactableTruthFamily, MessagePackTruthSegmentStore>();
  private readonly generationStores = new Map<
    WorkerCompactableTruthFamily,
    MessagePackTruthSnapshotGenerationStore
  >();

  constructor(options: WorkerTruthCompactionModuleOptions) {
    this.fileStore = options.fileStore;
    this.deviceId = normalizeIdentity(options.deviceId, 'deviceId');
    this.schemaVersion = normalizeSchemaVersion(options.schemaVersion);
    this.sourceGenerationIds = {
      'card-memory-facts': normalizeIdentity(
        options.sourceGenerationIds['card-memory-facts'],
        'card source generationId',
      ),
      'queue-facts': normalizeIdentity(
        options.sourceGenerationIds['queue-facts'],
        'queue source generationId',
      ),
    };
    this.reviewGenerationId = normalizeIdentity(options.reviewGenerationId, 'review generationId');
    this.maxSegmentBytes = options.maxSegmentBytes;
    this.maxSegmentRecords = options.maxSegmentRecords;
  }

  async compactAll(): Promise<WorkerTruthCompactionResult> {
    return {
      families: [
        await this.compactFamily('card-memory-facts'),
        await this.compactFamily('queue-facts'),
      ],
      reviewEvents: await this.cleanupReviewEvents(),
    };
  }

  async cleanupReviewEvents(): Promise<WorkerReviewTruthCleanupResult> {
    const sourceStore = createMessagePackTruthSegmentStore({
      fileStore: this.fileStore,
      family: 'review-events',
      deviceId: this.deviceId,
      generationId: this.reviewGenerationId,
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
      maxSegmentRecords: this.maxSegmentRecords,
    });
    const source = await sourceStore.replayRecords({ dedupeByIdempotencyKey: true });
    if (source.diagnostics.length > 0) {
      throw new Error(
        `review-truth-cleanup-source-invalid:${source.diagnostics.map((item) => item.reason).join(',')}`,
      );
    }
    const bloatedRecordCount = source.records.filter(reviewRecordHasBloat).length;
    const coveredJournalSequence = source.records.reduce(
      (maximum, record) => Math.max(maximum, recordJournalSequence(record)),
      0,
    );
    if (bloatedRecordCount === 0) {
      const compacted = await sourceStore.compactSegments();
      return {
        ...compacted,
        family: 'review-events',
        generationId: null,
        previousGenerationId: null,
        sourceRecordCount: source.records.length,
        skinnyRecordCount: source.records.length,
        bloatedRecordCount,
        coveredJournalSequence,
        verifiedProjectionRows: source.records.length,
        orphanPaths: [],
        reclaimedPaths: compacted.deletedPaths,
      };
    }
    if (!this.fileStore.deleteFile || !this.fileStore.listFiles) {
      throw new Error('review-truth-cleanup-delete-unavailable');
    }

    const skinnyRecords = normalizeReviewFacts(source.records);
    const before = reconstructCanonicalTruthState({
      truthRecords: source.records,
      uncoveredMutations: [],
    });
    const after = reconstructCanonicalTruthState({
      truthRecords: skinnyRecords,
      uncoveredMutations: [],
    });
    if (!stableReviewFactsEquivalent(before.reviewEvents, after.reviewEvents)) {
      throw new Error('review-truth-cleanup-projection-verification-failed');
    }

    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore: this.fileStore,
      family: 'review-events',
      deviceId: this.deviceId,
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
      maxSegmentRecords: this.maxSegmentRecords,
    });
    const inspection = await generationStore.inspectGenerations();
    let published: MessagePackTruthPublishGenerationResult | null = null;
    let generationId = deterministicReviewGenerationId(
      coveredJournalSequence,
      skinnyRecords.length,
      skinnyRecords,
    );
    if (inspection.fence.current) {
      try {
        const current = await generationStore.replayVerifiedGeneration(inspection.fence.current);
        if (recordsEquivalent(current.records, skinnyRecords)) {
          const reclaimedLegacy = await this.deleteReviewSourceGenerationPaths();
          const retained = await generationStore.reclaimObsoleteGenerations();
          const retainedInspection = await generationStore.inspectGenerations();
          return {
            status: 'compacted',
            reason: 'closed-segment-count-exceeded',
            sourceSegmentCount: source.manifest.segments.length,
            replacementSegmentCount: 0,
            remainingSegmentCount: current.manifest.segments.length,
            recordCount: source.records.length,
            deletedPaths: [...reclaimedLegacy, ...retained.deletedPaths],
            family: 'review-events',
            generationId: inspection.fence.current.generationId,
            previousGenerationId: inspection.fence.previous?.generationId ?? null,
            sourceRecordCount: source.records.length,
            skinnyRecordCount: skinnyRecords.length,
            bloatedRecordCount,
            coveredJournalSequence,
            verifiedProjectionRows: after.reviewEvents.length,
            orphanPaths: retainedInspection.orphanPaths,
            reclaimedPaths: [...reclaimedLegacy, ...retained.deletedPaths],
          };
        }
      } catch {
        // publishGeneration keeps the existing fence unchanged unless verification succeeds.
      }
    }

    try {
      published = await generationStore.publishGeneration({
        generationId,
        records: skinnyRecords,
        expectedCurrentGenerationId: inspection.fence.current?.generationId ?? null,
      });
    } catch (error) {
      if (!isRecoverableOrphanGenerationConflict(error)) {
        throw error;
      }
      await generationStore.reclaimObsoleteGenerations();
      const reclaimedInspection = await generationStore.inspectGenerations();
      generationId = `${generationId}-recovered-${reclaimedInspection.fence.fence + 1}`;
      published = await generationStore.publishGeneration({
        generationId,
        records: skinnyRecords,
        expectedCurrentGenerationId: reclaimedInspection.fence.current?.generationId ?? null,
      });
    }
    const reclaimedLegacy = await this.deleteReviewSourceGenerationPaths();
    const retained = await generationStore.reclaimObsoleteGenerations();
    const retainedInspection = await generationStore.inspectGenerations();
    return {
      status: 'compacted',
      reason: 'closed-segment-count-exceeded',
      sourceSegmentCount: source.manifest.segments.length,
      replacementSegmentCount: published.generation.manifest.segments.length,
      remainingSegmentCount: published.generation.manifest.segments.length,
      recordCount: source.records.length,
      deletedPaths: [...reclaimedLegacy, ...retained.deletedPaths],
      family: 'review-events',
      generationId: published.fence.current?.generationId ?? generationId,
      previousGenerationId: published.fence.previous?.generationId ?? null,
      sourceRecordCount: source.records.length,
      skinnyRecordCount: skinnyRecords.length,
      bloatedRecordCount,
      coveredJournalSequence,
      verifiedProjectionRows: after.reviewEvents.length,
      orphanPaths: retainedInspection.orphanPaths,
      reclaimedPaths: [...reclaimedLegacy, ...retained.deletedPaths],
    };
  }

  private async deleteReviewSourceGenerationPaths(): Promise<string[]> {
    if (!this.fileStore.listFiles || !this.fileStore.deleteFile) {
      throw new Error('review-truth-cleanup-delete-unavailable');
    }
    const prefix = `truth/review-events/${this.reviewGenerationId}/device-${this.deviceId}/`;
    const paths = (await this.fileStore.listFiles(prefix))
      .map((path) => String(path || '').replace(/\\/g, '/').trim())
      .filter((path) => path.startsWith(prefix))
      .sort();
    const deletedPaths: string[] = [];
    for (const path of paths) {
      await this.fileStore.deleteFile(path);
      if (await this.fileStore.readBinary(path)) {
        throw new Error(`review-truth-cleanup-delete-verification-failed:${path}`);
      }
      if (await this.fileStore.readJSON(path)) {
        throw new Error(`review-truth-cleanup-delete-verification-failed:${path}`);
      }
      deletedPaths.push(path);
    }
    return deletedPaths;
  }

  async compactFamily(
    family: WorkerCompactableTruthFamily,
  ): Promise<WorkerTruthFamilyCompactionResult> {
    const source = await this.getSourceStore(family).replayRecords({
      dedupeByIdempotencyKey: true,
    });
    if (source.diagnostics.length > 0) {
      throw new Error(
        `truth-compaction-source-invalid:${family}:${source.diagnostics.map((item) => item.reason).join(',')}`,
      );
    }
    const coveredJournalSequence = source.records.reduce(
      (maximum, record) => Math.max(maximum, recordJournalSequence(record)),
      0,
    );
    const snapshotRecords = family === 'card-memory-facts'
      ? this.buildCardSnapshotRecords(source.records)
      : this.buildQueueSnapshotRecords(source.records);
    const deterministicGeneration = snapshotRecords.length > 0
      ? deterministicGenerationId(family, coveredJournalSequence, snapshotRecords.length)
      : null;
    const generationStore = this.getGenerationStore(family);
    const inspection = await generationStore.inspectGenerations();
    let recoveryPreviousGenerationId: string | undefined;
    let currentRecordsEquivalent = false;
    if (inspection.fence.current) {
      try {
        const current = await generationStore.replayVerifiedGeneration(inspection.fence.current);
        currentRecordsEquivalent = recordsEquivalent(current.records, snapshotRecords);
      } catch (currentError) {
        if (!inspection.fence.previous) {
          throw new Error(
            `truth-compaction-current-generation-invalid:${family}:${inspection.fence.current.generationId}:${errorMessage(currentError)}`,
          );
        }
        try {
          await generationStore.replayVerifiedGeneration(inspection.fence.previous);
        } catch (previousError) {
          throw new Error(
            `truth-compaction-current-and-previous-generation-invalid:${family}:${errorMessage(currentError)}:${errorMessage(previousError)}`,
          );
        }
        recoveryPreviousGenerationId = inspection.fence.previous.generationId;
      }
    }

    if (
      deterministicGeneration === null
      || (
        recoveryPreviousGenerationId === undefined
        && (
          inspection.fence.current?.generationId === deterministicGeneration
          || currentRecordsEquivalent
        )
      )
    ) {
      const retention = inspection.orphanPaths.length > 0 && this.fileStore.deleteFile
        ? await generationStore.reclaimObsoleteGenerations()
        : {
            retainedGenerationIds: inspection.retainedGenerationIds,
            deletedPaths: [],
          };
      const retainedInspection = await generationStore.inspectGenerations();
      return {
        family,
        status: 'noop',
        generationId: inspection.fence.current?.generationId ?? null,
        previousGenerationId: inspection.fence.previous?.generationId ?? null,
        sourceRecordCount: source.records.length,
        snapshotRecordCount: snapshotRecords.length,
        coveredJournalSequence,
        orphanPaths: retainedInspection.orphanPaths,
        reclaimedPaths: retention.deletedPaths,
      };
    }
    const deterministicGenerationRetained = deterministicGeneration !== null
      && (
        inspection.fence.current?.generationId === deterministicGeneration
        || inspection.fence.previous?.generationId === deterministicGeneration
      );
    const generationId = deterministicGenerationRetained
      ? `${deterministicGeneration}-recovered-${inspection.fence.fence + 1}`
      : deterministicGeneration;

    let published: MessagePackTruthPublishGenerationResult;
    let prePublishReclaimedPaths: string[] = [];
    try {
      published = await generationStore.publishGeneration({
        generationId,
        records: snapshotRecords,
        expectedCurrentGenerationId: inspection.fence.current?.generationId ?? null,
        recoveryPreviousGenerationId,
      });
    } catch (error) {
      const generationIsRetained = generationId === inspection.fence.current?.generationId
        || generationId === inspection.fence.previous?.generationId;
      if (
        recoveryPreviousGenerationId !== undefined
        || generationIsRetained
        || !isRecoverableOrphanGenerationConflict(error)
      ) {
        throw error;
      }
      const prePublishRetention = await generationStore.reclaimObsoleteGenerations();
      prePublishReclaimedPaths = prePublishRetention.deletedPaths;
      const reclaimedInspection = await generationStore.inspectGenerations();
      published = await generationStore.publishGeneration({
        generationId,
        records: snapshotRecords,
        expectedCurrentGenerationId: reclaimedInspection.fence.current?.generationId ?? null,
      });
    }
    const retention = recoveryPreviousGenerationId
      ? {
          retainedGenerationIds: published.retainedGenerationIds,
          deletedPaths: [],
        }
      : await generationStore.reclaimObsoleteGenerations();
    const retainedInspection = await generationStore.inspectGenerations();
    return {
      family,
      status: 'compacted',
      generationId: published.fence.current?.generationId ?? generationId,
      previousGenerationId: published.fence.previous?.generationId ?? null,
      sourceRecordCount: source.records.length,
      snapshotRecordCount: snapshotRecords.length,
      coveredJournalSequence,
      orphanPaths: retainedInspection.orphanPaths,
      reclaimedPaths: [...prePublishReclaimedPaths, ...retention.deletedPaths],
    };
  }

  private buildCardSnapshotRecords(
    records: MessagePackTruthRecord[],
  ): Array<MessagePackCardAggregateSnapshotTruthRecord | MessagePackCardAggregateTombstoneTruthRecord> {
    const replay = replayCardAggregateTruthRecords(records);
    if (replay.diagnostics.length > 0) {
      throw new Error(
        `truth-compaction-card-replay-invalid:${replay.diagnostics.map((item) => item.reason).join(',')}`,
      );
    }
    return replay.aggregates.map((state) => {
      const common = {
        family: 'card-memory-facts' as const,
        schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
        idempotencyKey: `compact:card:${state.aggregateId}:${state.revision}`,
        mutationId: state.mutationId,
        aggregateId: state.aggregateId,
        causalBaseRevision: state.causalBaseRevision,
        revision: state.revision,
        journalSequence: state.journalSequence,
        logicalTime: state.journalSequence,
        recordedAt: state.journalSequence,
      };
      if (state.tombstone) {
        return {
          ...common,
          type: 'card-aggregate.tombstone.v1',
          card: null,
          schedule: null,
          tombstone: structuredClone(state.tombstone),
        };
      }
      if (!state.card || !state.schedule) {
        throw new Error(`truth-compaction-card-state-incomplete:${state.aggregateId}`);
      }
      return {
        ...common,
        type: 'card-aggregate.snapshot.v1',
        card: structuredClone(state.card),
        schedule: structuredClone(state.schedule),
        tombstone: null,
      };
    });
  }

  private buildQueueSnapshotRecords(
    records: MessagePackTruthRecord[],
  ): Array<MessagePackQueueSnapshotTruthRecord | MessagePackQueueStateChangesetTruthRecord> {
    const replay = replayQueueFamilyTruthRecords(records);
    if (replay.diagnostics.length > 0) {
      throw new Error(
        `truth-compaction-queue-replay-invalid:${replay.diagnostics.map((item) => item.reason).join(',')}`,
      );
    }
    const queueSnapshots: MessagePackQueueSnapshotTruthRecord[] = replay.queues.map((state) => ({
      family: 'queue-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'queue-family.snapshot.v1',
      idempotencyKey: `compact:queue:${state.queueFamily}:${state.revision}`,
      mutationId: state.mutationId,
      queueFamily: state.queueFamily,
      causalBaseRevision: state.causalBaseRevision,
      revision: state.revision,
      journalSequence: state.journalSequence,
      logicalTime: state.journalSequence,
      recordedAt: state.journalSequence,
      members: structuredClone(state.members),
      changes: null,
    }));
    const queueState: MessagePackQueueStateChangesetTruthRecord[] = replay.queueState.map((state) => ({
      family: 'queue-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'queue-state.changeset.v1',
      idempotencyKey: `compact:queue-state:${state.key}:${state.revision}`,
      mutationId: state.mutationId,
      queueFamily: state.key,
      causalBaseRevision: state.causalBaseRevision,
      revision: state.revision,
      journalSequence: state.journalSequence,
      logicalTime: state.journalSequence,
      recordedAt: state.journalSequence,
      members: null,
      changes: null,
      stateChange: {
        operation: 'set',
        key: state.key,
        value: structuredClone(state.value),
      },
    }));
    return [...queueSnapshots, ...queueState].sort((left, right) => (
      left.queueFamily.localeCompare(right.queueFamily)
      || left.type.localeCompare(right.type)
    ));
  }

  private getSourceStore(family: WorkerCompactableTruthFamily): MessagePackTruthSegmentStore {
    const existing = this.sourceStores.get(family);
    if (existing) {
      return existing;
    }
    const store = createMessagePackTruthSegmentStore({
      fileStore: this.fileStore,
      family,
      deviceId: this.deviceId,
      generationId: this.sourceGenerationIds[family],
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
    });
    this.sourceStores.set(family, store);
    return store;
  }

  private getGenerationStore(
    family: WorkerCompactableTruthFamily,
  ): MessagePackTruthSnapshotGenerationStore {
    const existing = this.generationStores.get(family);
    if (existing) {
      return existing;
    }
    const store = new MessagePackTruthSnapshotGenerationStore({
      fileStore: this.fileStore,
      family,
      deviceId: this.deviceId,
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
      maxSegmentRecords: this.maxSegmentRecords,
    });
    this.generationStores.set(family, store);
    return store;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
