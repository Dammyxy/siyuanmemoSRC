import type { Database, ParamsObject, SqlValue } from 'sql.js';
import { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import { SqlQueueStateRepository } from '@/infrastructure/persistence/sqlite/SqlQueueStateRepository';
import { SqlSemanticActivationRepository } from '@/infrastructure/persistence/sqlite/SqlSemanticActivationRepository';
import type { StructuredCardQuery } from '@/types/card-query';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type { QueueProjectionGeneration } from '@/application/ports/QueueProjectionPort';
import type {
  BrowserDeckCardPageResult,
  BrowserDeckPageRequest,
  BrowserDeckSnapshotQuery,
} from '@/application/queries/browser/browser-deck-query';
import type {
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendKernelTransactionAction,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionRequeueResult,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
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
} from '../../packages/contracts/src/backend-rpc';
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
import type { SqliteConflictDatabaseSource, SqlitePersistenceBridge } from './SqlitePersistenceBridge';
import { createLogger } from '@/utils/logger';
import type { DoOperation } from '@/core/infrastructure/websocket/transaction-types';
import { AutoCardDecisionService } from './AutoCardDecisionService';
import { SemanticSessionReadModelBuilder } from '../semantic/SemanticSessionReadModelBuilder';
import { WorkerReviewFeedbackRuntime } from '../review/WorkerReviewFeedbackRuntime';
import {
  resolveProjectionQueueType,
  WorkerQueueProjectionRuntime,
} from '../queue-projection/WorkerQueueProjectionRuntime';
import { SourceExistenceProjectionInvalidator } from '../queue-projection/SourceExistenceProjectionInvalidator';

type SqlParams = SqlValue[] | ParamsObject;
const logger = createLogger('WorkerSqliteDatabaseService');
const KERNEL_INGEST_QUEUE_SNAPSHOT_FILE = 'kernel-transaction-ingest.snapshot.json';
const KERNEL_INGEST_QUEUE_SNAPSHOT_VERSION = 1;
const KERNEL_ACTION_QUEUE_SNAPSHOT_FILE = 'kernel-transaction-actions.snapshot.json';
const KERNEL_ACTION_QUEUE_SNAPSHOT_VERSION = 1;

type SqliteFileServiceAdapter = {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
  readBinary(fileName: string): Promise<Uint8Array | null>;
  writeBinary(fileName: string, bytes: Uint8Array): Promise<void>;
  readSyncConflictDatabaseSources(): Promise<SqliteConflictDatabaseSource[]>;
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

interface ConflictSummaryReviewRow {
  count: number;
  latest: number | null;
}

interface ConflictSummaryCardRow {
  count: number;
  latestUpdated: number | null;
  latestReview: number | null;
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

function createSqliteFileServiceAdapter(bridge: SqlitePersistenceBridge): SqliteFileServiceAdapter {
  return {
    readJSON: async <T>(fileName: string): Promise<T | null> => {
      if (!bridge.readJSON) {
        return null;
      }
      return bridge.readJSON<T>(fileName);
    },
    writeJSON: async (fileName: string, data: unknown): Promise<void> => {
      if (!bridge.writeJSON) {
        throw new Error(`JSON persistence is not available for ${fileName}`);
      }
      await bridge.writeJSON(fileName, data);
    },
    readBinary: (fileName: string) => bridge.readBinary(fileName),
    writeBinary: (fileName: string, bytes: Uint8Array) => bridge.writeBinary(fileName, bytes),
    readSyncConflictDatabaseSources: async () => {
      if (!bridge.readSyncConflictDatabaseSources) {
        return [];
      }
      return bridge.readSyncConflictDatabaseSources();
    },
  };
}

function createReadonlyConflictFileService(bytes: Uint8Array): SqliteFileServiceAdapter {
  return {
    readJSON: async <T>(): Promise<T | null> => null,
    writeJSON: async (): Promise<void> => undefined,
    readBinary: async (): Promise<Uint8Array> => new Uint8Array(bytes),
    writeBinary: async (): Promise<void> => undefined,
    readSyncConflictDatabaseSources: async (): Promise<SqliteConflictDatabaseSource[]> => [],
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

function positiveNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function compareReviewSyncCardFreshness(
  local: Pick<ConflictCardRow, 'updated_at' | 'last_review' | 'reps'>,
  incoming: Pick<ConflictCardRow, 'updated_at' | 'last_review' | 'reps'>,
): number {
  const localReview = positiveNumber(local.last_review);
  const incomingReview = positiveNumber(incoming.last_review);
  if (localReview !== incomingReview) {
    return incomingReview - localReview;
  }

  const localUpdated = positiveNumber(local.updated_at);
  const incomingUpdated = positiveNumber(incoming.updated_at);
  if (localUpdated !== incomingUpdated) {
    return incomingUpdated - localUpdated;
  }

  const localReps = positiveNumber(local.reps);
  const incomingReps = positiveNumber(incoming.reps);
  if (localReps !== incomingReps) {
    return incomingReps - localReps;
  }

  return 0;
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

function buildReviewCardDivergenceRecords(
  rows: ReviewCardDivergenceEvidenceWithCardRow[],
): BackendReviewSyncDivergenceAuditResult['records'] {
  const records: BackendReviewSyncDivergenceAuditResult['records'] = [];
  for (const row of rows) {
    const cardId = String(row.card_id || '').trim();
    if (!cardId) {
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

export class WorkerSqliteDatabaseService {
  private readonly fileService: SqliteFileServiceAdapter;
  private readonly runtime: RuntimeSqliteDatabaseService;
  private readonly autoCardDecisionService = new AutoCardDecisionService();
  private repository: SqlUnifiedStorageRepository | null = null;
  private queueProjection: SqlQueueProjectionRepository | null = null;
  private queueState: SqlQueueStateRepository | null = null;
  private semanticActivation: SqlSemanticActivationRepository | null = null;
  private initialized = false;
  private lastObservedPersistedHash: string | null = null;
  private readonly semanticCommandResultsByIdempotencyKey = new Map<string, BackendSemanticCommandResult>();
  private readonly kernelTransactionQueue: Array<{
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    idempotencyKey: string;
    acceptedAt: number;
  }> = [];
  private readonly recentKernelTransactionKeys = new Map<string, number>();
  private readonly kernelTransactionActions: BackendKernelTransactionAction[] = [];
  private kernelQueuedTransactions = 0;
  private kernelAcceptedTotal = 0;
  private kernelDeduplicatedTotal = 0;
  private kernelRejectedTotal = 0;
  private kernelDrainedTotal = 0;
  private kernelActionEnqueuedTotal = 0;
  private kernelActionDequeuedTotal = 0;
  private kernelActionRequeuedTotal = 0;
  private kernelActionRejectedTotal = 0;
  private kernelRemoveActionQueuedTotal = 0;
  private kernelUpsertActionQueuedTotal = 0;
  private kernelAutoCardActionQueuedTotal = 0;
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
  private lastKernelAcceptedAt: number | null = null;
  private lastKernelDrainAt: number | null = null;
  private readonly maxKernelTransactionQueueLength: number;
  private readonly maxKernelQueuedTransactions: number;
  private readonly maxKernelActionQueueLength: number;
  private readonly kernelTransactionDedupeTtlMs: number;

  constructor(
    bridge: SqlitePersistenceBridge,
    private readonly dbFile = SQLITE_DB_FILE,
    options?: {
      maxKernelTransactionQueueLength?: number;
      maxKernelQueuedTransactions?: number;
      maxKernelActionQueueLength?: number;
      kernelTransactionDedupeTtlMs?: number;
    },
  ) {
    this.fileService = createSqliteFileServiceAdapter(bridge);
    this.runtime = new RuntimeSqliteDatabaseService(this.fileService, dbFile);
    this.maxKernelTransactionQueueLength = Math.max(
      1,
      Math.floor(Number(options?.maxKernelTransactionQueueLength ?? 256)),
    );
    this.maxKernelQueuedTransactions = Math.max(
      1,
      Math.floor(Number(options?.maxKernelQueuedTransactions ?? 8_192)),
    );
    this.maxKernelActionQueueLength = Math.max(
      8,
      Math.floor(Number(options?.maxKernelActionQueueLength ?? 4_096)),
    );
    this.kernelTransactionDedupeTtlMs = Math.max(
      5_000,
      Math.floor(Number(options?.kernelTransactionDedupeTtlMs ?? 120_000)),
    );
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.runtime.init();
    this.repository = new SqlUnifiedStorageRepository(this.runtime);
    this.queueProjection = new SqlQueueProjectionRepository(this.runtime);
    this.queueState = new SqlQueueStateRepository(this.runtime);
    this.semanticActivation = new SqlSemanticActivationRepository(this.runtime);
    await this.restoreKernelIngestQueueSnapshot();
    await this.restoreKernelActionQueueSnapshot();
    this.initialized = true;
    await this.rememberPersistedHash();
  }

  async load(): Promise<{ ok: true; initialized: true; dbFile: string }> {
    await this.init();
    return {
      ok: true,
      initialized: true,
      dbFile: this.dbFile,
    };
  }

  async reloadFromDisk(): Promise<BackendSyncConflictReloadResult> {
    this.queueState = null;
    this.semanticActivation = null;
    this.runtime.dispose();
    this.initialized = false;
    await this.init();
    return {
      ok: true,
      reloaded: true,
      dbFile: this.dbFile,
    };
  }

  async persist(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    await this.init();
    await this.runtime.persist();
    await this.rememberPersistedHash();
    return {
      ok: true,
      persisted: true,
      dbFile: this.dbFile,
    };
  }

  async mergeExternalDatabaseIfChanged(mergedAt = Date.now()): Promise<{
    ok: true;
    checked: true;
    changed: boolean;
    mergedReviewEvents: number;
    mergedCards: number;
    ignoredReviewEvents: number;
    ignoredCards: number;
    sourceIds: string[];
    skippedSources: Array<{ sourceId: string; reason: string }>;
    diagnostics: BackendSyncConflictMergeResult['diagnostics'];
  }> {
    await this.init();
    const sources: BackendSyncConflictMergeRequest['sources'] = [];
    const bytes = await this.fileService.readBinary(this.dbFile);

    if (bytes && bytes.byteLength > 0) {
      const persistedHash = hashBytes(bytes);
      if (persistedHash !== this.lastObservedPersistedHash) {
        const currentHash = await this.runtime.read((db) => hashBytes(db.export()));
        if (persistedHash === currentHash) {
          this.lastObservedPersistedHash = persistedHash;
        } else {
          sources.push({ sourceId: 'siyuan-sync:siyuanmemo.db', bytes });
        }
      }
    }

    const conflictSources = await this.fileService.readSyncConflictDatabaseSources();
    for (const source of conflictSources) {
      if (source.bytes.byteLength > 0) {
        sources.push(source);
      }
    }

    if (sources.length === 0) {
      return {
        ok: true,
        checked: true,
        changed: false,
        mergedReviewEvents: 0,
        mergedCards: 0,
        ignoredReviewEvents: 0,
        ignoredCards: 0,
        sourceIds: [],
        skippedSources: [],
        diagnostics: {
          reviewCardDivergences: [],
        },
      };
    }

    const result = await this.mergeSyncConflictDatabases({
      mergedAt,
      sources,
    });
    if (
      result.skippedSources.length === 0
      && (result.mergedReviewEvents > 0 || result.mergedCards > 0)
    ) {
      await this.runtime.persist();
      await this.rememberPersistedHash();
    }

    return {
      ok: true,
      checked: true,
      changed: result.mergedReviewEvents > 0 || result.mergedCards > 0,
      mergedReviewEvents: result.mergedReviewEvents,
      mergedCards: result.mergedCards,
      ignoredReviewEvents: result.ignoredReviewEvents,
      ignoredCards: result.ignoredCards,
      sourceIds: sources.map((source) => String(source.sourceId || '').trim() || 'unknown'),
      skippedSources: result.skippedSources,
      diagnostics: result.diagnostics,
    };
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
        'SELECT COUNT(*) AS count, MAX(reviewed_at) AS latest FROM review_events',
      );
      const card = conflictRuntime.getOne<ConflictSummaryCardRow>(
        'SELECT COUNT(*) AS count, MAX(updated_at) AS latestUpdated, MAX(last_review) AS latestReview FROM cards',
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
      ingest: {
        queueLength: this.kernelTransactionQueue.length,
        queuedTransactions: this.kernelQueuedTransactions,
        maxQueueLength: this.maxKernelTransactionQueueLength,
        acceptedTotal: this.kernelAcceptedTotal,
        deduplicatedTotal: this.kernelDeduplicatedTotal,
        rejectedTotal: this.kernelRejectedTotal,
        drainedTotal: this.kernelDrainedTotal,
        actionQueueLength: this.kernelTransactionActions.length,
        actionEnqueuedTotal: this.kernelActionEnqueuedTotal,
        actionDequeuedTotal: this.kernelActionDequeuedTotal,
        actionRequeuedTotal: this.kernelActionRequeuedTotal,
        actionRejectedTotal: this.kernelActionRejectedTotal,
        removeActionQueuedTotal: this.kernelRemoveActionQueuedTotal,
        upsertActionQueuedTotal: this.kernelUpsertActionQueuedTotal,
        autoCardActionQueuedTotal: this.kernelAutoCardActionQueuedTotal,
        maxActionQueueLength: this.maxKernelActionQueueLength,
        lastAcceptedAt: this.lastKernelAcceptedAt,
        lastDrainAt: this.lastKernelDrainAt,
      },
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

  private async restoreKernelActionQueueSnapshot(): Promise<void> {
    try {
      const snapshot = await this.fileService.readJSON<{
        version?: number;
        actions?: unknown[];
        metrics?: {
          actionEnqueuedTotal?: number;
          actionDequeuedTotal?: number;
          actionRequeuedTotal?: number;
          actionRejectedTotal?: number;
          removeActionQueuedTotal?: number;
          upsertActionQueuedTotal?: number;
          autoCardActionQueuedTotal?: number;
        };
      }>(KERNEL_ACTION_QUEUE_SNAPSHOT_FILE);
      if (!snapshot || snapshot.version !== KERNEL_ACTION_QUEUE_SNAPSHOT_VERSION) {
        return;
      }
      const normalized = this.normalizeKernelActions(snapshot.actions || []);
      if (normalized.length > 0) {
        const restored = normalized.slice(0, this.maxKernelActionQueueLength);
        this.kernelTransactionActions.push(...restored);
      }
      const metrics = snapshot.metrics;
      if (metrics && typeof metrics === 'object') {
        this.kernelActionEnqueuedTotal = Math.max(
          this.kernelActionEnqueuedTotal,
          Math.max(0, Math.floor(Number(metrics.actionEnqueuedTotal || 0))),
        );
        this.kernelActionDequeuedTotal = Math.max(
          this.kernelActionDequeuedTotal,
          Math.max(0, Math.floor(Number(metrics.actionDequeuedTotal || 0))),
        );
        this.kernelActionRequeuedTotal = Math.max(
          this.kernelActionRequeuedTotal,
          Math.max(0, Math.floor(Number(metrics.actionRequeuedTotal || 0))),
        );
        this.kernelActionRejectedTotal = Math.max(
          this.kernelActionRejectedTotal,
          Math.max(0, Math.floor(Number(metrics.actionRejectedTotal || 0))),
        );
        this.kernelRemoveActionQueuedTotal = Math.max(
          this.kernelRemoveActionQueuedTotal,
          Math.max(0, Math.floor(Number(metrics.removeActionQueuedTotal || 0))),
        );
        this.kernelUpsertActionQueuedTotal = Math.max(
          this.kernelUpsertActionQueuedTotal,
          Math.max(0, Math.floor(Number(metrics.upsertActionQueuedTotal || 0))),
        );
        this.kernelAutoCardActionQueuedTotal = Math.max(
          this.kernelAutoCardActionQueuedTotal,
          Math.max(0, Math.floor(Number(metrics.autoCardActionQueuedTotal || 0))),
        );
      }
    } catch (error) {
      logger.warn('Failed to restore kernel action queue snapshot', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private async restoreKernelIngestQueueSnapshot(): Promise<void> {
    try {
      const snapshot = await this.fileService.readJSON<{
        version?: number;
        queue?: unknown[];
        recentKeys?: Array<{ key?: unknown; expiresAt?: unknown }>;
        metrics?: {
          acceptedTotal?: number;
          deduplicatedTotal?: number;
          rejectedTotal?: number;
          drainedTotal?: number;
          lastAcceptedAt?: number | null;
          lastDrainAt?: number | null;
        };
      }>(KERNEL_INGEST_QUEUE_SNAPSHOT_FILE);
      if (!snapshot || snapshot.version !== KERNEL_INGEST_QUEUE_SNAPSHOT_VERSION) {
        return;
      }
      const now = Date.now();
      const normalizedQueue = this.normalizeKernelTransactionQueue(snapshot.queue || []);
      let queuedTransactions = 0;
      for (const entry of normalizedQueue) {
        if (this.kernelTransactionQueue.length >= this.maxKernelTransactionQueueLength) {
          break;
        }
        const nextCount = entry.transactions.length;
        if (nextCount <= 0) {
          continue;
        }
        if (queuedTransactions + nextCount > this.maxKernelQueuedTransactions) {
          break;
        }
        this.kernelTransactionQueue.push(entry);
        queuedTransactions += nextCount;
        this.recentKernelTransactionKeys.set(
          entry.idempotencyKey,
          Math.max(entry.acceptedAt + this.kernelTransactionDedupeTtlMs, now + this.kernelTransactionDedupeTtlMs),
        );
      }
      this.kernelQueuedTransactions = queuedTransactions;
      if (Array.isArray(snapshot.recentKeys)) {
        for (const entry of snapshot.recentKeys) {
          if (!entry || typeof entry !== 'object') {
            continue;
          }
          const key = String(entry.key || '').trim();
          const expiresAt = Number(entry.expiresAt);
          if (!key || !Number.isFinite(expiresAt)) {
            continue;
          }
          if (expiresAt <= now) {
            continue;
          }
          this.recentKernelTransactionKeys.set(key, Math.floor(expiresAt));
        }
      }
      const metrics = snapshot.metrics;
      if (metrics && typeof metrics === 'object') {
        this.kernelAcceptedTotal = Math.max(
          this.kernelAcceptedTotal,
          Math.max(0, Math.floor(Number(metrics.acceptedTotal || 0))),
        );
        this.kernelDeduplicatedTotal = Math.max(
          this.kernelDeduplicatedTotal,
          Math.max(0, Math.floor(Number(metrics.deduplicatedTotal || 0))),
        );
        this.kernelRejectedTotal = Math.max(
          this.kernelRejectedTotal,
          Math.max(0, Math.floor(Number(metrics.rejectedTotal || 0))),
        );
        this.kernelDrainedTotal = Math.max(
          this.kernelDrainedTotal,
          Math.max(0, Math.floor(Number(metrics.drainedTotal || 0))),
        );
        this.lastKernelAcceptedAt = Number.isFinite(Number(metrics.lastAcceptedAt))
          ? Math.max(0, Math.floor(Number(metrics.lastAcceptedAt)))
          : this.lastKernelAcceptedAt;
        this.lastKernelDrainAt = Number.isFinite(Number(metrics.lastDrainAt))
          ? Math.max(0, Math.floor(Number(metrics.lastDrainAt)))
          : this.lastKernelDrainAt;
      }
    } catch (error) {
      logger.warn('Failed to restore kernel ingest queue snapshot', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private async persistKernelIngestQueueSnapshot(): Promise<void> {
    try {
      await this.fileService.writeJSON(KERNEL_INGEST_QUEUE_SNAPSHOT_FILE, {
        version: KERNEL_INGEST_QUEUE_SNAPSHOT_VERSION,
        queue: this.kernelTransactionQueue,
        recentKeys: Array.from(this.recentKernelTransactionKeys.entries()).map(([key, expiresAt]) => ({
          key,
          expiresAt,
        })),
        metrics: {
          acceptedTotal: this.kernelAcceptedTotal,
          deduplicatedTotal: this.kernelDeduplicatedTotal,
          rejectedTotal: this.kernelRejectedTotal,
          drainedTotal: this.kernelDrainedTotal,
          lastAcceptedAt: this.lastKernelAcceptedAt,
          lastDrainAt: this.lastKernelDrainAt,
        },
      });
    } catch (error) {
      logger.warn('Failed to persist kernel ingest queue snapshot', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private async persistKernelActionQueueSnapshot(): Promise<void> {
    try {
      await this.fileService.writeJSON(KERNEL_ACTION_QUEUE_SNAPSHOT_FILE, {
        version: KERNEL_ACTION_QUEUE_SNAPSHOT_VERSION,
        actions: this.kernelTransactionActions,
        metrics: {
          actionEnqueuedTotal: this.kernelActionEnqueuedTotal,
          actionDequeuedTotal: this.kernelActionDequeuedTotal,
          actionRequeuedTotal: this.kernelActionRequeuedTotal,
          actionRejectedTotal: this.kernelActionRejectedTotal,
          removeActionQueuedTotal: this.kernelRemoveActionQueuedTotal,
          upsertActionQueuedTotal: this.kernelUpsertActionQueuedTotal,
          autoCardActionQueuedTotal: this.kernelAutoCardActionQueuedTotal,
        },
      });
    } catch (error) {
      logger.warn('Failed to persist kernel action queue snapshot', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private normalizeKernelActions(actions: unknown[]): BackendKernelTransactionAction[] {
    const normalized: BackendKernelTransactionAction[] = [];
    for (const action of actions) {
      if (!action || typeof action !== 'object') {
        continue;
      }
      const record = action as Record<string, unknown>;
      const source = record.source === 'kernel-sidecar' ? 'kernel-sidecar' : 'ws-main';
      const receivedAt = Number.isFinite(Number(record.receivedAt))
        ? Math.max(0, Math.floor(Number(record.receivedAt)))
        : Date.now();
      const idempotencyKey = String(record.idempotencyKey || '').trim();
      const type = String(record.type || '').trim();
      if (!idempotencyKey) {
        continue;
      }
      if (type === 'native-riff-remove' || type === 'native-riff-upsert') {
        const blockIds = Array.isArray(record.blockIds)
          ? uniqueStrings(record.blockIds)
          : [];
        normalized.push({
          type,
          blockIds,
          source,
          receivedAt,
          idempotencyKey,
        });
        continue;
      }
      if (type === 'auto-card-candidates') {
        const operations = Array.isArray(record.operations)
          ? record.operations
            .filter((entry): entry is { action: 'insert' | 'update' | 'delete'; blockId: string } => {
              if (!entry || typeof entry !== 'object') {
                return false;
              }
              const candidate = entry as Record<string, unknown>;
              const actionType = String(candidate.action || '').trim();
              const blockId = String(candidate.blockId || '').trim();
              return (
                (actionType === 'insert' || actionType === 'update' || actionType === 'delete')
                && Boolean(blockId)
              );
            })
            .map((entry) => ({
              action: entry.action,
              blockId: String(entry.blockId).trim(),
            }))
          : [];
        normalized.push({
          type: 'auto-card-candidates',
          operations,
          source,
          receivedAt,
          idempotencyKey,
        });
      }
    }
    return normalized;
  }

  private normalizeKernelTransactionQueue(
    queue: unknown[],
  ): Array<{
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    idempotencyKey: string;
    acceptedAt: number;
  }> {
    const normalized: Array<{
      source: 'kernel-sidecar' | 'ws-main';
      transactions: unknown[];
      receivedAt: number;
      idempotencyKey: string;
      acceptedAt: number;
    }> = [];
    for (const entry of queue) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const source = record.source === 'kernel-sidecar' ? 'kernel-sidecar' : 'ws-main';
      const transactions = Array.isArray(record.transactions) ? record.transactions : [];
      const idempotencyKey = String(record.idempotencyKey || '').trim();
      if (!idempotencyKey || transactions.length === 0) {
        continue;
      }
      const receivedAt = Number.isFinite(Number(record.receivedAt))
        ? Math.max(0, Math.floor(Number(record.receivedAt)))
        : Date.now();
      const acceptedAt = Number.isFinite(Number(record.acceptedAt))
        ? Math.max(0, Math.floor(Number(record.acceptedAt)))
        : receivedAt;
      normalized.push({
        source,
        transactions,
        receivedAt,
        idempotencyKey,
        acceptedAt,
      });
    }
    return normalized;
  }

  async queryDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckCardPageResult | null> {
    await this.init();
    return this.repository!.queryDeckPage(query, page);
  }

  async queryDeckMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[] | null> {
    await this.init();
    return this.repository!.queryDeckMatchedIds(query);
  }

  async getDeckRowsByIds(ids: string[]): Promise<FSRSCard[]> {
    await this.init();
    return this.repository!.getDeckCardsByIds(ids);
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
    await this.init();
    return this.createQueueProjectionRuntime().snapshot(request);
  }

  async queueProjectionRowsByIds(
    request: BackendQueueProjectionRowsByIdsRequest,
  ): Promise<BackendQueueProjectionRowsByIdsResult> {
    await this.init();
    return this.createQueueProjectionRuntime().rowsByIds(request);
  }

  async replaceQueueProjection(
    request: BackendQueueProjectionReplaceRequest,
  ): Promise<BackendQueueProjectionReplaceResult> {
    await this.init();
    return this.createQueueProjectionRuntime().replace(request);
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
    await this.init();
    return this.repository!.getBrowserStats(now);
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
        const previous = previousStatus.has(update.blockId)
          ? previousStatus.get(update.blockId)
          : null;
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

    await this.repository!.updateSourceExistence(updates, checkedAt);
    if (changedBlockIds.length > 0) {
      this.invalidateQueueProjectionsForSourceChanges(changedBlockIds, checkedAt);
    }

    return {
      checked: candidates.length,
      updated: updates.length,
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

  async reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    await this.init();
    const runtime = new WorkerReviewFeedbackRuntime({
      repository: this.repository!,
      queueProjection: this.queueProjection,
      runtime: this.runtime,
      recordUnavailable: () => {
        this.reviewFeedbackUnavailableTotal += 1;
      },
    });
    const result = await runtime.reviewFeedback(request);
    this.reviewFeedbackTotal += 1;
    if (result.committed) {
      this.reviewFeedbackCommittedTotal += 1;
    } else {
      this.reviewFeedbackPreviewTotal += 1;
    }
    return result;
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

  async mergeSyncConflictDatabases(
    request: BackendSyncConflictMergeRequest,
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
      if (!isUint8ArrayLike(source?.bytes) || source.bytes.byteLength === 0) {
        result.skippedSources.push({ sourceId, reason: 'invalid-bytes' });
        continue;
      }

      let conflictRuntime: RuntimeSqliteDatabaseService | null = null;
      try {
        conflictRuntime = new RuntimeSqliteDatabaseService(
          createReadonlyConflictFileService(source.bytes),
          `${sourceId}.db`,
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

        await this.runtime.runTransaction('sync.conflict.merge', async () => {
          let sourceChanged = false;
          const affectedCardIds = new Set<string>();
          const affectedBlockIds = new Set<string>();
          const diagnosticCardIds = new Set<string>();
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
            sourceChanged = true;
          }

          for (const cardRow of cards) {
            const incoming = parseJsonObject<FSRSCard | null>(cardRow.payload_json, null);
            if (!incoming?.id) {
              result.ignoredCards += 1;
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
            if (existing && compareReviewSyncCardFreshness(existing, cardRow) <= 0) {
              result.ignoredCards += 1;
              continue;
            }
            this.repository!.upsertCard(incoming);
            this.applyIncomingMissingSourceProjection(cardRow, incoming);
            result.mergedCards += 1;
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
          this.appendReviewCardDivergenceDiagnostics(result.diagnostics.reviewCardDivergences, [...diagnosticCardIds]);
        });
      } catch (error) {
        result.skippedSources.push({
          sourceId,
          reason: error instanceof Error ? error.message : String(error),
        });
      } finally {
        conflictRuntime?.dispose();
      }
    }

    return result;
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
         ${scope}
       GROUP BY e.card_id, c.updated_at, c.reps, c.last_review,
                c.block_id, c.source_exists, c.source_checked_at, c.source_missing_at
       ORDER BY e.card_id ASC`,
      params,
    );
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

  private applyIncomingMissingSourceProjection(row: ConflictCardRow, incoming: FSRSCard): void {
    if (Number(row.source_exists) !== 0) {
      return;
    }
    const rowBlockId = String(row.block_id || '').trim();
    const incomingBlockId = String(incoming.blockId || '').trim();
    if (!rowBlockId || rowBlockId !== incomingBlockId) {
      return;
    }
    const incomingCheckedAt = this.normalizeConflictTimestamp(row.source_checked_at);
    const incomingMissingAt = this.normalizeConflictTimestamp(row.source_missing_at) || incomingCheckedAt;
    const current = this.runtime.getOne<{
      source_checked_at: number | null;
    }>(
      'SELECT source_checked_at FROM cards WHERE id = ?',
      [incoming.id],
    );
    const currentCheckedAt = this.normalizeConflictTimestamp(current?.source_checked_at);
    if (currentCheckedAt && incomingCheckedAt && currentCheckedAt > incomingCheckedAt) {
      return;
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

    const now = Date.now();
    this.cleanupKernelTransactionDeduplication(now);

    const source = this.normalizeKernelTransactionSource(request.source);
    const receivedAt = Number.isFinite(Number(request.receivedAt))
      ? Math.max(0, Math.floor(Number(request.receivedAt)))
      : now;
    const transactions = (Array.isArray(request.transactions) ? request.transactions : [])
      .filter((transaction) => transaction != null && typeof transaction === 'object');
    const idempotencyKey = this.resolveKernelTransactionIdempotencyKey({
      source,
      transactions,
      receivedAt,
      requestIdempotencyKey: request.idempotencyKey,
    });

    if (transactions.length === 0) {
      return {
        accepted: 0,
        queued: this.kernelQueuedTransactions,
        receivedAt,
        duplicate: false,
        queueLength: this.kernelTransactionQueue.length,
        maxQueueLength: this.maxKernelTransactionQueueLength,
      };
    }

    if (this.recentKernelTransactionKeys.has(idempotencyKey)) {
      this.kernelDeduplicatedTotal += transactions.length;
      await this.persistKernelIngestQueueSnapshot();
      return {
        accepted: 0,
        queued: this.kernelQueuedTransactions,
        receivedAt,
        duplicate: true,
        queueLength: this.kernelTransactionQueue.length,
        maxQueueLength: this.maxKernelTransactionQueueLength,
      };
    }

    if (this.kernelTransactionQueue.length >= this.maxKernelTransactionQueueLength) {
      this.kernelRejectedTotal += transactions.length;
      await this.persistKernelIngestQueueSnapshot();
      throw new Error(
        `SrsBackendWorker kernel.transaction.ingest unavailable: queue backpressure (pending=${this.kernelTransactionQueue.length}, limit=${this.maxKernelTransactionQueueLength})`,
      );
    }
    if (this.kernelQueuedTransactions + transactions.length > this.maxKernelQueuedTransactions) {
      this.kernelRejectedTotal += transactions.length;
      await this.persistKernelIngestQueueSnapshot();
      throw new Error(
        `SrsBackendWorker kernel.transaction.ingest unavailable: transaction backpressure (pending=${this.kernelQueuedTransactions}, incoming=${transactions.length}, limit=${this.maxKernelQueuedTransactions})`,
      );
    }

    const actions = collectKernelTransactionActions({
      source,
      transactions,
      receivedAt,
      idempotencyKey,
    });
    if (this.kernelTransactionActions.length + actions.length > this.maxKernelActionQueueLength) {
      this.kernelRejectedTotal += transactions.length;
      this.kernelActionRejectedTotal += actions.length;
      await this.persistKernelActionQueueSnapshot();
      throw new Error(
        `SrsBackendWorker kernel.transaction.ingest unavailable: action queue backpressure `
        + `(pending=${this.kernelTransactionActions.length}, incoming=${actions.length}, limit=${this.maxKernelActionQueueLength})`,
      );
    }

    this.recentKernelTransactionKeys.set(idempotencyKey, now + this.kernelTransactionDedupeTtlMs);
    this.kernelTransactionQueue.push({
      source,
      transactions,
      receivedAt,
      idempotencyKey,
      acceptedAt: now,
    });
    if (actions.length > 0) {
      this.kernelTransactionActions.push(...actions);
      this.kernelActionEnqueuedTotal += actions.length;
      for (const action of actions) {
        if (action.type === 'native-riff-remove') {
          this.kernelRemoveActionQueuedTotal += 1;
        } else if (action.type === 'native-riff-upsert') {
          this.kernelUpsertActionQueuedTotal += 1;
        } else if (action.type === 'auto-card-candidates') {
          this.kernelAutoCardActionQueuedTotal += 1;
        }
      }
      await this.persistKernelActionQueueSnapshot();
    }
    this.kernelQueuedTransactions += transactions.length;
    this.kernelAcceptedTotal += transactions.length;
    this.lastKernelAcceptedAt = now;
    await this.persistKernelIngestQueueSnapshot();

    return {
      accepted: transactions.length,
      queued: this.kernelQueuedTransactions,
      receivedAt,
      duplicate: false,
      queueLength: this.kernelTransactionQueue.length,
      maxQueueLength: this.maxKernelTransactionQueueLength,
    };
  }

  async dequeueKernelTransactionActions(maxActions = 16): Promise<BackendKernelTransactionDequeueResult> {
    await this.init();
    const limit = Math.max(1, Math.floor(Number(maxActions) || 0));
    const rawActions = this.kernelTransactionActions.splice(0, limit);
    this.drainKernelTransactions(Math.max(256, limit * 32));
    this.kernelActionDequeuedTotal += rawActions.length;
    if (rawActions.length > 0) {
      await this.persistKernelActionQueueSnapshot();
    }
    const actions = coalesceDequeuedKernelActions(rawActions);
    return {
      actions,
      remaining: this.kernelTransactionActions.length,
    };
  }

  async requeueKernelTransactionActions(
    actions: BackendKernelTransactionAction[],
  ): Promise<BackendKernelTransactionRequeueResult> {
    await this.init();
    const normalized = (Array.isArray(actions) ? actions : [])
      .filter((action): action is BackendKernelTransactionAction => (
        Boolean(action)
        && typeof action === 'object'
        && typeof action.type === 'string'
        && typeof action.idempotencyKey === 'string'
      ));
    if (normalized.length === 0) {
      return {
        requeued: 0,
        queueLength: this.kernelTransactionActions.length,
        maxQueueLength: this.maxKernelActionQueueLength,
      };
    }
    const available = Math.max(0, this.maxKernelActionQueueLength - this.kernelTransactionActions.length);
    const accepted = normalized.slice(0, available);
    if (accepted.length > 0) {
      this.kernelTransactionActions.unshift(...accepted);
      this.kernelActionRequeuedTotal += accepted.length;
      await this.persistKernelActionQueueSnapshot();
    }
    const dropped = normalized.length - accepted.length;
    if (dropped > 0) {
      this.kernelActionRejectedTotal += dropped;
      if (accepted.length === 0) {
        await this.persistKernelActionQueueSnapshot();
      }
    }
    return {
      requeued: accepted.length,
      queueLength: this.kernelTransactionActions.length,
      maxQueueLength: this.maxKernelActionQueueLength,
    };
  }

  drainKernelTransactions(maxTransactions = 256): Array<{
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    idempotencyKey: string;
    acceptedAt: number;
  }> {
    const budget = Math.max(1, Math.floor(Number(maxTransactions) || 0));
    let consumed = 0;
    const drained: Array<{
      source: 'kernel-sidecar' | 'ws-main';
      transactions: unknown[];
      receivedAt: number;
      idempotencyKey: string;
      acceptedAt: number;
    }> = [];

    while (this.kernelTransactionQueue.length > 0 && consumed < budget) {
      const next = this.kernelTransactionQueue[0];
      const nextCount = next.transactions.length;
      if (drained.length > 0 && consumed + nextCount > budget) {
        break;
      }
      this.kernelTransactionQueue.shift();
      drained.push(next);
      consumed += nextCount;
      this.kernelQueuedTransactions = Math.max(0, this.kernelQueuedTransactions - nextCount);
    }

    if (drained.length > 0) {
      this.kernelDrainedTotal += consumed;
      this.lastKernelDrainAt = Date.now();
      void this.persistKernelIngestQueueSnapshot();
      logger.debug('Drained kernel transaction batch', {
        envelopes: drained.length,
        transactions: consumed,
        remaining: this.kernelQueuedTransactions,
      });
    }

    return drained;
  }

  private cleanupKernelTransactionDeduplication(now: number): void {
    for (const [key, expiresAt] of this.recentKernelTransactionKeys.entries()) {
      if (expiresAt <= now) {
        this.recentKernelTransactionKeys.delete(key);
      }
    }
  }

  private normalizeKernelTransactionSource(source: unknown): 'kernel-sidecar' | 'ws-main' {
    return source === 'kernel-sidecar' ? 'kernel-sidecar' : 'ws-main';
  }

  private resolveKernelTransactionIdempotencyKey(input: {
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    requestIdempotencyKey?: string;
  }): string {
    const explicit = String(input.requestIdempotencyKey || '').trim();
    if (explicit) {
      return explicit.slice(0, 256);
    }
    const signatureRaw = JSON.stringify(input.transactions) || '[]';
    const signature = this.fnv1a32(signatureRaw);
    return `${input.source}:${input.receivedAt}:${input.transactions.length}:${signature}`;
  }

  private fnv1a32(input: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
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

  getOne<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T | null {
    return this.runtime.getOne<T>(sql, params);
  }

  dispose(): void {
    void this.persistKernelIngestQueueSnapshot();
    void this.persistKernelActionQueueSnapshot();
    this.runtime.dispose();
    this.repository = null;
    this.initialized = false;
  }
}

const RELEVANT_UPSERT_ACTIONS = new Set(['insert', 'update', 'delete', 'setAttrs', 'updateAttrs']);
const REMOVE_FLASHCARDS_ACTION = 'removeFlashcards';
const ADD_FLASHCARDS_ACTION = 'addFlashcards';
const AUTO_CARD_RELEVANT_ACTIONS = new Set(['insert', 'update', 'delete']);
const QUICK_CARD_MARKERS = [
  '>>',
  '》》',
  '<<',
  '《《',
  '<>',
  '《》',
  '>>>',
  '》》》',
  '::',
  '：：',
  ';;',
  '；；',
  ';<',
  '；<',
  '；《',
  ';<>',
  '；<>',
  '；《》',
  '{{',
  '}}',
  '==',
  '\\cloze',
  'data-type="mark"',
];
const QUICK_CARD_CONTENT_KEYS = new Set([
  'content',
  'markdown',
  'kramdown',
  'text',
  'html',
  'data',
]);
const NATIVE_RIFF_MARKERS = [
  'custom-riff-decks',
  'custom-is-flashcard',
  'flashcard',
  'riffCardID',
  'riffCardId',
  'riffCard',
  'custom-card-type',
];

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

function containsNativeRiffMarker(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }
    return NATIVE_RIFF_MARKERS.some((marker) => normalized.includes(marker));
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsNativeRiffMarker(entry));
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nested]) => (
    NATIVE_RIFF_MARKERS.includes(key)
    || containsNativeRiffMarker(nested)
  ));
}

function containsQuickCardMarkerText(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && QUICK_CARD_MARKERS.some((marker) => normalized.includes(marker));
}

function inspectQuickCardPayload(value: unknown, key = ''): { inspected: boolean; hasMarker: boolean } {
  if (typeof value === 'string') {
    const inspectString = key === '' || QUICK_CARD_CONTENT_KEYS.has(key.toLowerCase());
    return {
      inspected: inspectString,
      hasMarker: inspectString && containsQuickCardMarkerText(value),
    };
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (summary, entry) => {
        const next = inspectQuickCardPayload(entry, key);
        return {
          inspected: summary.inspected || next.inspected,
          hasMarker: summary.hasMarker || next.hasMarker,
        };
      },
      { inspected: false, hasMarker: false },
    );
  }
  if (!isRecord(value)) {
    return { inspected: false, hasMarker: false };
  }
  return Object.entries(value).reduce(
    (summary, [childKey, childValue]) => {
      const next = inspectQuickCardPayload(childValue, childKey);
      return {
        inspected: summary.inspected || next.inspected,
        hasMarker: summary.hasMarker || next.hasMarker,
      };
    },
    { inspected: false, hasMarker: false },
  );
}

function shouldCollectAutoCardOperation(operation: DoOperation): boolean {
  const action = normalizeString(operation.action);
  if (action === 'delete') {
    return true;
  }
  if (action !== 'insert' && action !== 'update') {
    return false;
  }

  const newPayload = inspectQuickCardPayload(operation.data?.new);
  const oldPayload = inspectQuickCardPayload(operation.data?.old);
  if (newPayload.hasMarker || oldPayload.hasMarker) {
    return true;
  }
  if (newPayload.inspected || oldPayload.inspected) {
    return false;
  }
  return true;
}

function extractOperationBlockIds(operation: DoOperation): string[] {
  const data = isRecord(operation.data) ? operation.data : undefined;
  return uniqueStrings([
    ...(operation.blockIDs || []),
    ...(operation.ids || []),
    ...(Array.isArray(data?.blockIDs) ? data.blockIDs : []),
    ...(Array.isArray(data?.ids) ? data.ids : []),
    operation.id,
  ]);
}

function collectNativeRiffRemoveBlockIds(transactions: unknown[]): string[] {
  const ids: unknown[] = [];
  for (const transaction of transactions) {
    if (!isRecord(transaction) || !Array.isArray(transaction.doOperations)) {
      continue;
    }
    for (const operation of transaction.doOperations) {
      if (!isRecord(operation)) {
        continue;
      }
      if (normalizeString(operation.action) !== REMOVE_FLASHCARDS_ACTION) {
        continue;
      }
      ids.push(...extractOperationBlockIds(operation as DoOperation));
    }
  }
  return uniqueStrings(ids);
}

function looksLikeNativeRiffAttrRemoval(operation: DoOperation): boolean {
  if (operation.action !== 'setAttrs' && operation.action !== 'updateAttrs') {
    return false;
  }
  const oldHasMarker = containsNativeRiffMarker(operation.data?.old);
  const newHasMarker = containsNativeRiffMarker(operation.data?.new);
  return oldHasMarker && !newHasMarker;
}

function looksLikeNativeRiffUpsert(operation: DoOperation): boolean {
  if (operation.action === ADD_FLASHCARDS_ACTION) {
    return extractOperationBlockIds(operation).length > 0;
  }
  if (looksLikeNativeRiffAttrRemoval(operation)) {
    return false;
  }
  if (!RELEVANT_UPSERT_ACTIONS.has(operation.action)) {
    return false;
  }
  return containsNativeRiffMarker(operation.data?.new)
    || containsNativeRiffMarker(operation.data?.old);
}

function collectNativeRiffUpsertBlockIds(transactions: unknown[]): string[] {
  const ids: unknown[] = [];
  for (const transaction of transactions) {
    if (!isRecord(transaction) || !Array.isArray(transaction.doOperations)) {
      continue;
    }
    for (const operation of transaction.doOperations) {
      if (!isRecord(operation)) {
        continue;
      }
      const typed = operation as DoOperation;
      if (!looksLikeNativeRiffUpsert(typed)) {
        continue;
      }
      ids.push(...extractOperationBlockIds(typed));
    }
  }
  return uniqueStrings(ids);
}

function collectAutoCardCandidateOperations(
  transactions: unknown[],
): Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> {
  const operations: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> = [];
  for (const transaction of transactions) {
    if (!isRecord(transaction) || !Array.isArray(transaction.doOperations)) {
      continue;
    }
    for (const operation of transaction.doOperations) {
      if (!isRecord(operation)) {
        continue;
      }
      const typed = operation as DoOperation;
      const action = normalizeString(typed.action);
      if (!AUTO_CARD_RELEVANT_ACTIONS.has(action)) {
        continue;
      }
      if (!shouldCollectAutoCardOperation(typed)) {
        continue;
      }
      const blockId = normalizeString(typed.id);
      if (!blockId) {
        continue;
      }
      operations.push({
        action: action as 'insert' | 'update' | 'delete',
        blockId,
      });
    }
  }
  return coalesceAutoCardOperationList(operations);
}

function coalesceAutoCardOperationList(
  operations: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }>,
): Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> {
  const byBlockId = new Map<string, 'insert' | 'update' | 'delete' | null>();
  for (const operation of operations) {
    const blockId = normalizeString(operation.blockId);
    if (!blockId) {
      continue;
    }
    const nextAction = operation.action;
    const current = byBlockId.get(blockId) ?? null;
    if (nextAction === 'delete') {
      byBlockId.set(blockId, current === 'insert' ? null : 'delete');
      continue;
    }
    if (nextAction === 'insert') {
      byBlockId.set(blockId, current === 'delete' ? 'insert' : 'insert');
      continue;
    }
    if (current === null) {
      byBlockId.set(blockId, 'update');
    }
  }
  const coalesced: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> = [];
  for (const [blockId, action] of byBlockId.entries()) {
    if (!action) {
      continue;
    }
    coalesced.push({ action, blockId });
  }
  return coalesced;
}

function coalesceDequeuedKernelActions(
  actions: BackendKernelTransactionAction[],
): BackendKernelTransactionAction[] {
  if (actions.length <= 1) {
    return actions;
  }
  const removeBlockIds: string[] = [];
  const upsertBlockIds: string[] = [];
  const autoCardOps: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> = [];
  let removeEnvelope: BackendKernelTransactionAction | null = null;
  let upsertEnvelope: BackendKernelTransactionAction | null = null;
  let autoCardEnvelope: BackendKernelTransactionAction | null = null;
  const passthrough: BackendKernelTransactionAction[] = [];

  for (const action of actions) {
    if (action.type === 'native-riff-remove') {
      removeEnvelope = removeEnvelope ?? action;
      removeBlockIds.push(...(Array.isArray(action.blockIds) ? action.blockIds : []));
      continue;
    }
    if (action.type === 'native-riff-upsert') {
      upsertEnvelope = upsertEnvelope ?? action;
      upsertBlockIds.push(...(Array.isArray(action.blockIds) ? action.blockIds : []));
      continue;
    }
    if (action.type === 'auto-card-candidates') {
      autoCardEnvelope = autoCardEnvelope ?? action;
      autoCardOps.push(...(Array.isArray(action.operations) ? action.operations : []));
      continue;
    }
    passthrough.push(action);
  }

  const merged: BackendKernelTransactionAction[] = [...passthrough];
  if (removeEnvelope) {
    merged.push({
      type: 'native-riff-remove',
      blockIds: uniqueStrings(removeBlockIds),
      source: removeEnvelope.source,
      receivedAt: removeEnvelope.receivedAt,
      idempotencyKey: removeEnvelope.idempotencyKey,
    });
  }
  if (upsertEnvelope) {
    merged.push({
      type: 'native-riff-upsert',
      blockIds: uniqueStrings(upsertBlockIds),
      source: upsertEnvelope.source,
      receivedAt: upsertEnvelope.receivedAt,
      idempotencyKey: upsertEnvelope.idempotencyKey,
    });
  }
  if (autoCardEnvelope) {
    const coalesced = coalesceAutoCardOperationList(autoCardOps);
    if (coalesced.length > 0) {
    merged.push({
      type: 'auto-card-candidates',
      operations: coalesced,
      source: autoCardEnvelope.source,
      receivedAt: autoCardEnvelope.receivedAt,
      idempotencyKey: autoCardEnvelope.idempotencyKey,
    });
    }
  }
  return merged;
}

function collectKernelTransactionActions(input: {
  source: 'kernel-sidecar' | 'ws-main';
  transactions: unknown[];
  receivedAt: number;
  idempotencyKey: string;
}): BackendKernelTransactionAction[] {
  const actions: BackendKernelTransactionAction[] = [];
  const nativeRiffRemoveBlockIds = collectNativeRiffRemoveBlockIds(input.transactions);
  if (nativeRiffRemoveBlockIds.length > 0) {
    actions.push({
      type: 'native-riff-remove',
      blockIds: nativeRiffRemoveBlockIds,
      source: input.source,
      receivedAt: input.receivedAt,
      idempotencyKey: input.idempotencyKey,
    });
  }
  const nativeRiffUpsertBlockIds = collectNativeRiffUpsertBlockIds(input.transactions);
  if (nativeRiffUpsertBlockIds.length > 0) {
    actions.push({
      type: 'native-riff-upsert',
      blockIds: nativeRiffUpsertBlockIds,
      source: input.source,
      receivedAt: input.receivedAt,
      idempotencyKey: input.idempotencyKey,
    });
  }
  const autoCardOperations = collectAutoCardCandidateOperations(input.transactions);
  if (autoCardOperations.length > 0) {
    actions.push({
      type: 'auto-card-candidates',
      operations: autoCardOperations,
      source: input.source,
      receivedAt: input.receivedAt,
      idempotencyKey: input.idempotencyKey,
    });
  }
  return actions;
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
