import type { Database, ParamsObject, SqlValue } from 'sql.js';
import { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import { SqlQueueStateRepository } from '@/infrastructure/persistence/sqlite/SqlQueueStateRepository';
import { SqlSemanticActivationRepository } from '@/infrastructure/persistence/sqlite/SqlSemanticActivationRepository';
import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
} from '../../packages/contracts/src/backend-rpc';
import type { StructuredCardQuery } from '@/types/card-query';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  mapReviewLogV2ToReviewEventFact,
  summarizeReviewEventFact,
  type ReviewLogV2FactInput,
} from '@/core/scheduler/reviewEventFact';
import { QueueType } from '@/types/unified-data-source';
import type {
  QueueProjectionGeneration,
  QueueProjectionRow,
  QueueProjectionRowsQuery,
} from '@/application/ports/QueueProjectionPort';
import type {
  BrowserDeckCardPageResult,
  BrowserDocumentCountsResult,
  BrowserDocumentCountsScope,
  BrowserDeckPageRequest,
  BrowserDeckSnapshotQuery,
} from '@/application/queries/browser/browser-deck-query';
import type {
  BackendDbLoadRequest,
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendStorageProjectionRebuildRequest,
  BackendStorageProjectionRebuildResult,
  BackendStorageProjectionRebuildFamilyResult,
  BackendKernelTransactionAction,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionRequeueResult,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
  BackendDomainSyncOperationType,
  BackendDomainSyncProcessedSource,
  BackendDomainSyncRepairApplyRequest,
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewCardEvidence,
  BackendDomainSyncRepairPreviewPlannedMutation,
  BackendDomainSyncRepairPreviewRequest,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncSanityStatus,
  BackendDomainSyncStatusResult,
  BackendDomainSyncConflictSourceCleanupCandidatesResult,
  BackendDomainSyncConflictSourceCleanupRequest,
  BackendDomainSyncConflictSourceCleanupResult,
  BackendReviewSyncDivergenceAuditRequest,
  BackendReviewSyncDivergenceAuditResult,
  BackendSyncConflictMergeDivergenceDiagnostic,
  BackendSyncConflictDatabaseSummary,
  BackendSyncConflictMergeRequest,
  BackendSyncConflictMergeResult,
  BackendSyncConflictReloadResult,
  BackendSyncConflictSummarizeRequest,
  BackendSyncConflictSummarizeResult,
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
  BackendSemanticCommandRequest,
  BackendSemanticCommandResult,
  BackendSemanticNode,
  BackendSemanticSidebarReadRequest,
  BackendSemanticSidebarReadResult,
  BackendSemanticSessionReadRequest,
  BackendSemanticSessionReadResult,
  BackendXiuyuanSyncLocalFacts,
  BackendReviewFeedbackJournalDiagnostics,
  BackendReviewFeedbackJournalBackpressureDiagnostics,
  BackendReviewFeedbackJournalOperationStatus,
  BackendStorageErrorCode,
  BackendStorageDiagnostic,
  MessagePackTruthFamily,
  MessagePackTruthRecord,
  MessagePackReviewEventTruthRecord,
} from '../../packages/contracts/src/backend-rpc';
import {
  type MessagePackTruthSegmentManifest,
  type MessagePackTruthSegmentFileStore,
} from '../truth/MessagePackTruthSegmentStore';
import type {
  ReviewSqlTruthBackfillProjectionPatch,
  ReviewSqlTruthBackfillRow,
} from '../truth/ReviewSqlTruthBackfillRuntime';
import type { WorkerXiuyuanSyncApplyInput } from '../xiuyuan/WorkerXiuyuanSyncPlanner';
import type {
  SemanticEvent,
  SemanticLens,
  SemanticPathEntry,
  SemanticRelation,
  SemanticSessionSnapshot,
  SemanticStation,
} from '@/core/semantic/semanticActivationTypes';
import {
  buildSemanticMemoryProjection,
  type SemanticOldModeManualBoostEvidence,
} from '@/core/semantic/SemanticMemoryProjectionBuilder';
import type {
  SourceExistenceRefreshCandidate,
  SourceExistenceRefreshRequest,
  SourceExistenceSummary,
  SourceExistenceUpdate,
} from '@/application/ports/BrowserDeckReadPort';
import type {
  SqliteConflictDatabaseSource,
  SqlitePersistenceBridge,
  SqlitePersistenceHostEffectMetadata,
} from './SqlitePersistenceBridge';
import type {
  ReviewFeedbackJournalEntryStatus,
  ReviewFeedbackJournalStore,
  ReviewFeedbackJournalStoreStats,
} from './ReviewFeedbackJournalStore';
import { createLogger } from '@/utils/logger';
import { AutoCardDecisionService } from './AutoCardDecisionService';
import { SemanticSessionReadModelBuilder } from '../semantic/SemanticSessionReadModelBuilder';
import { WorkerReviewFeedbackRuntime } from '../review/WorkerReviewFeedbackRuntime';
import { ReviewFeedbackStorageEnvelope } from '../review/ReviewFeedbackStorageEnvelope';
import { ReviewJournalProjectionReconciler } from '../review/ReviewJournalProjectionReconciler';
import { DomainSyncLedger } from '../domain-sync/DomainSyncLedger';
import { recordBackendWorkerInnerStep, recordReviewFeedbackInnerStep } from '../bootstrap/ReviewFeedbackTimingScope';
import {
  resolveProjectionQueueType,
  WorkerQueueProjectionRuntime,
} from '../queue-projection/WorkerQueueProjectionRuntime';
import { SourceExistenceProjectionInvalidator } from '../queue-projection/SourceExistenceProjectionInvalidator';
import { WorkerKernelTransactionRuntime } from '../kernel-transaction/WorkerKernelTransactionRuntime';
import { WorkerXiuyuanSyncRuntime } from '../xiuyuan/WorkerXiuyuanSyncRuntime';
import {
  StorageBootstrapRuntime,
  type StartupTruthProjectionInput,
  type WorkerStorageBootstrapOptions,
} from './StorageBootstrapRuntime';
import { activePluginCardSql } from '@/infrastructure/persistence/sqlite/cardAdmissionSql';
import {
  deriveAlgorithmCardState,
  stringifyAlgorithmCardState,
  ACTIVE_ALGORITHM_IDS,
} from '@/infrastructure/persistence/sqlite/algorithmCardState';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';

type SqlParams = SqlValue[] | ParamsObject;
const logger = createLogger('WorkerSqliteDatabaseService');
const REVIEW_FEEDBACK_DB_STEP_SLOW_MS = 120;
const REVIEW_FEEDBACK_MAIN_DB_FAST_SKIP_LIMIT = 5;
const DOMAIN_SYNC_REPAIR_DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_FEEDBACK_JOURNAL_STORAGE_NAME = 'review-feedback-journal.v1';
const REVIEW_FEEDBACK_JOURNAL_VERSION = 1;
const REVIEW_FEEDBACK_JOURNAL_REPLAY_BATCH_LIMIT = 512;
const DEFAULT_REVIEW_FEEDBACK_JOURNAL_MAX_PENDING_COUNT = 50_000;
const DEFAULT_REVIEW_FEEDBACK_JOURNAL_MAX_PENDING_BYTES = 16 * 1024 * 1024;
const DEFAULT_REVIEW_FEEDBACK_JOURNAL_MAX_OLDEST_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REVIEW_FEEDBACK_JOURNAL_STATUSES = new Set<ReviewFeedbackJournalEntryStatus>([
  'prepared',
  'projection-applied',
  'truth-flushed',
  'projection-failed',
  'unavailable',
  'repair-required',
]);

type SqliteFileServiceAdapter = {
  readJSON<T>(fileName: string, metadata?: SqliteFileServiceMetadataInput): Promise<T | null>;
  writeJSON(fileName: string, data: unknown, metadata?: SqliteFileServiceMetadataInput): Promise<void>;
  readBinary(fileName: string, metadata?: SqliteFileServiceMetadataInput): Promise<Uint8Array | null>;
  writeBinary(fileName: string, bytes: Uint8Array, metadata?: SqliteFileServiceMetadataInput): Promise<void>;
  deleteFile(fileName: string): Promise<void>;
  hasLegacyPetalSqliteDb(): Promise<boolean>;
  readSyncConflictDatabaseSources(): Promise<SqliteConflictDatabaseSource[]>;
  cleanupSyncConflictDatabaseSources(sourceIds: string[]): Promise<{
    cleaned: Array<{ sourceId: string; path: string | null }>;
    skipped: Array<{ sourceId: string; reason: string }>;
    failed: Array<{ sourceId: string; path: string | null; reason: string }>;
  }>;
};

export type SqliteFileServiceMetadataInput = SqlitePersistenceHostEffectMetadata | {
  diagnostics?: Record<string, unknown> | null;
} | null;

interface SqliteFileServiceAdapterOptions {
  shouldSuppressBinaryRead?: (fileName: string) => boolean;
  shouldSuppressJsonRead?: (fileName: string) => boolean;
}

type ExternalDatabaseMergeContext =
  | 'generic'
  | 'read-only-preflight'
  | 'review-feedback-preflight';

interface ExternalDatabaseMergeOptions {
  context?: ExternalDatabaseMergeContext;
  cardId?: string | null;
  forceMainDbRead?: boolean;
  skipMainDbRead?: boolean;
  ignoreProcessedSourceDeduplication?: boolean;
}

type ExternalDatabaseMergeResult = {
  ok: true;
  checked: true;
  changed: boolean;
  mergedReviewEvents: number;
  mergedCards: number;
  ignoredReviewEvents: number;
  ignoredCards: number;
  importedOperations: number;
  ignoredOperations: number;
  processedSourceIds: string[];
  skippedSourceReasons: Record<string, number>;
  sanityStatus: BackendDomainSyncSanityStatus;
  sourceIds: string[];
  skippedSources: Array<{ sourceId: string; reason: string }>;
  diagnostics: BackendSyncConflictMergeResult['diagnostics'];
  mainDbReadSkipped: boolean;
  mainDbReadSkipReason: string | null;
  conflictSourceCount: number;
  nonEmptyConflictSourceCount: number;
};

type ReviewFeedbackJournalEntry = {
  id: string;
  requestId: string | null;
  cardId: string;
  idempotencyKey: string | null;
  status: ReviewFeedbackJournalEntryStatus;
  recordedAt: number;
  request: BackendReviewFeedbackRequest;
  appliedAt: number | null;
  projectionAppliedAt: number | null;
  projectionFailedAt: number | null;
  truthCandidate?: MessagePackReviewEventTruthRecord | null;
  lastError: string | null;
};

type WorkerSyncConflictMergeRequest = BackendSyncConflictMergeRequest & {
  ignoreProcessedSourceDeduplication?: boolean;
};

interface ConflictReviewEventRow {
  id: string;
  card_id: string | null;
  attempt_id: string | null;
  rating: number | null;
  reviewed_at: number;
  year: number;
  month: number;
  event_type: string;
  payload_json: string;
}

interface ConflictCardRow {
  id: string;
  updated_at: number | null;
  reps: number | null;
  last_review: number | null;
  block_id: string | null;
  source_exists: number | null;
  source_checked_at: number | null;
  source_missing_at: number | null;
  payload_json: string;
}

interface ConflictDomainSyncOperationRow {
  operation_id: string;
  source_id: string;
  source_device_id: string | null;
  source_generation: number | null;
  operation_type: string;
  entity_type: string;
  entity_id: string;
  entity_block_id: string | null;
  occurred_at: number;
  observed_at: number;
  payload_fingerprint: string;
  idempotency_key: string | null;
  review_event_id: string | null;
  payload_json: string;
}

interface DomainSyncOperationImportResult {
  imported: number;
  ignored: number;
  affectedCardIds: string[];
  affectedBlockIds: string[];
}

type DomainSyncProcessedSourceKind =
  | 'persisted-main-db'
  | 'siyuan-conflict-db'
  | 'legacy-db'
  | 'migration'
  | 'unknown';

type DomainSyncSkippedSourceReason =
  | 'unreadable'
  | 'invalid-bytes'
  | 'missing-ledger'
  | 'ledger-invariant-violation'
  | 'parse-error'
  | 'source-unavailable'
  | 'unknown';

interface DomainSyncProcessedSourceCounters {
  importedOperations: number;
  ignoredOperations: number;
  importedReviewEvents: number;
  ignoredReviewEvents: number;
  importedCards: number;
  ignoredCards: number;
}

interface ProjectionRebuildSourceRead {
  blockId: string;
  status: string;
  found: boolean;
  error: string | null;
  data?: unknown;
}

type WorkerStorageProjectionRebuildRequest = Omit<
  BackendStorageProjectionRebuildRequest,
  'schemaVersion'
> & {
  deviceId: string;
  generationId: string;
  schemaVersion: number;
  truthRecords: MessagePackTruthRecord[];
  truthManifest: MessagePackTruthSegmentManifest;
  sourceReads: ProjectionRebuildSourceRead[];
};

interface ConflictSummaryReviewRow {
  count: number;
  latest: number | null;
}

interface ConflictSummaryCardRow {
  count: number;
  latestUpdated: number | null;
  latestReview: number | null;
}

interface DomainSyncOperationSummaryRow {
  operation_type: string;
  count: number;
  newest: number | null;
}

interface DomainSyncProcessedSourceRow {
  source_id: string;
  source_fingerprint: string;
  source_kind: BackendDomainSyncProcessedSource['sourceKind'];
  path: string | null;
  processed_at: number;
  imported_operations: number;
  ignored_operations: number;
  imported_review_events: number;
  ignored_review_events: number;
  imported_cards: number;
  ignored_cards: number;
  skipped_reason: string | null;
  latest_sanity_status: BackendDomainSyncSanityStatus | null;
}

interface DomainSyncRepairPreviewEvidenceRow {
  card_id: string | null;
  latest_review_event_id: string | null;
  newest_reviewed_at: number | null;
  review_event_count: number;
  latest_review_payload_json: string | null;
  updated_at: number | null;
  due: number | null;
  state: number | null;
  scheduled_days: number | null;
  stability: number | null;
  difficulty: number | null;
  reps: number | null;
  last_review: number | null;
  block_id: string | null;
  scheduler_type: string | null;
  card_payload_json: string | null;
}

interface DomainSyncRepairPlanRow {
  plan_id: string;
  status: string;
  created_at: number;
  scope_json: string;
  scheduler_config_hash: string | null;
  ledger_generation: number;
  card_state_fingerprint: string;
  review_history_fingerprint: string;
  affected_card_count: number;
  apply_idempotency_key: string | null;
  applied_at: number | null;
  result_json: string | null;
  payload_json: string;
}

interface ReviewCardDivergenceEvidenceWithCardRow {
  card_id: string;
  newest_reviewed_at: number | null;
  review_event_count: number;
  updated_at: number | null;
  reps: number | null;
  last_review: number | null;
  block_id: string | null;
  source_exists: number | null;
  source_checked_at: number | null;
  source_missing_at: number | null;
}

function readMetadataString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readDiagnostics(metadata: SqliteFileServiceMetadataInput | undefined): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || !('diagnostics' in metadata)) {
    return null;
  }
  const diagnostics = metadata.diagnostics;
  return diagnostics && typeof diagnostics === 'object' ? diagnostics : null;
}

export function normalizeSqlitePersistenceHostEffectMetadata(
  metadata?: SqliteFileServiceMetadataInput,
): SqlitePersistenceHostEffectMetadata | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  const diagnostics = readDiagnostics(metadata);
  const purpose = ('purpose' in metadata ? readMetadataString(metadata.purpose) : null)
    ?? readMetadataString(diagnostics?.sqliteDeltaPurpose);
  const substep = ('substep' in metadata ? readMetadataString(metadata.substep) : null)
    ?? readMetadataString(diagnostics?.sqliteDeltaSubstep);
  if (purpose === null && substep === null) {
    return undefined;
  }
  return { purpose, substep };
}

export function createSqliteFileServiceAdapter(
  bridge: SqlitePersistenceBridge,
  options: SqliteFileServiceAdapterOptions = {},
): SqliteFileServiceAdapter {
  return {
    readJSON: async <T>(
      fileName: string,
      metadata?: SqliteFileServiceMetadataInput,
    ): Promise<T | null> => {
      if (!bridge.readJSON) {
        return null;
      }
      if (options.shouldSuppressJsonRead?.(fileName)) {
        return null;
      }
      return bridge.readJSON<T>(fileName, normalizeSqlitePersistenceHostEffectMetadata(metadata));
    },
    writeJSON: async (
      fileName: string,
      data: unknown,
      metadata?: SqliteFileServiceMetadataInput,
    ): Promise<void> => {
      if (!bridge.writeJSON) {
        throw new Error(`JSON persistence is not available for ${fileName}`);
      }
      await bridge.writeJSON(fileName, data, normalizeSqlitePersistenceHostEffectMetadata(metadata));
    },
    readBinary: (
      fileName: string,
      metadata?: SqliteFileServiceMetadataInput,
    ) => options.shouldSuppressBinaryRead?.(fileName)
      ? Promise.resolve(null)
      : bridge.readBinary(fileName, normalizeSqlitePersistenceHostEffectMetadata(metadata)),
    writeBinary: (
      fileName: string,
      bytes: Uint8Array,
      metadata?: SqliteFileServiceMetadataInput,
    ) => bridge.writeBinary(fileName, bytes, normalizeSqlitePersistenceHostEffectMetadata(metadata)),
    deleteFile: async (fileName: string): Promise<void> => {
      if (!bridge.deleteFile) {
        return;
      }
      await bridge.deleteFile(fileName);
    },
    hasLegacyPetalSqliteDb: async (): Promise<boolean> => {
      if (!bridge.hasLegacyPetalSqliteDb) {
        return false;
      }
      return bridge.hasLegacyPetalSqliteDb();
    },
    readSyncConflictDatabaseSources: async () => {
      if (!bridge.readSyncConflictDatabaseSources) {
        return [];
      }
      return bridge.readSyncConflictDatabaseSources();
    },
    cleanupSyncConflictDatabaseSources: async (sourceIds: string[]) => {
      if (!bridge.cleanupSyncConflictDatabaseSources) {
        return {
          cleaned: [],
          skipped: sourceIds.map((sourceId) => ({ sourceId, reason: 'cleanup host effect unavailable' })),
          failed: [],
        };
      }
      return bridge.cleanupSyncConflictDatabaseSources(sourceIds);
    },
  };
}

function createReadonlyConflictFileService(bytes: Uint8Array): SqliteFileServiceAdapter {
  return {
    readJSON: async <T>(): Promise<T | null> => null,
    writeJSON: async (): Promise<void> => undefined,
    readBinary: async (): Promise<Uint8Array> => new Uint8Array(bytes),
    writeBinary: async (): Promise<void> => undefined,
    deleteFile: async (): Promise<void> => undefined,
    readSyncConflictDatabaseSources: async (): Promise<SqliteConflictDatabaseSource[]> => [],
    cleanupSyncConflictDatabaseSources: async (sourceIds: string[]) => ({
      cleaned: [],
      skipped: sourceIds.map((sourceId) => ({ sourceId, reason: 'readonly conflict source' })),
      failed: [],
    }),
  };
}

function isUint8ArrayLike(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function parseJsonObject<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseSqlJsonRecord(value: string | null | undefined): Record<string, unknown> {
  const parsed = parseJsonObject<unknown>(String(value || '').trim() || '{}', {});
  return isRecord(parsed) ? parsed : {};
}

function mapConflictReviewEventToFact(
  event: ConflictReviewEventRow,
  idempotencyKey: string | null,
) {
  const payload = parseSqlJsonRecord(event.payload_json);
  return mapReviewLogV2ToReviewEventFact({
    ...payload,
    id: normalizeString(payload.id) || normalizeString(event.id),
    cardId: normalizeString(payload.cardId) || normalizeString(event.card_id),
    attemptId: normalizeString(payload.attemptId) || normalizeString(event.attempt_id),
    rating: payload.rating ?? event.rating,
    reviewedAt: payload.reviewedAt ?? event.reviewed_at,
    commitIdempotencyKey: normalizeString(payload.commitIdempotencyKey) || idempotencyKey || undefined,
    queueMode: normalizeString(payload.queueMode) || (event.event_type === 'review-v2' ? 'formal' : undefined),
    commitPolicy: normalizeString(payload.commitPolicy) || (event.event_type === 'review-v2' ? 'write-schedule' : undefined),
  } satisfies ReviewLogV2FactInput);
}

function readRecordString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const normalized = normalizeString(record[key]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function readRecordNumber(record: Record<string, unknown>, keys: string[], defaultValue?: unknown): number | null {
  for (const key of keys) {
    const numeric = Number(record[key]);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  const defaultNumeric = Number(defaultValue);
  return Number.isFinite(defaultNumeric) ? defaultNumeric : null;
}

function readMetaRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.meta) ? payload.meta : {};
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value);
}

function positiveNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

type ReviewSyncCardMergeDecisionReason =
  | 'incoming-review-older-than-review-history'
  | 'incoming-reps-behind-review-history'
  | 'incoming-card-newer'
  | 'incoming-card-stale-or-same';

interface ReviewSyncCardMergeDecision {
  action: 'apply-card' | 'skip-card';
  reason: ReviewSyncCardMergeDecisionReason;
}

export function decideReviewSyncCardMerge(
  local: Pick<ConflictCardRow, 'updated_at' | 'last_review' | 'reps'>,
  incoming: Pick<ConflictCardRow, 'updated_at' | 'last_review' | 'reps'>,
  reviewEvidence?: { newestReviewedAt: number; formalReviewEventCount: number } | null,
): ReviewSyncCardMergeDecision {
  const localReview = positiveNumber(local.last_review);
  const incomingReview = positiveNumber(incoming.last_review);
  const localReps = positiveNumber(local.reps);
  const incomingReps = positiveNumber(incoming.reps);
  const newestReviewedAt = positiveNumber(reviewEvidence?.newestReviewedAt);
  const formalReviewEventCount = positiveNumber(reviewEvidence?.formalReviewEventCount);

  if (newestReviewedAt > 0 && incomingReview > 0 && incomingReview < newestReviewedAt) {
    return { action: 'skip-card', reason: 'incoming-review-older-than-review-history' };
  }

  if (
    newestReviewedAt > 0
    && incomingReview === localReview
    && incomingReps < Math.max(localReps, formalReviewEventCount)
  ) {
    return { action: 'skip-card', reason: 'incoming-reps-behind-review-history' };
  }

  if (localReview !== incomingReview) {
    return incomingReview > localReview
      ? { action: 'apply-card', reason: 'incoming-card-newer' }
      : { action: 'skip-card', reason: 'incoming-card-stale-or-same' };
  }

  if (localReps !== incomingReps) {
    return incomingReps > localReps
      ? { action: 'apply-card', reason: 'incoming-card-newer' }
      : { action: 'skip-card', reason: 'incoming-card-stale-or-same' };
  }

  const localUpdated = positiveNumber(local.updated_at);
  const incomingUpdated = positiveNumber(incoming.updated_at);
  if (localUpdated !== incomingUpdated) {
    return incomingUpdated > localUpdated
      ? { action: 'apply-card', reason: 'incoming-card-newer' }
      : { action: 'skip-card', reason: 'incoming-card-stale-or-same' };
  }

  return { action: 'skip-card', reason: 'incoming-card-stale-or-same' };
}

function toNullableTimestamp(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function toNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (numeric === 1) {
    return true;
  }
  if (numeric === 0) {
    return false;
  }
  return null;
}

function isFiniteSqlNumber(value: unknown): boolean {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function normalizeAuditLimit(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 100;
  }
  return Math.max(1, Math.min(500, Math.floor(numeric)));
}

function normalizeAuditCardIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((id) => String(id || '').trim()).filter(Boolean)));
}

function stableStringifyJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  const valueType = typeof value;
  if (valueType === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (valueType === 'boolean' || valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'undefined') {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringifyJson(item)).join(',')}]`;
  }
  if (valueType === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringifyJson(entryValue)}`).join(',')}}`;
  }
  return 'null';
}

function buildReviewCardDivergenceRecords(
  rows: ReviewCardDivergenceEvidenceWithCardRow[],
): BackendReviewSyncDivergenceAuditResult['records'] {
  const records: BackendReviewSyncDivergenceAuditResult['records'] = [];
  for (const row of rows) {
    const cardId = String(row.card_id || '').trim();
    if (!cardId) {
      continue;
    }
    if (toNullableBoolean(row.source_exists) === false) {
      continue;
    }
    const newestReviewEventAt = toNullableTimestamp(row.newest_reviewed_at);
    const cardLastReview = toNullableTimestamp(row.last_review);
    const reviewEventCount = Math.max(0, Math.floor(Number(row.review_event_count) || 0));
    const cardReps = Number.isFinite(Number(row.reps)) ? Math.max(0, Math.floor(Number(row.reps))) : null;
    const base = {
      cardId,
      newestReviewEventAt,
      cardLastReview,
      reviewEventCount,
      cardReps,
      blockId: typeof row.block_id === 'string' && row.block_id.trim() ? row.block_id : null,
      sourceExists: toNullableBoolean(row.source_exists),
      sourceCheckedAt: toNullableTimestamp(row.source_checked_at),
      sourceMissingAt: toNullableTimestamp(row.source_missing_at),
    };

    if (newestReviewEventAt && (!cardLastReview || newestReviewEventAt > cardLastReview)) {
      records.push({
        ...base,
        reason: 'review-history-newer-than-card-state',
      });
    }

    if (cardReps !== null && reviewEventCount > cardReps) {
      records.push({
        ...base,
        reason: 'review-event-count-exceeds-card-reps',
      });
    }
  }
  return records;
}

function toSummarySize(source: Pick<SqliteConflictDatabaseSource, 'bytes' | 'size'>): number {
  const explicit = Number(source.size);
  return Number.isFinite(explicit) && explicit >= 0 ? Math.floor(explicit) : source.bytes.byteLength;
}

function hashBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function estimateJsonByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (!json) {
    return 0;
  }
  return new TextEncoder().encode(json).byteLength;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WorkerSqliteDatabaseService {
  private readonly fileService: SqliteFileServiceAdapter;
  private readonly runtime: RuntimeSqliteDatabaseService;
  private readonly truthFileStore: MessagePackTruthSegmentFileStore | null;
  private readonly autoCardDecisionService = new AutoCardDecisionService();
  private readonly kernelTransactionRuntime: WorkerKernelTransactionRuntime;
  private readonly storageBootstrapRuntime: StorageBootstrapRuntime;
  private repository: SqlUnifiedStorageRepository | null = null;
  private queueProjection: SqlQueueProjectionRepository | null = null;
  private queueState: SqlQueueStateRepository | null = null;
  private semanticActivation: SqlSemanticActivationRepository | null = null;
  private initialized = false;
  private lastObservedPersistedHash: string | null = null;
  private lastDomainSyncStatusSnapshot: BackendDomainSyncStatusResult | null = null;
  private reviewFeedbackMainDbFastSkipUsesRemaining = 0;
  private reviewFeedbackMainDbFastSkipInvalidatedBy: string | null = 'never-marked-clean';
  private readonly semanticCommandResultsByIdempotencyKey = new Map<string, BackendSemanticCommandResult>();
  private readonly domainSyncCleanupResultsByIdempotencyKey = new Map<string, BackendDomainSyncConflictSourceCleanupResult>();
  private readonly appliedReviewFeedbackJournalEntryIds = new Set<string>();
  private lastReviewFeedbackJournalWrite: BackendReviewFeedbackJournalOperationStatus | null = null;
  private lastReviewFeedbackJournalReplay: BackendReviewFeedbackJournalOperationStatus | null = null;
  private lastReviewFeedbackCheckpoint: BackendReviewFeedbackJournalOperationStatus | null = null;
  private autoCardDecisionTotal = 0;
  private autoCardDecisionSelectedTotal = 0;
  private autoCardDecisionSkippedTotal = 0;
  private autoCardDecisionNoOpTotal = 0;
  private autoCardDecisionUnavailableTotal = 0;
  private autoCardDecisionFailedTotal = 0;
  private autoCardExecuteTotal = 0;
  private autoCardExecuteCreatedTotal = 0;
  private autoCardExecuteSkippedTotal = 0;
  private autoCardExecuteUnavailableTotal = 0;
  private autoCardExecuteFailedTotal = 0;
  private reviewFeedbackTotal = 0;
  private reviewFeedbackCommittedTotal = 0;
  private reviewFeedbackPreviewTotal = 0;
  private reviewFeedbackUnavailableTotal = 0;
  private aiSessionCreateTotal = 0;
  private aiSessionUpdateTotal = 0;
  private aiSessionCancelTotal = 0;
  private aiStreamStartTotal = 0;
  private aiStreamCancelTotal = 0;
  private aiJobCreatedTotal = 0;
  private aiJobCompletedTotal = 0;
  private aiJobCanceledTotal = 0;
  private aiJobTimeoutTotal = 0;
  private aiJobFailedTotal = 0;
  private suppressProjectionReadForStartupReset = false;
  private readonly storageDiagnostics: BackendStorageDiagnostic[] = [];
  private readonly reviewFeedbackJournalStore: ReviewFeedbackJournalStore | null;
  private readonly reviewFeedbackJournalBackpressure: {
    maxPendingCount: number;
    maxPendingBytes: number;
    maxOldestPendingAgeMs: number;
  };
  constructor(
    bridge: SqlitePersistenceBridge,
    private readonly dbFile = SQLITE_DB_FILE,
    options?: {
      maxKernelTransactionQueueLength?: number;
      maxKernelQueuedTransactions?: number;
      maxKernelActionQueueLength?: number;
      kernelTransactionDedupeTtlMs?: number;
      reviewFeedbackJournalBackpressure?: {
        maxPendingCount?: number;
        maxPendingBytes?: number;
        maxOldestPendingAgeMs?: number;
      };
    },
  ) {
    this.truthFileStore = bridge.truthFileStore ?? null;
    this.fileService = createSqliteFileServiceAdapter(bridge, {
      shouldSuppressBinaryRead: (fileName) => (
        this.suppressProjectionReadForStartupReset
        && fileName === this.dbFile
      ),
      shouldSuppressJsonRead: (fileName) => (
        this.suppressProjectionReadForStartupReset
        && fileName === this.dbFile
      ),
    });
    this.storageBootstrapRuntime = new StorageBootstrapRuntime({
      dbFile: this.dbFile,
      fileService: this.fileService,
      truthFileStore: this.truthFileStore,
      addStorageDiagnostic: (diagnostic) => this.addStorageDiagnostic(diagnostic),
      projectionRuntime: {
        dispose: () => this.runtime.dispose(),
        init: () => this.runtime.init(),
        suppressPersistedProjectionRead: async (task) => {
          this.suppressProjectionReadForStartupReset = true;
          try {
            return await task();
          } finally {
            this.suppressProjectionReadForStartupReset = false;
          }
        },
      },
    });
    this.reviewFeedbackJournalStore = bridge.reviewFeedbackJournalStore ?? null;
    this.kernelTransactionRuntime = new WorkerKernelTransactionRuntime({
      fileService: this.fileService,
      maxKernelTransactionQueueLength: options?.maxKernelTransactionQueueLength,
      maxKernelQueuedTransactions: options?.maxKernelQueuedTransactions,
      maxKernelActionQueueLength: options?.maxKernelActionQueueLength,
      kernelTransactionDedupeTtlMs: options?.kernelTransactionDedupeTtlMs,
    });
    this.runtime = new RuntimeSqliteDatabaseService(this.fileService, dbFile, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
      dropStoredDatabaseOnSchemaMismatch: true,
    });
    this.reviewFeedbackJournalBackpressure = {
      maxPendingCount: Math.max(
        1,
        Math.floor(Number(
          options?.reviewFeedbackJournalBackpressure?.maxPendingCount
            ?? DEFAULT_REVIEW_FEEDBACK_JOURNAL_MAX_PENDING_COUNT,
        )),
      ),
      maxPendingBytes: Math.max(
        1_024,
        Math.floor(Number(
          options?.reviewFeedbackJournalBackpressure?.maxPendingBytes
            ?? DEFAULT_REVIEW_FEEDBACK_JOURNAL_MAX_PENDING_BYTES,
        )),
      ),
      maxOldestPendingAgeMs: Math.max(
        1_000,
        Math.floor(Number(
          options?.reviewFeedbackJournalBackpressure?.maxOldestPendingAgeMs
            ?? DEFAULT_REVIEW_FEEDBACK_JOURNAL_MAX_OLDEST_PENDING_AGE_MS,
        )),
      ),
    };
  }

  async init(request?: BackendDbLoadRequest): Promise<void> {
    if (this.initialized) {
      return;
    }
    const bootstrapOptions = this.normalizeStorageBootstrapOptions(request);
    const storageBootstrap = await this.storageBootstrapRuntime.bootstrap(bootstrapOptions);
    const projectionBytesBeforeStartup = storageBootstrap.projectionBytesBeforeStartup;
    let projectionResetDuringStartup = false;
    try {
      await this.runtime.init();
    } catch (error) {
      if (!storageBootstrap.truthAvailable) {
        throw error;
      }
      projectionResetDuringStartup = true;
      await this.storageBootstrapRuntime.reinitializeTempProjectionRuntimeAfterLoadFailure(error);
    }
    this.repository = new SqlUnifiedStorageRepository(this.runtime, {
      domainSyncLedger: new DomainSyncLedger(this.runtime),
      diagnosticRecorder: (step, durationMs, extra = {}) => {
        recordBackendWorkerInnerStep({
          layer: 'database',
          step,
          durationMs,
          queueType: typeof extra.queueType === 'string' ? extra.queueType : null,
          extra: {
            backendMethod: 'browser.deck.page',
            ...extra,
          },
        });
      },
    });
    this.queueProjection = new SqlQueueProjectionRepository(this.runtime);
    this.queueState = new SqlQueueStateRepository(this.runtime);
    this.semanticActivation = new SqlSemanticActivationRepository(this.runtime);
    if (
      storageBootstrap.truthAvailable
      && (
        storageBootstrap.projectionRebuildRequired
        || projectionResetDuringStartup
        || !projectionBytesBeforeStartup
      )
    ) {
      await this.rebuildRequiredStartupProjectionFromTruth(
        bootstrapOptions,
        storageBootstrap.truthProjectionInput,
        storageBootstrap.projectionRebuildReason
          ?? (projectionResetDuringStartup ? 'temp-projection-reset' : 'temp-projection-missing'),
      );
    }
    const domainSyncLedger = new DomainSyncLedger(this.runtime);
    if (domainSyncLedger.hasMissingBackfillOperations()) {
      await this.runtime.runTransaction('domain-sync.backfill-existing', () => {
        domainSyncLedger.backfillExistingReviewEventsAndCardTombstones();
      });
    }
    await this.replayPendingReviewFeedbackJournalEntries();
    await this.reconcileReviewFeedbackJournalProjectionState();
    await this.kernelTransactionRuntime.restoreSnapshots();
    this.initialized = true;
    await this.rememberPersistedHash();
  }

  private normalizeStorageBootstrapOptions(
    request?: BackendDbLoadRequest,
  ): WorkerStorageBootstrapOptions {
    const schemaVersion = Math.max(
      1,
      Math.floor(Number(request?.truthSchemaVersion ?? MESSAGEPACK_TRUTH_SCHEMA_VERSION) || MESSAGEPACK_TRUTH_SCHEMA_VERSION),
    );
    const truthDeviceId = normalizeString(request?.truthDeviceId);
    const requestedMaxSegmentBytes = normalizeOptionalInteger(request?.maxSegmentBytes);
    return {
      truthDeviceId: truthDeviceId || null,
      cardTruthGenerationId: normalizeString(request?.cardTruthGenerationId)
        || `card-memory-facts-v${schemaVersion}`,
      reviewTruthGenerationId: normalizeString(request?.reviewTruthGenerationId)
        || `review-events-v${schemaVersion}`,
      maxSegmentBytes: requestedMaxSegmentBytes && requestedMaxSegmentBytes >= 256
        ? requestedMaxSegmentBytes
        : undefined,
    };
  }

  private async rebuildRequiredStartupProjectionFromTruth(
    bootstrapOptions: WorkerStorageBootstrapOptions,
    truthProjectionInput: StartupTruthProjectionInput | null,
    reason: string,
  ): Promise<void> {
    if (!truthProjectionInput) {
      throw storageError('PROJECTION_REBUILD_FAILED', `startup projection rebuild unavailable: ${reason}`);
    }
    const result = this.rebuildSqlProjectionsFromTruth({
      rebuildId: `startup:${Date.now()}`,
      cause: reason,
      families: ['cards', 'review-event-indexes'],
      deviceId: truthProjectionInput.primaryDeviceId,
      generationId: truthProjectionInput.primaryGenerationId,
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      maxSegmentBytes: bootstrapOptions.maxSegmentBytes,
      truthRecords: truthProjectionInput.truthRecords,
      truthManifest: truthProjectionInput.truthManifest,
      sourceReads: [],
    });
    if (result.status !== 'ready') {
      throw storageError(
        'PROJECTION_REBUILD_FAILED',
        result.error ?? `startup projection rebuild ended in ${result.status}`,
      );
    }
    await this.runtime.persist({
      force: true,
      reason: 'storage.projection.rebuild.startup',
      diagnostics: {
        cause: reason,
        initiator: 'db.load',
        projectionGeneration: result.projectionGeneration,
        hotPath: false,
      },
    });
  }

  private addStorageDiagnostic(diagnostic: BackendStorageDiagnostic): void {
    const key = `${diagnostic.kind}\n${diagnostic.path ?? ''}\n${diagnostic.message}`;
    if (this.storageDiagnostics.some((existing) => `${existing.kind}\n${existing.path ?? ''}\n${existing.message}` === key)) {
      return;
    }
    this.storageDiagnostics.unshift(diagnostic);
    if (this.storageDiagnostics.length > 32) {
      this.storageDiagnostics.length = 32;
    }
  }

  private async measureDiagnosticDatabaseStep<TResult>(
    step: string,
    task: () => Promise<TResult>,
    extra?: Record<string, unknown>,
  ): Promise<TResult>;
  private measureDiagnosticDatabaseStep<TResult>(
    step: string,
    task: () => TResult,
    extra?: Record<string, unknown>,
  ): TResult;
  private measureDiagnosticDatabaseStep<TResult>(
    step: string,
    task: () => TResult | Promise<TResult>,
    extra: Record<string, unknown> = {},
  ): TResult | Promise<TResult> {
    const startedAt = Date.now();
    const record = (): void => {
      recordBackendWorkerInnerStep({
        layer: 'database',
        step,
        durationMs: Math.max(0, Date.now() - startedAt),
        queueType: typeof extra.queueType === 'string' ? extra.queueType : null,
        extra,
      });
    };

    try {
      const result = task();
      if (result && typeof (result as Promise<TResult>).then === 'function') {
        return (result as Promise<TResult>).finally(record);
      }
      record();
      return result;
    } catch (error) {
      record();
      throw error;
    }
  }

  async load(request?: BackendDbLoadRequest): Promise<{ ok: true; initialized: true; dbFile: string }> {
    await this.init(request);
    return {
      ok: true,
      initialized: true,
      dbFile: this.dbFile,
    };
  }

  async reloadFromDisk(): Promise<BackendSyncConflictReloadResult> {
    this.queueState = null;
    this.semanticActivation = null;
    this.lastDomainSyncStatusSnapshot = null;
    this.runtime.dispose();
    this.initialized = false;
    this.appliedReviewFeedbackJournalEntryIds.clear();
    await this.init();
    return {
      ok: true,
      reloaded: true,
      dbFile: this.dbFile,
    };
  }

  async persist(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    let pendingCountBefore: number | undefined;
    let pendingBytesBefore: number | undefined;
    try {
      await this.init();
      const journalBefore = await this.readReviewFeedbackJournalStats();
      pendingCountBefore = journalBefore.pendingCount;
      pendingBytesBefore = journalBefore.pendingBytes;
      await this.replayPendingReviewFeedbackJournalEntries();
      await this.runtime.persist({
        reason: 'worker.persist',
        diagnostics: {
          cause: 'worker.persist',
          initiator: 'db.persist',
          projectionGeneration: null,
          hotPath: false,
        },
      });
      await this.rememberPersistedHash();
      this.lastReviewFeedbackCheckpoint = {
        ok: true,
        at: Date.now(),
        pendingCount: pendingCountBefore,
        pendingBytes: pendingBytesBefore,
        cleared: false,
      };
    } catch (error) {
      this.lastReviewFeedbackCheckpoint = {
        ok: false,
        at: Date.now(),
        pendingCount: pendingCountBefore,
        pendingBytes: pendingBytesBefore,
        cleared: false,
        error: errorMessage(error),
      };
      throw error;
    }
    return {
      ok: true,
      persisted: true,
      dbFile: this.dbFile,
    };
  }

  async mergeExternalDatabaseIfChanged(
    mergedAt = Date.now(),
    options: ExternalDatabaseMergeOptions = {},
  ): Promise<ExternalDatabaseMergeResult> {
    const totalStartedAt = Date.now();
    const context = options.context ?? 'generic';
    const cardId = options.cardId ?? null;
    const forceMainDbRead = options.forceMainDbRead === true;
    const skipMainDbRead = options.skipMainDbRead === true && !forceMainDbRead;
    const ignoreProcessedSourceDeduplication = options.ignoreProcessedSourceDeduplication === true;
    await this.measureReviewFeedbackDatabaseStep('merge.init', cardId, () => this.init());
    const sources: BackendSyncConflictMergeRequest['sources'] = [];
    const conflictSources = await this.measureReviewFeedbackDatabaseStep(
      'merge.read-conflict-sources',
      cardId,
      () => this.fileService.readSyncConflictDatabaseSources(),
    );
    let mainDbReadSkipped = false;
    let mainDbReadSkipReason: string | null = null;
    const nonEmptyConflictSources = conflictSources.filter((source) => source.bytes.byteLength > 0);
    if (skipMainDbRead) {
      mainDbReadSkipped = true;
      mainDbReadSkipReason = 'read-only-preflight-main-db-disabled';
      recordReviewFeedbackInnerStep({
        layer: 'database',
        step: 'merge.skip-main-db-read',
        cardId: cardId ? String(cardId) : null,
        durationMs: 0,
        extra: {
          context,
          reason: mainDbReadSkipReason,
          conflictSourceCount: conflictSources.length,
          nonEmptyConflictSourceCount: nonEmptyConflictSources.length,
        },
      });
    } else if (!forceMainDbRead && nonEmptyConflictSources.length === 0 && this.canSkipMainDbReadForReviewFeedbackPreflight(context)) {
      this.reviewFeedbackMainDbFastSkipUsesRemaining -= 1;
      mainDbReadSkipped = true;
      mainDbReadSkipReason = 'own-review-feedback-persisted-no-conflict-sources';
      recordReviewFeedbackInnerStep({
        layer: 'database',
        step: 'merge.fast-skip-main-db-read',
        cardId: cardId ? String(cardId) : null,
        durationMs: 0,
        extra: {
          context,
          usesRemaining: this.reviewFeedbackMainDbFastSkipUsesRemaining,
          reason: mainDbReadSkipReason,
          conflictSourceCount: conflictSources.length,
          nonEmptyConflictSourceCount: nonEmptyConflictSources.length,
        },
      });
      logger.info('[SiYuanMemo][WorkerSqliteDatabaseService] review.feedback preflight skipped persisted main DB read', {
        cardId: cardId ? String(cardId) : null,
        context,
        usesRemaining: this.reviewFeedbackMainDbFastSkipUsesRemaining,
        reason: mainDbReadSkipReason,
        conflictSourceCount: conflictSources.length,
        nonEmptyConflictSourceCount: nonEmptyConflictSources.length,
      });
    } else {
      if (context === 'review-feedback-preflight' && !forceMainDbRead && nonEmptyConflictSources.length === 0) {
        mainDbReadSkipReason = this.reviewFeedbackMainDbFastSkipUsesRemaining <= 0
          ? `fast-skip-not-eligible:${this.reviewFeedbackMainDbFastSkipInvalidatedBy ?? 'unknown'}`
          : 'fast-skip-not-eligible:unknown';
      } else if (context === 'review-feedback-preflight' && !forceMainDbRead) {
        mainDbReadSkipReason = 'fast-skip-blocked:non-empty-conflict-sources';
      }
      if (context !== 'review-feedback-preflight' && context !== 'read-only-preflight') {
        this.invalidateReviewFeedbackMainDbFastSkip(`merge:${context}`);
      }
      const bytes = await this.measureReviewFeedbackDatabaseStep(
        'merge.read-main-db',
        cardId,
        () => this.fileService.readBinary(this.dbFile),
      );

      if (bytes && bytes.byteLength > 0) {
        const persistedHash = hashBytes(bytes);
        if (forceMainDbRead || persistedHash !== this.lastObservedPersistedHash) {
          const currentHash = await this.measureReviewFeedbackDatabaseStep(
            'merge.hash-current-db',
            cardId,
            () => this.runtime.read((db) => hashBytes(db.export())),
          );
          if (persistedHash === currentHash) {
            this.lastObservedPersistedHash = persistedHash;
          } else {
            sources.push({ sourceId: 'siyuan-sync:siyuanmemo.db', bytes });
          }
        }
      }
    }
    for (const source of nonEmptyConflictSources) {
      sources.push(source);
    }
    const forgottenStaleSkippedSources = this.forgetStaleUnknownSkippedDomainSyncConflictSources(
      conflictSources.map((source) => source.sourceId),
    );

    if (sources.length === 0) {
      if (forgottenStaleSkippedSources > 0) {
        this.invalidateReviewFeedbackMainDbFastSkip('merge:forgotten-stale-skipped-sources');
        await this.measureReviewFeedbackDatabaseStep('merge.persist-forgotten-skipped', cardId, () => this.runtime.persist());
        await this.measureReviewFeedbackDatabaseStep('merge.remember-hash', cardId, () => this.rememberPersistedHash());
      }
      const domainSyncStatus = await this.measureReviewFeedbackDatabaseStep(
        'merge.domain-sync-status.no-sources',
        cardId,
        () => this.readDomainSyncStatusForNoSourceMerge(context, Date.now()),
      );
      const response: ExternalDatabaseMergeResult = {
        ok: true,
        checked: true,
        changed: forgottenStaleSkippedSources > 0,
        mergedReviewEvents: 0,
        mergedCards: 0,
        ignoredReviewEvents: 0,
        ignoredCards: 0,
        importedOperations: 0,
        ignoredOperations: 0,
        processedSourceIds: [],
        skippedSourceReasons: {},
        sanityStatus: domainSyncStatus.sanity.status,
        sourceIds: [],
        skippedSources: [],
        diagnostics: {
          reviewCardDivergences: [],
        },
        mainDbReadSkipped,
        mainDbReadSkipReason,
        conflictSourceCount: conflictSources.length,
        nonEmptyConflictSourceCount: nonEmptyConflictSources.length,
      };
      this.logReviewFeedbackDatabaseStepIfSlow('merge.total', cardId, Date.now() - totalStartedAt, {
        changed: response.changed,
        sourceCount: response.sourceIds.length,
        sanityStatus: response.sanityStatus,
        mainDbReadSkipped: response.mainDbReadSkipped,
        mainDbReadSkipReason: response.mainDbReadSkipReason,
        conflictSourceCount: response.conflictSourceCount,
        nonEmptyConflictSourceCount: response.nonEmptyConflictSourceCount,
      });
      return response;
    }

    const operationCountBeforeMerge = this.runtime.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_operations',
    )?.count ?? 0;
    const result = await this.measureReviewFeedbackDatabaseStep(
      'merge.apply-conflicts',
      cardId,
      () => this.mergeSyncConflictDatabases({
        mergedAt,
        sources,
        ignoreProcessedSourceDeduplication,
      }),
      { sourceCount: sources.length },
    );
    const domainSyncStatus = await this.measureReviewFeedbackDatabaseStep(
      'merge.domain-sync-status.after-merge',
      cardId,
      () => this.readDomainSyncStatusSnapshot(Date.now()),
      { sourceCount: sources.length },
    );
    const processedRows = this.readDomainSyncProcessedSourcesForSourceIds(sources.map((source) => source.sourceId));
    const skippedSourceReasons: Record<string, number> = {};
    for (const skipped of result.skippedSources) {
      const reason = String(skipped.reason || 'unknown');
      skippedSourceReasons[reason] = (skippedSourceReasons[reason] || 0) + 1;
    }
    const operationCountAfterMerge = this.runtime.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_operations',
    )?.count ?? operationCountBeforeMerge;
    const changed = result.mergedReviewEvents > 0
      || result.mergedCards > 0
      || Number(operationCountAfterMerge) > Number(operationCountBeforeMerge)
      || forgottenStaleSkippedSources > 0;
    if (
      result.skippedSources.length === 0
      && changed
    ) {
      await this.measureReviewFeedbackDatabaseStep('merge.persist-changed', cardId, () => this.runtime.persist(), {
        sourceCount: sources.length,
      });
      await this.measureReviewFeedbackDatabaseStep('merge.remember-hash', cardId, () => this.rememberPersistedHash());
    } else if (result.skippedSources.length === 0 && !changed) {
      await this.measureReviewFeedbackDatabaseStep('merge.remember-noop-hash', cardId, () => this.rememberPersistedHash());
    }
    this.invalidateReviewFeedbackMainDbFastSkip('merge:changed-or-conflict-source');

    const response: ExternalDatabaseMergeResult = {
      ok: true,
      checked: true,
      changed,
      mergedReviewEvents: result.mergedReviewEvents,
      mergedCards: result.mergedCards,
      ignoredReviewEvents: result.ignoredReviewEvents,
      ignoredCards: result.ignoredCards,
      importedOperations: processedRows.reduce((sum, row) => sum + Number(row.imported_operations || 0), 0),
      ignoredOperations: processedRows.reduce((sum, row) => sum + Number(row.ignored_operations || 0), 0),
      processedSourceIds: processedRows
        .filter((row) => !row.skipped_reason)
        .map((row) => row.source_id),
      skippedSourceReasons,
      sanityStatus: domainSyncStatus.sanity.status,
      sourceIds: sources.map((source) => String(source.sourceId || '').trim() || 'unknown'),
      skippedSources: result.skippedSources,
      diagnostics: result.diagnostics,
      mainDbReadSkipped,
      mainDbReadSkipReason,
      conflictSourceCount: conflictSources.length,
      nonEmptyConflictSourceCount: nonEmptyConflictSources.length,
    };
    this.logReviewFeedbackDatabaseStepIfSlow('merge.total', cardId, Date.now() - totalStartedAt, {
      changed: response.changed,
      sourceCount: response.sourceIds.length,
      sanityStatus: response.sanityStatus,
      mergedCards: response.mergedCards,
      mergedReviewEvents: response.mergedReviewEvents,
      importedOperations: response.importedOperations,
      mainDbReadSkipped: response.mainDbReadSkipped,
      mainDbReadSkipReason: response.mainDbReadSkipReason,
      conflictSourceCount: response.conflictSourceCount,
      nonEmptyConflictSourceCount: response.nonEmptyConflictSourceCount,
    });
    return response;
  }

  private canSkipMainDbReadForReviewFeedbackPreflight(context: ExternalDatabaseMergeContext): boolean {
    return context === 'review-feedback-preflight'
      && this.reviewFeedbackMainDbFastSkipUsesRemaining > 0;
  }

  markReviewFeedbackOwnPersistedMainDbClean(): void {
    this.reviewFeedbackMainDbFastSkipUsesRemaining = REVIEW_FEEDBACK_MAIN_DB_FAST_SKIP_LIMIT;
    this.reviewFeedbackMainDbFastSkipInvalidatedBy = null;
  }

  invalidateReviewFeedbackMainDbFastSkip(reason = 'unknown'): void {
    this.reviewFeedbackMainDbFastSkipUsesRemaining = 0;
    if (reason === 'merge:generic' && this.reviewFeedbackMainDbFastSkipInvalidatedBy) {
      return;
    }
    this.reviewFeedbackMainDbFastSkipInvalidatedBy = reason;
  }

  private async rememberPersistedHash(): Promise<void> {
    const bytes = await this.fileService.readBinary(this.dbFile);
    this.lastObservedPersistedHash = bytes ? hashBytes(bytes) : null;
  }

  async summarizeSyncConflictDatabases(
    request: BackendSyncConflictSummarizeRequest,
  ): Promise<BackendSyncConflictSummarizeResult> {
    await this.init();
    const sources = Array.isArray(request.sources) ? request.sources : [];
    const current = request.includeCurrent === false
      ? null
      : await this.summarizeCurrentDatabase();
    return {
      ok: true,
      current,
      sources: await Promise.all(sources.map((source) => this.summarizeDatabaseSource(source))),
    };
  }

  private async summarizeCurrentDatabase(): Promise<BackendSyncConflictDatabaseSummary> {
    const bytes = await this.runtime.read((db) => db.export());
    return this.summarizeDatabaseSource({
      sourceId: 'current-local:siyuanmemo.db',
      bytes,
      path: 'siyuanmemo.db',
      size: bytes.byteLength,
      modifiedAt: null,
    });
  }

  private async summarizeDatabaseSource(
    source: SqliteConflictDatabaseSource,
  ): Promise<BackendSyncConflictDatabaseSummary> {
    const sourceId = String(source?.sourceId || '').trim() || 'unknown';
    const base = {
      sourceId,
      path: source?.path ?? null,
      size: toSummarySize(source),
      modifiedAt: toNullableTimestamp(source?.modifiedAt),
      reviewEventCount: 0,
      cardCount: 0,
      latestReviewTimestamp: null,
      latestCardTimestamp: null,
    };
    if (!isUint8ArrayLike(source?.bytes)) {
      return { ...base, size: 0, parseStatus: 'invalid-bytes', parseError: 'invalid-bytes' };
    }
    if (source.bytes.byteLength === 0) {
      return { ...base, parseStatus: 'empty', parseError: 'empty-bytes' };
    }

    let conflictRuntime: RuntimeSqliteDatabaseService | null = null;
    try {
      conflictRuntime = new RuntimeSqliteDatabaseService(
        createReadonlyConflictFileService(source.bytes),
        `${sourceId}.db`,
      );
      await conflictRuntime.init();
      const review = conflictRuntime.getOne<ConflictSummaryReviewRow>(
        `SELECT COUNT(*) AS count, MAX(e.reviewed_at) AS latest
         FROM review_events e
         INNER JOIN cards c ON c.id = e.card_id
         WHERE ${activePluginCardSql('c')}`,
      );
      const card = conflictRuntime.getOne<ConflictSummaryCardRow>(
        `SELECT COUNT(*) AS count,
                MAX(updated_at) AS latestUpdated,
                MAX(last_review) AS latestReview
         FROM cards
         WHERE ${activePluginCardSql('cards')}`,
      );
      return {
        ...base,
        reviewEventCount: Math.max(0, Number(review?.count || 0)),
        cardCount: Math.max(0, Number(card?.count || 0)),
        latestReviewTimestamp: toNullableTimestamp(review?.latest),
        latestCardTimestamp: toNullableTimestamp(Math.max(
          Number(card?.latestUpdated || 0),
          Number(card?.latestReview || 0),
        )),
        parseStatus: 'ok',
      };
    } catch (error) {
      return {
        ...base,
        parseStatus: 'parse-error',
        parseError: error instanceof Error ? error.message : String(error),
      };
    } finally {
      conflictRuntime?.dispose();
    }
  }

  getStatus(): {
    initialized: boolean;
    dbFile: string;
    ingest: {
      queueLength: number;
      queuedTransactions: number;
      maxQueueLength: number;
      acceptedTotal: number;
      deduplicatedTotal: number;
      rejectedTotal: number;
      drainedTotal: number;
      actionQueueLength: number;
      actionEnqueuedTotal: number;
      actionDequeuedTotal: number;
      actionRequeuedTotal: number;
      actionRejectedTotal: number;
      removeActionQueuedTotal: number;
      upsertActionQueuedTotal: number;
      autoCardActionQueuedTotal: number;
      maxActionQueueLength: number;
      lastAcceptedAt: number | null;
      lastDrainAt: number | null;
    };
    autoCard: {
      decisionTotal: number;
      decisionSelectedTotal: number;
      decisionSkippedTotal: number;
      decisionNoOpTotal: number;
      decisionUnavailableTotal: number;
      decisionFailedTotal: number;
      executeTotal: number;
      executeCreatedTotal: number;
      executeSkippedTotal: number;
      executeUnavailableTotal: number;
      executeFailedTotal: number;
    };
    review: {
      feedbackTotal: number;
      feedbackCommittedTotal: number;
      feedbackPreviewTotal: number;
      feedbackUnavailableTotal: number;
    };
    storageDiagnostics: BackendStorageDiagnostic[];
    ai: {
      sessionCreateTotal: number;
      sessionUpdateTotal: number;
      sessionCancelTotal: number;
      streamStartTotal: number;
      streamCancelTotal: number;
      jobCreatedTotal: number;
      jobCompletedTotal: number;
      jobCanceledTotal: number;
      jobTimeoutTotal: number;
      jobFailedTotal: number;
    };
  } {
    return {
      initialized: this.initialized,
      dbFile: this.dbFile,
      ingest: this.kernelTransactionRuntime.getStatus(),
      autoCard: {
        decisionTotal: this.autoCardDecisionTotal,
        decisionSelectedTotal: this.autoCardDecisionSelectedTotal,
        decisionSkippedTotal: this.autoCardDecisionSkippedTotal,
        decisionNoOpTotal: this.autoCardDecisionNoOpTotal,
        decisionUnavailableTotal: this.autoCardDecisionUnavailableTotal,
        decisionFailedTotal: this.autoCardDecisionFailedTotal,
        executeTotal: this.autoCardExecuteTotal,
        executeCreatedTotal: this.autoCardExecuteCreatedTotal,
        executeSkippedTotal: this.autoCardExecuteSkippedTotal,
        executeUnavailableTotal: this.autoCardExecuteUnavailableTotal,
        executeFailedTotal: this.autoCardExecuteFailedTotal,
      },
      review: {
        feedbackTotal: this.reviewFeedbackTotal,
        feedbackCommittedTotal: this.reviewFeedbackCommittedTotal,
        feedbackPreviewTotal: this.reviewFeedbackPreviewTotal,
        feedbackUnavailableTotal: this.reviewFeedbackUnavailableTotal,
      },
      storageDiagnostics: [...this.storageDiagnostics],
      ai: {
        sessionCreateTotal: this.aiSessionCreateTotal,
        sessionUpdateTotal: this.aiSessionUpdateTotal,
        sessionCancelTotal: this.aiSessionCancelTotal,
        streamStartTotal: this.aiStreamStartTotal,
        streamCancelTotal: this.aiStreamCancelTotal,
        jobCreatedTotal: this.aiJobCreatedTotal,
        jobCompletedTotal: this.aiJobCompletedTotal,
        jobCanceledTotal: this.aiJobCanceledTotal,
        jobTimeoutTotal: this.aiJobTimeoutTotal,
        jobFailedTotal: this.aiJobFailedTotal,
      },
    };
  }

  async queryDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckCardPageResult | null> {
    await this.measureDiagnosticDatabaseStep('queryDeckPage.init', () => this.init(), {
      backendMethod: 'browser.deck.page',
    });
    return this.measureDiagnosticDatabaseStep(
      'queryDeckPage.total',
      () => this.repository!.queryDeckPage(query, page),
      {
        backendMethod: 'browser.deck.page',
        startRow: page.startRow ?? null,
        endRow: page.endRow ?? null,
      },
    );
  }

  async queryDeckMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[] | null> {
    await this.init();
    return this.repository!.queryDeckMatchedIds(query);
  }

  async getDeckRowsByIds(ids: string[]): Promise<FSRSCard[]> {
    await this.init();
    return this.repository!.getDeckCardsByIds(ids);
  }

  async queryBrowserDocumentCounts(scope: BrowserDocumentCountsScope): Promise<BrowserDocumentCountsResult> {
    await this.measureDiagnosticDatabaseStep('browserDocumentCounts.init', () => this.init(), {
      backendMethod: 'browser.deck.documentCounts',
    });
    return this.measureDiagnosticDatabaseStep(
      'browserDocumentCounts.total',
      () => this.repository!.queryBrowserDocumentCounts(scope),
      {
        backendMethod: 'browser.deck.documentCounts',
        kind: scope.kind,
        queueType: scope.queueType ?? null,
      },
    );
  }

  async queryCards(query?: StructuredCardQuery): Promise<FSRSCard[]> {
    await this.init();
    return this.repository!.queryCards(query);
  }

  async getQueueStateValue<T>(key: string): Promise<T | null> {
    await this.init();
    const values = this.queueState!.loadAll();
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] as T : null;
  }

  async setQueueStateValue(key: string, value: unknown): Promise<void> {
    await this.init();
    this.queueState!.set(key, value);
    await this.queueState!.persist();
  }

  async queueProjectionSnapshot(
    request: BackendQueueProjectionSnapshotRequest,
  ): Promise<BackendQueueProjectionSnapshotResult> {
    await this.measureDiagnosticDatabaseStep('queueProjection.snapshot.init', () => this.init(), {
      backendMethod: 'queue.projection.snapshot',
      queueType: request.queueType,
    });
    return this.measureDiagnosticDatabaseStep(
      'queueProjection.snapshot.total',
      () => this.createQueueProjectionRuntime().snapshot(request),
      {
        backendMethod: 'queue.projection.snapshot',
        queueType: request.queueType,
        limit: request.limit ?? null,
        offset: request.offset ?? null,
      },
    );
  }

  async queueProjectionRowsByIds(
    request: BackendQueueProjectionRowsByIdsRequest,
  ): Promise<BackendQueueProjectionRowsByIdsResult> {
    await this.measureDiagnosticDatabaseStep('queueProjection.rowsByIds.init', () => this.init(), {
      backendMethod: 'queue.projection.rowsByIds',
      queueType: request.queueType,
    });
    return this.measureDiagnosticDatabaseStep(
      'queueProjection.rowsByIds.total',
      () => this.createQueueProjectionRuntime().rowsByIds(request),
      {
        backendMethod: 'queue.projection.rowsByIds',
        queueType: request.queueType,
        idCount: Array.isArray(request.ids) ? request.ids.length : 0,
      },
    );
  }

  async replaceQueueProjection(
    request: BackendQueueProjectionReplaceRequest,
  ): Promise<BackendQueueProjectionReplaceResult> {
    await this.measureDiagnosticDatabaseStep('queueProjection.replace.init', () => this.init(), {
      backendMethod: 'queue.projection.replace',
      queueType: request.queueType,
    });
    const result = await this.measureDiagnosticDatabaseStep(
      'queueProjection.replace.total',
      () => this.createQueueProjectionRuntime().replace(request),
      {
        backendMethod: 'queue.projection.replace',
        queueType: request.queueType,
        rowCount: Array.isArray(request.rows) ? request.rows.length : 0,
        reason: request.reason ?? null,
      },
    );
    logger.debug('Queue projection replace applied as derived cache update', {
      queueType: request.queueType,
      reason: request.reason ?? 'queue-projection.replace',
    });
    return result;
  }

  async rebuildSqlProjections(
    request: WorkerStorageProjectionRebuildRequest,
  ): Promise<BackendStorageProjectionRebuildResult> {
    await this.measureDiagnosticDatabaseStep('storageProjection.rebuild.init', () => this.init(), {
      backendMethod: 'storage.projection.rebuild',
      families: request.families,
      cause: request.cause ?? null,
    });
    return this.measureDiagnosticDatabaseStep(
      'storageProjection.rebuild.total',
      () => this.rebuildSqlProjectionsFromTruth(request),
      {
        backendMethod: 'storage.projection.rebuild',
        families: request.families,
        cause: request.cause ?? null,
        truthRecordCount: request.truthRecords.length,
        sourceReadCount: request.sourceReads.length,
      },
    );
  }

  async getCard(cardId: string): Promise<FSRSCard | undefined> {
    await this.init();
    return this.repository!.getCard(cardId);
  }

  async upsertCards(cards: FSRSCard[]): Promise<void> {
    await this.init();
    this.repository!.upsertCards(cards);
  }

  async countCards(query?: StructuredCardQuery): Promise<number> {
    await this.init();
    return this.repository!.countCards(query);
  }

  async getBrowserStats(now?: number): Promise<BrowserStats> {
    await this.measureDiagnosticDatabaseStep('browserStats.init', () => this.init(), {
      backendMethod: 'browser.stats',
    });
    return this.measureDiagnosticDatabaseStep('browserStats.total', () => this.repository!.getBrowserStats(now), {
      backendMethod: 'browser.stats',
    });
  }

  async getSourceExistenceRefreshCandidates(
    request?: SourceExistenceRefreshRequest,
  ): Promise<SourceExistenceRefreshCandidate[]> {
    await this.init();
    return this.repository!.getSourceExistenceRefreshCandidates(request);
  }

  async updateSourceExistence(
    updates: SourceExistenceUpdate[],
    checkedAt?: number,
  ): Promise<void> {
    await this.init();
    const previousStatus = this.repository!.getSourceExistenceByBlockIds(
      updates.map((update) => update.blockId),
    );
    await this.repository!.updateSourceExistence(updates, checkedAt);
    const changedBlockIds = uniqueStrings(updates
      .filter((update) => {
        if (!previousStatus.has(update.blockId)) {
          return false;
        }
        const previous = previousStatus.get(update.blockId);
        return previous !== update.exists;
      })
      .map((update) => update.blockId));
    this.invalidateQueueProjectionsForSourceChanges(changedBlockIds, checkedAt ?? Date.now());
  }

  async getSourceExistenceByBlockIds(
    blockIds: string[],
  ): Promise<Array<{ blockId: string; exists: boolean | null }>> {
    await this.init();
    const statusByBlockId = this.repository!.getSourceExistenceByBlockIds(blockIds);
    return Array.from(statusByBlockId.entries())
      .map(([blockId, exists]) => ({ blockId, exists }));
  }

  async getSourceExistenceSummary(staleBefore?: number): Promise<SourceExistenceSummary> {
    await this.init();
    return this.repository!.getSourceExistenceSummary(staleBefore);
  }

  async applySourceExistenceSweep(
    request: SourceExistenceRefreshRequest = {},
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<{ checked: number; updated: number; changed: boolean; changedToMissing: boolean; changedBlockIds: string[] }> {
    await this.init();

    const candidates = this.repository!.getSourceExistenceRefreshCandidates(request);
    return this.applySourceExistenceSweepFromCandidates(candidates, existingBlockIds, checkedAt);
  }

  async applySourceExistenceSweepFromCandidates(
    candidates: SourceExistenceRefreshCandidate[],
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<{ checked: number; updated: number; changed: boolean; changedToMissing: boolean; changedBlockIds: string[] }> {
    await this.init();

    if (candidates.length === 0) {
      return { checked: 0, updated: 0, changed: false, changedToMissing: false, changedBlockIds: [] };
    }

    const existingSet = new Set(
      existingBlockIds
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean),
    );

    let changed = false;
    let changedToMissing = false;
    const changedBlockIds: string[] = [];
    const updates: SourceExistenceUpdate[] = [];
    for (const candidate of candidates) {
      const exists = existingSet.has(candidate.blockId);
      if (candidate.sourceExists !== exists) {
        changed = true;
        changedBlockIds.push(candidate.blockId);
        if (!exists) {
          changedToMissing = true;
        }
      }
      updates.push({
        cardId: candidate.cardId,
        blockId: candidate.blockId,
        exists,
      });
    }

    if (changedBlockIds.length === 0) {
      return {
        checked: candidates.length,
        updated: 0,
        changed: false,
        changedToMissing: false,
        changedBlockIds: [],
      };
    }

    await this.runtime.runTransaction('source-existence.sweep', async () => {
      await this.repository!.updateSourceExistence(updates, checkedAt);
      const domainSyncLedger = new DomainSyncLedger(this.runtime);
      for (const candidate of candidates) {
        const exists = existingSet.has(candidate.blockId);
        if (candidate.sourceExists !== exists && !exists) {
          domainSyncLedger.appendSourceExistenceUpdated({
            cardId: candidate.cardId,
            blockId: candidate.blockId,
            previousExists: candidate.sourceExists,
            exists,
            checkedAt,
            missingAt: checkedAt,
          });
        }
      }
      if (changedBlockIds.length > 0) {
        this.invalidateQueueProjectionsForSourceChanges(changedBlockIds, checkedAt);
      }
    });

    return {
      checked: candidates.length,
      updated: changedBlockIds.length,
      changed,
      changedToMissing,
      changedBlockIds,
    };
  }

  async getQueueProjectionGeneration(queueType: string): Promise<QueueProjectionGeneration | null> {
    await this.init();
    const projectionQueueType = resolveProjectionQueueType(queueType);
    if (!projectionQueueType || !this.queueProjection) {
      return null;
    }
    return this.queueProjection.readGeneration(projectionQueueType);
  }

  async readQueueProjectionRows(query: QueueProjectionRowsQuery): Promise<QueueProjectionRow[]> {
    await this.init();
    const projectionQueueType = resolveProjectionQueueType(query.queueType);
    if (!projectionQueueType || !this.queueProjection) {
      return [];
    }
    return this.queueProjection.readRows({
      ...query,
      queueType: projectionQueueType,
    });
  }

  async reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    const totalStartedAt = Date.now();
    await this.measureReviewFeedbackDatabaseStep('reviewFeedback.init', request.cardId, () => this.init());
    let committedJournalEntryId: string | null = null;
    let truthCandidate: MessagePackReviewEventTruthRecord | null = null;
    const runtime = new WorkerReviewFeedbackRuntime({
      repository: this.repository!,
      queueProjection: this.queueProjection,
      runtime: this.runtime,
      domainSyncLedger: new DomainSyncLedger(this.runtime),
      recordUnavailable: () => {
        this.reviewFeedbackUnavailableTotal += 1;
      },
      persistReviewJournal: async (normalizedRequest) => {
        const journalEntry = this.createReviewFeedbackJournalEntry(normalizedRequest);
        await this.measureReviewFeedbackDatabaseStep(
          'reviewFeedback.journal-write',
          normalizedRequest.cardId,
          () => this.appendReviewFeedbackJournalEntry(journalEntry),
          {
            queueType: normalizedRequest.queueType,
            queueMode: normalizedRequest.queueMode,
            commitPolicy: normalizedRequest.commitPolicy,
            rating: normalizedRequest.rating,
          },
        );
        committedJournalEntryId = journalEntry.id;
        return journalEntry.request;
      },
      recordReviewTruthCandidate: (candidate) => {
        truthCandidate = this.validateReviewFeedbackTruthCandidate(candidate);
      },
    });
    let result: BackendReviewFeedbackResult;
    try {
      result = await this.measureReviewFeedbackDatabaseStep(
        'reviewFeedback.runtime',
        request.cardId,
        () => runtime.reviewFeedback(request),
        {
          queueType: request.queueType,
          queueMode: request.queueMode,
          commitPolicy: request.commitPolicy,
          rating: request.rating,
        },
      );
    } catch (error) {
      if (committedJournalEntryId) {
        await this.markReviewFeedbackJournalEntryProjectionFailed(committedJournalEntryId, error);
      }
      throw error;
    }
    this.reviewFeedbackTotal += 1;
    if (result.committed) {
      this.reviewFeedbackCommittedTotal += 1;
      this.lastDomainSyncStatusSnapshot = null;
      this.markReviewFeedbackOwnPersistedMainDbClean();
      if (committedJournalEntryId) {
        this.appliedReviewFeedbackJournalEntryIds.add(committedJournalEntryId);
        await this.markReviewFeedbackJournalEntryTruthRecorded(
          committedJournalEntryId,
          result.reviewedAt,
          truthCandidate,
        );
      }
    } else {
      this.reviewFeedbackPreviewTotal += 1;
    }
    this.logReviewFeedbackDatabaseStepIfSlow('reviewFeedback.total', request.cardId, Date.now() - totalStartedAt, {
      queueType: request.queueType,
      queueMode: request.queueMode,
      commitPolicy: request.commitPolicy,
      rating: request.rating,
      committed: result.committed,
      duplicate: result.duplicate,
    });
    return {
      ...result,
      storage: await new ReviewFeedbackStorageEnvelope({
        readJournalDiagnostics: () => this.getReviewFeedbackJournalDiagnostics(),
        readSqliteDeltaHotPathDiagnostics: async () => this.runtime.getSqliteDeltaHotPathDiagnostics(),
      }).build({
        result,
        journalEntryId: committedJournalEntryId,
      }),
    };
  }

  private async appendReviewFeedbackJournalEntry(entry: ReviewFeedbackJournalEntry): Promise<void> {
    try {
      const beforeStats = await this.readReviewFeedbackJournalStats();
      const beforeBackpressure = this.buildReviewFeedbackJournalBackpressure(beforeStats, Date.now());
      if (beforeBackpressure.state === 'unavailable') {
        throw new Error(
          `BACKEND_UNAVAILABLE: review.feedback non-SiYuan journal backpressure `
          + `(${beforeBackpressure.reason}; pending=${beforeBackpressure.pendingCount}, `
          + `bytes=${beforeBackpressure.pendingBytes})`,
        );
      }
      const stats = await this.appendReviewFeedbackJournalStoreEntry(entry);
      this.lastReviewFeedbackJournalWrite = {
        ok: true,
        at: Date.now(),
        entryId: entry.id,
        cardId: entry.cardId,
        status: entry.status,
        pendingCount: stats.pendingCount,
        pendingBytes: stats.pendingBytes,
      };
    } catch (error) {
      this.lastReviewFeedbackJournalWrite = {
        ok: false,
        at: Date.now(),
        entryId: entry.id,
        cardId: entry.cardId,
        error: errorMessage(error),
      };
      throw error;
    }
  }

  private async replayPendingReviewFeedbackJournalEntries(): Promise<void> {
    let pendingEntries: ReviewFeedbackJournalEntry[] = [];
    let replayedCount = 0;
    let skippedInMemoryCount = 0;
    try {
      pendingEntries = await this.readReplayableReviewFeedbackJournalEntries();
      if (pendingEntries.length === 0) {
        this.lastReviewFeedbackJournalReplay = {
          ok: true,
          at: Date.now(),
          pendingCount: 0,
          pendingBytes: 0,
          replayedCount: 0,
          skippedInMemoryCount: 0,
        };
        return;
      }
      const runtime = new WorkerReviewFeedbackRuntime({
        repository: this.repository!,
        queueProjection: this.queueProjection,
        runtime: this.runtime,
        domainSyncLedger: new DomainSyncLedger(this.runtime),
        recordUnavailable: () => {
          this.reviewFeedbackUnavailableTotal += 1;
        },
      });
      for (const entry of pendingEntries) {
        if (this.appliedReviewFeedbackJournalEntryIds.has(entry.id)) {
          skippedInMemoryCount += 1;
          continue;
        }
        await this.measureReviewFeedbackDatabaseStep(
          'reviewFeedback.journal-replay',
          entry.cardId,
          () => runtime.reviewFeedback(entry.request),
          {
            queueType: entry.request.queueType,
            queueMode: entry.request.queueMode,
            commitPolicy: entry.request.commitPolicy,
            rating: entry.request.rating,
          },
        );
        replayedCount += 1;
        this.appliedReviewFeedbackJournalEntryIds.add(entry.id);
        await this.markReviewFeedbackJournalEntryProjectionApplied(
          entry.id,
          Number(entry.request.reviewedAt ?? entry.appliedAt ?? Date.now()),
        );
      }
      this.lastReviewFeedbackJournalReplay = {
        ok: true,
        at: Date.now(),
        pendingCount: pendingEntries.length,
        pendingBytes: estimateJsonByteLength(pendingEntries),
        replayedCount,
        skippedInMemoryCount,
      };
    } catch (error) {
      this.lastReviewFeedbackJournalReplay = {
        ok: false,
        at: Date.now(),
        pendingCount: pendingEntries.length,
        pendingBytes: estimateJsonByteLength(pendingEntries),
        replayedCount,
        skippedInMemoryCount,
        error: errorMessage(error),
      };
      throw error;
    }
  }

  private async readPendingReviewFeedbackJournalEntries(): Promise<ReviewFeedbackJournalEntry[]> {
    if (!this.reviewFeedbackJournalStore) {
      return [];
    }
    return this.normalizeReviewFeedbackJournalEntries(await this.reviewFeedbackJournalStore.listPendingEntries())
      .filter((entry) => entry.status !== 'truth-flushed');
  }

  private async readReplayableReviewFeedbackJournalEntries(): Promise<ReviewFeedbackJournalEntry[]> {
    if (!this.reviewFeedbackJournalStore) {
      return [];
    }
    const statuses: ReviewFeedbackJournalEntryStatus[] = ['prepared'];
    const entries: ReviewFeedbackJournalEntry[] = [];
    for (const status of statuses) {
      entries.push(...this.normalizeReviewFeedbackJournalEntries(
        await this.reviewFeedbackJournalStore.listEntriesByStatus(status, REVIEW_FEEDBACK_JOURNAL_REPLAY_BATCH_LIMIT),
      ));
      if (entries.length >= REVIEW_FEEDBACK_JOURNAL_REPLAY_BATCH_LIMIT) {
        break;
      }
    }
    return entries
      .sort((a, b) => a.recordedAt - b.recordedAt)
      .slice(0, REVIEW_FEEDBACK_JOURNAL_REPLAY_BATCH_LIMIT);
  }

  private async reconcileReviewFeedbackJournalProjectionState(): Promise<void> {
    if (!this.reviewFeedbackJournalStore || !this.queueProjection || !this.repository) {
      return;
    }
    const reconciler = new ReviewJournalProjectionReconciler({
      journalStore: this.reviewFeedbackJournalStore,
      queueProjection: this.queueProjection,
      repository: this.repository,
      getDurableReviewEventByIdempotencyKey: (idempotencyKey) => this.runtime.getOne<{
        card_id: string | null;
        rating: number | null;
        reviewed_at: number | null;
        payload_json: string | null;
      }>(
        `SELECT card_id, rating, reviewed_at, payload_json
           FROM review_events
          WHERE commit_idempotency_key = ?
          ORDER BY reviewed_at ASC, id ASC
          LIMIT 1`,
        [idempotencyKey],
      ),
      runTransaction: (label, task, options) => this.runtime.runTransaction(label, task, options),
      replayBatchLimit: REVIEW_FEEDBACK_JOURNAL_REPLAY_BATCH_LIMIT,
    });
    await reconciler.reconcile();
  }

  private async readReviewFeedbackJournalStats(): Promise<ReviewFeedbackJournalStoreStats> {
    if (!this.reviewFeedbackJournalStore) {
      return {
        entryCount: 0,
        pendingCount: 0,
        pendingBytes: 0,
        updatedAt: 0,
      };
    }
    return this.reviewFeedbackJournalStore.getStats();
  }

  private async appendReviewFeedbackJournalStoreEntry(
    entry: ReviewFeedbackJournalEntry,
  ): Promise<ReviewFeedbackJournalStoreStats> {
    if (!this.reviewFeedbackJournalStore) {
      throw new Error('BACKEND_UNAVAILABLE: review.feedback non-SiYuan journal store unavailable');
    }
    return this.reviewFeedbackJournalStore.appendEntry(entry);
  }

  private async markReviewFeedbackJournalEntryTruthRecorded(
    entryId: string,
    appliedAt: number,
    truthCandidate?: MessagePackReviewEventTruthRecord | null,
  ): Promise<void> {
    if (!this.reviewFeedbackJournalStore) {
      return;
    }
    await this.reviewFeedbackJournalStore.updateEntryStatus(entryId, 'prepared', {
      appliedAt,
      ...(truthCandidate ? { truthCandidate: { ...truthCandidate, journalEntryId: entryId } } : {}),
      projectionFailedAt: null,
      lastError: null,
    });
  }

  private async markReviewFeedbackJournalEntryProjectionApplied(
    entryId: string,
    appliedAt: number,
  ): Promise<void> {
    if (!this.reviewFeedbackJournalStore) {
      return;
    }
    await this.reviewFeedbackJournalStore.updateEntryStatus(entryId, 'projection-applied', {
      appliedAt,
      projectionAppliedAt: Date.now(),
      projectionFailedAt: null,
      lastError: null,
    });
  }

  private async markReviewFeedbackJournalEntryProjectionFailed(entryId: string, error: unknown): Promise<void> {
    if (!this.reviewFeedbackJournalStore) {
      return;
    }
    await this.reviewFeedbackJournalStore.updateEntryStatus(entryId, 'projection-failed', {
      projectionFailedAt: Date.now(),
      lastError: errorMessage(error),
    });
  }

  private normalizeReviewFeedbackJournalEntries(entries: unknown[]): ReviewFeedbackJournalEntry[] {
    return entries.filter((entry): entry is ReviewFeedbackJournalEntry => {
      return typeof entry === 'object'
        && entry !== null
        && typeof (entry as ReviewFeedbackJournalEntry).id === 'string'
        && typeof (entry as ReviewFeedbackJournalEntry).cardId === 'string'
        && typeof (entry as ReviewFeedbackJournalEntry).recordedAt === 'number'
        && typeof (entry as ReviewFeedbackJournalEntry).request === 'object'
        && (entry as ReviewFeedbackJournalEntry).request !== null;
    }).map((entry) => ({
      ...entry,
      status: this.normalizeReviewFeedbackJournalEntryStatus((entry as Partial<ReviewFeedbackJournalEntry>).status),
      appliedAt: typeof entry.appliedAt === 'number' && Number.isFinite(entry.appliedAt) ? entry.appliedAt : null,
      projectionAppliedAt: typeof entry.projectionAppliedAt === 'number' && Number.isFinite(entry.projectionAppliedAt)
        ? entry.projectionAppliedAt
        : null,
      projectionFailedAt: typeof entry.projectionFailedAt === 'number' && Number.isFinite(entry.projectionFailedAt)
        ? entry.projectionFailedAt
        : null,
      truthCandidate: this.validateReviewFeedbackTruthCandidateOrNull((entry as Partial<ReviewFeedbackJournalEntry>).truthCandidate),
      lastError: typeof entry.lastError === 'string' ? entry.lastError : null,
    }));
  }

  private validateReviewFeedbackTruthCandidateOrNull(value: unknown): MessagePackReviewEventTruthRecord | null {
    return value ? this.validateReviewFeedbackTruthCandidate(value) : null;
  }

  private validateReviewFeedbackTruthCandidate(value: unknown): MessagePackReviewEventTruthRecord {
    if (!isRecord(value)
      || value.family !== 'review-events'
      || value.type !== 'review.feedback.v2'
      || typeof value.idempotencyKey !== 'string'
      || !value.idempotencyKey.trim()
      || !isRecord(value.source)
      || typeof value.source.cardId !== 'string'
      || !value.source.cardId.trim()
      || !isRecord(value.review)
      || ![1, 2, 3, 4].includes(Number(value.review.rating))
      || !Number.isFinite(Number(value.review.reviewedAt))
      || !isRecord(value.beforeCard)
      || !isRecord(value.afterCard)) {
      throw new Error('INVALID_STATE: review.feedback truth v2 candidate is incomplete');
    }
    return value as MessagePackReviewEventTruthRecord;
  }

  private normalizeReviewFeedbackJournalEntryStatus(status: unknown): ReviewFeedbackJournalEntryStatus {
    return typeof status === 'string' && REVIEW_FEEDBACK_JOURNAL_STATUSES.has(status as ReviewFeedbackJournalEntryStatus)
      ? status as ReviewFeedbackJournalEntryStatus
      : 'prepared';
  }

  private createReviewFeedbackJournalEntry(request: BackendReviewFeedbackRequest): ReviewFeedbackJournalEntry {
    const cardId = String(request.cardId || '').trim();
    const reviewedAt = Number(request.reviewedAt || Date.now());
    const rating = Math.max(1, Math.min(4, Math.floor(Number(request.rating) || 0)));
    const idempotencyKey = typeof request.idempotencyKey === 'string' && request.idempotencyKey.trim()
      ? request.idempotencyKey.trim()
      : null;
    const id = idempotencyKey
      ? `review-feedback:${idempotencyKey}`
      : `review-feedback:${cardId}:${reviewedAt}:${rating}`;
    const normalizedIdempotencyKey = idempotencyKey ?? id;
    return {
      id,
      requestId: null,
      cardId,
      idempotencyKey: normalizedIdempotencyKey,
      status: 'prepared',
      recordedAt: Date.now(),
      request: {
        ...request,
        cardId,
        rating: rating as 1 | 2 | 3 | 4,
        reviewedAt,
        idempotencyKey: normalizedIdempotencyKey,
      },
      appliedAt: null,
      projectionAppliedAt: null,
      projectionFailedAt: null,
      lastError: null,
    };
  }

  async getReviewFeedbackJournalDiagnostics(): Promise<BackendReviewFeedbackJournalDiagnostics> {
    const stats = await this.readReviewFeedbackJournalStats();
    const now = Date.now();
    return {
      fileName: REVIEW_FEEDBACK_JOURNAL_STORAGE_NAME,
      storage: this.reviewFeedbackJournalStore?.storage ?? 'unavailable',
      version: REVIEW_FEEDBACK_JOURNAL_VERSION,
      entryCount: stats.entryCount,
      pendingCount: stats.pendingCount,
      pendingBytes: stats.pendingBytes,
      oldestPendingAt: stats.oldestPendingAt,
      oldestPendingAgeMs: stats.oldestPendingAt === null ? null : Math.max(0, now - stats.oldestPendingAt),
      statusCounts: stats.statusCounts,
      backpressure: this.buildReviewFeedbackJournalBackpressure(stats, now),
      appliedInMemoryCount: this.appliedReviewFeedbackJournalEntryIds.size,
      lastWrite: this.lastReviewFeedbackJournalWrite,
      lastReplay: this.lastReviewFeedbackJournalReplay,
      lastCheckpoint: this.lastReviewFeedbackCheckpoint,
    };
  }

  getReviewFeedbackJournalStore(): ReviewFeedbackJournalStore | null {
    return this.reviewFeedbackJournalStore;
  }

  async countReviewEventsPendingTruthBackfill(): Promise<number> {
    await this.init();
    const row = this.runtime.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM review_events
        WHERE event_type IN ('review', 'review-v2')
          AND (msgpack_ref IS NULL OR TRIM(msgpack_ref) = '')`,
    );
    return Math.max(0, Math.floor(Number(row?.count || 0)));
  }

  async listReviewEventsForTruthBackfill(limit = 64): Promise<ReviewSqlTruthBackfillRow[]> {
    await this.init();
    const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 64));
    const rows = this.runtime.getAll<{
      id: string | null;
      card_id: string | null;
      attempt_id: string | null;
      rating: number | null;
      reviewed_at: number | null;
      event_type: string | null;
      commit_idempotency_key: string | null;
      payload_json: string | null;
      msgpack_ref: string | null;
      truth_hash: string | null;
      truth_schema_version: number | null;
      projection_generation: number | null;
    }>(
      `SELECT id, card_id, attempt_id, rating, reviewed_at, event_type,
              commit_idempotency_key, payload_json, msgpack_ref, truth_hash,
              truth_schema_version, projection_generation
         FROM review_events
        WHERE event_type IN ('review', 'review-v2')
          AND (msgpack_ref IS NULL OR TRIM(msgpack_ref) = '')
        ORDER BY reviewed_at ASC, id ASC
        LIMIT ?`,
      [normalizedLimit],
    );
    return rows.map((row) => ({
      id: row.id,
      cardId: row.card_id,
      attemptId: row.attempt_id,
      rating: row.rating,
      reviewedAt: row.reviewed_at,
      eventType: row.event_type,
      commitIdempotencyKey: row.commit_idempotency_key,
      payloadJson: row.payload_json,
      msgpackRef: row.msgpack_ref,
      truthHash: row.truth_hash,
      truthSchemaVersion: row.truth_schema_version,
      projectionGeneration: row.projection_generation,
    }));
  }

  async patchReviewTruthBackfillProjectionRefs(
    patches: ReviewSqlTruthBackfillProjectionPatch[],
  ): Promise<void> {
    if (patches.length === 0) {
      return;
    }
    await this.init();
    await this.runtime.runTransaction('review.truth.backfill.patch-refs', () => {
      for (const patch of patches) {
        this.runtime.run(
          `UPDATE review_events
              SET msgpack_ref = ?,
                  truth_hash = ?,
                  truth_schema_version = ?,
                  projection_generation = ?
            WHERE id = ?`,
          [
            patch.msgpackRef,
            patch.truthHash,
            patch.truthSchemaVersion,
            patch.projectionGeneration,
            patch.eventId,
          ],
        );
      }
    });
  }

  async getSqliteDeltaDiagnostics(): Promise<SqliteDeltaDiagnostics> {
    const diagnostics = await this.runtime.getSqliteDeltaDiagnostics();
    if (!diagnostics) {
      throw new Error('SQLite delta diagnostics unavailable');
    }
    return diagnostics;
  }

  private buildReviewFeedbackJournalBackpressure(
    stats: ReviewFeedbackJournalStoreStats,
    now: number,
  ): BackendReviewFeedbackJournalBackpressureDiagnostics {
    const oldestPendingAgeMs = stats.oldestPendingAt === null ? null : Math.max(0, now - stats.oldestPendingAt);
    let reason: BackendReviewFeedbackJournalBackpressureDiagnostics['reason'] = null;
    if (stats.pendingCount >= this.reviewFeedbackJournalBackpressure.maxPendingCount) {
      reason = 'pending-count';
    } else if (stats.pendingBytes >= this.reviewFeedbackJournalBackpressure.maxPendingBytes) {
      reason = 'pending-bytes';
    } else if (
      oldestPendingAgeMs !== null
      && oldestPendingAgeMs >= this.reviewFeedbackJournalBackpressure.maxOldestPendingAgeMs
    ) {
      reason = 'oldest-pending-age';
    }
    return {
      state: reason ? 'unavailable' : 'ok',
      reason,
      pendingCount: stats.pendingCount,
      pendingBytes: stats.pendingBytes,
      oldestPendingAgeMs,
      maxPendingCount: this.reviewFeedbackJournalBackpressure.maxPendingCount,
      maxPendingBytes: this.reviewFeedbackJournalBackpressure.maxPendingBytes,
      maxOldestPendingAgeMs: this.reviewFeedbackJournalBackpressure.maxOldestPendingAgeMs,
      nextAction: reason ? 'flush-or-checkpoint' : 'continue',
    };
  }

  private async measureReviewFeedbackDatabaseStep<TResult>(
    step: string,
    cardId: string | null | undefined,
    task: () => Promise<TResult>,
    extra?: Record<string, unknown>,
  ): Promise<TResult>;
  private measureReviewFeedbackDatabaseStep<TResult>(
    step: string,
    cardId: string | null | undefined,
    task: () => TResult,
    extra?: Record<string, unknown>,
  ): TResult;
  private measureReviewFeedbackDatabaseStep<TResult>(
    step: string,
    cardId: string | null | undefined,
    task: () => TResult | Promise<TResult>,
    extra: Record<string, unknown> = {},
  ): TResult | Promise<TResult> {
    const startedAt = Date.now();
    const logIfSlow = (): void => {
      this.logReviewFeedbackDatabaseStepIfSlow(step, cardId, Date.now() - startedAt, extra);
    };

    try {
      const result = task();
      if (result && typeof (result as Promise<TResult>).then === 'function') {
        return (result as Promise<TResult>).finally(logIfSlow);
      }
      logIfSlow();
      return result;
    } catch (error) {
      logIfSlow();
      throw error;
    }
  }

  private logReviewFeedbackDatabaseStepIfSlow(
    step: string,
    cardId: string | null | undefined,
    durationMs: number,
    extra: Record<string, unknown>,
  ): void {
    if (durationMs < REVIEW_FEEDBACK_DB_STEP_SLOW_MS) {
      return;
    }
    recordReviewFeedbackInnerStep({
      layer: 'database',
      step,
      cardId: cardId ? String(cardId) : null,
      durationMs,
      queueType: typeof extra.queueType === 'string' ? extra.queueType : null,
      extra,
    });
    logger.info('[SiYuanMemo][WorkerSqliteDatabaseService] slow review.feedback database step', {
      step,
      cardId: cardId ? String(cardId) : null,
      durationMs,
      ...extra,
    });
  }

  async getDomainSyncStatus(checkedAt = Date.now()): Promise<BackendDomainSyncStatusResult> {
    await this.init();
    return this.readDomainSyncStatusSnapshot(checkedAt);
  }

  async getDomainSyncStatusForPreflight(
    context: ExternalDatabaseMergeContext,
    checkedAt = Date.now(),
  ): Promise<BackendDomainSyncStatusResult> {
    await this.init();
    return this.readDomainSyncStatusForNoSourceMerge(context, checkedAt);
  }

  private async readDomainSyncStatusForNoSourceMerge(
    context: ExternalDatabaseMergeContext,
    checkedAt = Date.now(),
  ): Promise<BackendDomainSyncStatusResult> {
    if (
      (context === 'review-feedback-preflight' || context === 'read-only-preflight')
      && this.lastDomainSyncStatusSnapshot
    ) {
      return this.cloneDomainSyncStatusSnapshot(this.lastDomainSyncStatusSnapshot, checkedAt);
    }
    return this.readDomainSyncStatusSnapshot(checkedAt);
  }

  private async readDomainSyncStatusSnapshot(checkedAt = Date.now()): Promise<BackendDomainSyncStatusResult> {
    const operationRows = this.runtime.getAll<DomainSyncOperationSummaryRow>(
      `SELECT operation_type, COUNT(*) AS count, MAX(occurred_at) AS newest
       FROM domain_sync_operations
       GROUP BY operation_type
       ORDER BY operation_type`,
    );
    const operationTypes: Partial<Record<BackendDomainSyncOperationType, number>> = {};
    let operationCount = 0;
    let newestOperationAt: number | null = null;
    for (const row of operationRows) {
      const operationType = String(row.operation_type || '') as BackendDomainSyncOperationType;
      const count = Math.max(0, Number(row.count || 0));
      operationTypes[operationType] = count;
      operationCount += count;
      const newest = toNullableTimestamp(row.newest);
      if (newest !== null && (newestOperationAt === null || newest > newestOperationAt)) {
        newestOperationAt = newest;
      }
    }

    const processedCounts = this.runtime.getOne<{
      total_processed: number;
      total_skipped: number;
    }>(
      `SELECT
         SUM(CASE WHEN skipped_reason IS NULL THEN 1 ELSE 0 END) AS total_processed,
         SUM(CASE WHEN skipped_reason IS NOT NULL THEN 1 ELSE 0 END) AS total_skipped
       FROM domain_sync_processed_sources`,
    );
    const divergence = await this.auditReviewSyncDivergence({ limit: 50 });
    const repairSummary = this.summarizeDomainSyncRepairEvidence(this.queryDomainSyncRepairPreviewEvidence());
    const needsDirection = this.countNeedsDirectionDomainSyncOperations();
    const divergentLedgerCount = this.countDivergentLedgerOperations();
    const pendingImportCount = this.countPotentialPendingImportOperations();
    const skippedSourceCount = Math.max(0, Number(processedCounts?.total_skipped || 0));
    const status = this.resolveDomainSyncSanityStatus({
      skippedSourceCount,
      needsDirection,
      divergentLedgerCount,
      repairableDivergenceCount: repairSummary.repairableCards,
      unrepairableDivergenceCount: repairSummary.unrepairableCards,
      processedSourceCount: Math.max(0, Number(processedCounts?.total_processed || 0)),
    });
    const reasonCounts: BackendDomainSyncStatusResult['sanity']['reasonCounts'] = {
      ...divergence.reasons,
    };
    if (needsDirection > 0) {
      reasonCounts['needs-direction'] = needsDirection;
    }
    if (skippedSourceCount > 0) {
      reasonCounts['source-error'] = skippedSourceCount;
    }
    const recentProcessed = this.readDomainSyncProcessedSources(false, 10, status);
    const recentSkipped = this.readDomainSyncProcessedSources(true, 10, status);

    const snapshot: BackendDomainSyncStatusResult = {
      ok: true,
      ledger: {
        operationCount,
        newestOperationAt,
        operationTypes,
      },
      processedSources: {
        recent: recentProcessed,
        skipped: recentSkipped,
        totalProcessed: Math.max(0, Number(processedCounts?.total_processed || 0)),
        totalSkipped: skippedSourceCount,
      },
      sanity: {
        status,
        checkedAt,
        ledgerOperationCount: operationCount,
        pendingImportCount,
        processedSourceCount: Math.max(0, Number(processedCounts?.total_processed || 0)),
        skippedSourceCount,
        repairableDivergenceCount: repairSummary.repairableCards,
        unrepairableDivergenceCount: repairSummary.unrepairableCards,
        divergentLedgerCount,
        divergentCardCount: repairSummary.repairableCards + repairSummary.unrepairableCards + divergentLedgerCount,
        reasonCounts,
        affectedCardIds: divergence.records.map((record) => record.cardId),
        truncated: divergence.truncated,
      },
      repair: {
        available: repairSummary.repairableCards > 0,
        repairableDivergenceCount: repairSummary.repairableCards,
        latestPlanId: this.readLatestDomainSyncRepairPlanId(),
      },
    };
    this.lastDomainSyncStatusSnapshot = snapshot;
    return snapshot;
  }

  private cloneDomainSyncStatusSnapshot(
    snapshot: BackendDomainSyncStatusResult,
    checkedAt: number,
  ): BackendDomainSyncStatusResult {
    return {
      ...snapshot,
      ledger: {
        ...snapshot.ledger,
        operationTypes: {
          ...snapshot.ledger.operationTypes,
        },
      },
      processedSources: {
        ...snapshot.processedSources,
        recent: snapshot.processedSources.recent.map((source) => ({ ...source })),
        skipped: snapshot.processedSources.skipped.map((source) => ({ ...source })),
      },
      sanity: {
        ...snapshot.sanity,
        checkedAt,
        reasonCounts: {
          ...snapshot.sanity.reasonCounts,
        },
        affectedCardIds: [...snapshot.sanity.affectedCardIds],
      },
      repair: {
        ...snapshot.repair,
      },
    };
  }

  async auditReviewSyncDivergence(
    request: BackendReviewSyncDivergenceAuditRequest = {},
  ): Promise<BackendReviewSyncDivergenceAuditResult> {
    await this.init();
    const limit = normalizeAuditLimit(request.limit);
    const cardIds = normalizeAuditCardIds(request.cardIds);
    const rows = this.queryReviewCardDivergenceEvidence(cardIds);
    const records = buildReviewCardDivergenceRecords(rows);
    const divergentCardIds = new Set(records.map((record) => record.cardId));
    const reasons: BackendReviewSyncDivergenceAuditResult['reasons'] = {
      'review-history-newer-than-card-state': 0,
      'review-event-count-exceeds-card-reps': 0,
    };
    for (const record of records) {
      reasons[record.reason] += 1;
    }

    return {
      ok: true,
      scannedCards: rows.length,
      divergentCards: divergentCardIds.size,
      limit,
      truncated: records.length > limit,
      reasons,
      records: records.slice(0, limit),
    };
  }

  async previewDomainSyncRepair(
    request: BackendDomainSyncRepairPreviewRequest = {},
    createdAt = Date.now(),
  ): Promise<BackendDomainSyncRepairPreviewResult> {
    await this.init();
    const limit = normalizeAuditLimit(request.limit);
    const requestedCardIds = normalizeAuditCardIds(request.cardIds);
    const includeUnrepairable = request.includeUnrepairable !== false;
    const rows = this.queryDomainSyncRepairPreviewEvidence(requestedCardIds);
    const evidence: BackendDomainSyncRepairPreviewCardEvidence[] = [];
    const plannedMutations: BackendDomainSyncRepairPreviewPlannedMutation[] = [];
    const unrepairableReasons: BackendDomainSyncRepairPreviewResult['unrepairableReasons'] = [];
    const seenEvidence = new Set<string>();

    for (const row of rows) {
      const cardId = String(row.card_id || '').trim();
      if (!cardId || seenEvidence.has(cardId)) {
        continue;
      }
      seenEvidence.add(cardId);
      const newestReviewEventAt = toNullableTimestamp(row.newest_reviewed_at);
      const cardLastReview = toNullableTimestamp(row.last_review);
      const reviewEventCount = Math.max(0, Math.floor(Number(row.review_event_count) || 0));
      const cardReps = Number.isFinite(Number(row.reps)) ? Math.max(0, Math.floor(Number(row.reps))) : null;
      const blockId = typeof row.block_id === 'string' && row.block_id.trim() ? row.block_id : null;
      const hasCardState = row.updated_at !== null && row.updated_at !== undefined;
      const hasSchedulerEvidence = hasCardState
        && isFiniteSqlNumber(row.due)
        && isFiniteSqlNumber(row.state)
        && isFiniteSqlNumber(row.scheduled_days)
        && isFiniteSqlNumber(row.stability)
        && isFiniteSqlNumber(row.difficulty);
      const after = this.buildDomainSyncRepairAfterState({
        row,
        newestReviewEventAt,
        reviewEventCount,
        cardReps,
      });
      const hasReviewSnapshotDivergence = hasCardState
        && hasSchedulerEvidence
        && this.hasDomainSyncReviewAfterSnapshot(row)
        && after !== null
        && this.domainSyncRepairAfterStateDiffers(row, after);
      const repairReasons: BackendDomainSyncRepairPreviewCardEvidence['reason'][] = [];

      if (!hasCardState) {
        repairReasons.push('missing-card-state');
      } else {
        if (newestReviewEventAt && (!cardLastReview || newestReviewEventAt > cardLastReview)) {
          repairReasons.push('review-history-newer-than-card-state');
        }
        if (hasReviewSnapshotDivergence && !repairReasons.includes('review-history-newer-than-card-state')) {
          repairReasons.push('review-history-newer-than-card-state');
        }
        if (cardReps !== null && reviewEventCount > cardReps) {
          repairReasons.push('review-event-count-exceeds-card-reps');
        }
        if (!hasSchedulerEvidence && repairReasons.length > 0) {
          repairReasons.splice(0, repairReasons.length, 'missing-scheduler-evidence');
        }
      }

      if (repairReasons.length === 0) {
        continue;
      }

      const firstReason = repairReasons[0];
      if (firstReason === 'missing-card-state' || firstReason === 'missing-scheduler-evidence') {
        if (includeUnrepairable) {
          evidence.push({
            cardId,
            blockId,
            reason: firstReason,
            newestReviewEventAt,
            cardLastReview,
            reviewEventCount,
            cardReps,
          });
        }
        unrepairableReasons.push({
          cardId,
          reason: firstReason,
        });
        continue;
      }

      if (!after) {
        if (includeUnrepairable) {
          evidence.push({
            cardId,
            blockId,
            reason: 'missing-scheduler-evidence',
            newestReviewEventAt,
            cardLastReview,
            reviewEventCount,
            cardReps,
          });
        }
        unrepairableReasons.push({
          cardId,
          reason: 'missing-scheduler-evidence',
        });
        continue;
      }

      evidence.push({
        cardId,
        blockId,
        reason: firstReason,
        newestReviewEventAt,
        cardLastReview,
        reviewEventCount,
        cardReps,
      });
      plannedMutations.push({
        cardId,
        mutationType: 'card-state-repair',
        summary: 'repair card scheduling state from backend review history',
        before: {
          due: toNullableTimestamp(row.due),
          stability: isFiniteSqlNumber(row.stability) ? Number(row.stability) : null,
          difficulty: isFiniteSqlNumber(row.difficulty) ? Number(row.difficulty) : null,
          lastReview: cardLastReview,
          reps: cardReps,
          state: isFiniteSqlNumber(row.state) ? Math.floor(Number(row.state)) : null,
          elapsedDays: null,
          scheduledDays: isFiniteSqlNumber(row.scheduled_days) ? Math.floor(Number(row.scheduled_days)) : null,
          schedulerType: typeof row.scheduler_type === 'string' && row.scheduler_type.trim() ? row.scheduler_type : null,
        },
        after,
      });
    }

    const truncated = evidence.length > limit;
    const boundedEvidence = evidence.slice(0, limit);
    const boundedCardIds = new Set(boundedEvidence.map((item) => item.cardId));
    const boundedMutations = plannedMutations.filter((mutation) => boundedCardIds.has(mutation.cardId));
    const affectedCardCount = new Set(boundedEvidence.map((item) => item.cardId)).size;
    const status: BackendDomainSyncRepairPreviewResult['status'] = boundedMutations.length > 0
      ? 'preview'
      : unrepairableReasons.length > 0
        ? 'unrepairable'
        : 'no-repair';
    const schedulerConfigHash = this.buildDomainSyncRepairSchedulerConfigHash(rows);
    const planId = `domain-sync-repair-preview:${createdAt}:${this.fnv1a32(JSON.stringify({
      requestedCardIds,
      limit,
      status,
      affectedCardIds: boundedEvidence.map((item) => item.cardId),
      mutations: boundedMutations.map((mutation) => mutation.cardId),
    }))}`;
    const result: BackendDomainSyncRepairPreviewResult = {
      ok: true,
      planId,
      status,
      createdAt,
      affectedCardCount,
      evidence: boundedEvidence,
      plannedMutations: boundedMutations,
      unrepairableReasons: unrepairableReasons.filter((item) => boundedCardIds.has(item.cardId) || requestedCardIds.includes(item.cardId)),
      schedulerEvidence: {
        schedulerType: this.resolveDomainSyncRepairSchedulerType(rows),
        configHash: schedulerConfigHash,
        capturedAt: createdAt,
      },
      truncated,
      limit,
    };

    this.persistDomainSyncRepairPreviewPlan({
      request,
      result,
      rows,
      schedulerConfigHash,
    });
    return result;
  }

  async applyDomainSyncRepair(
    request: BackendDomainSyncRepairApplyRequest,
    appliedAt = Date.now(),
  ): Promise<BackendDomainSyncRepairApplyResult> {
    await this.init();
    const planId = String(request?.planId || '').trim();
    const idempotencyKey = String(request?.idempotencyKey || '').trim();
    const confirmedAt = Math.max(0, Math.floor(Number(request?.confirmedAt || 0)));
    if (!planId || !idempotencyKey || confirmedAt <= 0) {
      return {
        ok: false,
        status: 'invalid-request',
        planId,
        idempotencyKey,
        reason: 'domainSync.repair.apply requires planId, idempotencyKey, and confirmedAt',
      };
    }

    const duplicate = this.readDomainSyncRepairPlanByApplyKey(idempotencyKey);
    if (duplicate?.result_json) {
      const cached = parseJsonObject<BackendDomainSyncRepairApplyResult | null>(duplicate.result_json, null);
      if (cached?.ok) {
        return {
          ...cached,
          status: 'duplicate',
          appliedAt,
        };
      }
    }

    const plan = this.readDomainSyncRepairPlan(planId);
    if (!plan) {
      return {
        ok: false,
        status: 'invalid-request',
        planId,
        idempotencyKey,
        reason: 'repair plan not found',
      };
    }
    if (plan.apply_idempotency_key && plan.apply_idempotency_key !== idempotencyKey) {
      return {
        ok: false,
        status: 'conflict',
        planId,
        idempotencyKey,
        reason: 'repair plan was already applied with a different idempotency key',
      };
    }

    const preview = parseJsonObject<BackendDomainSyncRepairPreviewResult | null>(plan.payload_json, null);
    if (!preview || preview.ok !== true || preview.status !== 'preview' || preview.plannedMutations.length === 0) {
      return {
        ok: false,
        status: 'invalid-request',
        planId,
        idempotencyKey,
        reason: 'repair plan has no applyable card-state mutations',
      };
    }
    const scope = parseJsonObject<{ cardIds?: string[] } | null>(plan.scope_json, null);
    const currentRows = this.queryDomainSyncRepairPreviewEvidence(scope?.cardIds ?? preview.evidence.map((item) => item.cardId));
    const currentFingerprints = this.buildDomainSyncRepairPlanFingerprints(currentRows);
    const currentLedgerGeneration = this.countDomainSyncLedgerGeneration();
    const currentSchedulerConfigHash = this.buildDomainSyncRepairSchedulerConfigHash(currentRows);
    if (
      currentLedgerGeneration !== Math.max(0, Math.floor(Number(plan.ledger_generation || 0)))
      || currentFingerprints.cardStateFingerprint !== plan.card_state_fingerprint
      || currentFingerprints.reviewHistoryFingerprint !== plan.review_history_fingerprint
      || currentSchedulerConfigHash !== plan.scheduler_config_hash
    ) {
      return {
        ok: false,
        status: 'stale-plan',
        planId,
        idempotencyKey,
        reason: 'repair plan no longer matches card state, review history, scheduler evidence, or ledger generation',
      };
    }

    return this.runtime.runTransaction('domain-sync.repair.apply', async () => {
      let appliedCards = 0;
      let skippedCards = 0;
      const affectedCardIds: string[] = [];
      const affectedBlockIds: string[] = [];
      for (const mutation of preview.plannedMutations) {
        if (mutation.mutationType !== 'card-state-repair') {
          skippedCards += 1;
          continue;
        }
        const card = await this.getCard(mutation.cardId);
        if (!card) {
          skippedCards += 1;
          continue;
        }
        const after = mutation.after || {};
        const repairedCard = this.applyDomainSyncRepairAfterState(card, after, appliedAt);
        if (!repairedCard) {
          skippedCards += 1;
          continue;
        }
        this.repository!.upsertCard(repairedCard);
        appliedCards += 1;
        affectedCardIds.push(card.id);
        if (card.blockId) {
          affectedBlockIds.push(card.blockId);
        }
        this.appendDomainSyncRepairAppliedOperation({
          planId,
          idempotencyKey,
          cardId: card.id,
          blockId: card.blockId ?? null,
          appliedAt,
          mutation,
        });
      }

      const invalidatedQueueProjections = appliedCards > 0
        ? this.invalidateQueueProjectionsForDomainSyncRepair({
          affectedCardIds,
          affectedBlockIds,
          appliedAt,
        })
        : 0;
      if (appliedCards > 0) {
        await this.repository!.touchSyncMetadata({
          modifiedAt: appliedAt,
          modifiedBy: 'srs-backend-worker:domain-sync.repair.apply',
        });
        this.lastDomainSyncStatusSnapshot = null;
      }

      const result: BackendDomainSyncRepairApplyResult = {
        ok: true,
        status: 'applied',
        planId,
        idempotencyKey,
        appliedAt,
        appliedCards,
        skippedCards,
        invalidatedQueueProjections,
      };
      this.runtime.run(
        `UPDATE domain_sync_repair_plans
         SET status = ?,
             apply_idempotency_key = ?,
             applied_at = ?,
             result_json = ?
         WHERE plan_id = ?`,
        ['applied', idempotencyKey, appliedAt, JSON.stringify(result), planId],
      );
      return result;
    });
  }

  async cleanupDomainSyncConflictSources(
    request: BackendDomainSyncConflictSourceCleanupRequest,
  ): Promise<BackendDomainSyncConflictSourceCleanupResult> {
    await this.init();
    const idempotencyKey = String(request?.idempotencyKey || '').trim();
    const sourceIds = [...new Set((Array.isArray(request?.sourceIds) ? request.sourceIds : [])
      .map((sourceId) => String(sourceId || '').trim())
      .filter(Boolean))];
    const confirmedAt = Math.max(0, Math.floor(Number(request?.confirmedAt || 0)));
    if (!idempotencyKey || sourceIds.length === 0 || confirmedAt <= 0) {
      return {
        ok: false,
        idempotencyKey,
        cleaned: [],
        skipped: sourceIds.map((sourceId) => ({ sourceId, reason: 'invalid-request' })),
        failed: [],
        status: 'invalid-request',
      };
    }
    const duplicate = this.domainSyncCleanupResultsByIdempotencyKey.get(idempotencyKey);
    if (duplicate) {
      return {
        ...duplicate,
        status: 'duplicate',
      };
    }

    const status = await this.getDomainSyncStatus();
    const rows = this.readDomainSyncProcessedSourcesForSourceIds(sourceIds);
    const rowsById = new Map(rows.map((row) => [String(row.source_id || ''), row]));
    const eligible: string[] = [];
    const skipped: BackendDomainSyncConflictSourceCleanupResult['skipped'] = [];
    for (const sourceId of sourceIds) {
      const row = rowsById.get(sourceId);
      if (!row) {
        skipped.push({ sourceId, reason: 'unprocessed' });
        continue;
      }
      const cleanup = this.resolveDomainSyncProcessedSourceCleanup(row, status.sanity.status);
      if (!cleanup.eligible) {
        skipped.push({ sourceId, reason: cleanup.reason });
        continue;
      }
      eligible.push(sourceId);
    }

    if (eligible.length === 0) {
      const result: BackendDomainSyncConflictSourceCleanupResult = {
        ok: true,
        idempotencyKey,
        cleaned: [],
        skipped,
        failed: [],
        status: 'invalid-request',
      };
      this.domainSyncCleanupResultsByIdempotencyKey.set(idempotencyKey, result);
      return result;
    }

    let hostResult: Awaited<ReturnType<SqliteFileServiceAdapter['cleanupSyncConflictDatabaseSources']>>;
    try {
      hostResult = await this.fileService.cleanupSyncConflictDatabaseSources(eligible);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        idempotencyKey,
        cleaned: [],
        skipped,
        failed: eligible.map((sourceId) => ({
          sourceId,
          path: rowsById.get(sourceId)?.path ?? null,
          reason,
        })),
        status: 'unavailable',
      };
    }

    const result: BackendDomainSyncConflictSourceCleanupResult = {
      ok: hostResult.failed.length === 0,
      idempotencyKey,
      cleaned: hostResult.cleaned,
      skipped: [...skipped, ...hostResult.skipped],
      failed: hostResult.failed,
      status: hostResult.failed.length > 0
        ? 'partial'
        : hostResult.cleaned.length > 0
          ? 'cleaned'
          : 'invalid-request',
    };
    this.forgetCleanedDomainSyncConflictSources([
      ...hostResult.cleaned.map((item) => item.sourceId),
      ...hostResult.skipped
        .filter((item) => item.reason === 'source-not-found')
        .map((item) => item.sourceId),
    ]);
    this.domainSyncCleanupResultsByIdempotencyKey.set(idempotencyKey, result);
    return result;
  }

  async listDomainSyncConflictSourceCleanupCandidates(): Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult> {
    await this.init();
    const conflictSources = await this.fileService.readSyncConflictDatabaseSources();
    const forgotten = this.forgetStaleUnknownSkippedDomainSyncConflictSources(
      conflictSources.map((source) => source.sourceId),
    );
    if (forgotten > 0) {
      this.lastDomainSyncStatusSnapshot = null;
      await this.runtime.persist();
      await this.rememberPersistedHash();
    }
    const status = await this.readDomainSyncStatusSnapshot();
    const rows = this.readDomainSyncProcessedSourcesForSourceIds(conflictSources.map((source) => source.sourceId));
    const rowsById = new Map(rows.map((row) => [String(row.source_id || ''), row]));
    const candidates = conflictSources.map((source) => {
      const sourceId = String(source.sourceId || '').trim() || 'unknown';
      const row = rowsById.get(sourceId) ?? null;
      const fingerprint = hashBytes(source.bytes);
      const processedSource = row ? this.toDomainSyncProcessedSource(row, status.sanity.status) : null;
      const cleanup = this.resolveDomainSyncConflictCleanupCandidate(fingerprint, row, status.sanity.status);
      return {
        sourceId,
        path: source.path ?? null,
        modifiedAt: source.modifiedAt ?? null,
        size: source.size ?? source.bytes.byteLength,
        fingerprint,
        processedSource,
        cleanup,
      };
    });
    return {
      ok: true,
      sanityStatus: status.sanity.status,
      candidates,
    };
  }

  private forgetCleanedDomainSyncConflictSources(sourceIds: string[]): void {
    const uniqueIds = [...new Set(sourceIds.map((sourceId) => String(sourceId || '').trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }
    this.runtime.run(
      `DELETE FROM domain_sync_processed_sources
       WHERE source_id IN (${uniqueIds.map(() => '?').join(', ')})`,
      uniqueIds,
    );
    this.lastDomainSyncStatusSnapshot = null;
  }

  private forgetStaleUnknownSkippedDomainSyncConflictSources(activeSourceIds: string[]): number {
    const active = [...new Set(activeSourceIds.map((sourceId) => String(sourceId || '').trim()).filter(Boolean))];
    const activeClause = active.length > 0
      ? `AND source_id NOT IN (${active.map(() => '?').join(', ')})`
      : '';
    this.runtime.run(
      `DELETE FROM domain_sync_processed_sources
       WHERE source_id LIKE 'siyuan-sync-conflict:%'
         AND skipped_reason = 'unknown'
         AND (source_kind IS NULL OR source_kind = 'unknown')
         ${activeClause}`,
      active,
    );
    return Number(this.runtime.getOne<{ changed: number }>('SELECT changes() AS changed')?.changed ?? 0);
  }

  async mergeSyncConflictDatabases(
    request: WorkerSyncConflictMergeRequest,
  ): Promise<BackendSyncConflictMergeResult> {
    await this.init();
    const sources = Array.isArray(request.sources) ? request.sources : [];
    const result: BackendSyncConflictMergeResult = {
      ok: true,
      sources: sources.length,
      mergedReviewEvents: 0,
      ignoredReviewEvents: 0,
      mergedCards: 0,
      ignoredCards: 0,
      skippedSources: [],
      diagnostics: {
        reviewCardDivergences: [],
      },
    };

    for (const source of sources) {
      const sourceId = String(source?.sourceId || '').trim() || 'unknown';
      const sourceFingerprint = isUint8ArrayLike(source?.bytes) ? hashBytes(source.bytes) : '';
      if (!isUint8ArrayLike(source?.bytes) || source.bytes.byteLength === 0) {
        result.skippedSources.push({ sourceId, reason: 'invalid-bytes' });
        this.recordDomainSyncSkippedSource({
          sourceId,
          sourceFingerprint,
          sourceKind: 'unknown',
          path: source?.path ?? null,
          processedAt: request.mergedAt,
          skippedReason: 'invalid-bytes',
          metadata: { byteLength: isUint8ArrayLike(source?.bytes) ? source.bytes.byteLength : null },
        });
        continue;
      }
      if (!request.ignoreProcessedSourceDeduplication && this.hasSuccessfulDomainSyncProcessedSource(sourceId, sourceFingerprint)) {
        continue;
      }

      let conflictRuntime: RuntimeSqliteDatabaseService | null = null;
      try {
        conflictRuntime = new RuntimeSqliteDatabaseService(
          createReadonlyConflictFileService(source.bytes),
          `${sourceId}.db`,
          {
            applySchemaOnInit: false,
            persistOnInit: false,
          },
        );
        await conflictRuntime.init();
        const reviewEvents = conflictRuntime.getAll<ConflictReviewEventRow>(
          `SELECT id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json
           FROM review_events
           ORDER BY reviewed_at, id`,
        );
        const cards = conflictRuntime.getAll<ConflictCardRow>(
          `SELECT id, updated_at, reps, last_review,
                  block_id, source_exists, source_checked_at, source_missing_at,
                  payload_json
           FROM cards
           ORDER BY id`,
        );
        const hasDomainSyncLedger = this.hasConflictDomainSyncLedger(conflictRuntime);
        const domainSyncOperations = this.readConflictDomainSyncOperations(conflictRuntime);
        const sourceKind = this.resolveDomainSyncProcessedSourceKind(sourceId, hasDomainSyncLedger);
        const conflictCardsById = new Map(cards.map((cardRow) => [String(cardRow.id || '').trim(), cardRow]));
        const processedCounters: DomainSyncProcessedSourceCounters = {
          importedOperations: 0,
          ignoredOperations: 0,
          importedReviewEvents: 0,
          ignoredReviewEvents: 0,
          importedCards: 0,
          ignoredCards: 0,
        };

        await this.runtime.runTransaction('sync.conflict.merge', async () => {
          let sourceChanged = false;
          const affectedCardIds = new Set<string>();
          const affectedBlockIds = new Set<string>();
          const diagnosticCardIds = new Set<string>();
          if (domainSyncOperations.length > 0) {
            const operationImport = this.importMissingDomainSyncOperations(domainSyncOperations);
            processedCounters.importedOperations += operationImport.imported;
            processedCounters.ignoredOperations += operationImport.ignored;
            for (const cardId of operationImport.affectedCardIds) {
              affectedCardIds.add(cardId);
            }
            for (const blockId of operationImport.affectedBlockIds) {
              affectedBlockIds.add(blockId);
            }
            sourceChanged = operationImport.imported > 0 || sourceChanged;
          }
          for (const event of reviewEvents) {
            const eventCardId = String(event.card_id || '').trim();
            if (eventCardId) {
              diagnosticCardIds.add(eventCardId);
            }
            const existing = this.runtime.getOne<{ count: number }>(
              'SELECT COUNT(*) AS count FROM review_events WHERE id = ?',
              [event.id],
            );
            if (Number(existing?.count) > 0) {
              result.ignoredReviewEvents += 1;
              processedCounters.ignoredReviewEvents += 1;
              continue;
            }
            this.runtime.run(
              `INSERT INTO review_events
                (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                event.id,
                event.card_id || null,
                event.attempt_id || null,
                event.rating ?? null,
                Number(event.reviewed_at),
                Number(event.year),
                Number(event.month),
                event.event_type || 'review',
                event.payload_json || '{}',
              ],
            );
            result.mergedReviewEvents += 1;
            processedCounters.importedReviewEvents += 1;
            if (!hasDomainSyncLedger && event.event_type === 'review-v2') {
              const ledgerBackfill = this.appendLegacyReviewImportDomainSyncOperation({
                event,
                blockId: conflictCardsById.get(eventCardId)?.block_id ?? null,
                sourceId,
                observedAt: request.mergedAt,
              });
              processedCounters.importedOperations += ledgerBackfill.imported;
              processedCounters.ignoredOperations += ledgerBackfill.ignored;
            }
            sourceChanged = true;
          }

          for (const cardRow of cards) {
            const incoming = parseJsonObject<FSRSCard | null>(cardRow.payload_json, null);
            if (!incoming?.id) {
              result.ignoredCards += 1;
              processedCounters.ignoredCards += 1;
              continue;
            }
            diagnosticCardIds.add(incoming.id);
            const existing = this.runtime.getOne<ConflictCardRow>(
              `SELECT id, updated_at, reps, last_review,
                      block_id, source_exists, source_checked_at, source_missing_at,
                      payload_json
               FROM cards
               WHERE id = ?`,
              [incoming.id],
            );
            const reviewEvidence = existing
              ? this.readReviewSyncSchedulingEvidence(incoming.id)
              : null;
            const mergeDecision = existing
              ? decideReviewSyncCardMerge(existing, cardRow, reviewEvidence)
              : { action: 'apply-card' as const, reason: 'incoming-card-newer' as const };
            if (existing && mergeDecision.action === 'skip-card') {
              if (this.applyIncomingMissingSourceProjection(cardRow, incoming)) {
                sourceChanged = true;
                affectedCardIds.add(incoming.id);
                const blockId = String(incoming.blockId || '').trim();
                if (blockId) {
                  affectedBlockIds.add(blockId);
                }
              }
              result.ignoredCards += 1;
              processedCounters.ignoredCards += 1;
              continue;
            }
            this.repository!.upsertCard(incoming);
            this.applyIncomingMissingSourceProjection(cardRow, incoming);
            result.mergedCards += 1;
            processedCounters.importedCards += 1;
            sourceChanged = true;
            affectedCardIds.add(incoming.id);
            const blockId = String(incoming.blockId || '').trim();
            if (blockId) {
              affectedBlockIds.add(blockId);
            }
          }

          if (sourceChanged) {
            this.invalidateQueueProjectionsForSyncConflictMerge({
              affectedCardIds: [...affectedCardIds],
              affectedBlockIds: [...affectedBlockIds],
              mergedAt: request.mergedAt,
            });
            await this.repository!.touchSyncMetadata({
              modifiedAt: request.mergedAt,
              modifiedBy: 'srs-backend-worker:sync.conflict.merge',
            });
          }
          if (this.shouldRecordDomainSyncProcessedSource(sourceKind, sourceChanged, processedCounters)) {
            this.recordDomainSyncProcessedSource({
              sourceId,
              sourceFingerprint,
              sourceKind,
              path: source.path ?? null,
              processedAt: request.mergedAt,
              counters: processedCounters,
            });
          }
          this.appendReviewCardDivergenceDiagnostics(result.diagnostics.reviewCardDivergences, [...diagnosticCardIds]);
        });
      } catch (error) {
        const reason = this.resolveDomainSyncSkippedReason(error);
        result.skippedSources.push({
          sourceId,
          reason: error instanceof Error ? error.message : String(error),
        });
        this.recordDomainSyncSkippedSource({
          sourceId,
          sourceFingerprint,
          sourceKind: 'unknown',
          path: source.path ?? null,
          processedAt: request.mergedAt,
          skippedReason: reason,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        conflictRuntime?.dispose();
      }
    }

    return result;
  }

  private readConflictDomainSyncOperations(conflictRuntime: RuntimeSqliteDatabaseService): ConflictDomainSyncOperationRow[] {
    if (!this.hasConflictDomainSyncLedger(conflictRuntime)) {
      return [];
    }
    return conflictRuntime.getAll<ConflictDomainSyncOperationRow>(
      `SELECT operation_id, source_id, source_device_id, source_generation, operation_type,
              entity_type, entity_id, entity_block_id, occurred_at, observed_at,
              payload_fingerprint, idempotency_key, review_event_id, payload_json
       FROM domain_sync_operations
       ORDER BY occurred_at, operation_id`,
    );
  }

  private hasConflictDomainSyncLedger(conflictRuntime: RuntimeSqliteDatabaseService): boolean {
    const hasLedger = conflictRuntime.getOne<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = ? AND name = ?
       LIMIT 1`,
      ['table', 'domain_sync_operations'],
    );
    return Boolean(hasLedger);
  }

  private readDomainSyncProcessedSources(
    skipped: boolean,
    limit: number,
    sanityStatus?: BackendDomainSyncSanityStatus,
  ): BackendDomainSyncProcessedSource[] {
    const rows = this.runtime.getAll<DomainSyncProcessedSourceRow>(
      `SELECT source_id, source_fingerprint, source_kind, path, processed_at,
              imported_operations, ignored_operations, imported_review_events, ignored_review_events,
              imported_cards, ignored_cards, skipped_reason, latest_sanity_status
       FROM domain_sync_processed_sources
       WHERE skipped_reason IS ${skipped ? 'NOT NULL' : 'NULL'}
       ORDER BY processed_at DESC, source_id ASC
       LIMIT ?`,
      [Math.max(1, Math.floor(limit))],
    );
    return rows.map((row) => this.toDomainSyncProcessedSource(row, sanityStatus));
  }

  private readDomainSyncProcessedSourcesForSourceIds(sourceIds: unknown[]): DomainSyncProcessedSourceRow[] {
    const uniqueIds = [...new Set(sourceIds
      .map((sourceId) => String(sourceId || '').trim() || 'unknown')
      .filter(Boolean))];
    if (uniqueIds.length === 0) {
      return [];
    }
    return this.runtime.getAll<DomainSyncProcessedSourceRow>(
      `SELECT source_id, source_fingerprint, source_kind, path, processed_at,
              imported_operations, ignored_operations, imported_review_events, ignored_review_events,
              imported_cards, ignored_cards, skipped_reason, latest_sanity_status
       FROM domain_sync_processed_sources
       WHERE source_id IN (${uniqueIds.map(() => '?').join(', ')})
       ORDER BY processed_at DESC, source_id ASC`,
      uniqueIds,
    );
  }

  private toDomainSyncProcessedSource(
    row: DomainSyncProcessedSourceRow,
    sanityStatus?: BackendDomainSyncSanityStatus,
  ): BackendDomainSyncProcessedSource {
    return {
      sourceId: String(row.source_id || ''),
      sourceKind: (row.source_kind || 'unknown') as BackendDomainSyncProcessedSource['sourceKind'],
      fingerprint: String(row.source_fingerprint || ''),
      path: row.path ?? null,
      processedAt: Number(row.processed_at) || 0,
      importedOperations: Math.max(0, Number(row.imported_operations || 0)),
      ignoredOperations: Math.max(0, Number(row.ignored_operations || 0)),
      importedReviewEvents: Math.max(0, Number(row.imported_review_events || 0)),
      ignoredReviewEvents: Math.max(0, Number(row.ignored_review_events || 0)),
      importedCards: Math.max(0, Number(row.imported_cards || 0)),
      ignoredCards: Math.max(0, Number(row.ignored_cards || 0)),
      skippedReason: (row.skipped_reason as BackendDomainSyncProcessedSource['skippedReason']) ?? null,
      latestSanityStatus: row.latest_sanity_status ?? null,
      cleanup: this.resolveDomainSyncProcessedSourceCleanup(row, sanityStatus),
    };
  }

  private resolveDomainSyncProcessedSourceCleanup(
    row: DomainSyncProcessedSourceRow,
    sanityStatus?: BackendDomainSyncSanityStatus,
  ): BackendDomainSyncProcessedSource['cleanup'] {
    if (row.skipped_reason) {
      if (this.isDomainSyncConflictSourceRow(row) && String(row.path || '').trim()) {
        return { eligible: true, reason: 'skipped-source' };
      }
      return { eligible: false, reason: 'skipped-source' };
    }
    if (row.source_kind !== 'siyuan-conflict-db') {
      return { eligible: false, reason: 'unsupported-source-kind' };
    }
    if (!String(row.path || '').trim()) {
      return { eligible: false, reason: 'missing-path' };
    }
    if (sanityStatus === 'needs-direction') {
      return { eligible: false, reason: 'needs-direction' };
    }
    if (sanityStatus === 'source-error') {
      return { eligible: false, reason: 'source-error' };
    }
    if (sanityStatus && sanityStatus !== 'clean' && sanityStatus !== 'merged') {
      return { eligible: false, reason: 'unsafe-sanity-status' };
    }
    return { eligible: true, reason: 'processed-resolved' };
  }

  private resolveDomainSyncConflictCleanupCandidate(
    fingerprint: string,
    row: DomainSyncProcessedSourceRow | null,
    sanityStatus: BackendDomainSyncSanityStatus,
  ): NonNullable<BackendDomainSyncProcessedSource['cleanup']> {
    if (!row) {
      return { eligible: false, reason: 'unprocessed' };
    }
    if (String(row.source_fingerprint || '') !== fingerprint) {
      return { eligible: false, reason: 'fingerprint-mismatch' };
    }
    return this.resolveDomainSyncProcessedSourceCleanup(row, sanityStatus)
      ?? { eligible: false, reason: 'unsupported-source-kind' };
  }

  private isDomainSyncConflictSourceRow(row: DomainSyncProcessedSourceRow): boolean {
    const sourceKind = String(row.source_kind || '').trim();
    const sourceId = String(row.source_id || '').trim();
    return sourceKind === 'siyuan-conflict-db' || sourceId.startsWith('siyuan-sync-conflict:');
  }

  private countNeedsDirectionDomainSyncOperations(): number {
    const row = this.runtime.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations
       WHERE operation_type IN (?, ?)`,
      ['card-upserted', 'queue-projection-invalidated'],
    );
    return Math.max(0, Number(row?.count || 0));
  }

  private countDivergentLedgerOperations(): number {
    const row = this.runtime.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations d
       WHERE d.operation_type = ?
         AND d.review_event_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM review_events e
           WHERE e.id = d.review_event_id
         )`,
      ['review-committed'],
    );
    return Math.max(0, Number(row?.count || 0));
  }

  private countPotentialPendingImportOperations(): number {
    const row = this.runtime.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_processed_sources
       WHERE skipped_reason IS NOT NULL`,
    );
    return Math.max(0, Number(row?.count || 0));
  }

  private resolveDomainSyncSanityStatus(input: {
    skippedSourceCount: number;
    needsDirection: number;
    divergentLedgerCount: number;
    repairableDivergenceCount: number;
    unrepairableDivergenceCount: number;
    processedSourceCount: number;
  }): BackendDomainSyncSanityStatus {
    if (input.skippedSourceCount > 0) {
      return 'source-error';
    }
    if (input.needsDirection > 0) {
      return 'needs-direction';
    }
    if (input.divergentLedgerCount > 0) {
      return 'divergent';
    }
    if (input.repairableDivergenceCount > 0) {
      return 'repairable';
    }
    if (input.unrepairableDivergenceCount > 0) {
      return 'divergent';
    }
    if (input.processedSourceCount > 0) {
      return 'merged';
    }
    return 'clean';
  }

  private readLatestDomainSyncRepairPlanId(): string | null {
    const row = this.runtime.getOne<{ plan_id: string }>(
      `SELECT plan_id
       FROM domain_sync_repair_plans
       ORDER BY created_at DESC
       LIMIT 1`,
    );
    return row?.plan_id ? String(row.plan_id) : null;
  }

  private readDomainSyncRepairPlan(planId: string): DomainSyncRepairPlanRow | null {
    return this.runtime.getOne<DomainSyncRepairPlanRow>(
      `SELECT plan_id, status, created_at, scope_json, scheduler_config_hash,
              ledger_generation, card_state_fingerprint, review_history_fingerprint,
              affected_card_count, apply_idempotency_key, applied_at, result_json, payload_json
       FROM domain_sync_repair_plans
       WHERE plan_id = ?
       LIMIT 1`,
      [planId],
    ) ?? null;
  }

  private readDomainSyncRepairPlanByApplyKey(idempotencyKey: string): DomainSyncRepairPlanRow | null {
    return this.runtime.getOne<DomainSyncRepairPlanRow>(
      `SELECT plan_id, status, created_at, scope_json, scheduler_config_hash,
              ledger_generation, card_state_fingerprint, review_history_fingerprint,
              affected_card_count, apply_idempotency_key, applied_at, result_json, payload_json
       FROM domain_sync_repair_plans
       WHERE apply_idempotency_key = ?
       LIMIT 1`,
      [idempotencyKey],
    ) ?? null;
  }

  private countDomainSyncLedgerGeneration(): number {
    const row = this.runtime.getOne<{ generation: number }>(
      `SELECT COUNT(*) AS generation
       FROM domain_sync_operations`,
    );
    return Math.max(0, Math.floor(Number(row?.generation || 0)));
  }

  private importMissingDomainSyncOperations(rows: ConflictDomainSyncOperationRow[]): DomainSyncOperationImportResult {
    const result: DomainSyncOperationImportResult = {
      imported: 0,
      ignored: 0,
      affectedCardIds: [],
      affectedBlockIds: [],
    };
    for (const row of rows) {
      const operationId = String(row.operation_id || '').trim();
      const operationType = String(row.operation_type || '').trim();
      const entityType = String(row.entity_type || '').trim();
      const entityId = String(row.entity_id || '').trim();
      const payloadFingerprint = String(row.payload_fingerprint || '').trim();
      const payloadJson = String(row.payload_json || '').trim();
      if (!operationId || !operationType || !entityType || !entityId || !payloadFingerprint || !payloadJson) {
        result.ignored += 1;
        continue;
      }
      const existing = this.runtime.getOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM domain_sync_operations WHERE operation_id = ?',
        [operationId],
      );
      if (Number(existing?.count) > 0) {
        result.ignored += 1;
        continue;
      }
      this.runtime.run(
        `INSERT OR IGNORE INTO domain_sync_operations
          (operation_id, source_id, source_device_id, source_generation, operation_type,
           entity_type, entity_id, entity_block_id, occurred_at, observed_at,
           payload_fingerprint, idempotency_key, review_event_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          operationId,
          String(row.source_id || '').trim() || 'unknown',
          row.source_device_id || null,
          row.source_generation ?? null,
          operationType,
          entityType,
          entityId,
          row.entity_block_id || null,
          Number(row.occurred_at) || Date.now(),
          Number(row.observed_at) || Date.now(),
          payloadFingerprint,
          row.idempotency_key || null,
          row.review_event_id || null,
          payloadJson,
        ],
      );
      const inserted = this.runtime.getOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM domain_sync_operations WHERE operation_id = ?',
        [operationId],
      );
      if (Number(inserted?.count) > 0) {
        result.imported += 1;
        this.collectDomainSyncOperationAffectedEntities(row, result);
      } else {
        result.ignored += 1;
      }
    }
    return result;
  }

  private collectDomainSyncOperationAffectedEntities(
    row: ConflictDomainSyncOperationRow,
    result: DomainSyncOperationImportResult,
  ): void {
    const operationType = String(row.operation_type || '').trim();
    if (operationType === 'review-committed') {
      return;
    }
    if (![
      'card-upserted',
      'card-deleted',
      'source-existence-updated',
      'queue-projection-invalidated',
      'repair-applied',
    ].includes(operationType)) {
      return;
    }
    const entityId = String(row.entity_id || '').trim();
    const blockId = String(row.entity_block_id || '').trim();
    if (entityId && !result.affectedCardIds.includes(entityId)) {
      result.affectedCardIds.push(entityId);
    }
    if (blockId && !result.affectedBlockIds.includes(blockId)) {
      result.affectedBlockIds.push(blockId);
    }
  }

  private appendLegacyReviewImportDomainSyncOperation(input: {
    event: ConflictReviewEventRow;
    blockId: string | null;
    sourceId: string;
    observedAt: number | undefined;
  }): DomainSyncOperationImportResult {
    const reviewEventId = String(input.event.id || '').trim();
    const cardId = String(input.event.card_id || '').trim();
    if (!reviewEventId || !cardId) {
      return { imported: 0, ignored: 1, affectedCardIds: [], affectedBlockIds: [] };
    }
    const idempotencyKey = `legacy-review:${reviewEventId}`;
    const reviewFact = mapConflictReviewEventToFact(input.event, idempotencyKey);
    const payload = {
      reviewEventId,
      cardId,
      blockId: String(input.blockId || '').trim() || null,
      attemptId: String(input.event.attempt_id || '').trim() || null,
      rating: Number.isFinite(Number(input.event.rating)) ? Number(input.event.rating) : null,
      reviewedAt: Number(input.event.reviewed_at) || Date.now(),
      eventType: input.event.event_type || 'review-v2',
      legacySourceId: input.sourceId,
      idempotencyKey,
      reviewEventFact: summarizeReviewEventFact(reviewFact),
    };
    const payloadJson = JSON.stringify(payload);
    const operationId = `domain-sync:review-committed:${this.fnv1a32(`${cardId}:${reviewEventId}`)}`;
    const existing = this.runtime.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations
       WHERE operation_id = ?
          OR (operation_type = ? AND idempotency_key = ?)`,
      [operationId, 'review-committed', idempotencyKey],
    );
    if (Number(existing?.count) > 0) {
      return { imported: 0, ignored: 1, affectedCardIds: [], affectedBlockIds: [] };
    }
    this.runtime.run(
      `INSERT OR IGNORE INTO domain_sync_operations
        (operation_id, source_id, source_device_id, source_generation, operation_type,
         entity_type, entity_id, entity_block_id, occurred_at, observed_at,
         payload_fingerprint, idempotency_key, review_event_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operationId,
        `legacy-import:${input.sourceId}`,
        null,
        null,
        'review-committed',
        'card',
        cardId,
        payload.blockId,
        payload.reviewedAt,
        Number(input.observedAt) || Date.now(),
        this.fnv1a32(payloadJson),
        idempotencyKey,
        reviewEventId,
        payloadJson,
      ],
    );
    const inserted = this.runtime.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_operations WHERE operation_id = ?',
      [operationId],
    );
    return Number(inserted?.count) > 0
      ? { imported: 1, ignored: 0, affectedCardIds: [], affectedBlockIds: [] }
      : { imported: 0, ignored: 1, affectedCardIds: [], affectedBlockIds: [] };
  }

  private resolveDomainSyncProcessedSourceKind(
    sourceId: string,
    hasLedger: boolean,
  ): DomainSyncProcessedSourceKind {
    if (sourceId === 'siyuan-sync:siyuanmemo.db') {
      return 'persisted-main-db';
    }
    if (sourceId.startsWith('siyuan-sync-conflict:')) {
      return hasLedger ? 'siyuan-conflict-db' : 'legacy-db';
    }
    return hasLedger ? 'unknown' : 'legacy-db';
  }

  private recordDomainSyncProcessedSource(input: {
    sourceId: string;
    sourceFingerprint: string;
    sourceKind: DomainSyncProcessedSourceKind;
    path: string | null;
    processedAt: number | undefined;
    counters: DomainSyncProcessedSourceCounters;
  }): void {
    const processedAt = Number(input.processedAt) || Date.now();
    this.runtime.run(
      `INSERT OR REPLACE INTO domain_sync_processed_sources
        (source_id, source_fingerprint, source_kind, path, processed_at,
         imported_operations, ignored_operations, imported_review_events, ignored_review_events,
         imported_cards, ignored_cards, skipped_reason, latest_sanity_status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.sourceId,
        input.sourceFingerprint,
        input.sourceKind,
        input.path,
        processedAt,
        input.counters.importedOperations,
        input.counters.ignoredOperations,
        input.counters.importedReviewEvents,
        input.counters.ignoredReviewEvents,
        input.counters.importedCards,
        input.counters.ignoredCards,
        null,
        null,
        JSON.stringify({
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
          processedAt,
        }),
      ],
    );
  }

  private shouldRecordDomainSyncProcessedSource(
    sourceKind: DomainSyncProcessedSourceKind,
    sourceChanged: boolean,
    counters: DomainSyncProcessedSourceCounters,
  ): boolean {
    if (sourceKind !== 'persisted-main-db') {
      return true;
    }
    return sourceChanged
      || counters.importedOperations > 0
      || counters.importedReviewEvents > 0
      || counters.importedCards > 0;
  }

  private hasSuccessfulDomainSyncProcessedSource(sourceId: string, sourceFingerprint: string): boolean {
    const existing = this.runtime.getOne<{ present: number }>(
      `SELECT 1 AS present
       FROM domain_sync_processed_sources
       WHERE source_id = ?
         AND source_fingerprint = ?
         AND skipped_reason IS NULL
       LIMIT 1`,
      [sourceId, sourceFingerprint],
    );
    return Boolean(existing);
  }

  private resolveDomainSyncSkippedReason(error: unknown): DomainSyncSkippedSourceReason {
    const message = error instanceof Error ? error.message : String(error);
    if (/invariant/i.test(message)) {
      return 'ledger-invariant-violation';
    }
    if (/unavailable|denied|permission/i.test(message)) {
      return 'source-unavailable';
    }
    if (/sqlite|database|file|parse|malformed|corrupt/i.test(message)) {
      return 'parse-error';
    }
    return 'unknown';
  }

  private recordDomainSyncSkippedSource(input: {
    sourceId: string;
    sourceFingerprint: string;
    sourceKind: DomainSyncProcessedSourceKind;
    path: string | null;
    processedAt: number | undefined;
    skippedReason: DomainSyncSkippedSourceReason;
    metadata: Record<string, unknown>;
  }): void {
    const processedAt = Number(input.processedAt) || Date.now();
    this.runtime.run(
      `INSERT OR REPLACE INTO domain_sync_processed_sources
        (source_id, source_fingerprint, source_kind, path, processed_at,
         imported_operations, ignored_operations, imported_review_events, ignored_review_events,
         imported_cards, ignored_cards, skipped_reason, latest_sanity_status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.sourceId,
        input.sourceFingerprint,
        input.sourceKind,
        input.path,
        processedAt,
        0,
        0,
        0,
        0,
        0,
        0,
        input.skippedReason,
        null,
        JSON.stringify({
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
          skippedReason: input.skippedReason,
          processedAt,
          ...input.metadata,
        }),
      ],
    );
  }

  private appendReviewCardDivergenceDiagnostics(
    diagnostics: BackendSyncConflictMergeDivergenceDiagnostic[],
    cardIds: string[],
  ): void {
    const records = buildReviewCardDivergenceRecords(this.queryReviewCardDivergenceEvidence(cardIds));
    for (const record of records) {
      if (!diagnostics.some((diagnostic) => diagnostic.cardId === record.cardId && diagnostic.reason === record.reason)) {
        diagnostics.push({
          cardId: record.cardId,
          reason: record.reason,
          newestReviewEventAt: record.newestReviewEventAt,
          cardLastReview: record.cardLastReview,
          reviewEventCount: record.reviewEventCount,
          cardReps: record.cardReps,
        });
      }
    }
  }

  private readReviewSyncSchedulingEvidence(cardId: string): { newestReviewedAt: number; formalReviewEventCount: number } | null {
    const normalizedCardId = String(cardId || '').trim();
    if (!normalizedCardId) {
      return null;
    }
    const row = this.runtime.getOne<{
      newest_reviewed_at: number | null;
      review_event_count: number;
    }>(
      `SELECT MAX(reviewed_at) AS newest_reviewed_at,
              COUNT(*) AS review_event_count
       FROM review_events
       WHERE card_id = ?
         AND event_type = ?`,
      [normalizedCardId, 'review-v2'],
    );
    const formalReviewEventCount = Math.max(0, Math.floor(Number(row?.review_event_count || 0)));
    const newestReviewedAt = toNullableTimestamp(row?.newest_reviewed_at) ?? 0;
    if (formalReviewEventCount <= 0 && newestReviewedAt <= 0) {
      return null;
    }
    return {
      newestReviewedAt,
      formalReviewEventCount,
    };
  }

  private queryReviewCardDivergenceEvidence(cardIds: string[] = []): ReviewCardDivergenceEvidenceWithCardRow[] {
    const uniqueCardIds = normalizeAuditCardIds(cardIds);
    const params: SqlValue[] = [];
    const scope = uniqueCardIds.length > 0
      ? `AND e.card_id IN (${uniqueCardIds.map(() => '?').join(', ')})`
      : '';
    params.push(...uniqueCardIds);
    return this.runtime.getAll<ReviewCardDivergenceEvidenceWithCardRow>(
      `SELECT e.card_id,
              MAX(e.reviewed_at) AS newest_reviewed_at,
              COUNT(*) AS review_event_count,
              c.updated_at,
              c.reps,
              c.last_review,
              c.block_id,
              c.source_exists,
              c.source_checked_at,
              c.source_missing_at
       FROM review_events e
       INNER JOIN cards c ON c.id = e.card_id
       WHERE e.event_type = 'review-v2'
         AND ${activePluginCardSql('c')}
         ${scope}
       GROUP BY e.card_id, c.updated_at, c.reps, c.last_review,
                c.block_id, c.source_exists, c.source_checked_at, c.source_missing_at
       ORDER BY e.card_id ASC`,
      params,
    );
  }

  private queryDomainSyncRepairPreviewEvidence(cardIds: string[] = []): DomainSyncRepairPreviewEvidenceRow[] {
    const uniqueCardIds = normalizeAuditCardIds(cardIds);
    const params: SqlValue[] = [];
    const scope = uniqueCardIds.length > 0
      ? `AND e.card_id IN (${uniqueCardIds.map(() => '?').join(', ')})`
      : '';
    params.push(...uniqueCardIds);
    return this.runtime.getAll<DomainSyncRepairPreviewEvidenceRow>(
      `SELECT e.card_id,
              latest.id AS latest_review_event_id,
              MAX(e.reviewed_at) AS newest_reviewed_at,
              COUNT(*) AS review_event_count,
              latest.payload_json AS latest_review_payload_json,
              c.updated_at,
              c.due,
              c.state,
              c.scheduled_days,
              c.stability,
              c.difficulty,
              c.reps,
              c.last_review,
              c.block_id,
              c.scheduler_type,
              c.payload_json AS card_payload_json
       FROM review_events e
       LEFT JOIN cards c ON c.id = e.card_id
       LEFT JOIN review_events latest
         ON latest.id = (
           SELECT e2.id
           FROM review_events e2
           WHERE e2.card_id = e.card_id
             AND e2.event_type = 'review-v2'
           ORDER BY e2.reviewed_at DESC, e2.id DESC
           LIMIT 1
         )
       WHERE e.event_type = 'review-v2'
         AND (c.id IS NULL OR (${activePluginCardSql('c')}))
         ${scope}
       GROUP BY e.card_id, latest.id, latest.payload_json, c.updated_at, c.due, c.state, c.scheduled_days,
                c.stability, c.difficulty, c.reps, c.last_review, c.block_id, c.scheduler_type, c.payload_json
       ORDER BY e.card_id ASC`,
      params,
    );
  }

  private summarizeDomainSyncRepairEvidence(rows: DomainSyncRepairPreviewEvidenceRow[]): {
    repairableCards: number;
    unrepairableCards: number;
  } {
    const repairableCardIds = new Set<string>();
    const unrepairableCardIds = new Set<string>();
    const seen = new Set<string>();
    for (const row of rows) {
      const cardId = String(row.card_id || '').trim();
      if (!cardId || seen.has(cardId)) {
        continue;
      }
      seen.add(cardId);
      const newestReviewEventAt = toNullableTimestamp(row.newest_reviewed_at);
      const cardLastReview = toNullableTimestamp(row.last_review);
      const reviewEventCount = Math.max(0, Math.floor(Number(row.review_event_count) || 0));
      const cardReps = Number.isFinite(Number(row.reps)) ? Math.max(0, Math.floor(Number(row.reps))) : null;
      const hasCardState = row.updated_at !== null && row.updated_at !== undefined;
      const hasSchedulerEvidence = hasCardState
        && isFiniteSqlNumber(row.due)
        && isFiniteSqlNumber(row.state)
        && isFiniteSqlNumber(row.scheduled_days)
        && isFiniteSqlNumber(row.stability)
        && isFiniteSqlNumber(row.difficulty);
      const after = this.buildDomainSyncRepairAfterState({
        row,
        newestReviewEventAt,
        reviewEventCount,
        cardReps,
      });
      const hasRepairableDivergence = hasCardState && (
        (Boolean(newestReviewEventAt) && (!cardLastReview || newestReviewEventAt! > cardLastReview))
        || (cardReps !== null && reviewEventCount > cardReps)
        || (
          hasSchedulerEvidence
          && this.hasDomainSyncReviewAfterSnapshot(row)
          && this.domainSyncRepairAfterStateDiffers(row, after)
        )
      );
      if (!hasCardState) {
        unrepairableCardIds.add(cardId);
      } else if (hasRepairableDivergence && hasSchedulerEvidence && after) {
        repairableCardIds.add(cardId);
      } else if (hasRepairableDivergence) {
        unrepairableCardIds.add(cardId);
      }
    }
    for (const cardId of repairableCardIds) {
      unrepairableCardIds.delete(cardId);
    }
    return {
      repairableCards: repairableCardIds.size,
      unrepairableCards: unrepairableCardIds.size,
    };
  }

  private buildDomainSyncRepairAfterState(input: {
    row: DomainSyncRepairPreviewEvidenceRow;
    newestReviewEventAt: number | null;
    reviewEventCount: number;
    cardReps: number | null;
  }): Record<string, unknown> | null {
    const payload = parseSqlJsonRecord(input.row.latest_review_payload_json);
    const after = isRecord(payload.after) ? payload.after : null;
    const cardId = normalizeString(input.row.card_id);
    if (!cardId) {
      return null;
    }
    if (!after) {
      return this.buildDomainSyncRepairCounterOnlyAfterState(input);
    }
    const afterCardId = normalizeString(after.id) || normalizeString(payload.cardId);
    if (afterCardId && afterCardId !== cardId) {
      return null;
    }
    const lastReview = toNullableTimestamp(after.lastReview) ?? input.newestReviewEventAt;
    if (!lastReview || (input.newestReviewEventAt && lastReview !== input.newestReviewEventAt)) {
      return null;
    }
    const due = toNullableTimestamp(after.due);
    const stability = readFiniteRepairNumber(after.stability);
    const difficulty = readFiniteRepairNumber(after.difficulty);
    const reps = readNonNegativeRepairInteger(after.reps);
    const lapses = readNonNegativeRepairInteger(after.lapses);
    const state = readCardStateRepairValue(after.state);
    const elapsedDays = readNonNegativeRepairInteger(after.elapsedDays);
    const scheduledDays = readNonNegativeRepairInteger(after.scheduledDays);
    if (
      due === null
      || stability === null
      || difficulty === null
      || reps === null
      || lapses === null
      || state === null
      || elapsedDays === null
      || scheduledDays === null
    ) {
      return null;
    }
    const schedulerType = normalizeString(after.schedulerType) || normalizeString(payload.schedulerType) || null;
    const repairAfter: Record<string, unknown> = {
      due,
      stability,
      difficulty,
      reps: Math.max(reps, input.reviewEventCount, input.cardReps ?? 0),
      lapses,
      state,
      lastReview,
      elapsedDays,
      scheduledDays,
      schedulerType,
    };
    const learningStep = readNonNegativeRepairInteger(after.learning_step);
    if (learningStep !== null) {
      repairAfter.learning_step = learningStep;
    }
    const aFactor = readFiniteRepairNumber(after.aFactor);
    if (aFactor !== null) {
      repairAfter.aFactor = aFactor;
    }
    return this.canonicalizeDomainSyncRepairAfterState(input.row, repairAfter);
  }

  private hasDomainSyncReviewAfterSnapshot(row: DomainSyncRepairPreviewEvidenceRow): boolean {
    const payload = parseSqlJsonRecord(row.latest_review_payload_json);
    return isRecord(payload.after);
  }

  private buildDomainSyncRepairCounterOnlyAfterState(input: {
    row: DomainSyncRepairPreviewEvidenceRow;
    newestReviewEventAt: number | null;
    reviewEventCount: number;
    cardReps: number | null;
  }): Record<string, unknown> | null {
    const due = toNullableTimestamp(input.row.due);
    const stability = readFiniteRepairNumber(input.row.stability);
    const difficulty = readFiniteRepairNumber(input.row.difficulty);
    const state = readCardStateRepairValue(input.row.state);
    const lastReview = input.newestReviewEventAt;
    const scheduledDays = readNonNegativeRepairInteger(input.row.scheduled_days);
    if (
      due === null
      || stability === null
      || difficulty === null
      || state === null
      || lastReview === null
      || scheduledDays === null
    ) {
      return null;
    }
    const current = parseSqlJsonRecord(input.row.card_payload_json);
    const reps = Math.max(input.reviewEventCount, input.cardReps ?? 0);
    const repairAfter: Record<string, unknown> = {
      due,
      stability,
      difficulty,
      reps,
      lapses: readNonNegativeRepairInteger(current.lapses) ?? 0,
      state,
      lastReview,
      elapsedDays: readNonNegativeRepairInteger(current.elapsedDays) ?? 0,
      scheduledDays,
      schedulerType: normalizeString(input.row.scheduler_type) || normalizeString(current.schedulerType) || null,
    };
    const learningStep = readNonNegativeRepairInteger(current.learning_step);
    if (learningStep !== null) {
      repairAfter.learning_step = learningStep;
    }
    const aFactor = readFiniteRepairNumber(current.aFactor);
    if (aFactor !== null) {
      repairAfter.aFactor = aFactor;
    }
    return this.canonicalizeDomainSyncRepairAfterState(input.row, repairAfter);
  }

  private canonicalizeDomainSyncRepairAfterState(
    row: DomainSyncRepairPreviewEvidenceRow,
    repairAfter: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const cardId = normalizeString(row.card_id);
    if (!cardId) {
      return null;
    }
    const current = parseSqlJsonRecord(row.card_payload_json);
    const lastReview = toNullableTimestamp(repairAfter.lastReview);
    const elapsedDays = readNonNegativeRepairInteger(repairAfter.elapsedDays);
    const canonicalNow = lastReview !== null && elapsedDays !== null
      ? lastReview + elapsedDays * DOMAIN_SYNC_REPAIR_DAY_MS
      : undefined;
    const candidate: FSRSCard = {
      ...(current as Partial<FSRSCard>),
      id: cardId,
      xiuyuanID: normalizeString(current.xiuyuanID),
      blockId: normalizeString(current.blockId) || normalizeString(row.block_id) || cardId,
      due: toNullableTimestamp(repairAfter.due) ?? toNullableTimestamp(current.due) ?? 0,
      stability: readFiniteRepairNumber(repairAfter.stability) ?? readFiniteRepairNumber(current.stability) ?? 0,
      difficulty: readFiniteRepairNumber(repairAfter.difficulty) ?? readFiniteRepairNumber(current.difficulty) ?? 0,
      reps: readNonNegativeRepairInteger(repairAfter.reps) ?? readNonNegativeRepairInteger(current.reps) ?? 0,
      lapses: readNonNegativeRepairInteger(repairAfter.lapses) ?? readNonNegativeRepairInteger(current.lapses) ?? 0,
      state: readCardStateRepairValue(repairAfter.state) ?? readCardStateRepairValue(current.state) ?? CardState.New,
      lastReview: lastReview ?? toNullableTimestamp(current.lastReview) ?? 0,
      elapsedDays: elapsedDays ?? readNonNegativeRepairInteger(current.elapsedDays) ?? 0,
      scheduledDays: readNonNegativeRepairInteger(repairAfter.scheduledDays) ?? readNonNegativeRepairInteger(current.scheduledDays) ?? 0,
      priority: readFiniteRepairNumber(current.priority) ?? readFiniteRepairNumber(repairAfter.priority) ?? 19,
      type: readCardTypeRepairValue(current.type) ?? readCardTypeRepairValue(repairAfter.type) ?? CardType.Item,
      tags: Array.isArray(current.tags) ? current.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      neuralRoamSeed: current.neuralRoamSeed === true,
      leechCount: readNonNegativeRepairInteger(current.leechCount) ?? 0,
      isLeech: current.isLeech === true,
      skipped: current.skipped === true,
      createdAt: toNullableTimestamp(current.createdAt) ?? toNullableTimestamp(row.updated_at) ?? 0,
      updatedAt: toNullableTimestamp(current.updatedAt) ?? toNullableTimestamp(row.updated_at) ?? 0,
      meta: isRecord(current.meta) ? current.meta : {},
      schedulerType: normalizeString(repairAfter.schedulerType) || normalizeString(current.schedulerType) || undefined,
    };
    const learningStep = readNonNegativeRepairInteger(repairAfter.learning_step);
    if (learningStep !== null) {
      candidate.learning_step = learningStep;
    }
    const aFactor = readFiniteRepairNumber(repairAfter.aFactor);
    if (aFactor !== null) {
      candidate.aFactor = aFactor;
    }
    const canonical = canonicalizeSchedulingState(candidate, {
      source: 'domain-sync.repair',
      mode: 'repair-external',
      now: canonicalNow,
    }).card;
    const normalized: Record<string, unknown> = {
      ...repairAfter,
      due: canonical.due,
      stability: canonical.stability,
      difficulty: canonical.difficulty,
      reps: canonical.reps,
      lapses: canonical.lapses,
      state: canonical.state,
      lastReview: canonical.lastReview,
      elapsedDays: canonical.elapsedDays,
      scheduledDays: canonical.scheduledDays,
      schedulerType: canonical.schedulerType,
    };
    if (readNonNegativeRepairInteger(canonical.learning_step) !== null) {
      normalized.learning_step = canonical.learning_step;
    } else {
      delete normalized.learning_step;
    }
    const canonicalAFactor = readFiniteRepairNumber(canonical.aFactor);
    if (canonicalAFactor !== null) {
      normalized.aFactor = canonicalAFactor;
    } else {
      delete normalized.aFactor;
    }
    return normalized;
  }

  private domainSyncRepairAfterStateDiffers(
    row: DomainSyncRepairPreviewEvidenceRow,
    after: Record<string, unknown> | null,
  ): boolean {
    if (!after) {
      return false;
    }
    if (toNullableTimestamp(row.due) !== toNullableTimestamp(after.due)) {
      return true;
    }
    if (readFiniteRepairNumber(row.stability) !== readFiniteRepairNumber(after.stability)) {
      return true;
    }
    if (readFiniteRepairNumber(row.difficulty) !== readFiniteRepairNumber(after.difficulty)) {
      return true;
    }
    if (readNonNegativeRepairInteger(row.reps) !== readNonNegativeRepairInteger(after.reps)) {
      return true;
    }
    if (readCardStateRepairValue(row.state) !== readCardStateRepairValue(after.state)) {
      return true;
    }
    if (toNullableTimestamp(row.last_review) !== toNullableTimestamp(after.lastReview)) {
      return true;
    }
    if (readNonNegativeRepairInteger(row.scheduled_days) !== readNonNegativeRepairInteger(after.scheduledDays)) {
      return true;
    }
    const current = parseSqlJsonRecord(row.card_payload_json);
    if (readNonNegativeRepairInteger(current.lapses) !== readNonNegativeRepairInteger(after.lapses)) {
      return true;
    }
    // elapsedDays is derived from lastReview and the current clock when cards are
    // persisted. A historical review-event snapshot must not make repair loop
    // forever just because time has advanced since that review.
    if ((readNonNegativeRepairInteger(current.learning_step) ?? null) !== (readNonNegativeRepairInteger(after.learning_step) ?? null)) {
      return true;
    }
    const afterSchedulerType = normalizeString(after.schedulerType);
    if (afterSchedulerType && normalizeString(row.scheduler_type) !== afterSchedulerType) {
      return true;
    }
    const afterAFactor = readFiniteRepairNumber(after.aFactor);
    if (afterAFactor !== null && readFiniteRepairNumber(current.aFactor) !== afterAFactor) {
      return true;
    }
    return false;
  }

  private applyDomainSyncRepairAfterState(
    card: FSRSCard,
    after: Record<string, unknown>,
    appliedAt: number,
  ): FSRSCard | null {
    const due = toNullableTimestamp(after.due);
    const stability = readFiniteRepairNumber(after.stability);
    const difficulty = readFiniteRepairNumber(after.difficulty);
    const reps = readNonNegativeRepairInteger(after.reps);
    const lapses = readNonNegativeRepairInteger(after.lapses);
    const state = readCardStateRepairValue(after.state);
    const lastReview = toNullableTimestamp(after.lastReview);
    const elapsedDays = readNonNegativeRepairInteger(after.elapsedDays);
    const scheduledDays = readNonNegativeRepairInteger(after.scheduledDays);
    if (
      due === null
      || stability === null
      || difficulty === null
      || reps === null
      || lapses === null
      || state === null
      || lastReview === null
      || elapsedDays === null
      || scheduledDays === null
    ) {
      return null;
    }
    const next: FSRSCard = {
      ...card,
      due,
      stability,
      difficulty,
      reps,
      lapses,
      state,
      lastReview,
      elapsedDays,
      scheduledDays,
      updatedAt: appliedAt,
    };
    const schedulerType = normalizeString(after.schedulerType);
    if (schedulerType) {
      next.schedulerType = schedulerType;
    }
    const learningStep = readNonNegativeRepairInteger(after.learning_step);
    if (learningStep !== null) {
      next.learning_step = learningStep;
    } else {
      delete next.learning_step;
    }
    const aFactor = readFiniteRepairNumber(after.aFactor);
    if (aFactor !== null) {
      next.aFactor = aFactor;
    }
    return next;
  }

  private buildDomainSyncRepairSchedulerConfigHash(rows: DomainSyncRepairPreviewEvidenceRow[]): string | null {
    const schedulerRows = rows
      .filter((row) => row.updated_at !== null && row.updated_at !== undefined)
      .map((row) => ({
        cardId: String(row.card_id || ''),
        schedulerType: String(row.scheduler_type || 'default'),
        due: toNullableTimestamp(row.due),
        state: isFiniteSqlNumber(row.state) ? Number(row.state) : null,
        scheduledDays: isFiniteSqlNumber(row.scheduled_days) ? Number(row.scheduled_days) : null,
        stability: isFiniteSqlNumber(row.stability) ? Number(row.stability) : null,
        difficulty: isFiniteSqlNumber(row.difficulty) ? Number(row.difficulty) : null,
      }));
    if (schedulerRows.length === 0) {
      return null;
    }
    return this.fnv1a32(JSON.stringify(schedulerRows));
  }

  private resolveDomainSyncRepairSchedulerType(rows: DomainSyncRepairPreviewEvidenceRow[]): string | null {
    const schedulerTypes = Array.from(new Set(rows
      .map((row) => String(row.scheduler_type || '').trim())
      .filter(Boolean)));
    if (schedulerTypes.length === 1) {
      return schedulerTypes[0];
    }
    if (schedulerTypes.length > 1) {
      return 'mixed';
    }
    return rows.some((row) => row.updated_at !== null && row.updated_at !== undefined) ? 'default' : null;
  }

  private persistDomainSyncRepairPreviewPlan(input: {
    request: BackendDomainSyncRepairPreviewRequest;
    result: BackendDomainSyncRepairPreviewResult;
    rows: DomainSyncRepairPreviewEvidenceRow[];
    schedulerConfigHash: string | null;
  }): void {
    const fingerprints = this.buildDomainSyncRepairPlanFingerprints(input.rows);
    this.runtime.run(
      `INSERT OR REPLACE INTO domain_sync_repair_plans
        (plan_id, status, created_at, expires_at, scope_json, scheduler_config_hash,
         ledger_generation, card_state_fingerprint, review_history_fingerprint,
         affected_card_count, apply_idempotency_key, applied_at, result_json, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.result.planId,
        input.result.status,
        input.result.createdAt,
        null,
        JSON.stringify({
          cardIds: normalizeAuditCardIds(input.request.cardIds),
          limit: input.result.limit,
          includeUnrepairable: input.request.includeUnrepairable !== false,
        }),
        input.schedulerConfigHash,
        this.countDomainSyncLedgerGeneration(),
        fingerprints.cardStateFingerprint,
        fingerprints.reviewHistoryFingerprint,
        input.result.affectedCardCount,
        null,
        null,
        null,
        JSON.stringify(input.result),
      ],
    );
  }

  private buildDomainSyncRepairPlanFingerprints(rows: DomainSyncRepairPreviewEvidenceRow[]): {
    cardStateFingerprint: string;
    reviewHistoryFingerprint: string;
  } {
    return {
      cardStateFingerprint: this.fnv1a32(JSON.stringify(rows.map((row) => ({
        cardId: row.card_id,
        updatedAt: row.updated_at,
        reps: row.reps,
        lastReview: row.last_review,
        due: row.due,
        state: row.state,
        scheduledDays: row.scheduled_days,
        stability: row.stability,
        difficulty: row.difficulty,
      })))),
      reviewHistoryFingerprint: this.fnv1a32(JSON.stringify(rows.map((row) => ({
        cardId: row.card_id,
        newestReviewEventAt: row.newest_reviewed_at,
        reviewEventCount: row.review_event_count,
        latestReviewEventId: row.latest_review_event_id,
        latestReviewPayloadFingerprint: this.fnv1a32(String(row.latest_review_payload_json || '')),
      })))),
    };
  }

  private rebuildSqlProjectionsFromTruth(
    request: WorkerStorageProjectionRebuildRequest,
  ): BackendStorageProjectionRebuildResult {
    const at = Date.now();
    const rebuildId = normalizeString(request.rebuildId) || `projection-rebuild:${at}`;
    const cause = normalizeString(request.cause) || 'manual';
    const projectionGeneration = at;
    const families = uniqueStrings(request.families);
    const familyResults: BackendStorageProjectionRebuildFamilyResult[] = [];

    for (const family of families) {
      if (family === 'review-event-indexes') {
        familyResults.push(this.rebuildReviewEventIndexProjection({
          request,
          projectionGeneration,
        }));
        continue;
      }
      if (family === 'cards') {
        familyResults.push(this.rebuildCardProjection({
          request,
          projectionGeneration,
        }));
        continue;
      }
      familyResults.push({
        family: family as BackendStorageProjectionRebuildFamilyResult['family'],
        status: 'unavailable',
        unavailableReason: 'unsupported-family',
        projectionGeneration: 0,
        rowsRead: 0,
        rowsWritten: 0,
        sourceReadCount: 0,
        missingSourceIds: [],
        error: `storage.projection.rebuild does not support ${family}`,
      });
    }

    const missingSourceIds = uniqueStrings(familyResults.flatMap((result) => result.missingSourceIds));
    const firstError = familyResults.find((result) => result.error)?.error ?? null;
    const rowsRead = familyResults.reduce((total, result) => total + result.rowsRead, 0);
    const rowsWritten = familyResults.reduce((total, result) => total + result.rowsWritten, 0);
    const sourceReadCount = request.sourceReads.length;
    const hasRepairRequired = familyResults.some((result) => result.status === 'repair-required');
    const hasUnavailable = familyResults.some((result) => result.status === 'unavailable');
    const hasRefreshing = familyResults.some((result) => result.status === 'refreshing');
    return {
      status: hasRepairRequired ? 'repair-required' : hasUnavailable ? 'unavailable' : hasRefreshing ? 'refreshing' : 'ready',
      at,
      rebuildId,
      cause,
      projectionGeneration: hasUnavailable && rowsWritten === 0 ? 0 : projectionGeneration,
      rowsRead,
      rowsWritten,
      sourceReadCount,
      missingSourceIds,
      families: familyResults,
      error: firstError,
    };
  }

  private rebuildReviewEventIndexProjection(input: {
    request: WorkerStorageProjectionRebuildRequest;
    projectionGeneration: number;
  }): BackendStorageProjectionRebuildFamilyResult {
    const reviewRecords = input.request.truthRecords
      .filter(isReviewEventTruthRecord);
    const reviewBlockIds = new Set(reviewRecords
      .map((record) => readTruthRecordSourceBlockId(record))
      .filter((blockId): blockId is string => Boolean(blockId)));
    const missingSourceIds = uniqueStrings(input.request.sourceReads
      .filter((read) => reviewBlockIds.has(read.blockId) && !read.found)
      .map((read) => read.blockId));
    if (missingSourceIds.length > 0) {
      return {
        family: 'review-event-indexes',
        status: 'unavailable',
        unavailableReason: 'missing-source',
        projectionGeneration: 0,
        rowsRead: reviewRecords.length,
        rowsWritten: 0,
        sourceReadCount: input.request.sourceReads.length,
        missingSourceIds,
        error: `missing source blocks: ${missingSourceIds.join(', ')}`,
      };
    }

    const rows = reviewRecords
      .map((record) => buildReviewEventProjectionRow({
        record,
        request: input.request,
        projectionGeneration: input.projectionGeneration,
      }))
      .filter((row): row is ReviewEventProjectionRow => row !== null);

    this.runtime.runTransaction('storage.projection.rebuild.review-event-indexes', () => {
      for (const row of rows) {
        if (row.commitIdempotencyKey) {
          this.runtime.run(
            `DELETE FROM review_events
              WHERE commit_idempotency_key = ?
                AND msgpack_ref IS NOT NULL`,
            [row.commitIdempotencyKey],
          );
        }
        this.runtime.run(
          `INSERT OR REPLACE INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key,
             year, month, event_type, payload_json, msgpack_ref, truth_hash,
             truth_schema_version, projection_generation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.cardId,
            row.attemptId,
            row.rating,
            row.reviewedAt,
            row.commitIdempotencyKey,
            row.year,
            row.month,
            row.eventType,
            row.payloadJson,
            row.msgpackRef,
            row.truthHash,
            row.truthSchemaVersion,
            row.projectionGeneration,
          ],
        );
      }
    });

    return {
      family: 'review-event-indexes',
      status: 'ready',
      projectionGeneration: input.projectionGeneration,
      rowsRead: reviewRecords.length,
      rowsWritten: rows.length,
      sourceReadCount: input.request.sourceReads.length,
      missingSourceIds: [],
      error: null,
    };
  }

  private rebuildCardProjection(input: {
    request: WorkerStorageProjectionRebuildRequest;
    projectionGeneration: number;
  }): BackendStorageProjectionRebuildFamilyResult {
    const cardRecords = input.request.truthRecords
      .filter((record): record is MessagePackTruthRecord & Record<string, unknown> => (
        isCardMemoryFactTruthRecord(record) || isReviewFeedbackV2CardTruthRecord(record)
      ));
    const cardRows = buildCardProjectionRows({
      request: input.request,
      records: cardRecords,
      projectionGeneration: input.projectionGeneration,
    });
    const rowBlockIds = new Set(cardRows.map((row) => row.blockId));
    const missingSourceIds = uniqueStrings(input.request.sourceReads
      .filter((read) => rowBlockIds.has(read.blockId) && !read.found)
      .map((read) => read.blockId));
    if (missingSourceIds.length > 0) {
      return {
        family: 'cards',
        status: 'unavailable',
        unavailableReason: 'missing-source',
        projectionGeneration: 0,
        rowsRead: cardRecords.length,
        rowsWritten: 0,
        sourceReadCount: input.request.sourceReads.length,
        missingSourceIds,
        error: `missing source blocks: ${missingSourceIds.join(', ')}`,
      };
    }

    this.runtime.runTransaction('storage.projection.rebuild.cards', () => {
      for (const row of cardRows) {
        this.runtime.run(
          `INSERT OR REPLACE INTO cards
            (id, block_id, xiuyuan_id, type, state, due, priority, scheduler_type, updated_at,
             deck_id, root_id, content_text, tags, suspended, lapses, reps, last_review, created_at,
             scheduled_days, stability, difficulty, a_factor, search_text, card_type_marker,
             source_exists, source_checked_at, source_missing_at, payload_json, dto_json,
             msgpack_ref, truth_hash, truth_schema_version, projection_generation, source_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.blockId,
            row.xiuyuanId,
            row.type,
            row.state,
            row.due,
            row.priority,
            row.schedulerType,
            row.updatedAt,
            row.deckId,
            row.rootId,
            row.contentText,
            row.tags,
            row.suspended,
            row.lapses,
            row.reps,
            row.lastReview,
            row.createdAt,
            row.scheduledDays,
            row.stability,
            row.difficulty,
            row.aFactor,
            row.searchText,
            row.cardTypeMarker,
            row.sourceExists,
            row.sourceCheckedAt,
            row.sourceMissingAt,
            row.payloadJson,
            row.dtoJson,
            row.msgpackRef,
            row.truthHash,
            row.truthSchemaVersion,
            row.projectionGeneration,
            row.sourceHash,
          ],
        );
        const algorithmState = deriveAlgorithmCardState(row.card);
        this.runtime.run(
          `DELETE FROM algorithm_card_state
           WHERE card_id = ?
             AND algorithm_id IN (?, ?)
             AND algorithm_id != ?`,
          [row.id, ...ACTIVE_ALGORITHM_IDS, algorithmState.algorithmId],
        );
        this.runtime.run(
          `INSERT OR REPLACE INTO algorithm_card_state
            (card_id, algorithm_id, state_json, updated_at)
           VALUES (?, ?, ?, ?)`,
          [
            row.id,
            algorithmState.algorithmId,
            stringifyAlgorithmCardState(algorithmState.state),
            row.updatedAt,
          ],
        );
      }
    });

    return {
      family: 'cards',
      status: 'ready',
      projectionGeneration: input.projectionGeneration,
      rowsRead: cardRecords.length,
      rowsWritten: cardRows.length,
      sourceReadCount: input.request.sourceReads.length,
      missingSourceIds: [],
      error: null,
    };
  }

  private createQueueProjectionRuntime(): WorkerQueueProjectionRuntime {
    return new WorkerQueueProjectionRuntime({
      repository: this.repository!,
      queueProjection: this.queueProjection,
      runtime: this.runtime,
    });
  }

  private invalidateQueueProjectionsForSourceChanges(blockIds: string[], checkedAt: number): void {
    new SourceExistenceProjectionInvalidator({
      queueProjection: this.queueProjection,
    }).invalidateForSourceChanges(blockIds, checkedAt);
  }

  private invalidateQueueProjectionsForSyncConflictMerge(input: {
    affectedCardIds: string[];
    affectedBlockIds: string[];
    mergedAt: number;
  }): void {
    if (!this.queueProjection || input.affectedCardIds.length === 0) {
      return;
    }
    const mergedAt = Math.max(1, Math.floor(Number(input.mergedAt) || Date.now()));
    this.queueProjection.invalidateQueues({
      queueTypes: [
        QueueType.RetrievalPractice,
        QueueType.IncrementalLearning,
        QueueType.FilterGroup,
        QueueType.FinalDrill,
        QueueType.Leech,
        QueueType.NeuralRoam,
      ],
      reason: 'sync-conflict-merge',
      affectedCardIds: input.affectedCardIds,
      affectedBlockIds: input.affectedBlockIds,
      generation: mergedAt,
      createdAt: mergedAt,
      metadata: {
        source: 'sync-conflict-merge',
      },
    });
  }

  private invalidateQueueProjectionsForDomainSyncRepair(input: {
    affectedCardIds: string[];
    affectedBlockIds: string[];
    appliedAt: number;
  }): number {
    if (!this.queueProjection || input.affectedCardIds.length === 0) {
      return 0;
    }
    const queueTypes = [
      QueueType.RetrievalPractice,
      QueueType.IncrementalLearning,
      QueueType.FilterGroup,
      QueueType.FinalDrill,
      QueueType.Leech,
      QueueType.NeuralRoam,
    ];
    this.queueProjection.invalidateQueues({
      queueTypes,
      reason: 'explicit-repair',
      affectedCardIds: input.affectedCardIds,
      affectedBlockIds: input.affectedBlockIds,
      generation: input.appliedAt,
      createdAt: input.appliedAt,
      metadata: {
        source: 'domain-sync.repair.apply',
      },
    });
    return queueTypes.length;
  }

  private appendDomainSyncRepairAppliedOperation(input: {
    planId: string;
    idempotencyKey: string;
    cardId: string;
    blockId: string | null;
    appliedAt: number;
    mutation: BackendDomainSyncRepairPreviewPlannedMutation;
  }): void {
    const payload = {
      planId: input.planId,
      idempotencyKey: input.idempotencyKey,
      cardId: input.cardId,
      mutation: input.mutation,
    };
    const payloadJson = JSON.stringify(payload);
    const operationIdempotencyKey = `${input.idempotencyKey}:${input.cardId}`;
    this.runtime.run(
      `INSERT OR IGNORE INTO domain_sync_operations
        (operation_id, source_id, source_device_id, source_generation, operation_type,
         entity_type, entity_id, entity_block_id, occurred_at, observed_at,
         payload_fingerprint, idempotency_key, review_event_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `repair-applied:${input.planId}:${input.cardId}`,
        'srs-backend-worker',
        null,
        null,
        'repair-applied',
        'card',
        input.cardId,
        input.blockId,
        input.appliedAt,
        input.appliedAt,
        this.fnv1a32(payloadJson),
        operationIdempotencyKey,
        null,
        payloadJson,
      ],
    );
  }

  private fnv1a32(input: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private applyIncomingMissingSourceProjection(row: ConflictCardRow, incoming: FSRSCard): boolean {
    if (Number(row.source_exists) !== 0) {
      return false;
    }
    const rowBlockId = String(row.block_id || '').trim();
    const incomingBlockId = String(incoming.blockId || '').trim();
    if (!rowBlockId || rowBlockId !== incomingBlockId) {
      return false;
    }
    const incomingCheckedAt = this.normalizeConflictTimestamp(row.source_checked_at);
    const incomingMissingAt = this.normalizeConflictTimestamp(row.source_missing_at) || incomingCheckedAt;
    if (!incomingCheckedAt && !incomingMissingAt) {
      return false;
    }
    const current = this.runtime.getOne<{
      source_exists: number | null;
      source_checked_at: number | null;
      source_missing_at: number | null;
    }>(
      'SELECT source_exists, source_checked_at, source_missing_at FROM cards WHERE id = ?',
      [incoming.id],
    );
    const currentCheckedAt = this.normalizeConflictTimestamp(current?.source_checked_at);
    const currentMissingAt = this.normalizeConflictTimestamp(current?.source_missing_at);
    if (currentCheckedAt && incomingCheckedAt && currentCheckedAt > incomingCheckedAt) {
      return false;
    }
    if (
      Number(current?.source_exists) === 0
      && currentCheckedAt === (incomingCheckedAt || 0)
      && currentMissingAt === (incomingMissingAt || 0)
    ) {
      return false;
    }
    this.runtime.run(
      `UPDATE cards
       SET source_exists = 0,
           source_checked_at = ?,
           source_missing_at = ?
       WHERE id = ?
         AND block_id = ?`,
      [incomingCheckedAt || null, incomingMissingAt || null, incoming.id, incomingBlockId],
    );
    return true;
  }

  private normalizeConflictTimestamp(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
  }

  async resolveAutoCardDecision(
    request: BackendAutoCardDecisionResolveRequest,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    await this.init();
    const result = this.autoCardDecisionService.resolve(request);
    this.autoCardDecisionTotal += 1;
    if (result.status === 'selected') {
      this.autoCardDecisionSelectedTotal += 1;
    } else if (result.status === 'skipped') {
      this.autoCardDecisionSkippedTotal += 1;
    } else if (result.status === 'no-op') {
      this.autoCardDecisionNoOpTotal += 1;
    } else if (result.status === 'unavailable') {
      this.autoCardDecisionUnavailableTotal += 1;
    } else if (result.status === 'failed') {
      this.autoCardDecisionFailedTotal += 1;
    }
    return result;
  }

  recordAutoCardExecuteOutcome(input: {
    status: 'created' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
    created?: number;
    skipped?: number;
  }): void {
    this.autoCardExecuteTotal += 1;
    this.autoCardExecuteCreatedTotal += Math.max(0, Math.floor(Number(input.created || 0)));
    this.autoCardExecuteSkippedTotal += Math.max(0, Math.floor(Number(input.skipped || 0)));
    if (input.status === 'unavailable') {
      this.autoCardExecuteUnavailableTotal += 1;
    }
    if (input.status === 'failed') {
      this.autoCardExecuteFailedTotal += 1;
    }
  }

  recordAiSessionOutcome(status: 'create' | 'update' | 'cancel'): void {
    if (status === 'create') {
      this.aiSessionCreateTotal += 1;
      return;
    }
    if (status === 'update') {
      this.aiSessionUpdateTotal += 1;
      return;
    }
    this.aiSessionCancelTotal += 1;
  }

  recordAiStreamOutcome(status: 'start' | 'cancel'): void {
    if (status === 'start') {
      this.aiStreamStartTotal += 1;
      return;
    }
    this.aiStreamCancelTotal += 1;
  }

  recordAiJobOutcome(status: 'created' | 'completed' | 'canceled' | 'timeout' | 'failed'): void {
    if (status === 'created') {
      this.aiJobCreatedTotal += 1;
      return;
    }
    if (status === 'completed') {
      this.aiJobCompletedTotal += 1;
      return;
    }
    if (status === 'canceled') {
      this.aiJobCanceledTotal += 1;
      return;
    }
    if (status === 'timeout') {
      this.aiJobTimeoutTotal += 1;
      return;
    }
    this.aiJobFailedTotal += 1;
  }

  async ingestKernelTransactions(
    request: BackendKernelTransactionIngestRequest,
  ): Promise<BackendKernelTransactionIngestResult> {
    await this.init();
    return this.kernelTransactionRuntime.ingestKernelTransactions(request);
  }

  async dequeueKernelTransactionActions(maxActions = 16): Promise<BackendKernelTransactionDequeueResult> {
    await this.init();
    return this.kernelTransactionRuntime.dequeueKernelTransactionActions(maxActions);
  }

  async requeueKernelTransactionActions(
    actions: BackendKernelTransactionAction[],
  ): Promise<BackendKernelTransactionRequeueResult> {
    await this.init();
    return this.kernelTransactionRuntime.requeueKernelTransactionActions(actions);
  }

  drainKernelTransactions(maxTransactions = 256): Array<{
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    idempotencyKey: string;
    acceptedAt: number;
  }> {
    return this.kernelTransactionRuntime.drainKernelTransactions(maxTransactions);
  }

  async executeSemanticCommand(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult> {
    await this.init();
    const requestId = normalizeString(request.requestId);
    const callerIntent = normalizeString(request.callerIntent);
    const idempotencyKey = normalizeString(request.idempotencyKey);
    if (!requestId || !callerIntent || !idempotencyKey || request.method !== 'semantic.command.execute') {
      return this.semanticFailed(requestId || 'semantic-command', 'invalid-request', 'semantic.command.execute requires requestId/callerIntent/idempotencyKey');
    }
    const cached = this.semanticCommandResultsByIdempotencyKey.get(idempotencyKey);
    if (cached) {
      return cached;
    }
    const command = request.command;
    if (!command || typeof command !== 'object') {
      return this.semanticFailed(requestId, 'invalid-request', 'semantic.command.execute requires command');
    }
    const result = await this.runtime.runTransaction('semantic.command.execute', () => {
      return this.executeSemanticCommandInTransaction(requestId, idempotencyKey, command);
    });
    this.semanticCommandResultsByIdempotencyKey.set(idempotencyKey, result);
    return result;
  }

  readSemanticBrowser(request: BackendSemanticBrowserReadRequest): BackendSemanticBrowserReadResult {
    return new SemanticSessionReadModelBuilder(this.semanticActivation).readBrowser(request);
  }

  readSemanticSession(request: BackendSemanticSessionReadRequest): BackendSemanticSessionReadResult {
    return new SemanticSessionReadModelBuilder(this.semanticActivation).readSession(request);
  }

  readSemanticSidebar(request: BackendSemanticSidebarReadRequest): BackendSemanticSidebarReadResult {
    return new SemanticSessionReadModelBuilder(this.semanticActivation).readSidebar(request);
  }

  private executeSemanticCommandInTransaction(
    requestId: string,
    idempotencyKey: string,
    command: BackendSemanticCommandRequest['command'],
  ): BackendSemanticCommandResult {
    switch (command.type) {
      case 'start-session':
        return this.startSemanticSession(requestId, idempotencyKey, command);
      case 'follow-candidate':
        return this.followSemanticCandidate(requestId, command);
      case 'create-branch-edge':
        return this.createSemanticBranchEdge(requestId, command);
      case 'move-active-cursor':
        return this.moveSemanticActiveCursor(requestId, command);
      case 'archive-branch':
        return this.archiveSemanticBranch(requestId, command);
      case 'restore-branch':
        return this.restoreSemanticBranch(requestId, command);
      case 'switch-lens':
        return this.switchSemanticLens(requestId, command);
      case 'create-station':
        return this.createSemanticStation(requestId, command);
      case 'record-implicit-node-action':
        return this.recordImplicitSemanticNodeAction(requestId, command);
      case 'accept-relation':
      case 'reject-relation':
        return this.decideSemanticRelation(requestId, command);
      case 'mark-irrelevant':
        return this.markSemanticNodeIrrelevant(requestId, command);
      case 'add-later':
        return this.addSemanticLaterEntry(requestId, command);
      case 'remove-later':
        return this.removeSemanticLaterEntry(requestId, command);
      case 'create-suggestion':
        return this.createSemanticSuggestion(requestId, command);
      case 'ignore-suggestion':
        return this.updateSemanticSuggestionStatus(requestId, command, 'ignored');
      case 'bind-suggestion':
        return this.updateSemanticSuggestionStatus(requestId, command, 'bound');
      case 'materialize-suggestion':
        return this.updateSemanticSuggestionStatus(requestId, command, 'materialized');
      case 'archive-station':
        return this.archiveSemanticStation(requestId, command);
      case 'restore-path-station':
        return this.restoreSemanticPathStation(requestId, command);
      case 'end-session':
        return this.endSemanticSession(requestId, command);
      case 'restore-session':
        return this.restoreSemanticSession(requestId, command);
      default:
        return this.semanticFailed(requestId, 'invalid-request', `unsupported semantic command: ${(command as { type?: unknown }).type || '<missing>'}`);
    }
  }

  private startSemanticSession(
    requestId: string,
    idempotencyKey: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'start-session' }>,
  ): BackendSemanticCommandResult {
    const rootFocusNodeId = normalizeString(command.rootFocusNodeId);
    if (!rootFocusNodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'start-session requires rootFocusNodeId');
    }
    const rootFocusNodeType = this.normalizeSemanticNodeType(command.rootFocusNodeType) ?? 'concept';
    const now = Date.now();
    const sessionId = normalizeString(command.sessionId) || `semantic-session:${idempotencyKey}`;
    const eventId = `semantic-event:${idempotencyKey}:session-started`;
    const entry: SemanticPathEntry = {
      nodeId: rootFocusNodeId,
      lens: 'assimilation',
      eventId,
      visitedAt: now,
    };
    const session: SemanticSessionSnapshot = {
      sessionId,
      rootFocusNodeId,
      rootFocusNodeType,
      currentNodeId: rootFocusNodeId,
      activeLens: 'assimilation',
      narrativePath: [entry],
      startedAt: now,
      endedAt: null,
    };
    const event = this.semanticEvent(eventId, sessionId, 'session-started', {
      nodeId: rootFocusNodeId,
      lens: 'assimilation',
      occurredAt: now,
      payload: { rootFocusNodeId, rootFocusNodeType },
    });
    const visitEvent = this.semanticEvent(`semantic-event:${idempotencyKey}:node-visited`, sessionId, 'node-visited', {
      nodeId: rootFocusNodeId,
      lens: 'assimilation',
      occurredAt: now,
      payload: { reason: 'session-started' },
    });
    this.semanticActivation!.saveSession(session);
    this.semanticActivation!.appendEvent(event);
    this.semanticActivation!.appendEvent(visitEvent);
    return this.semanticOk(requestId, sessionId, { session, event: visitEvent, events: [event, visitEvent] });
  }

  private followSemanticCandidate(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'follow-candidate' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const candidateId = normalizeString(command.candidateId);
    const lens = this.normalizeSemanticLens(command.lens) ?? session.activeLens;
    if (!candidateId) {
      return this.semanticFailed(requestId, 'invalid-request', 'follow-candidate requires candidateId');
    }
    const now = Date.now();
    const events: SemanticEvent[] = [];
    if (lens !== session.activeLens) {
      events.push(this.semanticEvent(`semantic-event:${requestId}:lens-switched`, session.sessionId, 'lens-switched', {
        nodeId: session.currentNodeId,
        lens,
        occurredAt: now,
        payload: { previousLens: session.activeLens, nextLens: lens, reason: 'follow-candidate' },
      }));
    }
    const edgeEventId = `semantic-event:${requestId}:edge-traversed`;
    events.push(this.semanticEvent(edgeEventId, session.sessionId, 'edge-traversed', {
      nodeId: candidateId,
      fromNodeId: session.currentNodeId,
      toNodeId: candidateId,
      lens,
      occurredAt: now,
      payload: { candidateId },
    }));
    const visitEvent = this.semanticEvent(`semantic-event:${requestId}:node-visited`, session.sessionId, 'node-visited', {
      nodeId: candidateId,
      lens,
      occurredAt: now,
      payload: { reason: 'follow-candidate', candidateId },
    });
    events.push(visitEvent);
    const updated: SemanticSessionSnapshot = {
      ...session,
      currentNodeId: candidateId,
      activeLens: lens,
      narrativePath: [
        ...session.narrativePath,
        { nodeId: candidateId, lens, eventId: visitEvent.eventId, visitedAt: now },
      ],
    };
    this.semanticActivation!.saveSession(updated);
    for (const event of events) {
      this.semanticActivation!.appendEvent(event);
    }
    return this.semanticOk(requestId, updated.sessionId, { session: updated, event: visitEvent, events });
  }

  private createSemanticBranchEdge(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'create-branch-edge' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const fromNodeId = normalizeString(command.fromNodeId);
    const toNodeId = normalizeString(command.toNodeId);
    const lens = this.normalizeSemanticLens(command.lens) ?? session.activeLens;
    if (!fromNodeId || !toNodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'create-branch-edge requires fromNodeId/toNodeId');
    }
    const now = Date.now();
    const branchId = `semantic-branch:${session.sessionId}:${fromNodeId}:${requestId}`;
    const edge = {
      edgeId: `semantic-edge:${requestId}`,
      sessionId: session.sessionId,
      branchId,
      fromNodeId,
      toNodeId,
      lens,
      explanation: command.explanation ?? null,
      createdBy: command.explanation?.createdBy ?? { kind: 'user' as const, label: 'Review sidebar' },
      createdAt: now,
      forkMetadata: null,
    };
    const state = {
      branchId,
      sessionId: session.sessionId,
      rootNodeId: fromNodeId,
      activeCursorNodeId: toNodeId,
      archivedAt: null,
      restoredAt: null,
      updatedAt: now,
    };
    const event = this.semanticEvent(`semantic-event:${requestId}:branch-edge-created`, session.sessionId, 'branch-edge-created', {
      fromNodeId,
      toNodeId,
      nodeId: toNodeId,
      lens,
      occurredAt: now,
      payload: { branchId, edgeId: edge.edgeId },
    });
    this.semanticActivation!.saveBranchEdge(edge);
    this.semanticActivation!.saveBranchState(state);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private moveSemanticActiveCursor(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'move-active-cursor' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    if (!nodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'move-active-cursor requires nodeId');
    }
    const pathEntry = [...session.narrativePath].reverse().find((entry) => entry.nodeId === nodeId);
    const lens = pathEntry?.lens ?? session.activeLens;
    const now = Date.now();
    const event = this.semanticEvent(`semantic-event:${requestId}:active-cursor-moved`, session.sessionId, 'active-cursor-moved', {
      nodeId,
      lens,
      occurredAt: now,
      payload: { previousNodeId: session.currentNodeId },
    });
    const updated = {
      ...session,
      currentNodeId: nodeId,
      activeLens: lens,
    };
    this.semanticActivation!.saveSession(updated);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, updated.sessionId, { session: updated, event });
  }

  private archiveSemanticBranch(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'archive-branch' }>,
  ): BackendSemanticCommandResult {
    return this.updateSemanticBranchArchivedState(requestId, command.sessionId, command.branchId, true);
  }

  private restoreSemanticBranch(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'restore-branch' }>,
  ): BackendSemanticCommandResult {
    return this.updateSemanticBranchArchivedState(requestId, command.sessionId, command.branchId, false);
  }

  private updateSemanticBranchArchivedState(
    requestId: string,
    sessionIdInput: unknown,
    branchIdInput: unknown,
    archive: boolean,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, sessionIdInput);
    if (!('sessionId' in session)) {
      return session;
    }
    const branchId = normalizeString(branchIdInput);
    if (!branchId) {
      return this.semanticFailed(requestId, 'invalid-request', `${archive ? 'archive' : 'restore'}-branch requires branchId`);
    }
    const existingState = this.semanticActivation!.listBranchStates(session.sessionId)
      .find((state) => state.branchId === branchId);
    const branchEdges = this.semanticActivation!.listBranchEdges(session.sessionId)
      .filter((edge) => edge.branchId === branchId);
    if (!existingState && branchEdges.length === 0) {
      return this.semanticFailed(requestId, 'invalid-request', `semantic branch not found: ${branchId}`);
    }
    const now = Date.now();
    const firstEdge = branchEdges[0] ?? null;
    const lastEdge = branchEdges[branchEdges.length - 1] ?? null;
    const state = {
      branchId,
      sessionId: session.sessionId,
      rootNodeId: existingState?.rootNodeId ?? firstEdge?.fromNodeId ?? session.currentNodeId,
      activeCursorNodeId: existingState?.activeCursorNodeId ?? lastEdge?.toNodeId ?? session.currentNodeId,
      archivedAt: archive ? now : existingState?.archivedAt ?? null,
      restoredAt: archive ? existingState?.restoredAt ?? null : now,
      updatedAt: now,
    };
    const eventType = archive ? 'branch-archived' : 'branch-restored';
    const event = this.semanticEvent(`semantic-event:${requestId}:${eventType}`, session.sessionId, eventType, {
      nodeId: state.activeCursorNodeId,
      lens: session.activeLens,
      occurredAt: now,
      payload: { branchId },
    });
    this.semanticActivation!.saveBranchState(state);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private switchSemanticLens(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'switch-lens' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const lens = this.normalizeSemanticLens(command.lens);
    if (!lens) {
      return this.semanticFailed(requestId, 'invalid-request', 'switch-lens requires lens');
    }
    const event = this.semanticEvent(`semantic-event:${requestId}:lens-switched`, session.sessionId, 'lens-switched', {
      nodeId: session.currentNodeId,
      lens,
      payload: { previousLens: session.activeLens, nextLens: lens },
    });
    const updated = { ...session, activeLens: lens };
    this.semanticActivation!.saveSession(updated);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, updated.sessionId, { session: updated, event });
  }

  private createSemanticStation(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'create-station' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const stationType = command.stationType === 'path' ? 'path' : 'node';
    const station: SemanticStation = {
      stationId: `semantic-station:${requestId}`,
      type: stationType,
      sessionId: session.sessionId,
      nodeId: stationType === 'node' ? session.currentNodeId : null,
      path: stationType === 'path' ? session.narrativePath : null,
      lensHistory: stationType === 'path' ? session.narrativePath.map((entry) => entry.lens) : [session.activeLens],
      createdAt: Date.now(),
    };
    const event = this.semanticEvent(`semantic-event:${requestId}:station-created`, session.sessionId, 'station-created', {
      nodeId: station.nodeId,
      lens: session.activeLens,
      payload: { stationId: station.stationId, stationType },
    });
    this.semanticActivation!.saveStation(station);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event, station });
  }

  private recordImplicitSemanticNodeAction(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'record-implicit-node-action' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    const action = normalizeString(command.action);
    if (!nodeId || !action) {
      return this.semanticFailed(requestId, 'invalid-request', 'record-implicit-node-action requires nodeId/action');
    }
    const lens = this.normalizeSemanticLens(command.lens) ?? session.activeLens;
    const event = this.semanticEvent(`semantic-event:${requestId}:implicit-node-action`, session.sessionId, 'implicit-node-action', {
      nodeId,
      lens,
      payload: { nodeId, action },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event, events: [event] });
  }

  private decideSemanticRelation(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'accept-relation' | 'reject-relation' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const relationId = normalizeString(command.relationId);
    const fromNodeId = normalizeString(command.fromNodeId);
    const toNodeId = normalizeString(command.toNodeId);
    if (!relationId || !fromNodeId || !toNodeId) {
      return this.semanticFailed(requestId, 'invalid-request', `${command.type} requires relationId/fromNodeId/toNodeId`);
    }
    const decision = command.type === 'accept-relation' ? 'accepted' : 'rejected';
    const eventType = command.type === 'accept-relation' ? 'ai-relation-accepted' : 'ai-relation-rejected';
    const relation: SemanticRelation = {
      relationId,
      fromNodeId,
      toNodeId,
      decision,
      source: command.source === 'manual' ? 'manual' : 'ai',
      confidence: Number.isFinite(Number(command.confidence)) ? Number(command.confidence) : 1,
      reason: normalizeOptionalString(command.reason),
      decidedAt: Date.now(),
    };
    const event = this.semanticEvent(`semantic-event:${requestId}:${eventType}`, session.sessionId, eventType, {
      fromNodeId,
      toNodeId,
      lens: session.activeLens,
      payload: { relationId, decision },
    });
    this.semanticActivation!.saveRelation(relation);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event, relation });
  }

  private markSemanticNodeIrrelevant(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'mark-irrelevant' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    if (!nodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'mark-irrelevant requires nodeId');
    }
    const scope = command.scope === 'root' ? 'root' : 'session';
    const event = this.semanticEvent(`semantic-event:${requestId}:node-marked-irrelevant`, session.sessionId, 'node-marked-irrelevant', {
      nodeId,
      lens: session.activeLens,
      payload: { nodeId, scope },
    });
    this.semanticActivation!.saveIrrelevantFeedback({
      feedbackId: `semantic-irrelevant:${requestId}`,
      sessionId: session.sessionId,
      nodeId,
      scope,
      rootFocusNodeId: session.rootFocusNodeId,
      createdAt: event.occurredAt,
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private addSemanticLaterEntry(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'add-later' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    if (!nodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'add-later requires nodeId');
    }
    const now = Date.now();
    const entryId = `semantic-later:${session.sessionId}:${nodeId}`;
    this.semanticActivation!.saveLaterEntry({
      entryId,
      sessionId: session.sessionId,
      nodeId,
      reason: normalizeOptionalString(command.reason),
      createdAt: now,
      removedAt: null,
    });
    const event = this.semanticEvent(`semantic-event:${requestId}:later-added`, session.sessionId, 'later-added', {
      nodeId,
      lens: session.activeLens,
      occurredAt: now,
      payload: { entryId, reason: normalizeOptionalString(command.reason) },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private removeSemanticLaterEntry(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'remove-later' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    if (!nodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'remove-later requires nodeId');
    }
    const now = Date.now();
    const existing = this.semanticActivation!.listLaterEntries(session.sessionId)
      .find((entry) => entry.nodeId === nodeId && typeof entry.removedAt !== 'number');
    const entryId = existing?.entryId ?? `semantic-later:${session.sessionId}:${nodeId}`;
    this.semanticActivation!.saveLaterEntry({
      entryId,
      sessionId: session.sessionId,
      nodeId,
      reason: existing?.reason ?? null,
      createdAt: existing?.createdAt ?? now,
      removedAt: now,
    });
    const event = this.semanticEvent(`semantic-event:${requestId}:later-removed`, session.sessionId, 'later-removed', {
      nodeId,
      lens: session.activeLens,
      occurredAt: now,
      payload: { entryId },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private createSemanticSuggestion(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'create-suggestion' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const suggestionId = normalizeString(command.suggestionId);
    const summary = normalizeString(command.summary);
    if (!suggestionId || !summary) {
      return this.semanticFailed(requestId, 'invalid-request', 'create-suggestion requires suggestionId/summary');
    }
    const now = Date.now();
    this.semanticActivation!.saveSuggestion({
      suggestionId,
      sessionId: session.sessionId,
      source: command.source === 'system' ? 'system' : 'ai',
      summary,
      status: 'active',
      targetNodeId: normalizeOptionalString(command.targetNodeId),
      boundNodeId: null,
      materializedBlockId: null,
      materializedCardId: null,
      createdAt: now,
      updatedAt: now,
    });
    const event = this.semanticEvent(`semantic-event:${requestId}:suggestion-created`, session.sessionId, 'suggestion-created', {
      nodeId: normalizeOptionalString(command.targetNodeId),
      lens: session.activeLens,
      occurredAt: now,
      payload: { suggestionId, source: command.source === 'system' ? 'system' : 'ai' },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private updateSemanticSuggestionStatus(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'ignore-suggestion' | 'bind-suggestion' | 'materialize-suggestion' }>,
    status: 'ignored' | 'bound' | 'materialized',
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const suggestionId = normalizeString(command.suggestionId);
    if (!suggestionId) {
      return this.semanticFailed(requestId, 'invalid-request', `${command.type} requires suggestionId`);
    }
    const existing = this.semanticActivation!.listSuggestions(session.sessionId)
      .find((suggestion) => suggestion.suggestionId === suggestionId);
    if (!existing) {
      return this.semanticFailed(requestId, 'candidate-unavailable', `semantic suggestion not found: ${suggestionId}`);
    }
    const now = Date.now();
    const boundNodeId = command.type === 'bind-suggestion'
      ? normalizeOptionalString(command.nodeId)
      : existing.boundNodeId ?? null;
    const materializedBlockId = command.type === 'materialize-suggestion'
      ? normalizeOptionalString(command.blockId)
      : existing.materializedBlockId ?? null;
    this.semanticActivation!.saveSuggestion({
      ...existing,
      status,
      boundNodeId,
      materializedBlockId,
      materializedCardId: command.type === 'materialize-suggestion'
        ? normalizeOptionalString(command.cardId)
        : existing.materializedCardId ?? null,
      updatedAt: now,
    });
    const eventType = status === 'ignored'
      ? 'suggestion-ignored'
      : status === 'bound'
        ? 'suggestion-bound'
        : 'suggestion-materialized';
    const event = this.semanticEvent(`semantic-event:${requestId}:${eventType}`, session.sessionId, eventType, {
      nodeId: boundNodeId ?? materializedBlockId ?? existing.targetNodeId ?? null,
      lens: session.activeLens,
      occurredAt: now,
      payload: { suggestionId, status },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private archiveSemanticStation(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'archive-station' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const stationId = normalizeString(command.stationId);
    if (!stationId) {
      return this.semanticFailed(requestId, 'invalid-request', 'archive-station requires stationId');
    }
    const station = this.semanticActivation!.getStation(stationId);
    if (!station || station.sessionId !== session.sessionId) {
      return this.semanticFailed(requestId, 'station-unavailable', `semantic station not found: ${stationId}`);
    }
    const now = Date.now();
    const archived = this.semanticActivation!.archiveStation(stationId, now);
    const event = this.semanticEvent(`semantic-event:${requestId}:station-archived`, session.sessionId, 'station-archived', {
      nodeId: archived?.nodeId ?? null,
      lens: session.activeLens,
      occurredAt: now,
      payload: { stationId, stationType: station.type, archivedAt: now },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, {
      session,
      event,
      station: archived,
      archivedStationId: stationId,
    });
  }

  private restoreSemanticPathStation(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'restore-path-station' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const stationId = normalizeString(command.stationId);
    if (!stationId) {
      return this.semanticFailed(requestId, 'invalid-request', 'restore-path-station requires stationId');
    }
    const station = this.semanticActivation!.getStation(stationId);
    if (!station || station.sessionId !== session.sessionId || station.type !== 'path') {
      return this.semanticFailed(requestId, 'station-unavailable', `semantic path station not found: ${stationId}`);
    }
    if (typeof station.archivedAt === 'number') {
      return this.semanticFailed(requestId, 'inactive-station', `semantic path station is archived: ${stationId}`);
    }
    const path = Array.isArray(station.path) ? station.path.filter((entry) => normalizeString(entry.nodeId)) : [];
    if (path.length === 0) {
      return this.semanticFailed(requestId, 'invalid-request', 'restore-path-station requires a non-empty path');
    }
    const terminal = path[path.length - 1]!;
    const event = this.semanticEvent(`semantic-event:${requestId}:station-restored`, session.sessionId, 'station-restored', {
      nodeId: terminal.nodeId,
      lens: terminal.lens ?? session.activeLens,
      payload: { stationId, stationType: station.type, restoredPathLength: path.length },
    });
    const updated: SemanticSessionSnapshot = {
      ...session,
      currentNodeId: terminal.nodeId,
      activeLens: terminal.lens ?? session.activeLens,
      narrativePath: path.map((entry) => ({ ...entry })),
    };
    this.semanticActivation!.saveSession(updated);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, updated.sessionId, { session: updated, event, station });
  }

  private endSemanticSession(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'end-session' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const now = Date.now();
    const updated = { ...session, endedAt: now };
    const event = this.semanticEvent(`semantic-event:${requestId}:session-ended`, session.sessionId, 'session-ended', {
      nodeId: session.currentNodeId,
      lens: session.activeLens,
      occurredAt: now,
    });
    this.semanticActivation!.saveSession(updated);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session: updated, event });
  }

  private restoreSemanticSession(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'restore-session' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    return this.semanticReadOk(requestId, session.sessionId, { session });
  }

  private requireSemanticSession(requestId: string, sessionIdInput: unknown): SemanticSessionSnapshot | BackendSemanticCommandResult {
    const sessionId = normalizeString(sessionIdInput);
    if (!sessionId) {
      return this.semanticFailed(requestId, 'invalid-request', 'semantic command requires sessionId');
    }
    const session = this.semanticActivation!.getSession(sessionId);
    if (!session) {
      return {
        status: 'unavailable',
        unavailableReason: 'session-unavailable',
        message: `SESSION_UNAVAILABLE: semantic session not found: ${sessionId}`,
        diagnosticEventId: `semantic-command-unavailable:${requestId}`,
      };
    }
    return session;
  }

  private semanticEvent(
    eventId: string,
    sessionId: string,
    type: SemanticEvent['type'],
    input: {
      nodeId?: string | null;
      fromNodeId?: string | null;
      toNodeId?: string | null;
      lens?: SemanticLens | null;
      occurredAt?: number;
      payload?: Record<string, unknown> | null;
    },
  ): SemanticEvent {
    return {
      eventId,
      sessionId,
      type,
      nodeId: normalizeOptionalString(input.nodeId),
      fromNodeId: normalizeOptionalString(input.fromNodeId),
      toNodeId: normalizeOptionalString(input.toNodeId),
      lens: input.lens ?? null,
      occurredAt: Number.isFinite(Number(input.occurredAt)) ? Number(input.occurredAt) : Date.now(),
      payload: input.payload ?? null,
    };
  }

  private normalizeSemanticLens(value: unknown): SemanticLens | null {
    const lens = normalizeString(value);
    return lens === 'assimilation' || lens === 'accommodation' || lens === 'free'
      ? lens
      : null;
  }

  private normalizeSemanticNodeType(value: unknown): BackendSemanticNode['nodeType'] | null {
    const nodeType = normalizeString(value);
    return nodeType === 'real-review-card' || nodeType === 'implicit-knowledge' || nodeType === 'concept'
      ? nodeType
      : null;
  }

  private semanticOk(
    requestId: string,
    sessionId: string,
    payload: Partial<Pick<Extract<BackendSemanticCommandResult, { status: 'ok' }>, 'session' | 'event' | 'events' | 'station' | 'relation' | 'archivedStationId'>>,
  ): BackendSemanticCommandResult {
    this.rebuildSemanticProjectionCache(sessionId);
    return {
      status: 'ok',
      commandId: requestId,
      writerInstanceId: 'backend-worker',
      changed: {
        semanticSessionIds: [sessionId],
      },
      diagnosticEventId: `semantic-command:${requestId}`,
      ...payload,
    };
  }

  private semanticReadOk(
    requestId: string,
    sessionId: string,
    payload: Partial<Pick<Extract<BackendSemanticCommandResult, { status: 'ok' }>, 'session' | 'event' | 'events' | 'station' | 'relation'>>,
  ): BackendSemanticCommandResult {
    return {
      status: 'ok',
      commandId: requestId,
      writerInstanceId: 'backend-worker',
      changed: {
        semanticSessionIds: [sessionId],
      },
      diagnosticEventId: `semantic-command:${requestId}`,
      ...payload,
    };
  }

  private rebuildSemanticProjectionCache(sessionId: string): void {
    const events = this.semanticActivation!.listEvents(sessionId, 5000);
    const stations = this.semanticActivation!.listStations(sessionId);
    const relations = this.semanticActivation!.listRelations();
    this.semanticActivation!.saveProjection(buildSemanticMemoryProjection({
      sessionId,
      events,
      stations,
      relations,
      oldModeManualBoosts: this.readOldNeuralRoamManualBoostEvidence(),
    }));
  }

  private readOldNeuralRoamManualBoostEvidence(): SemanticOldModeManualBoostEvidence[] {
    const state = this.readQueueStateValueSync<Record<string, unknown>>('neuralRoamQueue');
    if (!state || !isRecord(state)) {
      return [];
    }
    const evidence: SemanticOldModeManualBoostEvidence[] = [];
    const orbit = isRecord(state.orbit) ? state.orbit : state;
    this.collectOldNeuralRoamPoolEvidence(evidence, 'orbit-seed', orbit.seedPool);
    this.collectOldNeuralRoamPoolEvidence(evidence, 'orbit-anchor', orbit.anchorPool);
    const hyperspace = isRecord(state.hyperspace) ? state.hyperspace : {};
    this.collectOldNeuralRoamPoolEvidence(evidence, 'hyperspace-source', hyperspace.sourcePool);
    this.collectOldNeuralRoamPoolEvidence(evidence, 'hyperspace-anchor', hyperspace.anchorPool);
    return evidence;
  }

  private readQueueStateValueSync<T>(key: string): T | null {
    if (!this.queueState) {
      return null;
    }
    const values = this.queueState.loadAll();
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] as T : null;
  }

  private collectOldNeuralRoamPoolEvidence(
    evidence: SemanticOldModeManualBoostEvidence[],
    source: SemanticOldModeManualBoostEvidence['source'],
    entries: unknown,
  ): void {
    if (!Array.isArray(entries)) {
      return;
    }
    for (const entry of entries) {
      if (!isRecord(entry)) {
        continue;
      }
      const nodeId = normalizeString(entry.nodeId);
      if (!nodeId) {
        continue;
      }
      evidence.push({
        nodeId,
        source,
        weight: this.oldNeuralRoamEvidenceWeight(source, entry),
      });
    }
  }

  private oldNeuralRoamEvidenceWeight(
    source: SemanticOldModeManualBoostEvidence['source'],
    entry: Record<string, unknown>,
  ): number {
    const base = source === 'orbit-anchor' || source === 'hyperspace-anchor' ? 0.32 : 0.24;
    const priority = Number(entry.priority);
    const priorityBoost = Number.isFinite(priority) ? this.clamp01(priority) * 0.18 : 0;
    return this.clamp01(base + priorityBoost);
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  async applyXiuyuanSyncPlan(input: WorkerXiuyuanSyncApplyInput): Promise<{
    blockIds: string[];
    cardIds: string[];
  }> {
    await this.init();
    return this.createXiuyuanSyncRuntime().applyXiuyuanSyncPlan(input);
  }

  async readXiuyuanSyncLocalFacts(): Promise<BackendXiuyuanSyncLocalFacts> {
    await this.init();
    return this.createXiuyuanSyncRuntime().readXiuyuanSyncLocalFacts();
  }

  private createXiuyuanSyncRuntime(): WorkerXiuyuanSyncRuntime {
    return new WorkerXiuyuanSyncRuntime({
      runtime: this.runtime,
      repository: this.repository!,
      now: Date.now,
    });
  }
  private semanticFailed(
    requestId: string,
    unavailableReason: Extract<BackendSemanticCommandResult, { status: 'failed' }>['unavailableReason'],
    message: string,
  ): BackendSemanticCommandResult {
    return {
      status: 'failed',
      unavailableReason,
      message,
      diagnosticEventId: `semantic-command-failed:${requestId}`,
    };
  }

  async runTransaction<T>(
    label: string,
    writer: (db: Database) => T | Promise<T>,
  ): Promise<T> {
    await this.init();
    return this.runtime.runTransaction(label, writer);
  }

  async write<T>(writer: (db: Database) => T | Promise<T>): Promise<T> {
    await this.init();
    return this.runtime.write(writer);
  }

  getOne<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T | null {
    return this.runtime.getOne<T>(sql, params);
  }

  getAll<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T[] {
    return this.runtime.getAll<T>(sql, params);
  }

  run(sql: string, params?: SqlParams): void {
    this.runtime.run(sql, params);
  }

  dispose(): void {
    void this.kernelTransactionRuntime.persistSnapshots();
    this.runtime.dispose();
    this.repository = null;
    this.initialized = false;
    this.appliedReviewFeedbackJournalEntryIds.clear();
  }
}

const CARD_PROJECTION_SOURCE_PREVIEW_LIMIT = 80;

interface ReviewEventProjectionRow {
  id: string;
  cardId: string;
  attemptId: string | null;
  rating: number | null;
  reviewedAt: number;
  commitIdempotencyKey: string | null;
  year: number;
  month: number;
  eventType: string;
  payloadJson: string;
  msgpackRef: string;
  truthHash: string;
  truthSchemaVersion: number;
  projectionGeneration: number;
}

interface CardProjectionRow {
  id: string;
  blockId: string;
  xiuyuanId: string | null;
  type: string;
  state: number;
  due: number;
  priority: number;
  schedulerType: string | null;
  updatedAt: number;
  deckId: string | null;
  rootId: string | null;
  contentText: string | null;
  tags: string | null;
  suspended: number;
  lapses: number | null;
  reps: number | null;
  lastReview: number | null;
  createdAt: number | null;
  scheduledDays: number | null;
  stability: number | null;
  difficulty: number | null;
  aFactor: number | null;
  searchText: string | null;
  cardTypeMarker: string | null;
  sourceExists: number;
  sourceCheckedAt: number;
  sourceMissingAt: number | null;
  payloadJson: string;
  dtoJson: string | null;
  msgpackRef: string;
  truthHash: string;
  truthSchemaVersion: number;
  projectionGeneration: number;
  sourceHash: string | null;
  card: FSRSCard;
}

function isReviewEventTruthRecord(record: MessagePackTruthRecord): record is MessagePackTruthRecord & Record<string, unknown> {
  return isRecord(record)
    && record.family === 'review-events'
    && Number(record.schemaVersion) >= 1;
}

function isCardMemoryFactTruthRecord(record: MessagePackTruthRecord): record is MessagePackTruthRecord & Record<string, unknown> {
  return isRecord(record)
    && record.family === 'card-memory-facts'
    && Number(record.schemaVersion) >= 1
    && (
      record.type === 'card-memory.created.v1'
      || record.type === 'card-memory.updated.v1'
      || record.type === 'source-binding.created.v1'
      || record.type === 'card-face.created.v1'
      || record.type === 'card-memory.snapshot-imported'
      || record.type === 'source-binding.snapshot-imported'
      || record.type === 'card-memory.tombstone-imported'
    );
}

function isReviewFeedbackV2CardTruthRecord(record: MessagePackTruthRecord): record is MessagePackTruthRecord & Record<string, unknown> {
  return isRecord(record)
    && record.family === 'review-events'
    && record.type === 'review.feedback.v2'
    && isRecord(record.afterCard);
}

function readTruthRecordSourceBlockId(record: Record<string, unknown>): string | null {
  const source = isRecord(record.source) ? record.source : {};
  return readRecordString(source, ['blockId', 'sourceBlockId'])
    ?? readRecordString(record, ['blockId', 'sourceBlockId']);
}

function buildReviewEventProjectionRow(input: {
  record: MessagePackTruthRecord & Record<string, unknown>;
  request: WorkerStorageProjectionRebuildRequest;
  projectionGeneration: number;
}): ReviewEventProjectionRow | null {
  const source = isRecord(input.record.source) ? input.record.source : {};
  const review = isRecord(input.record.review) ? input.record.review : {};
  const queue = isRecord(input.record.queue) ? input.record.queue : {};
  const cardId = readRecordString(source, ['cardId'])
    ?? readRecordString(input.record, ['cardId']);
  const idempotencyKey = readRecordString(input.record, ['idempotencyKey']);
  if (!cardId || !idempotencyKey) {
    return null;
  }
  const reviewedAt = readRecordNumber(review, ['reviewedAt'])
    ?? readRecordNumber(input.record, ['reviewedAt', 'logicalTime', 'recordedAt'])
    ?? Date.now();
  const eventId = readRecordString(input.record, ['eventId', 'journalEntryId', 'id'])
    ?? `review-truth:${idempotencyKey}`;
  const rating = readRecordNumber(review, ['rating'])
    ?? readRecordNumber(input.record, ['rating']);
  const reviewedDate = new Date(reviewedAt);
  const sourceBlockId = readRecordString(source, ['blockId', 'sourceBlockId'])
    ?? readRecordString(input.record, ['blockId', 'sourceBlockId']);
  const segmentPath = input.request.truthManifest.segments[0]?.path
    ?? input.request.truthManifest.path
    ?? '';
  const msgpackRef = {
    family: 'review-events',
    deviceId: input.request.deviceId,
    generationId: input.request.generationId,
    schemaVersion: input.request.schemaVersion,
    segmentPath,
    recordId: eventId,
    idempotencyKey,
  };
  const payload = {
    schemaVersion: 1,
    projectionKind: 'messagepack-review-event-index',
    eventId,
    cardId,
    attemptId: readRecordString(input.record, ['attemptId']),
    rating,
    reviewedAt,
    commitIdempotencyKey: idempotencyKey,
    sourceBlockId,
    reviewAction: readRecordString(review, ['action']),
    queueType: readRecordString(queue, ['queueType']) ?? readRecordString(input.record, ['queueType']),
    queueMode: readRecordString(queue, ['queueMode']) ?? readRecordString(input.record, ['queueMode']),
    commitPolicy: readRecordString(queue, ['commitPolicy']) ?? readRecordString(input.record, ['commitPolicy']),
  };
  return {
    id: eventId,
    cardId,
    attemptId: payload.attemptId,
    rating: rating === null ? null : Math.max(1, Math.min(4, Math.floor(rating))),
    reviewedAt,
    commitIdempotencyKey: idempotencyKey,
    year: reviewedDate.getFullYear(),
    month: reviewedDate.getMonth() + 1,
    eventType: 'review-v2',
    payloadJson: JSON.stringify(payload),
    msgpackRef: JSON.stringify(msgpackRef),
    truthHash: hashString(JSON.stringify(input.record)),
    truthSchemaVersion: input.request.schemaVersion,
    projectionGeneration: input.projectionGeneration,
  };
}

function buildCardProjectionRows(input: {
  request: WorkerStorageProjectionRebuildRequest;
  records: Array<MessagePackTruthRecord & Record<string, unknown>>;
  projectionGeneration: number;
}): CardProjectionRow[] {
  const states = new Map<string, {
    cardId: string;
    blockId: string;
    sourceBlockId: string | null;
    xiuyuanId: string | null;
    cardFaceId: string | null;
    schedulerOwner: string | null;
    memoryHash: string | null;
    sourceHash: string | null;
    lineage: Record<string, unknown>;
    lastRecord: MessagePackTruthRecord & Record<string, unknown>;
    lastLogicalTime: number;
  }>();
  for (const record of input.records) {
    const source = isRecord(record.source) ? record.source : {};
    const memory = isRecord(record.memory) ? record.memory : {};
    const reviewAfterCard = record.family === 'review-events'
      && record.type === 'review.feedback.v2'
      && isRecord(record.afterCard)
      ? record.afterCard
      : null;
    const scheduler = isRecord(record.scheduler) ? record.scheduler : {};
    const lineage = reviewAfterCard ?? (isRecord(memory.lineage) ? memory.lineage : {});
    const cardId = readRecordString(source, ['cardId'])
      ?? readRecordString(record, ['cardId']);
    const blockId = readRecordString(source, ['blockId', 'sourceBlockId'])
      ?? readRecordString(record, ['blockId', 'sourceBlockId']);
    if (
      !cardId
      || !blockId
      || record.type === 'card-memory.tombstoned.v1'
      || record.type === 'card-memory.tombstone-imported'
    ) {
      continue;
    }
    const logicalTime = readRecordNumber(record, ['logicalTime', 'recordedAt'], 0) ?? 0;
    const current = states.get(cardId);
    const nextLineage = {
      ...(current?.lineage ?? {}),
      ...lineage,
    };
    states.set(cardId, {
      cardId,
      blockId,
      sourceBlockId: readRecordString(source, ['sourceBlockId']) ?? current?.sourceBlockId ?? blockId,
      xiuyuanId: readRecordString(source, ['xiuyuanId'])
        ?? readRecordString(lineage, ['xiuyuanId', 'xiuyuanID'])
        ?? current?.xiuyuanId
        ?? null,
      cardFaceId: readRecordString(source, ['cardFaceId'])
        ?? readRecordString(lineage, ['cardFaceId'])
        ?? current?.cardFaceId
        ?? null,
      schedulerOwner: readRecordString(memory, ['schedulerOwner'])
        ?? readRecordString(scheduler, ['schedulerType'])
        ?? current?.schedulerOwner
        ?? null,
      memoryHash: readRecordString(memory, ['memoryHash'])
        ?? current?.memoryHash
        ?? null,
      sourceHash: readRecordString(source, ['sourceHash'])
        ?? readRecordString(lineage, ['sourceHash'])
        ?? current?.sourceHash
        ?? null,
      lineage: nextLineage,
      lastRecord: logicalTime >= (current?.lastLogicalTime ?? -1) ? record : current?.lastRecord ?? record,
      lastLogicalTime: Math.max(logicalTime, current?.lastLogicalTime ?? 0),
    });
  }

  const rows: CardProjectionRow[] = [];
  for (const state of states.values()) {
    const sourceRead = input.request.sourceReads.find((read) => read.blockId === state.blockId);
    if (sourceRead && !sourceRead.found) {
      continue;
    }
    const sourceData = isRecord(sourceRead?.data) ? sourceRead.data : {};
    const sourceContent = readRecordString(sourceData, ['content', 'markdown', 'kramdown', 'text']) ?? '';
    const sourcePreview = trimProjectionText(sourceContent, CARD_PROJECTION_SOURCE_PREVIEW_LIMIT);
    const rootId = readRecordString(sourceData, ['root_id', 'rootId']);
    const deckId = readRecordString(sourceData, ['deck_id', 'deckId', 'parent_id', 'parentId']);
    const xiuyuanId = state.xiuyuanId ?? readAllowlistedXiuyuanBinding(sourceData);
    const cardTypeMarker = readRecordString(state.lineage, ['cardTypeMarker'])
      ?? readAllowlistedCardTypeMarker(sourceData);
    const card = buildProjectionCard({
      state: {
        ...state,
        xiuyuanId,
        lineage: {
          ...state.lineage,
          ...(cardTypeMarker ? { cardTypeMarker } : {}),
        },
      },
      sourcePreview,
      rootId,
      deckId,
    });
    const sourceHash = state.sourceHash ?? (sourceContent ? hashString(sourceContent) : null);
    const msgpackRef = {
      family: 'card-memory-facts',
      deviceId: input.request.deviceId,
      generationId: input.request.generationId,
      schemaVersion: input.request.schemaVersion,
      segmentPath: input.request.truthManifest.segments.find((segment) => segment.family === 'card-memory-facts')?.path
        ?? input.request.truthManifest.segments[0]?.path
        ?? input.request.truthManifest.path
        ?? '',
      recordId: readRecordString(state.lastRecord, ['eventId', 'journalEntryId', 'id']),
      idempotencyKey: readRecordString(state.lastRecord, ['idempotencyKey']),
    };
    const payload = {
      schemaVersion: 1,
      projectionKind: 'messagepack-card-projection',
      cardId: state.cardId,
      blockId: state.blockId,
      xiuyuanId: state.xiuyuanId,
      cardFaceId: state.cardFaceId,
      schedulerOwner: state.schedulerOwner,
      memoryHash: state.memoryHash,
      sourceHash,
      sourcePreview,
      rootId,
      deckId,
      lineage: pickSkinnyLineage(state.lineage),
    };
    rows.push({
      id: card.id,
      blockId: card.blockId,
      xiuyuanId,
      type: card.type,
      state: Number(card.state) || 0,
      due: Number(card.due) || 0,
      priority: Number(card.priority) || 0,
      schedulerType: card.schedulerType ?? null,
      updatedAt: Number(card.updatedAt) || Number(state.lastRecord.recordedAt) || Date.now(),
      deckId,
      rootId,
      contentText: sourcePreview || null,
      tags: encodeProjectionTags(card.tags),
      suspended: card.state === CardState.Suspended ? 1 : 0,
      lapses: nullableNumber(card.lapses),
      reps: nullableNumber(card.reps),
      lastReview: nullableNumber(card.lastReview),
      createdAt: nullableNumber(card.createdAt),
      scheduledDays: nullableNumber(card.scheduledDays),
      stability: nullableNumber(card.stability),
      difficulty: nullableNumber(card.difficulty),
      aFactor: nullableNumber(card.aFactor),
      searchText: normalizeProjectionSearchText(sourcePreview),
      cardTypeMarker: cardTypeMarker ?? card.cardTypeMarker ?? null,
      sourceExists: 1,
      sourceCheckedAt: Date.now(),
      sourceMissingAt: null,
      payloadJson: JSON.stringify(payload),
      dtoJson: null,
      msgpackRef: JSON.stringify(msgpackRef),
      truthHash: hashString(JSON.stringify(state.lastRecord)),
      truthSchemaVersion: input.request.schemaVersion,
      projectionGeneration: input.projectionGeneration,
      sourceHash,
      card,
    });
  }
  return rows;
}

function buildProjectionCard(input: {
  state: {
    cardId: string;
    blockId: string;
    xiuyuanId: string | null;
    schedulerOwner: string | null;
    lineage: Record<string, unknown>;
    lastRecord: Record<string, unknown>;
  };
  sourcePreview: string;
  rootId: string | null;
  deckId: string | null;
}): FSRSCard {
  const lineage = input.state.lineage;
  const now = readRecordNumber(input.state.lastRecord, ['recordedAt', 'logicalTime'], Date.now()) ?? Date.now();
  const type = normalizeCardType(readRecordString(lineage, ['type', 'cardType']), CardType.Item);
  const state = normalizeCardState(readRecordNumber(lineage, ['state'], CardState.New), CardState.New);
  const card: FSRSCard = {
    id: input.state.cardId,
    xiuyuanID: input.state.xiuyuanId ?? '',
    blockId: input.state.blockId,
    due: readRecordNumber(lineage, ['due'], now) ?? now,
    stability: readRecordNumber(lineage, ['stability'], 0) ?? 0,
    difficulty: readRecordNumber(lineage, ['difficulty'], 0) ?? 0,
    reps: readRecordNumber(lineage, ['reps'], 0) ?? 0,
    lapses: readRecordNumber(lineage, ['lapses'], 0) ?? 0,
    state,
    lastReview: readRecordNumber(lineage, ['lastReview', 'last_review'], 0) ?? 0,
    elapsedDays: readRecordNumber(lineage, ['elapsedDays', 'elapsed_days'], 0) ?? 0,
    scheduledDays: readRecordNumber(lineage, ['scheduledDays', 'scheduled_days'], 0) ?? 0,
    priority: readRecordNumber(lineage, ['priority'], 50) ?? 50,
    type,
    tags: readStringArray(Array.isArray(lineage.tags) ? lineage.tags : []),
    neuralRoamSeed: false,
    leechCount: readRecordNumber(lineage, ['leechCount', 'leech_count'], 0) ?? 0,
    isLeech: lineage.isLeech === true,
    skipped: lineage.skipped === true,
    createdAt: readRecordNumber(lineage, ['createdAt', 'created_at'], now) ?? now,
    updatedAt: readRecordNumber(lineage, ['updatedAt', 'updated_at'], now) ?? now,
    schedulerType: readRecordString(lineage, ['schedulerType', 'scheduler_type'])
      ?? input.state.schedulerOwner
      ?? undefined,
    meta: {
      projectionKind: 'messagepack-card-projection',
      ...(input.deckId ? { deckId: input.deckId } : {}),
      ...(input.rootId ? { rootId: input.rootId } : {}),
      ...(input.sourcePreview ? { sourcePreview: input.sourcePreview } : {}),
    },
  };
  const cardTypeMarker = readRecordString(lineage, ['cardTypeMarker']);
  if (cardTypeMarker === 'concept' || cardTypeMarker === 'descriptor') {
    card.cardTypeMarker = cardTypeMarker;
  }
  const faceKey = isRecord(lineage.faceKey) ? lineage.faceKey : null;
  if (faceKey) {
    const ruleId = readRecordString(faceKey, ['ruleId']);
    if (ruleId) {
      card.faceKey = {
        ruleId,
        ...(readRecordNumber(faceKey, ['faceIndex']) !== null
          ? { faceIndex: readRecordNumber(faceKey, ['faceIndex'])! }
          : {}),
      };
    }
  }
  return canonicalizeSchedulingState(card, {
    source: 'sql-projection-rebuild',
    mode: 'repair-external',
  }).card;
}

function readAllowlistedXiuyuanBinding(sourceData: Record<string, unknown>): string | null {
  const attrs = readSourceAttrs(sourceData);
  return readRecordString(attrs, ['custom-xiuyuan-id', 'custom-fsrs-xiuyuan-id']);
}

function readAllowlistedCardTypeMarker(sourceData: Record<string, unknown>): string | null {
  const attrs = readSourceAttrs(sourceData);
  const marker = readRecordString(attrs, ['custom-fsrs-card-type', 'custom-card-type']);
  return marker === 'concept' || marker === 'descriptor' ? marker : null;
}

function readSourceAttrs(sourceData: Record<string, unknown>): Record<string, unknown> {
  const candidates = [
    sourceData.attrs,
    sourceData.ial,
    sourceData.attributes,
  ];
  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }
  return sourceData;
}

function pickSkinnyLineage(lineage: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'type',
    'state',
    'due',
    'priority',
    'createdAt',
    'updatedAt',
    'schedulerType',
    'cardTypeMarker',
    'faceKey',
  ];
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (lineage[key] !== undefined) {
      result[key] = lineage[key];
    }
  }
  return result;
}

function normalizeCardType(value: string | null, fallback: CardType): CardType {
  if (value && Object.values(CardType).includes(value as CardType)) {
    return value as CardType;
  }
  return fallback;
}

function normalizeCardState(value: number | null, fallback: CardState): CardState {
  const normalized = Math.floor(Number(value));
  if ([
    CardState.New,
    CardState.Learning,
    CardState.Review,
    CardState.Relearning,
    CardState.Suspended,
  ].includes(normalized as CardState)) {
    return normalized as CardState;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function trimProjectionText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? normalized.slice(0, limit) : normalized;
}

function normalizeProjectionSearchText(value: string): string | null {
  const normalized = trimProjectionText(value, CARD_PROJECTION_SOURCE_PREVIEW_LIMIT).toLowerCase();
  return normalized || null;
}

function encodeProjectionTags(tags: string[]): string | null {
  if (tags.length === 0) {
    return null;
  }
  return `\n${Array.from(new Set(tags)).sort().join('\n')}\n`;
}

function hashString(value: string): string {
  return hashBytes(new TextEncoder().encode(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function storageError(code: BackendStorageErrorCode, message: string): Error & { code: BackendStorageErrorCode } {
  const error = new Error(`${code}: ${message}`) as Error & { code: BackendStorageErrorCode };
  error.name = 'BackendStorageError';
  error.code = code;
  return error;
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function readFiniteRepairNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readNonNegativeRepairInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
}

function readCardStateRepairValue(value: unknown): CardState | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  switch (Math.floor(numeric)) {
    case CardState.New:
    case CardState.Learning:
    case CardState.Review:
    case CardState.Relearning:
    case CardState.Suspended:
      return Math.floor(numeric) as CardState;
    default:
      return null;
  }
}

function readCardTypeRepairValue(value: unknown): CardType | null {
  switch (String(value || '').trim()) {
    case CardType.Item:
    case CardType.Topic:
    case CardType.Concept:
    case CardType.Descriptor:
    case CardType.Incremental:
    case CardType.Webpage:
      return String(value).trim() as CardType;
    default:
      return null;
  }
}
