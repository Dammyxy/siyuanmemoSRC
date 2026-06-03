export const BACKEND_RPC_VERSION = '2.0';

export type BackendRpcMethod =
  | 'system.health'
  | 'db.load'
  | 'db.persist'
  | 'sync.conflict.merge'
  | 'sync.reviewDivergence.audit'
  | 'sync.conflict.summarize'
  | 'sync.conflict.reload'
  | 'diagnostics.status'
  | 'domainSync.status'
  | 'domainSync.repair.preview'
  | 'domainSync.repair.apply'
  | 'domainSync.conflictSources.cleanupCandidates'
  | 'domainSync.conflictSources.cleanup'
  | 'browser.deck.page'
  | 'browser.deck.matchedIds'
  | 'browser.deck.rowsByIds'
  | 'browser.deck.documentCounts'
  | 'browser.stats'
  | 'browser.count'
  | 'browser.sourceExistence.refreshCandidates'
  | 'browser.sourceExistence.update'
  | 'browser.sourceExistence.byBlockIds'
  | 'browser.sourceExistence.summary'
  | 'browser.sourceExistence.applySweep'
  | 'browser.sourceExistence.applySweepHost'
  | 'storage.projection.rebuild'
  | 'queue.projection.snapshot'
  | 'queue.projection.rowsByIds'
  | 'queue.projection.replace'
  | 'neural-roam.advance'
  | 'neural-roam.viewState'
  | 'neural-roam.command'
  | 'kernel.transaction.ingest'
  | 'kernel.transaction.dequeue'
  | 'kernel.transaction.requeue'
  | 'autocard.decision.resolve'
  | 'autocard.execute'
  | 'review.feedback'
  | 'review.truth.flush'
  | 'review.truth.backfill'
  | 'ai.session.create'
  | 'ai.session.get'
  | 'ai.session.update'
  | 'ai.session.cancel'
  | 'ai.prompt.execute'
  | 'ai.tool.job.execute'
  | 'ai.tool.job.approval'
  | 'ai.stream.start'
  | 'ai.stream.cancel'
  | 'job.get'
  | 'job.cancel'
  | 'private.health'
  | 'private.diagnostics.status'
  | 'private.audit.query'
  | 'private.read.cards'
  | 'private.read.queues'
  | 'private.read.sessions'
  | 'private.command.execute'
  | 'semantic.command.execute'
  | 'semantic.session.read'
  | 'semantic.sidebar.read'
  | 'semantic.browser.read'
  | 'hotspot.command.submit'
  | 'hotspot.job.get'
  | 'xiuyuan.sync.execute'
  | 'progressive.command.execute'
  | 'topic-derived.command.execute'
  | 'review.riffFeedback.execute'
  | 'review.sourceRefresh.execute'
  | 'browser.aggregate.snapshot'
  | 'browser.aggregate.page'
  | 'browser.aggregate.focus'
  | 'graph.query'
  | 'p6.ownership.query'
  | 'p6.ownership.command';

export type BackendRpcId = number | string;

export const SIYUANMEMO_PLUGIN_PETAL_STORAGE_ROOT = 'storage/petal/siyuan-plugin-siyuanmemo';
export const SIYUANMEMO_TRUTH_ROOT_PATH = 'truth';
export const SIYUANMEMO_TRUTH_MIGRATIONS_PATH = `${SIYUANMEMO_TRUTH_ROOT_PATH}/migrations`;
export const LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH =
  `${SIYUANMEMO_TRUTH_MIGRATIONS_PATH}/legacy-unified-cards-to-truth.v1.json`;
export const SIYUANMEMO_TEMP_PROJECTION_ROOT_PATH = 'temp/siyuan-plugin-siyuanmemo';
export const SIYUANMEMO_TEMP_PROJECTION_DB_PATH = `${SIYUANMEMO_TEMP_PROJECTION_ROOT_PATH}/siyuanmemo.db`;
export const SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH =
  `${SIYUANMEMO_PLUGIN_PETAL_STORAGE_ROOT}/siyuanmemo.db`;

export const STORAGE_ERROR_CODES = [
  'TRUTH_DEVICE_ID_UNAVAILABLE',
  'LEGACY_MIGRATION_FAILED',
  'LEGACY_DIVERGENCE_DETECTED',
  'TRUTH_VALIDATION_FAILED',
  'PROJECTION_REBUILD_FAILED',
  'SOURCE_READ_UNAVAILABLE',
] as const;

export type BackendStorageErrorCode = typeof STORAGE_ERROR_CODES[number];

export const STORAGE_DIAGNOSTIC_KINDS = [
  'legacy-petal-db-ignored',
  'orphan-truth-segment',
  'quarantined-review-log',
  'repaired-scheduling-memory',
  'skipped-non-formal-review-log',
  'projection-rebuild-status',
] as const;

export type BackendStorageDiagnosticKind = typeof STORAGE_DIAGNOSTIC_KINDS[number];

export interface BackendStorageDiagnostic {
  kind: BackendStorageDiagnosticKind;
  severity: 'info' | 'warning' | 'error';
  at: number;
  message: string;
  code?: BackendStorageErrorCode | null;
  path?: string | null;
  family?: string | null;
  projectionFamily?: string | null;
  details?: Record<string, unknown> | null;
}

export interface BackendRpcRequest<TParams = unknown> {
  jsonrpc: typeof BACKEND_RPC_VERSION;
  id: BackendRpcId;
  method: BackendRpcMethod;
  params?: TParams;
}

export type BackendRpcErrorCode =
  | BackendStorageErrorCode
  | 'WRITER_UNAVAILABLE'
  | 'LEASE_UNAVAILABLE'
  | 'RELAY_QUEUE_UNAVAILABLE'
  | 'KERNEL_SIDECAR_UNAVAILABLE'
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'BACKEND_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'METHOD_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'FAILED';

export interface BackendRpcError {
  code: BackendRpcErrorCode;
  message: string;
}

export interface BackendRpcSuccess<TResult = unknown> {
  jsonrpc: typeof BACKEND_RPC_VERSION;
  id: BackendRpcId;
  result: TResult;
}

export interface BackendRpcFailure {
  jsonrpc: typeof BACKEND_RPC_VERSION;
  id: BackendRpcId;
  error: BackendRpcError;
}

export type BackendRpcResponse<TResult = unknown> =
  | BackendRpcSuccess<TResult>
  | BackendRpcFailure;

export interface MutationChangedSet {
  cardIds?: string[];
  blockIds?: string[];
  queueIds?: string[];
  reviewSessionIds?: string[];
  aiSessionIds?: string[];
  semanticSessionIds?: string[];
}

export interface MutationResult<TResult> {
  ok: true;
  revision: number;
  changed: MutationChangedSet;
  result: TResult;
}

export interface BackendHealthResult {
  ok: true;
  runtime: 'srs-backend-worker';
  initialized: boolean;
}

export interface BackendDbLoadResult {
  ok: true;
  initialized: boolean;
  dbFile: string;
}

export interface BackendDbPersistResult {
  ok: true;
  persisted: true;
  dbFile: string;
}

export interface BackendSyncConflictMergeSource {
  sourceId: string;
  bytes: Uint8Array;
  path?: string | null;
  modifiedAt?: number | null;
  size?: number | null;
}

export interface BackendSyncConflictMergeRequest {
  sources: BackendSyncConflictMergeSource[];
  mergedAt?: number;
}

export type BackendSyncConflictMergeDivergenceReason =
  | 'review-history-newer-than-card-state'
  | 'review-event-count-exceeds-card-reps';

export interface BackendSyncConflictMergeDivergenceDiagnostic {
  cardId: string;
  reason: BackendSyncConflictMergeDivergenceReason;
  newestReviewEventAt: number | null;
  cardLastReview: number | null;
  reviewEventCount: number;
  cardReps: number | null;
}

export interface BackendSyncConflictMergeDiagnostics {
  reviewCardDivergences: BackendSyncConflictMergeDivergenceDiagnostic[];
}

export interface BackendReviewSyncDivergenceAuditRequest {
  cardIds?: string[];
  limit?: number;
}

export interface BackendReviewSyncDivergenceAuditRecord extends BackendSyncConflictMergeDivergenceDiagnostic {
  blockId: string | null;
  sourceExists: boolean | null;
  sourceCheckedAt: number | null;
  sourceMissingAt: number | null;
}

export interface BackendReviewSyncDivergenceAuditResult {
  ok: true;
  scannedCards: number;
  divergentCards: number;
  limit: number;
  truncated: boolean;
  reasons: Record<BackendSyncConflictMergeDivergenceReason, number>;
  records: BackendReviewSyncDivergenceAuditRecord[];
}

export interface BackendSyncConflictMergeResult {
  ok: true;
  sources: number;
  mergedReviewEvents: number;
  ignoredReviewEvents: number;
  mergedCards: number;
  ignoredCards: number;
  skippedSources: Array<{
    sourceId: string;
    reason: string;
  }>;
  diagnostics: BackendSyncConflictMergeDiagnostics;
}

export interface BackendSyncConflictDatabaseSummary {
  sourceId: string;
  path?: string | null;
  size: number;
  modifiedAt: number | null;
  reviewEventCount: number;
  cardCount: number;
  latestReviewTimestamp: number | null;
  latestCardTimestamp: number | null;
  parseStatus: 'ok' | 'empty' | 'invalid-bytes' | 'parse-error';
  parseError?: string;
}

export interface BackendSyncConflictSummarizeRequest {
  sources: BackendSyncConflictMergeSource[];
  includeCurrent?: boolean;
}

export interface BackendSyncConflictSummarizeResult {
  ok: true;
  current: BackendSyncConflictDatabaseSummary | null;
  sources: BackendSyncConflictDatabaseSummary[];
}

export interface BackendSyncConflictReloadResult {
  ok: true;
  reloaded: true;
  dbFile: string;
}

export type BackendDomainSyncOperationType =
  | 'review-committed'
  | 'card-upserted'
  | 'card-deleted'
  | 'source-existence-updated'
  | 'queue-projection-invalidated'
  | 'repair-applied';

export type BackendDomainSyncSanityStatus =
  | 'clean'
  | 'merged'
  | 'repairable'
  | 'divergent'
  | 'needs-direction'
  | 'source-error';

export type BackendDomainSyncSkippedSourceReason =
  | 'unreadable'
  | 'invalid-bytes'
  | 'missing-ledger'
  | 'ledger-invariant-violation'
  | 'parse-error'
  | 'source-unavailable'
  | 'unknown';

export interface BackendDomainSyncProcessedSource {
  sourceId: string;
  sourceKind: 'persisted-main-db' | 'siyuan-conflict-db' | 'legacy-db' | 'migration' | 'unknown';
  fingerprint: string;
  path?: string | null;
  processedAt: number;
  importedOperations: number;
  ignoredOperations: number;
  importedReviewEvents: number;
  ignoredReviewEvents: number;
  importedCards: number;
  ignoredCards: number;
  skippedReason?: BackendDomainSyncSkippedSourceReason | null;
  latestSanityStatus?: BackendDomainSyncSanityStatus | null;
  cleanup?: {
    eligible: boolean;
    reason: 'processed-resolved' | 'missing-path' | 'skipped-source' | 'needs-direction' | 'source-error' | 'unsafe-sanity-status' | 'unprocessed' | 'fingerprint-mismatch' | 'unsupported-source-kind';
  };
}

export interface BackendDomainSyncSanitySummary {
  status: BackendDomainSyncSanityStatus;
  checkedAt: number;
  ledgerOperationCount: number;
  pendingImportCount: number;
  processedSourceCount: number;
  skippedSourceCount: number;
  repairableDivergenceCount: number;
  unrepairableDivergenceCount?: number;
  divergentLedgerCount?: number;
  divergentCardCount: number;
  reasonCounts: Partial<Record<BackendSyncConflictMergeDivergenceReason | 'needs-direction' | 'source-error', number>>;
  affectedCardIds: string[];
  truncated: boolean;
}

export interface BackendDomainSyncStatusResult {
  ok: true;
  ledger: {
    operationCount: number;
    newestOperationAt: number | null;
    operationTypes: Partial<Record<BackendDomainSyncOperationType, number>>;
  };
  processedSources: {
    recent: BackendDomainSyncProcessedSource[];
    skipped: BackendDomainSyncProcessedSource[];
    totalProcessed: number;
    totalSkipped: number;
  };
  sanity: BackendDomainSyncSanitySummary;
  repair: {
    available: boolean;
    repairableDivergenceCount: number;
    latestPlanId: string | null;
  };
}

export interface BackendDomainSyncStatusRequest {
  context?: 'review-feedback-preflight' | 'read-only-preflight' | null;
  cardId?: string | null;
}

export interface BackendDomainSyncRepairPreviewRequest {
  cardIds?: string[];
  limit?: number;
  includeUnrepairable?: boolean;
}

export interface BackendDomainSyncRepairPreviewCardEvidence {
  cardId: string;
  blockId: string | null;
  reason: BackendSyncConflictMergeDivergenceReason | 'missing-card-state' | 'missing-scheduler-evidence';
  newestReviewEventAt: number | null;
  cardLastReview: number | null;
  reviewEventCount: number;
  cardReps: number | null;
}

export interface BackendDomainSyncRepairPreviewPlannedMutation {
  cardId: string;
  mutationType: 'card-state-repair' | 'projection-invalidation';
  summary: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface BackendDomainSyncRepairPreviewResult {
  ok: true;
  planId: string;
  status: 'preview' | 'no-repair' | 'unrepairable';
  createdAt: number;
  affectedCardCount: number;
  evidence: BackendDomainSyncRepairPreviewCardEvidence[];
  plannedMutations: BackendDomainSyncRepairPreviewPlannedMutation[];
  unrepairableReasons: Array<{
    cardId: string;
    reason: string;
  }>;
  schedulerEvidence: {
    schedulerType: string | null;
    configHash: string | null;
    capturedAt: number;
  };
  truncated: boolean;
  limit: number;
}

export interface BackendDomainSyncRepairApplyRequest {
  planId: string;
  idempotencyKey: string;
  confirmedAt: number;
  confirmedBy?: string | null;
  confirmationText?: string | null;
}

export type BackendDomainSyncRepairApplyResult =
  | {
      ok: true;
      status: 'applied' | 'duplicate';
      planId: string;
      idempotencyKey: string;
      appliedAt: number;
      appliedCards: number;
      skippedCards: number;
      invalidatedQueueProjections: number;
    }
  | {
      ok: false;
      status: 'stale-plan' | 'conflict' | 'unavailable' | 'invalid-request' | 'failed';
      planId: string;
      idempotencyKey: string;
      reason: string;
    };

export interface BackendDomainSyncConflictSourceCleanupRequest {
  sourceIds: string[];
  idempotencyKey: string;
  confirmedAt: number;
}

export interface BackendDomainSyncConflictSourceCleanupCandidate {
  sourceId: string;
  path: string | null;
  modifiedAt: number | null;
  size: number | null;
  fingerprint: string;
  processedSource: BackendDomainSyncProcessedSource | null;
  cleanup: {
    eligible: boolean;
    reason: NonNullable<BackendDomainSyncProcessedSource['cleanup']>['reason'];
  };
}

export interface BackendDomainSyncConflictSourceCleanupCandidatesResult {
  ok: true;
  sanityStatus: BackendDomainSyncSanityStatus;
  candidates: BackendDomainSyncConflictSourceCleanupCandidate[];
}

export interface BackendDomainSyncConflictSourceCleanupResult {
  ok: boolean;
  idempotencyKey: string;
  cleaned: Array<{ sourceId: string; path: string | null }>;
  skipped: Array<{ sourceId: string; reason: string }>;
  failed: Array<{ sourceId: string; path: string | null; reason: string }>;
  status: 'cleaned' | 'partial' | 'duplicate' | 'invalid-request' | 'unavailable';
}

export interface BackendDiagnosticsStatusResult {
  runtime: 'srs-backend-worker';
  initialized: boolean;
  dbFile: string;
  ingest?: {
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
  autoCard?: {
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
  review?: {
    feedbackTotal: number;
    feedbackCommittedTotal: number;
    feedbackPreviewTotal: number;
    feedbackUnavailableTotal: number;
    journal?: BackendReviewFeedbackJournalDiagnostics;
    truthDevice?: BackendReviewTruthDeviceDiagnostics;
    truthFlush?: BackendReviewFeedbackTruthFlushDiagnostics;
    truthBackfill?: BackendReviewTruthBackfillDiagnostics;
  };
  storage?: {
    sqliteDelta?: BackendSqliteDeltaDiagnostics;
    diagnostics?: BackendStorageDiagnostic[];
  };
  ai?: {
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
  hotspot?: {
    submittedTotal: number;
    idempotencyHitTotal: number;
    acceptedLatencyMsTotal: number;
    lastAcceptedLatencyMs: number;
    pendingCount: number;
    terminalCount: number;
    unavailableTotal: number;
    timeoutTotal: number;
    canceledTotal: number;
    writerRelayFailureTotal: number;
    kernelProxyFailureTotal: number;
  };
  preRequestMerge?: BackendPreRequestMergeDiagnosticsState;
  domainSync?: BackendDomainSyncStatusResult;
}

export interface BackendReviewTruthDeviceDiagnostics {
  deviceId: string | null;
  source: 'temp-local' | 'localStorage' | 'legacy-localStorage' | 'generated' | 'unavailable';
  localStatePath: string;
  persisted: boolean;
  cacheUpdated: boolean;
  error: string | null;
}

export type BackendSqliteDeltaWriteClassification = 'delta' | 'checkpoint';
export type BackendSqliteCheckpointStorageClass = 'durable-checkpoint' | 'volatile-projection';

export interface BackendSqliteDeltaOperationStatus {
  ok: boolean;
  at: number;
  classification?: BackendSqliteDeltaWriteClassification;
  label?: string;
  cause?: string | null;
  initiator?: string | null;
  projectionGeneration?: number | null;
  hotPath?: boolean;
  reason?: string | null;
  pendingCount?: number;
  pendingBytes?: number;
  deltaEntryId?: string | null;
  deltaEntriesWritten?: number;
  replayedCount?: number;
  skippedInMemoryCount?: number;
  affectedTables?: string[];
  byteLength?: number | null;
  cleared?: boolean;
  checkpointStorageClass?: BackendSqliteCheckpointStorageClass;
  error?: string | null;
}

export interface BackendSqliteDeltaDiagnostics {
  fileName: string;
  version: number;
  registeredTables: string[];
  pendingCount: number;
  pendingBytes: number;
  affectedTables: string[];
  deltaWritesTotal: number;
  checkpointWritesTotal: number;
  checkpointOnlyTotal: number;
  replayedEntriesTotal: number;
  lastWrite: BackendSqliteDeltaOperationStatus | null;
  lastReplay: BackendSqliteDeltaOperationStatus | null;
  lastCheckpoint: BackendSqliteDeltaOperationStatus | null;
}

export interface BackendReviewFeedbackJournalOperationStatus {
  ok: boolean;
  at: number;
  entryId?: string | null;
  cardId?: string | null;
  status?: BackendReviewFeedbackJournalEntryStatus | null;
  pendingCount?: number;
  pendingBytes?: number;
  replayedCount?: number;
  skippedInMemoryCount?: number;
  cleared?: boolean;
  error?: string | null;
}

export type BackendReviewFeedbackJournalEntryStatus =
  | 'prepared'
  | 'projection-applied'
  | 'truth-flushed'
  | 'projection-failed'
  | 'unavailable'
  | 'repair-required';

export type BackendReviewFeedbackJournalBackpressureState = 'ok' | 'warning' | 'unavailable';

export interface BackendReviewFeedbackJournalBackpressureDiagnostics {
  state: BackendReviewFeedbackJournalBackpressureState;
  reason: 'pending-count' | 'pending-bytes' | 'oldest-pending-age' | null;
  pendingCount: number;
  pendingBytes: number;
  oldestPendingAgeMs: number | null;
  maxPendingCount: number;
  maxPendingBytes: number;
  maxOldestPendingAgeMs: number;
  nextAction: 'continue' | 'flush-or-checkpoint' | 'repair-required';
}

export interface BackendReviewFeedbackJournalDiagnostics {
  fileName: string;
  storage?: 'non-siyuan' | 'unavailable';
  version: number;
  entryCount?: number;
  pendingCount: number;
  pendingBytes: number;
  oldestPendingAt?: number | null;
  oldestPendingAgeMs?: number | null;
  statusCounts?: Partial<Record<BackendReviewFeedbackJournalEntryStatus, number>>;
  backpressure?: BackendReviewFeedbackJournalBackpressureDiagnostics;
  appliedInMemoryCount: number;
  lastWrite: BackendReviewFeedbackJournalOperationStatus | null;
  lastReplay: BackendReviewFeedbackJournalOperationStatus | null;
  lastCheckpoint: BackendReviewFeedbackJournalOperationStatus | null;
}

export const MESSAGEPACK_TRUTH_SCHEMA_VERSION = 1;

export type MessagePackTruthFamily =
  | 'review-events'
  | 'card-memory-facts'
  | 'domain-sync-operations'
  | 'ai-session-payload-refs'
  | 'semantic-arena-payload-refs'
  | 'diagnostics-records';

export type MessagePackTruthPayloadPolicy =
  | 'event-fact'
  | 'entity-fact'
  | 'operation-fact'
  | 'payload-ref'
  | 'diagnostic-fact';

export interface MessagePackTruthFamilySchema {
  family: MessagePackTruthFamily;
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  payloadPolicy: MessagePackTruthPayloadPolicy;
  sqlProjection: 'skinny-index-ref' | 'diagnostic-index-ref';
  sourceOwner: 'plugin-truth' | 'siyuan-source-plus-plugin-truth';
}

export type MessagePackTruthRetentionMode =
  | 'retain-truth-indefinitely'
  | 'ttl-after-compaction';

export interface MessagePackTruthCompactionPolicy {
  closedSegmentThreshold: number;
  targetClosedSegments: number;
  minSegmentAgeMs: number;
}

export interface MessagePackTruthRetentionPolicy {
  mode: MessagePackTruthRetentionMode;
  keepUntilProjectionCheckpointed: boolean;
  compactedInputRetainDays: number;
}

export interface MessagePackTruthFamilyStoragePolicy {
  family: MessagePackTruthFamily;
  maxSegmentBytes: number;
  compaction: MessagePackTruthCompactionPolicy;
  retention: MessagePackTruthRetentionPolicy;
}

export const MESSAGEPACK_TRUTH_FAMILY_SCHEMAS = [
  {
    family: 'review-events',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'event-fact',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'plugin-truth',
  },
  {
    family: 'card-memory-facts',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'entity-fact',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'siyuan-source-plus-plugin-truth',
  },
  {
    family: 'domain-sync-operations',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'operation-fact',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'plugin-truth',
  },
  {
    family: 'ai-session-payload-refs',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'payload-ref',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'plugin-truth',
  },
  {
    family: 'semantic-arena-payload-refs',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'payload-ref',
    sqlProjection: 'skinny-index-ref',
    sourceOwner: 'siyuan-source-plus-plugin-truth',
  },
  {
    family: 'diagnostics-records',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    payloadPolicy: 'diagnostic-fact',
    sqlProjection: 'diagnostic-index-ref',
    sourceOwner: 'plugin-truth',
  },
] as const satisfies readonly MessagePackTruthFamilySchema[];

const ONE_MIB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

function truthStoragePolicy(
  family: MessagePackTruthFamily,
  maxSegmentBytes: number,
  retentionMode: MessagePackTruthRetentionMode = 'retain-truth-indefinitely',
  compactedInputRetainDays = 30,
): MessagePackTruthFamilyStoragePolicy {
  return {
    family,
    maxSegmentBytes,
    compaction: {
      closedSegmentThreshold: 48,
      targetClosedSegments: 16,
      minSegmentAgeMs: DAY_MS,
    },
    retention: {
      mode: retentionMode,
      keepUntilProjectionCheckpointed: true,
      compactedInputRetainDays,
    },
  };
}

export const MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES = [
  truthStoragePolicy('review-events', ONE_MIB),
  truthStoragePolicy('card-memory-facts', 2 * ONE_MIB),
  truthStoragePolicy('domain-sync-operations', 2 * ONE_MIB),
  truthStoragePolicy('ai-session-payload-refs', 4 * ONE_MIB),
  truthStoragePolicy('semantic-arena-payload-refs', 4 * ONE_MIB),
  truthStoragePolicy('diagnostics-records', ONE_MIB, 'ttl-after-compaction', 14),
] as const satisfies readonly MessagePackTruthFamilyStoragePolicy[];

export function getMessagePackTruthFamilyStoragePolicy(
  family: MessagePackTruthFamily,
): MessagePackTruthFamilyStoragePolicy {
  const policy = MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES.find((candidate) => candidate.family === family);
  if (!policy) {
    throw new Error(`Unsupported MessagePack truth family storage policy: ${family}`);
  }
  return policy;
}

export const SQL_PROJECTION_SCHEMA_VERSION = 1;

export type SqlProjectionFamily =
  | 'cards'
  | 'review-event-indexes'
  | 'domain-sync-indexes'
  | 'queue-projections'
  | 'semantic-ai-indexes'
  | 'diagnostics-indexes';

export type SqlProjectionSource =
  | 'messagepack-truth'
  | 'siyuan-source'
  | 'allowlisted-block-attrs'
  | 'local-projection'
  | 'worker-diagnostics';

export type SqlProjectionColumnRole =
  | 'identity'
  | 'source-ref'
  | 'truth-ref'
  | 'skinny-index'
  | 'search-index'
  | 'ordering-index'
  | 'counter'
  | 'status'
  | 'summary'
  | 'rebuild-metadata'
  | 'retained-import-input';

export type SqlProjectionPayloadColumnPolicy =
  | 'skinny-index-json'
  | 'truth-ref-json'
  | 'retained-import-input';

export interface SqlProjectionColumnOwnership {
  table: string;
  column: string;
  role: SqlProjectionColumnRole;
  source: SqlProjectionSource | readonly SqlProjectionSource[];
  payloadPolicy?: SqlProjectionPayloadColumnPolicy;
}

export interface SqlProjectionFamilySchema {
  family: SqlProjectionFamily;
  schemaVersion: typeof SQL_PROJECTION_SCHEMA_VERSION;
  tables: readonly string[];
  truthFamilies: readonly MessagePackTruthFamily[];
  sourceInputs: readonly SqlProjectionSource[];
  columns: readonly SqlProjectionColumnOwnership[];
}

function projectionColumn(
  table: string,
  column: string,
  role: SqlProjectionColumnRole,
  source: SqlProjectionSource | readonly SqlProjectionSource[],
  payloadPolicy?: SqlProjectionPayloadColumnPolicy,
): SqlProjectionColumnOwnership {
  return payloadPolicy
    ? { table, column, role, source, payloadPolicy }
    : { table, column, role, source };
}

export const SQL_PROJECTION_FAMILY_SCHEMAS = [
  {
    family: 'cards',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: ['cards', 'xiuyuans', 'tombstones'],
    truthFamilies: ['card-memory-facts'],
    sourceInputs: ['messagepack-truth', 'siyuan-source', 'allowlisted-block-attrs'],
    columns: [
      projectionColumn('cards', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('cards', 'block_id', 'source-ref', ['messagepack-truth', 'siyuan-source']),
      projectionColumn('cards', 'xiuyuan_id', 'source-ref', ['messagepack-truth', 'allowlisted-block-attrs']),
      projectionColumn('cards', 'type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('cards', 'state', 'skinny-index', 'messagepack-truth'),
      projectionColumn('cards', 'due', 'ordering-index', 'messagepack-truth'),
      projectionColumn('cards', 'priority', 'ordering-index', 'messagepack-truth'),
      projectionColumn('cards', 'scheduler_type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('cards', 'deck_id', 'source-ref', 'siyuan-source'),
      projectionColumn('cards', 'root_id', 'source-ref', 'siyuan-source'),
      projectionColumn('cards', 'content_text', 'summary', 'siyuan-source'),
      projectionColumn('cards', 'tags', 'search-index', 'siyuan-source', 'skinny-index-json'),
      projectionColumn('cards', 'search_text', 'search-index', 'siyuan-source'),
      projectionColumn('cards', 'card_type_marker', 'skinny-index', ['messagepack-truth', 'allowlisted-block-attrs']),
      projectionColumn('cards', 'source_exists', 'status', 'siyuan-source'),
      projectionColumn('cards', 'source_checked_at', 'status', 'siyuan-source'),
      projectionColumn('cards', 'source_missing_at', 'status', 'siyuan-source'),
      projectionColumn('cards', 'msgpack_ref', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('cards', 'truth_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('cards', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('cards', 'projection_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('cards', 'source_hash', 'rebuild-metadata', 'siyuan-source'),
      projectionColumn('cards', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
      projectionColumn('cards', 'dto_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
    ],
  },
  {
    family: 'review-event-indexes',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: ['review_events', 'drill_events', 'reschedule_events'],
    truthFamilies: ['review-events'],
    sourceInputs: ['messagepack-truth', 'siyuan-source', 'local-projection'],
    columns: [
      projectionColumn('review_events', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('review_events', 'card_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'attempt_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'rating', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'reviewed_at', 'ordering-index', 'messagepack-truth'),
      projectionColumn('review_events', 'commit_idempotency_key', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'year', 'ordering-index', 'messagepack-truth'),
      projectionColumn('review_events', 'month', 'ordering-index', 'messagepack-truth'),
      projectionColumn('review_events', 'event_type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('review_events', 'msgpack_ref', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('review_events', 'truth_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('review_events', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('review_events', 'projection_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('review_events', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
    ],
  },
  {
    family: 'domain-sync-indexes',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: [
      'domain_sync_operations',
      'domain_sync_processed_sources',
      'domain_sync_sanity_snapshots',
      'domain_sync_repair_plans',
    ],
    truthFamilies: ['domain-sync-operations'],
    sourceInputs: ['messagepack-truth', 'local-projection'],
    columns: [
      projectionColumn('domain_sync_operations', 'operation_id', 'identity', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'source_id', 'source-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'source_device_id', 'source-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'source_generation', 'rebuild-metadata', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'operation_type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'entity_type', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'entity_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'entity_block_id', 'source-ref', ['messagepack-truth', 'siyuan-source']),
      projectionColumn('domain_sync_operations', 'occurred_at', 'ordering-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'observed_at', 'ordering-index', 'local-projection'),
      projectionColumn('domain_sync_operations', 'payload_fingerprint', 'truth-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'idempotency_key', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'review_event_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'msgpack_ref', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('domain_sync_operations', 'truth_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('domain_sync_operations', 'projection_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('domain_sync_operations', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
    ],
  },
  {
    family: 'queue-projections',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: [
      'queue_projection_generations',
      'queue_projection_rows',
      'queue_projection_counters',
      'queue_projection_invalidations',
      'queue_projection_rebuilds',
    ],
    truthFamilies: ['review-events', 'card-memory-facts'],
    sourceInputs: ['messagepack-truth', 'siyuan-source', 'local-projection'],
    columns: [
      projectionColumn('queue_projection_generations', 'queue_type', 'identity', 'local-projection'),
      projectionColumn('queue_projection_generations', 'policy_hash', 'rebuild-metadata', 'local-projection'),
      projectionColumn('queue_projection_generations', 'generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('queue_projection_generations', 'status', 'status', 'local-projection'),
      projectionColumn('queue_projection_generations', 'truth_generation_id', 'truth-ref', 'messagepack-truth'),
      projectionColumn('queue_projection_generations', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('queue_projection_generations', 'metadata_json', 'rebuild-metadata', 'local-projection', 'skinny-index-json'),
      projectionColumn('queue_projection_rows', 'row_id', 'identity', 'local-projection'),
      projectionColumn('queue_projection_rows', 'card_id', 'skinny-index', 'messagepack-truth'),
      projectionColumn('queue_projection_rows', 'block_id', 'source-ref', 'siyuan-source'),
      projectionColumn('queue_projection_rows', 'deck_id', 'source-ref', 'siyuan-source'),
      projectionColumn('queue_projection_rows', 'membership_reason', 'skinny-index', 'local-projection'),
      projectionColumn('queue_projection_rows', 'sort_key', 'ordering-index', 'local-projection'),
      projectionColumn('queue_projection_rows', 'source_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('queue_projection_rows', 'truth_refs_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('queue_projection_rows', 'source_hash', 'rebuild-metadata', 'siyuan-source'),
      projectionColumn('queue_projection_rows', 'truth_schema_version', 'truth-ref', 'messagepack-truth'),
      projectionColumn('queue_projection_rows', 'payload_json', 'summary', 'local-projection', 'skinny-index-json'),
      projectionColumn('queue_projection_counters', 'buckets_json', 'counter', 'local-projection', 'skinny-index-json'),
    ],
  },
  {
    family: 'semantic-ai-indexes',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: [
      'semantic_sessions',
      'semantic_events',
      'semantic_projection_cache',
      'arena_predictions',
      'arena_outcomes',
      'arena_score_snapshots',
      'ai_arena_events',
      'ai_card_attributions',
    ],
    truthFamilies: ['ai-session-payload-refs', 'semantic-arena-payload-refs'],
    sourceInputs: ['messagepack-truth', 'siyuan-source', 'local-projection'],
    columns: [
      projectionColumn('semantic_sessions', 'session_id', 'identity', 'messagepack-truth'),
      projectionColumn('semantic_sessions', 'root_focus_node_id', 'source-ref', 'siyuan-source'),
      projectionColumn('semantic_sessions', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('semantic_sessions', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('semantic_sessions', 'projection_generation', 'rebuild-metadata', 'local-projection'),
      projectionColumn('semantic_sessions', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
      projectionColumn('semantic_projection_cache', 'projection_key', 'identity', 'local-projection'),
      projectionColumn('semantic_projection_cache', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('semantic_projection_cache', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('semantic_projection_cache', 'payload_json', 'summary', 'local-projection', 'skinny-index-json'),
      projectionColumn('semantic_events', 'event_id', 'identity', 'messagepack-truth'),
      projectionColumn('semantic_events', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('ai_arena_events', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('ai_arena_events', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('ai_arena_events', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('ai_arena_events', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
      projectionColumn('arena_predictions', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('arena_predictions', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('arena_outcomes', 'id', 'identity', 'messagepack-truth'),
      projectionColumn('arena_outcomes', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('arena_outcomes', 'payload_json', 'retained-import-input', 'messagepack-truth', 'retained-import-input'),
      projectionColumn('arena_score_snapshots', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('ai_card_attributions', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
    ],
  },
  {
    family: 'diagnostics-indexes',
    schemaVersion: SQL_PROJECTION_SCHEMA_VERSION,
    tables: ['diagnostics_indexes'],
    truthFamilies: ['diagnostics-records'],
    sourceInputs: ['messagepack-truth', 'worker-diagnostics', 'local-projection'],
    columns: [
      projectionColumn('diagnostics_indexes', 'diagnostic_event_id', 'identity', 'messagepack-truth'),
      projectionColumn('diagnostics_indexes', 'category', 'skinny-index', 'worker-diagnostics'),
      projectionColumn('diagnostics_indexes', 'severity', 'status', 'worker-diagnostics'),
      projectionColumn('diagnostics_indexes', 'recorded_at', 'ordering-index', 'worker-diagnostics'),
      projectionColumn('diagnostics_indexes', 'summary', 'summary', 'worker-diagnostics'),
      projectionColumn('diagnostics_indexes', 'payload_ref_json', 'truth-ref', 'messagepack-truth', 'truth-ref-json'),
      projectionColumn('diagnostics_indexes', 'payload_hash', 'truth-ref', 'messagepack-truth'),
      projectionColumn('diagnostics_indexes', 'projection_generation', 'rebuild-metadata', 'local-projection'),
    ],
  },
] as const satisfies readonly SqlProjectionFamilySchema[];

export type StorageSlimmingFamily =
  | 'review-events'
  | 'card-memory'
  | 'domain-sync-operations'
  | 'queue-projections'
  | 'semantic-projections'
  | 'arena-evidence'
  | 'ai-sessions'
  | 'progressive-topic-lineage'
  | 'diagnostics'
  | 'block-attrs';

export type StorageSlimmingOwner =
  | 'messagepack-truth'
  | 'messagepack-truth-or-ref'
  | 'messagepack-truth-or-siyuan-source'
  | 'sql-projection-cache'
  | 'ttl-diagnostics-truth'
  | 'siyuan-source-metadata';

export type StorageSlimmingSqlPayloadRole =
  | 'skinny-index-plus-truth-ref'
  | 'rebuildable-cache'
  | 'ttl-index-plus-truth-ref'
  | 'source-binding-metadata-only';

export type StorageSlimmingWriteMode =
  | 'messagepack-truth-sql-projection'
  | 'messagepack-ref-sql-index'
  | 'projection-cache-only'
  | 'strict-allowlist-only'
  | 'background-diagnostics-ttl';

export interface StorageSlimmingLegacyCompatibilityPolicy {
  legacySources: readonly string[];
  expiryCondition: string;
  removalValidation: string;
}

export interface StorageSlimmingFamilyPolicy {
  family: StorageSlimmingFamily;
  owner: StorageSlimmingOwner;
  truthFamily: MessagePackTruthFamily | null;
  sqlProjectionFamily: SqlProjectionFamily | null;
  sqlPayloadRole: StorageSlimmingSqlPayloadRole;
  writeMode: StorageSlimmingWriteMode;
  legacyCompatibility: StorageSlimmingLegacyCompatibilityPolicy;
}

function slimmingPolicy(
  family: StorageSlimmingFamily,
  owner: StorageSlimmingOwner,
  truthFamily: MessagePackTruthFamily | null,
  sqlProjectionFamily: SqlProjectionFamily | null,
  sqlPayloadRole: StorageSlimmingSqlPayloadRole,
  writeMode: StorageSlimmingWriteMode,
  legacySources: readonly string[],
  expiryCondition: string,
  removalValidation: string,
): StorageSlimmingFamilyPolicy {
  return {
    family,
    owner,
    truthFamily,
    sqlProjectionFamily,
    sqlPayloadRole,
    writeMode,
    legacyCompatibility: {
      legacySources,
      expiryCondition,
      removalValidation,
    },
  };
}

export const STORAGE_SLIMMING_FAMILY_POLICIES = [
  slimmingPolicy(
    'review-events',
    'messagepack-truth',
    'review-events',
    'review-event-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-truth-sql-projection',
    ['review_events.payload_json', 'monthly review log files'],
    'review-events truth flush, rebuild, and idempotency parity pass for imported rows',
    'storage.projection.rebuild review-event-indexes plus review feedback idempotency tests',
  ),
  slimmingPolicy(
    'card-memory',
    'messagepack-truth',
    'card-memory-facts',
    'cards',
    'skinny-index-plus-truth-ref',
    'messagepack-truth-sql-projection',
    ['cards.payload_json', 'cards.dto_json', 'xiuyuans.payload_json', 'legacy cardDTOs'],
    'card-memory/source-binding truth segments rebuild cards and Xiuyuan projections on a second device',
    'storage.projection.rebuild cards tests with deleted SQL and source reads',
  ),
  slimmingPolicy(
    'domain-sync-operations',
    'messagepack-truth',
    'domain-sync-operations',
    'domain-sync-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-truth-sql-projection',
    ['domain_sync_operations.payload_json', 'sync conflict database rows'],
    'domain-sync operation facts and conflict decisions are replayable from MessagePack truth',
    'conflict merge, repair ledger, and idempotency replay tests',
  ),
  slimmingPolicy(
    'queue-projections',
    'sql-projection-cache',
    null,
    'queue-projections',
    'rebuildable-cache',
    'projection-cache-only',
    ['queue_projection_rows.payload_json', 'queue_state.value_json'],
    'queue projections rebuild from card/review truth plus SiYuan source reads',
    'queue projection materialization and stale/deleted SQL rebuild checks',
  ),
  slimmingPolicy(
    'semantic-projections',
    'messagepack-truth-or-ref',
    'semantic-arena-payload-refs',
    'semantic-ai-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-ref-sql-index',
    ['semantic_* payload_json columns'],
    'semantic payload bodies have payload_ref_json/hash or are documented rebuildable cache rows',
    'semantic SQL index/ref contract and payload budget tests',
  ),
  slimmingPolicy(
    'arena-evidence',
    'messagepack-truth-or-ref',
    'semantic-arena-payload-refs',
    'semantic-ai-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-ref-sql-index',
    ['arena_* payload_json columns', 'ai_arena_events.payload_json'],
    'arena evidence payload bodies have payload_ref_json/hash or TTL/cache classification',
    'arena SQL-backed recording and payload ref contract tests',
  ),
  slimmingPolicy(
    'ai-sessions',
    'messagepack-truth-or-ref',
    'ai-session-payload-refs',
    'semantic-ai-indexes',
    'skinny-index-plus-truth-ref',
    'messagepack-ref-sql-index',
    ['ai-workbench session JSON records', 'AI session payload_json rows'],
    'AI session payload bodies move behind backend session/job payload refs or explicit legacy read',
    'AI backend session contract and legacy session load tests',
  ),
  slimmingPolicy(
    'progressive-topic-lineage',
    'messagepack-truth-or-siyuan-source',
    'card-memory-facts',
    'cards',
    'skinny-index-plus-truth-ref',
    'messagepack-ref-sql-index',
    ['progressive/topic lineage attrs', 'progressive payload JSON records'],
    'source-binding and topic lineage facts rebuild from MessagePack truth plus SiYuan source metadata',
    'card/source-binding rebuild and strict block-attr allowlist tests',
  ),
  slimmingPolicy(
    'diagnostics',
    'ttl-diagnostics-truth',
    'diagnostics-records',
    'diagnostics-indexes',
    'ttl-index-plus-truth-ref',
    'background-diagnostics-ttl',
    ['diagnostic payload_json fields', 'debug JSON files'],
    'diagnostics payloads are TTL truth records or bounded summaries, not permanent SQL truth',
    'diagnostics index/ref contract and retention policy tests',
  ),
  slimmingPolicy(
    'block-attrs',
    'siyuan-source-metadata',
    null,
    null,
    'source-binding-metadata-only',
    'strict-allowlist-only',
    ['custom-fsrs-* legacy attrs', 'custom-xiuyuan-id legacy binding attrs'],
    'all non-source-metadata writes are rejected and legacy attrs are read-only or cleanup-only',
    'BlockAttrPolicy and Siyuan API BLOCK_ATTR_WRITE_FORBIDDEN tests',
  ),
] as const satisfies readonly StorageSlimmingFamilyPolicy[];

export type BackendStorageProjectionRebuildStatus = 'ready' | 'refreshing' | 'unavailable' | 'repair-required';

export type BackendStorageProjectionRebuildCause =
  | 'sql-missing'
  | 'sql-stale'
  | 'sql-deleted'
  | 'manual'
  | 'truth-flush'
  | 'source-missing'
  | 'schema-upgrade';

export type BackendStorageProjectionRebuildUnavailableReason =
  | 'truth-store-unavailable'
  | 'source-reader-unavailable'
  | 'missing-source'
  | 'unsupported-family'
  | 'validation-failed'
  | 'invalid-request'
  | 'internal-error';

export interface BackendStorageProjectionRebuildRequest {
  rebuildId?: string | null;
  cause?: BackendStorageProjectionRebuildCause | string | null;
  families: SqlProjectionFamily[];
  deviceId: string;
  generationId: string;
  schemaVersion?: number | null;
  maxSegmentBytes?: number | null;
}

export interface BackendStorageProjectionRebuildFamilyResult {
  family: SqlProjectionFamily;
  status: BackendStorageProjectionRebuildStatus;
  unavailableReason?: BackendStorageProjectionRebuildUnavailableReason | null;
  projectionGeneration: number;
  rowsRead: number;
  rowsWritten: number;
  sourceReadCount: number;
  missingSourceIds: string[];
  error: string | null;
}

export interface BackendStorageProjectionRebuildResult {
  status: BackendStorageProjectionRebuildStatus;
  at: number;
  rebuildId: string;
  cause: string;
  projectionGeneration: number;
  rowsRead: number;
  rowsWritten: number;
  sourceReadCount: number;
  missingSourceIds: string[];
  families: BackendStorageProjectionRebuildFamilyResult[];
  error: string | null;
}

export interface MessagePackTruthRef {
  family: MessagePackTruthFamily;
  deviceId: string;
  generationId: string;
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  segmentPath: string;
  recordId?: string | null;
  idempotencyKey?: string | null;
  checksum?: string | null;
}

export interface MessagePackTruthSourceRef {
  cardId?: string | null;
  blockId?: string | null;
  sourceBlockId?: string | null;
  deckId?: string | null;
  xiuyuanId?: string | null;
  cardFaceId?: string | null;
  sourceHash?: string | null;
}

export interface MessagePackReviewEventTruthRecord {
  family: 'review-events';
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  type:
    | 'review.feedback.v1'
    | 'review.feedback.v2'
    | 'review.skip.v1'
    | 'review.custom-feedback.v1'
    | 'review.reschedule.v1'
    | 'review.drill-only.v1';
  idempotencyKey: string;
  eventId?: string | null;
  attemptId?: string | null;
  journalEntryId?: string | null;
  logicalTime: number;
  recordedAt: number;
  source: MessagePackTruthSourceRef & {
    cardId: string;
  };
  review: {
    action: 'rating' | 'skip' | 'custom-feedback' | 'reschedule' | 'drill-only';
    rating?: 1 | 2 | 3 | 4 | null;
    customActionId?: string | null;
    reviewedAt: number;
    scheduler?: string | null;
  };
  memory: {
    baseMemoryHash?: string | null;
    afterMemoryHash?: string | null;
    projectionGeneration?: number | null;
  };
  queue?: {
    queueType?: string | null;
    queueMode?: string | null;
    commitPolicy?: string | null;
  };
  scheduler?: {
    schedulerType?: string | null;
    algorithm?: string | null;
    configHash?: string | null;
  };
  projection?: {
    generation?: number | null;
    policyHash?: string | null;
    schemaVersion?: number | null;
  };
  beforeCard?: Record<string, unknown> | null;
  afterCard?: Record<string, unknown> | null;
}

export interface MessagePackCardMemoryFactTruthRecord {
  family: 'card-memory-facts';
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  type:
    | 'card-memory.created.v1'
    | 'card-memory.updated.v1'
    | 'card-memory.tombstoned.v1'
    | 'source-binding.created.v1'
    | 'card-face.created.v1'
    | 'card-memory.snapshot-imported'
    | 'card-memory.tombstone-imported'
    | 'source-binding.snapshot-imported';
  idempotencyKey: string;
  logicalTime: number;
  recordedAt: number;
  source: MessagePackTruthSourceRef & {
    cardId?: string | null;
  };
  memory: {
    schedulerOwner?: string | null;
    memoryHash?: string | null;
    previousMemoryHash?: string | null;
    lineage?: Record<string, unknown> | null;
  };
}

export interface MessagePackDomainSyncOperationTruthRecord {
  family: 'domain-sync-operations';
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  type: 'domain-sync.operation.v1' | 'domain-sync.tombstone.v1' | 'domain-sync.conflict-decision.v1';
  operationId: string;
  idempotencyKey: string;
  logicalTime: number;
  recordedAt: number;
  operationType: BackendDomainSyncOperationType | string;
  source: MessagePackTruthSourceRef;
  payloadRef?: MessagePackTruthRef | null;
  payload?: Record<string, unknown> | null;
}

export interface MessagePackAiSessionPayloadRefTruthRecord {
  family: 'ai-session-payload-refs';
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  type: 'ai-session.payload-ref.v1';
  idempotencyKey: string;
  logicalTime: number;
  recordedAt: number;
  sessionId: string;
  payloadKind: 'prompt' | 'response' | 'tool-call' | 'tool-result' | 'stream-event' | 'summary';
  payloadRef: MessagePackTruthRef;
  hash: string;
  summary?: string | null;
}

export interface MessagePackSemanticArenaPayloadRefTruthRecord {
  family: 'semantic-arena-payload-refs';
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  type: 'semantic.payload-ref.v1' | 'arena.payload-ref.v1';
  idempotencyKey: string;
  logicalTime: number;
  recordedAt: number;
  source: MessagePackTruthSourceRef;
  payloadKind: 'semantic-session' | 'semantic-projection' | 'arena-evidence' | 'arena-score';
  payloadRef: MessagePackTruthRef;
  hash: string;
  summary?: string | null;
}

export interface MessagePackDiagnosticsTruthRecord {
  family: 'diagnostics-records';
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  type: 'diagnostic.record.v1';
  diagnosticEventId: string;
  idempotencyKey?: string | null;
  logicalTime: number;
  recordedAt: number;
  category: 'review-hot-path' | 'truth-flush' | 'projection-rebuild' | 'sql-checkpoint' | 'storage-budget' | 'migration' | string;
  severity: 'info' | 'warning' | 'error';
  summary: string;
  payloadRef?: MessagePackTruthRef | null;
  fields?: Record<string, unknown> | null;
}

export type MessagePackTruthRecord =
  | MessagePackReviewEventTruthRecord
  | MessagePackCardMemoryFactTruthRecord
  | MessagePackDomainSyncOperationTruthRecord
  | MessagePackAiSessionPayloadRefTruthRecord
  | MessagePackSemanticArenaPayloadRefTruthRecord
  | MessagePackDiagnosticsTruthRecord;

export interface BackendReviewFeedbackTruthFlushRequest {
  deviceId: string;
  generationId: string;
  schemaVersion?: number;
  maxSegmentBytes?: number;
  batchLimit?: number;
}

export interface BackendReviewFeedbackTruthFlushResult {
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

export interface BackendReviewFeedbackTruthFlushDiagnostics {
  family: 'review-events';
  storage: 'truth-segments' | 'unavailable';
  last: BackendReviewFeedbackTruthFlushResult | null;
}

export interface BackendReviewTruthBackfillRequest {
  deviceId: string;
  generationId: string;
  schemaVersion?: number;
  maxSegmentBytes?: number;
  batchLimit?: number;
  sourceId?: string | null;
}

export interface BackendReviewTruthBackfillResult {
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

export interface BackendReviewTruthBackfillDiagnostics {
  family: 'review-events';
  source: 'review_events';
  storage: 'truth-segments' | 'unavailable';
  pendingSqlRows: number | null;
  pendingSqlRowsCheckedAt: number | null;
  syncVisible: boolean;
  last: BackendReviewTruthBackfillResult | null;
  lastError: string | null;
}

export type BackendUnavailableClass =
  | 'WRITER_UNAVAILABLE'
  | 'LEASE_UNAVAILABLE'
  | 'RELAY_QUEUE_UNAVAILABLE'
  | 'BACKEND_UNAVAILABLE'
  | 'KERNEL_SIDECAR_UNAVAILABLE'
  | 'UPSTREAM_SIYUAN_UNAVAILABLE'
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'INVALID_REQUEST'
  | 'FAILED';

export type BackendHotspotCommandFamily =
  | 'xiuyuan.sync'
  | 'progressive.command'
  | 'topic-derived.command'
  | 'ai.tool-job'
  | 'review.riff-feedback'
  | 'review.source-refresh';

export type BackendHotspotCommandState =
  | 'accepted'
  | 'running'
  | 'waiting-for-renderer-facts'
  | 'waiting-for-user-approval'
  | 'succeeded'
  | 'failed'
  | 'unavailable'
  | 'timeout'
  | 'canceled'
  | 'duplicate'
  | 'stale-generation'
  | 'validation-failed';

export interface BackendHotspotCallerIdentity {
  instanceId: string;
  runtimeRole: 'writer' | 'follower' | 'single-window' | 'worker' | 'unknown';
  surface: 'browser' | 'review' | 'ai-workbench' | 'mobile' | 'background' | 'private-api' | 'unknown';
}

export interface BackendHotspotWriterExpectation {
  mode: 'required' | 'preferred' | 'not-required';
  expectedWriterInstanceId?: string | null;
  relayAllowed: boolean;
}

export interface BackendHotspotCommandDiagnostics {
  diagnosticEventId: string;
  family: BackendHotspotCommandFamily;
  commandId: string;
  timing?: {
    submittedAt: number;
    deadlineAt?: number | null;
    completedAt?: number | null;
  };
  counters?: Record<string, number>;
  errorCategory?: BackendUnavailableClass | 'VALIDATION_FAILED' | 'UNKNOWN' | null;
}

export interface BackendHotspotCommandProgress {
  state: BackendHotspotCommandState;
  currentStep?: string | null;
  completedUnits?: number | null;
  totalUnits?: number | null;
  updatedAt: number;
}

export interface BackendHotspotCommandEnvelope<TPayload = unknown> {
  family: BackendHotspotCommandFamily;
  commandId: string;
  idempotencyKey: string;
  caller: BackendHotspotCallerIdentity;
  writerExpectation: BackendHotspotWriterExpectation;
  deadlineAt: number;
  submittedAt: number;
  payload: TPayload;
  diagnostics?: Partial<BackendHotspotCommandDiagnostics>;
}

export interface BackendHotspotCommandSubmitRequest<TPayload = unknown> {
  envelope: BackendHotspotCommandEnvelope<TPayload>;
}

export type BackendHotspotCommandTerminalResult<TResult = unknown> =
  | {
      ok: true;
      family: BackendHotspotCommandFamily;
      commandId: string;
      idempotencyKey: string;
      state: 'succeeded' | 'duplicate';
      result: TResult;
      progress: BackendHotspotCommandProgress;
      diagnostics: BackendHotspotCommandDiagnostics;
    }
  | {
      ok: false;
      family: BackendHotspotCommandFamily;
      commandId: string;
      idempotencyKey: string;
      state: Exclude<BackendHotspotCommandState, 'accepted' | 'running' | 'waiting-for-renderer-facts' | 'waiting-for-user-approval' | 'succeeded' | 'duplicate'>;
      unavailableClass: BackendUnavailableClass | null;
      reason: string;
      recoverable: boolean;
      progress: BackendHotspotCommandProgress;
      diagnostics: BackendHotspotCommandDiagnostics;
    };

export type BackendHotspotCommandSubmitResult<TResult = unknown> =
  | {
      ok: true;
      accepted: true;
      family: BackendHotspotCommandFamily;
      commandId: string;
      idempotencyKey: string;
      state: 'accepted' | 'running' | 'waiting-for-renderer-facts' | 'waiting-for-user-approval';
      progress: BackendHotspotCommandProgress;
      diagnostics: BackendHotspotCommandDiagnostics;
    }
  | BackendHotspotCommandTerminalResult<TResult>;

export interface BackendHotspotJobGetRequest {
  family: BackendHotspotCommandFamily;
  commandId: string;
  idempotencyKey?: string | null;
}

export type BackendHotspotJobGetResult<TResult = unknown> =
  | BackendHotspotCommandSubmitResult<TResult>
  | {
      ok: false;
      family: BackendHotspotCommandFamily;
      commandId: string;
      state: 'unavailable' | 'failed';
      unavailableClass: BackendUnavailableClass;
      reason: string;
      recoverable: boolean;
    };

export type BackendXiuyuanSyncMode = 'incremental' | 'full' | 'audit';

export interface BackendXiuyuanSyncScope {
  blockIds?: string[] | null;
  dueOnly?: boolean | null;
  notebook?: string | null;
  rootId?: string | null;
  includeNew?: boolean | null;
}

export interface BackendXiuyuanNativeRiffCardFacts {
  id?: string | null;
  blockID?: string | null;
  deckID?: string | null;
  due?: string | null;
  reps?: number | null;
  lapses?: number | null;
  state?: number | null;
  lastReview?: string | null;
  stability?: number | null;
  difficulty?: number | null;
  elapsedDays?: number | null;
  scheduledDays?: number | null;
}

export interface BackendXiuyuanNativeRiffBlockFacts {
  id: string;
  content: string;
  ial?: Record<string, string>;
  riffCardID?: string | null;
  riffCardId?: string | null;
  riffCard?: BackendXiuyuanNativeRiffCardFacts;
}

export interface BackendXiuyuanRiffReadAuditRequest {
  requestId: string;
  mode: BackendXiuyuanSyncMode;
  deckId: string;
  since?: number | null;
  scope?: BackendXiuyuanSyncScope | null;
  deadlineAt?: number | null;
}

export type BackendXiuyuanRiffReadAuditSource =
  | 'kernel-sidecar'
  | 'renderer-host-effect';

export type BackendXiuyuanRiffReadAuditResult =
  | {
      status: 'ready';
      requestId: string;
      mode: BackendXiuyuanSyncMode;
      deckId: string;
      readAt: number;
      blocks: BackendXiuyuanNativeRiffBlockFacts[];
      diagnostics: {
        source: BackendXiuyuanRiffReadAuditSource;
        blockCount: number;
        normalizedBlockCount: number;
        malformedBlockCount: number;
        truncated: boolean;
      };
    }
  | {
      status: 'unavailable' | 'failed';
      requestId: string;
      mode: BackendXiuyuanSyncMode;
      deckId: string;
      unavailableClass: BackendUnavailableClass;
      reason: string;
      recoverable: boolean;
      blocks: [];
      diagnostics: {
        source: BackendXiuyuanRiffReadAuditSource | 'none';
        blockCount: 0;
        normalizedBlockCount: 0;
        malformedBlockCount: 0;
        truncated: false;
        errorCategory: BackendUnavailableClass;
      };
    };

export interface BackendXiuyuanSyncLocalXiuyuanFact {
  id: string;
  blockIds: string[];
  representativeBlockId?: string | null;
  templateId?: string | null;
  ownership?: string | null;
  source?: string | null;
  updatedAt?: number | null;
}

export interface BackendXiuyuanSyncLocalCardFact {
  id: string;
  xiuyuanId?: string | null;
  blockId: string;
  riffCardId?: string | null;
  templateId?: string | null;
  ownership?: string | null;
  source?: string | null;
  schedulerType?: string | null;
  updatedAt?: number | null;
}

export interface BackendXiuyuanSyncLocalFacts {
  loadedAt: number;
  xiuyuans: BackendXiuyuanSyncLocalXiuyuanFact[];
  cards: BackendXiuyuanSyncLocalCardFact[];
}

export interface BackendXiuyuanShadowAuditOwnershipEvidence {
  entity: 'card' | 'xiuyuan';
  id: string;
  xiuyuanId?: string | null;
  templateId?: string | null;
  ownership?: string | null;
  source?: string | null;
  riffCardId?: string | null;
}

export interface BackendXiuyuanShadowAuditFinding {
  blockId: string;
  pluginCardIds: string[];
  shadowCardIds: string[];
  pluginXiuyuanIds: string[];
  shadowXiuyuanIds: string[];
  ownershipEvidence: {
    plugin: BackendXiuyuanShadowAuditOwnershipEvidence[];
    shadow: BackendXiuyuanShadowAuditOwnershipEvidence[];
  };
  proposedAction: 'audit-only-defer-hide-or-delete-policy';
}

export interface BackendXiuyuanShadowAudit {
  findingCount: number;
  findings: BackendXiuyuanShadowAuditFinding[];
}

export interface BackendXiuyuanSyncExecuteRequest {
  requestId: string;
  commandId: string;
  idempotencyKey: string;
  mode: BackendXiuyuanSyncMode;
  dryRun: boolean;
  deckId: string;
  requestedAt: number;
  since?: number | null;
  scope?: BackendXiuyuanSyncScope | null;
  deadlineAt?: number | null;
  caller?: BackendHotspotCallerIdentity | null;
  persistIdleCheckpoint?: boolean;
}

export interface BackendXiuyuanSyncPlan {
  localXiuyuanCount: number;
  localCardCount: number;
  localManagedRiffCount: number;
  nativeRiffCount: number;
  normalizedNativeRiffCount: number;
  malformedNativeRiffCount: number;
  duplicateNativeRiffCount: number;
  createCount: number;
  updateCount: number;
  deleteCount: number;
  skippedLocalOwnedCount: number;
  candidateBlockIds: {
    create: string[];
    update: string[];
    delete: string[];
    skippedLocalOwned: string[];
  };
  shadowAudit?: BackendXiuyuanShadowAudit;
}

export interface BackendXiuyuanSyncApplyImpact {
  requested: boolean;
  applied: boolean;
  reason: 'applied' | 'dry-run' | 'read-unavailable';
  changed: MutationChangedSet;
}

export interface BackendXiuyuanSyncDiagnostics {
  diagnosticEventId: string;
  readSource: BackendXiuyuanRiffReadAuditSource | 'none';
  localLoadedAt?: number | null;
  nativeReadAt?: number | null;
  timingMs: number;
  errorCategory?: BackendUnavailableClass | null;
}

export type BackendXiuyuanSyncExecuteResult =
  | {
      status: 'planned' | 'applied';
      commandId: string;
      idempotencyKey: string;
      mode: BackendXiuyuanSyncMode;
      dryRun: boolean;
      progress: BackendHotspotCommandProgress;
      plan: BackendXiuyuanSyncPlan;
      applyImpact: BackendXiuyuanSyncApplyImpact;
      diagnostics: BackendXiuyuanSyncDiagnostics;
    }
  | {
      status: 'unavailable' | 'failed';
      commandId: string;
      idempotencyKey: string;
      mode: BackendXiuyuanSyncMode;
      dryRun: boolean;
      unavailableClass: BackendUnavailableClass;
      reason: string;
      recoverable: boolean;
      progress: BackendHotspotCommandProgress;
      applyImpact: BackendXiuyuanSyncApplyImpact;
      diagnostics: BackendXiuyuanSyncDiagnostics;
    };

export type BackendProgressiveCommandOperation =
  | 'create-excerpt'
  | 'create-child-doc'
  | 'delete-artifact'
  | 'advance'
  | 'defer'
  | 'split'
  | 'convert-to-card';

export interface BackendProgressiveCommandExecuteRequest<TInput = Record<string, unknown>> {
  requestId: string;
  commandId: string;
  idempotencyKey: string;
  operation: BackendProgressiveCommandOperation;
  input: TInput;
  requestedAt: number;
  deadlineAt?: number | null;
  caller?: BackendHotspotCallerIdentity | null;
}

export type BackendProgressiveCommandExecuteResult<TResult = unknown> =
  | {
      status: 'completed' | 'duplicate';
      commandId: string;
      idempotencyKey: string;
      operation: BackendProgressiveCommandOperation;
      result: TResult;
      rollback: {
        attempted: boolean;
        status: 'not-needed' | 'completed' | 'failed';
        reason?: string | null;
      };
      progress: BackendHotspotCommandProgress;
      diagnostics: BackendHotspotCommandDiagnostics;
    }
  | {
      status: 'unavailable' | 'validation-failed' | 'failed';
      commandId: string;
      idempotencyKey: string;
      operation: BackendProgressiveCommandOperation;
      unavailableClass: BackendUnavailableClass | null;
      reason: string;
      recoverable: boolean;
      rollback: {
        attempted: boolean;
        status: 'not-needed' | 'completed' | 'failed';
        reason?: string | null;
      };
      progress: BackendHotspotCommandProgress;
      diagnostics: BackendHotspotCommandDiagnostics;
    };

export interface BackendTopicDerivedCommandExecuteRequest<TInput = Record<string, unknown>> {
  requestId: string;
  commandId: string;
  idempotencyKey: string;
  operation: 'create-from-topic-source';
  input: TInput;
  requestedAt: number;
  deadlineAt?: number | null;
  caller?: BackendHotspotCallerIdentity | null;
}

export type BackendTopicDerivedCommandExecuteResult<TResult = unknown> =
  | {
      status: 'completed' | 'duplicate';
      commandId: string;
      idempotencyKey: string;
      operation: 'create-from-topic-source';
      result: TResult;
      audit: {
        created: number;
        skipped: number;
        nativeRiffRegistered: number;
      };
      rollback: {
        attempted: boolean;
        status: 'not-needed' | 'completed' | 'failed';
        reason?: string | null;
      };
      progress: BackendHotspotCommandProgress;
      diagnostics: BackendHotspotCommandDiagnostics;
    }
  | {
      status: 'unavailable' | 'validation-failed' | 'failed';
      commandId: string;
      idempotencyKey: string;
      operation: 'create-from-topic-source';
      unavailableClass: BackendUnavailableClass | null;
      reason: string;
      recoverable: boolean;
      audit: {
        created: number;
        skipped: number;
        nativeRiffRegistered: number;
      };
      rollback: {
        attempted: boolean;
        status: 'not-needed' | 'completed' | 'failed';
        reason?: string | null;
      };
      progress: BackendHotspotCommandProgress;
      diagnostics: BackendHotspotCommandDiagnostics;
    };

export type BackendBrowserAggregateStatus =
  | 'ready'
  | 'refreshing'
  | 'unavailable'
  | 'stale-generation'
  | 'ready-empty';

export interface BackendBrowserAggregateIdentity {
  snapshotId: string;
  generation: number;
  datasourceId: string;
  policyHash: string;
  queryFingerprint: string;
}

export interface BackendBrowserAggregateSnapshotRequest {
  requestId: string;
  datasourceId: string;
  fullUniverseReason?: string | null;
  queueType?: string | null;
  scope?: Record<string, unknown> | null;
  sort?: Record<string, unknown> | null;
  filter?: Record<string, unknown> | null;
  deadlineAt?: number | null;
}

export interface BackendBrowserAggregateSnapshotResult {
  status: BackendBrowserAggregateStatus;
  identity: BackendBrowserAggregateIdentity | null;
  totalCount: number;
  pageSize: number;
  unavailableClass?: BackendUnavailableClass | null;
  reason?: string | null;
}

export interface BackendBrowserAggregatePageRequest {
  requestId: string;
  identity: BackendBrowserAggregateIdentity;
  cursor?: string | null;
  offset?: number | null;
  limit: number;
  deadlineAt?: number | null;
}

export interface BackendBrowserAggregatePageResult<TRow = unknown> {
  status: BackendBrowserAggregateStatus;
  identity: BackendBrowserAggregateIdentity | null;
  rows: TRow[];
  nextCursor?: string | null;
  totalCount?: number | null;
  unavailableClass?: BackendUnavailableClass | null;
  reason?: string | null;
}

export interface BackendBrowserAggregateFocusRequest {
  requestId: string;
  identity: BackendBrowserAggregateIdentity;
  focus:
    | { type: 'card'; cardId: string }
    | { type: 'block'; blockId: string }
    | { type: 'source'; sourceId: string };
  limitBefore?: number | null;
  limitAfter?: number | null;
  deadlineAt?: number | null;
}

export interface BackendBrowserAggregateFocusResult<TRow = unknown> {
  status: BackendBrowserAggregateStatus;
  identity: BackendBrowserAggregateIdentity | null;
  focusFound: boolean;
  rows: TRow[];
  hierarchy?: Record<string, unknown> | null;
  sourceExistence?: Record<string, unknown> | null;
  unavailableClass?: BackendUnavailableClass | null;
  reason?: string | null;
}

export type BackendGraphQueryKind =
  | 'neighbors'
  | 'backlinks'
  | 'outgoing-links'
  | 'descriptors'
  | 'subtree-ids'
  | 'generic-edges'
  | 'hyperspace-edges'
  | 'concept-map-edges'
  | 'element-link-edges'
  | 'block-tree-edges'
  | 'document-tree-edges'
  | 'node-priority';

export interface BackendGraphQueryRequest {
  queryId: string;
  kind: BackendGraphQueryKind;
  sourceNodeId: string;
  scope?: Record<string, unknown> | null;
  limit?: number | null;
  deadlineAt?: number | null;
  cacheGeneration?: number | null;
}

export interface BackendGraphPresentationNode {
  nodeId: string;
  kind: 'flashcard' | 'block' | 'document' | 'heading' | 'list-item' | 'paragraph' | 'concept' | 'unknown';
  title: string;
  summary?: string | null;
  sourceIdentity?: Record<string, unknown> | null;
  breadcrumb?: string[] | null;
  availability: 'available' | 'unavailable';
  unavailableReason?: string | null;
  debugId?: string | null;
}

export interface BackendGraphPresentationEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: string;
  rationale?: string | null;
  evidence?: Record<string, unknown> | null;
}

export type BackendGraphQueryResult =
  | {
      status: 'ready' | 'partial';
      queryId: string;
      kind: BackendGraphQueryKind;
      nodes: BackendGraphPresentationNode[];
      edges: BackendGraphPresentationEdge[];
      limitReached: boolean;
      continuation?: string | null;
      diagnostics: {
        timingMs: number;
        nodeCount: number;
        edgeCount: number;
        sourceAvailability: 'available' | 'partial' | 'unavailable';
      };
    }
  | {
      status: 'unavailable' | 'failed';
      queryId: string;
      kind: BackendGraphQueryKind;
      unavailableClass: BackendUnavailableClass | null;
      reason: string;
      recoverable: boolean;
      diagnostics: {
        timingMs: number;
        sourceAvailability: 'unavailable' | 'unknown';
        errorCategory: string;
      };
    };

export type BackendAiSessionState =
  | 'active'
  | 'streaming'
  | 'completed'
  | 'canceled'
  | 'expired'
  | 'unavailable'
  | 'failed';

export type BackendAiJobState =
  | 'queued'
  | 'running'
  | 'progress'
  | 'completed'
  | 'canceled'
  | 'timeout'
  | 'unavailable'
  | 'failed';

export interface BackendAiSessionRecord {
  sessionId: string;
  surfaceId: string;
  reviewSessionId: string | null;
  owner: 'application' | 'backend';
  skillId: string | null;
  providerId: string | null;
  modelId: string | null;
  state: BackendAiSessionState;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  lastError: string | null;
  diagnosticEventId: string;
}

export interface BackendAiSessionCreateRequest {
  sessionId: string;
  surfaceId: string;
  reviewSessionId?: string | null;
  owner?: 'application' | 'backend';
  skillId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  idempotencyKey?: string;
}

export interface BackendAiSessionGetRequest {
  sessionId: string;
}

export interface BackendAiSessionUpdateRequest {
  sessionId: string;
  state?: BackendAiSessionState;
  skillId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  expiresAt?: number | null;
  lastError?: string | null;
}

export interface BackendAiSessionCancelRequest {
  sessionId: string;
  reason?: string;
}

export interface BackendAiSessionResult {
  ok: true;
  session: BackendAiSessionRecord;
}

export interface BackendAiStreamStartRequest {
  streamId: string;
  sessionId: string;
  jobId: string;
  providerId?: string | null;
  modelId?: string | null;
  inputFingerprint?: string;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export interface BackendAiPromptNetworkRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  redactionKeys?: string[];
  stream?: boolean;
}

export interface BackendAiPromptExecuteRequest {
  sessionId: string;
  streamId: string;
  jobId: string;
  providerId?: string | null;
  modelId?: string | null;
  timeoutMs?: number;
  idempotencyKey?: string;
  request: BackendAiPromptNetworkRequest;
}

export interface BackendAiPromptNetworkResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface BackendAiPromptExecuteResult {
  ok: true;
  sessionId: string;
  streamId: string;
  jobId: string;
  state: 'completed' | 'timeout' | 'canceled' | 'unavailable' | 'failed';
  unavailableClass?: BackendUnavailableClass | null;
  diagnosticEventId: string;
  response?: BackendAiPromptNetworkResponse;
}

export interface BackendAiStreamCancelRequest {
  streamId: string;
  sessionId: string;
  jobId: string;
  reason?: string;
}

export interface BackendAiStreamResult {
  ok: true;
  streamId: string;
  sessionId: string;
  jobId: string;
  state: 'started' | 'canceled' | 'timeout' | 'unavailable' | 'failed' | 'completed';
  diagnosticEventId: string;
}

export interface BackendAiJobRecord {
  jobId: string;
  kind: 'ai-stream' | 'ai-tool-job';
  owner: 'application' | 'backend';
  idempotencyKey: string;
  state: BackendAiJobState;
  progress: number;
  startedAt: number;
  updatedAt: number;
  deadlineAt: number | null;
  retryPolicy: 'none' | 'safe-retry';
  result: unknown;
  error: string | null;
}

export interface BackendAiJobGetRequest {
  jobId: string;
}

export interface BackendAiJobCancelRequest {
  jobId: string;
  reason?: string;
}

export interface BackendAiJobResult {
  ok: true;
  job: BackendAiJobRecord;
}

export type BackendAiToolJobPhase =
  | 'provider-execution'
  | 'approval-wait'
  | 'write-preparation'
  | 'writer-commit'
  | 'terminal';

export interface BackendAiToolJobExecuteRequest {
  jobId: string;
  sessionId: string;
  commandId: string;
  idempotencyKey: string;
  toolName: string;
  providerId?: string | null;
  modelId?: string | null;
  phase?: BackendAiToolJobPhase | null;
  requiresApproval?: boolean | null;
  approvalState?: 'not-required' | 'pending' | 'approved' | 'rejected' | 'canceled' | null;
  writeIntent?: {
    kind: 'none' | 'progressive' | 'topic-derived' | 'flashcard' | 'markdown-insertion';
    sourceId?: string | null;
    targetBlockId?: string | null;
    cardCount?: number | null;
  } | null;
  deadlineAt?: number | null;
}

export interface BackendAiToolJobApprovalRequest {
  jobId: string;
  sessionId: string;
  commandId: string;
  idempotencyKey: string;
  decision: 'approved' | 'rejected' | 'canceled';
  decidedAt: number;
}

export interface BackendAiToolJobResult {
  status: 'queued' | 'waiting-for-user-approval' | 'completed' | 'duplicate' | 'rejected' | 'canceled' | 'unavailable' | 'failed';
  jobId: string;
  sessionId: string;
  commandId: string;
  phase: BackendAiToolJobPhase;
  unavailableClass?: BackendUnavailableClass | null;
  reason?: string | null;
  progress: BackendHotspotCommandProgress;
  diagnostics: BackendHotspotCommandDiagnostics;
}

export interface BackendReviewRiffFeedbackExecuteRequest {
  commandId: string;
  idempotencyKey: string;
  sessionId?: string | null;
  action: 'rate' | 'skip';
  deckId: string;
  riffCardId: string;
  rating?: number | null;
  deadlineAt?: number | null;
}

export interface BackendReviewRiffFeedbackExecuteResult {
  status: 'completed' | 'duplicate' | 'unavailable' | 'failed';
  commandId: string;
  idempotencyKey: string;
  action: 'rate' | 'skip';
  updated: number;
  skipped: number;
  unavailableClass?: BackendUnavailableClass | null;
  reason?: string | null;
  queueImpact: {
    refreshRequired: boolean;
    projectionChanged: boolean;
    removedFromQueue: boolean;
  };
  diagnostics: BackendHotspotCommandDiagnostics;
}

export interface BackendReviewSourceRefreshExecuteRequest {
  commandId: string;
  idempotencyKey: string;
  sessionId?: string | null;
  currentCardId?: string | null;
  currentBlockId?: string | null;
  changedBlockIds: string[];
  dependencyBlockIds: string[];
  missingSourceBlockIds?: string[] | null;
  deadlineAt?: number | null;
}

export interface BackendReviewSourceRefreshExecuteResult {
  status: 'refresh-required' | 'no-op' | 'missing-source' | 'unavailable' | 'failed';
  commandId: string;
  idempotencyKey: string;
  matchedBlockIds: string[];
  unavailableClass?: BackendUnavailableClass | null;
  reason?: string | null;
  impact: {
    refreshVisibleContent: boolean;
    cleanupMissingSource: boolean;
  };
  diagnostics: BackendHotspotCommandDiagnostics;
}

export interface PrivateApiCapabilityResult {
  available: boolean;
  reason: string | null;
  kernelSidecarAvailable: boolean;
  backendWorkerAvailable: boolean;
  writerAvailable: boolean;
  methodAllowed: boolean;
}

export interface PrivateApiReadRequest {
  requestId: string;
  method: 'private.read.cards' | 'private.read.queues' | 'private.read.sessions';
  callerIntent: string;
  capabilityResult?: PrivateApiCapabilityResult;
  limit?: number;
  filter?: Record<string, unknown>;
}

export interface PrivateApiReadResult {
  ok: true;
  data: unknown;
  diagnosticEventId: string;
  auditStatus: 'recorded' | 'skipped';
}

export interface PrivateApiMutationRequest {
  requestId: string;
  method: 'private.command.execute';
  callerIntent: string;
  capabilityResult?: PrivateApiCapabilityResult;
  idempotencyKey: string;
  params?: Record<string, unknown>;
  auditContext?: Record<string, unknown>;
}

export interface PrivateApiMutationResult {
  ok: true;
  commandId: string;
  writerInstanceId: string;
  changed: MutationChangedSet;
  result: unknown;
  auditStatus: 'recorded' | 'skipped';
  diagnosticEventId: string;
}

export type BackendSemanticLens = 'assimilation' | 'accommodation' | 'free';

export type BackendSemanticStationType = 'node' | 'path';

export type BackendSemanticNodeType = 'real-review-card' | 'implicit-knowledge' | 'concept';

export type BackendSemanticNodeKind =
  | 'flashcard'
  | 'block'
  | 'document'
  | 'heading'
  | 'list-item'
  | 'paragraph'
  | 'concept'
  | 'unknown';

export interface BackendSemanticNodeAvailability {
  status: 'available' | 'unavailable';
  reason?:
    | 'writer-unavailable'
    | 'projection-unavailable'
    | 'graph-unavailable'
    | 'session-unavailable'
    | 'focus-unavailable'
    | 'candidate-unavailable'
    | 'station-unavailable'
    | 'inactive-station'
    | 'invalid-request'
    | 'failed'
    | 'source-missing'
    | 'content-missing'
    | 'virtual-node'
    | null;
  message?: string | null;
}

export interface BackendSemanticPathEntry {
  nodeId: string;
  lens: BackendSemanticLens;
  eventId: string;
  visitedAt: number;
}

export interface BackendSemanticSessionSnapshot {
  sessionId: string;
  rootFocusNodeId: string;
  rootFocusNodeType?: BackendSemanticNodeType | null;
  currentNodeId: string;
  activeLens: BackendSemanticLens;
  narrativePath: BackendSemanticPathEntry[];
  startedAt: number;
  endedAt?: number | null;
  forkMetadata?: BackendSemanticForkMetadata | null;
}

export interface BackendSemanticNode {
  nodeId: string;
  nodeType: BackendSemanticNodeType;
  presentation?: BackendSemanticRealNodePresentation;
  title: string;
  preview: string;
  location: {
    blockId: string;
    cardId?: string | null;
    deckId?: string | null;
    breadcrumb?: string[] | null;
    backlinkBlockIds?: string[] | null;
  };
}

export interface BackendSemanticRealNodePresentation {
  displayTitle: string;
  summary: string;
  nodeKind: BackendSemanticNodeKind;
  breadcrumb: string[];
  availability: BackendSemanticNodeAvailability;
  sourceBlockId: string | null;
  cardId: string | null;
  debugId: string;
}

export interface BackendSemanticEdgeCreatedBy {
  kind: 'user' | 'system' | 'ai' | 'import' | 'unknown';
  id?: string | null;
  label?: string | null;
}

export interface BackendSemanticEdgeEvidence {
  eventId?: string | null;
  relationId?: string | null;
  sourceNodeId?: string | null;
  label?: string | null;
  weight?: number | null;
}

export interface BackendSemanticEdgeExplanation {
  fromNodeId: string;
  toNodeId: string;
  lens: BackendSemanticLens;
  primaryExplanation: string;
  reasonTags: string[];
  evidence: BackendSemanticEdgeEvidence[];
  createdBy: BackendSemanticEdgeCreatedBy;
  createdAt: number;
}

export interface BackendSemanticSessionTreeNode {
  nodeId: string;
  childNodeIds: string[];
  edgeIds: string[];
}

export interface BackendSemanticBranchEdge {
  edgeId: string;
  sessionId: string;
  branchId: string;
  fromNodeId: string;
  toNodeId: string;
  lens: BackendSemanticLens;
  explanation?: BackendSemanticEdgeExplanation | null;
  createdBy: BackendSemanticEdgeCreatedBy;
  createdAt: number;
  forkMetadata?: BackendSemanticForkMetadata | null;
}

export interface BackendSemanticSessionBranchProjection {
  branchId: string;
  rootNodeId: string;
  activeCursorNodeId: string;
  edges: BackendSemanticBranchEdge[];
  archivedAt?: number | null;
  restoredAt?: number | null;
  recentActivityAt: number;
}

export interface BackendSemanticLaterEntry {
  entryId: string;
  sessionId: string;
  nodeId: string;
  reason?: string | null;
  createdAt: number;
  removedAt?: number | null;
}

export interface BackendSemanticSuggestion {
  suggestionId: string;
  sessionId: string;
  source: 'ai' | 'system';
  summary: string;
  status: 'active' | 'ignored' | 'bound' | 'materialized';
  targetNodeId?: string | null;
  boundNodeId?: string | null;
  materializedBlockId?: string | null;
  materializedCardId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BackendSemanticSessionProjection {
  session: BackendSemanticSessionSnapshot;
  tree: BackendSemanticSessionTreeNode[];
  activePath: BackendSemanticPathEntry[];
  branches: BackendSemanticSessionBranchProjection[];
  archivedBranches: BackendSemanticSessionBranchProjection[];
  inheritedContextNodeIds: string[];
  later: BackendSemanticLaterEntry[];
  suggestions: BackendSemanticSuggestion[];
  ended: boolean;
  forkMetadata?: BackendSemanticForkMetadata | null;
}

export interface BackendSemanticForkMetadata {
  sourceSessionId: string;
  sourceNodeId: string;
  forkedAt: number;
  reason?: 'continue-ended-session' | 'branch-from-node' | 'manual' | null;
}

export interface BackendSemanticCandidateReason {
  code:
    | 'current-node-relation'
    | 'root-focus-relation'
    | 'memory-projection'
    | 'station-boost'
    | 'accepted-ai-relation'
    | 'old-mode-manual-boost'
    | 'structural-relation'
    | 'novelty'
    | 'tension'
    | 'free-association';
  weight: number;
  label?: string | null;
  evidenceEventIds?: string[];
}

export interface BackendSemanticCandidate {
  candidateId: string;
  node: BackendSemanticNode;
  score: number;
  lens: BackendSemanticLens;
  reasons: BackendSemanticCandidateReason[];
  explanation?: Record<string, unknown> | null;
}

export type BackendSemanticCandidateColumns = Record<BackendSemanticLens, BackendSemanticCandidate[]>;

export interface BackendSemanticStation {
  stationId: string;
  type: BackendSemanticStationType;
  sessionId: string;
  nodeId?: string | null;
  path?: BackendSemanticPathEntry[] | null;
  lensHistory?: BackendSemanticLens[] | null;
  createdAt: number;
  archivedAt?: number | null;
}

export interface BackendSemanticBrowserReadRequest {
  requestId: string;
  method: 'semantic.browser.read';
  callerIntent: string;
  rootFocusNodeId?: string | null;
  sessionId?: string | null;
  selectedNodeId?: string | null;
}

export interface BackendSemanticSessionReadRequest {
  requestId: string;
  method: 'semantic.session.read';
  callerIntent: string;
  sessionId: string;
}

export type BackendSemanticSessionReadResult =
  | {
      status: 'ok';
      requestId: string;
      projection: BackendSemanticSessionProjection;
      nodes: BackendSemanticNode[];
      diagnosticEventId: string;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason:
        | 'projection-unavailable'
        | 'graph-unavailable'
        | 'session-unavailable'
        | 'focus-unavailable'
        | 'candidate-unavailable'
        | 'station-unavailable'
        | 'invalid-request'
        | 'failed';
      message: string;
      diagnosticEventId: string;
    };

export interface BackendSemanticSidebarReadRequest {
  requestId: string;
  method: 'semantic.sidebar.read';
  callerIntent: string;
  sessionId?: string | null;
  rootFocusNodeId?: string | null;
  currentNodeId?: string | null;
  bindingMode?: 'follow-current' | 'pinned-session';
}

export type BackendSemanticSidebarBindingState =
  | { type: 'pinned-session'; sessionId: string }
  | { type: 'follow-current'; rootFocusNodeId: string }
  | { type: 'current-node-unavailable'; reason: string };

export interface BackendSemanticSidebarReadModel {
  bindingState: BackendSemanticSidebarBindingState;
  session: BackendSemanticSessionSnapshot | null;
  recentEndedSession?: BackendSemanticSessionSnapshot | null;
  currentNode: BackendSemanticNode | null;
  activePath: BackendSemanticPathEntry[];
  activePathNodes: BackendSemanticNode[];
  branches: BackendSemanticSessionBranchProjection[];
  candidates: BackendSemanticCandidateColumns;
  edgeExplanations: BackendSemanticEdgeExplanation[];
  later: BackendSemanticLaterEntry[];
  suggestions: BackendSemanticSuggestion[];
  nodes: BackendSemanticNode[];
}

export type BackendSemanticSidebarReadResult =
  | {
      status: 'ok';
      requestId: string;
      model: BackendSemanticSidebarReadModel;
      diagnosticEventId: string;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason:
        | 'projection-unavailable'
        | 'graph-unavailable'
        | 'session-unavailable'
        | 'focus-unavailable'
        | 'candidate-unavailable'
        | 'station-unavailable'
        | 'invalid-request'
        | 'failed';
      message: string;
      diagnosticEventId: string;
    };

export type BackendSemanticBrowserReadResult =
  | {
      status: 'ok';
      requestId: string;
      activeSession: BackendSemanticSessionSnapshot | null;
      session: BackendSemanticSessionSnapshot | null;
      rootNode: BackendSemanticNode | null;
      currentNode: BackendSemanticNode | null;
      projection?: BackendSemanticSessionProjection | null;
      nodes?: BackendSemanticNode[];
      selectedNode?: BackendSemanticNode | null;
      edgeExplanations?: BackendSemanticEdgeExplanation[];
      later?: BackendSemanticLaterEntry[];
      suggestions?: BackendSemanticSuggestion[];
      archivedBranches?: BackendSemanticSessionBranchProjection[];
      candidates: BackendSemanticCandidateColumns;
      stations: BackendSemanticStation[];
      stationNodes: BackendSemanticNode[];
      rootScopedStations: BackendSemanticStation[];
      diagnosticEventId: string;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason:
        | 'projection-unavailable'
        | 'graph-unavailable'
        | 'session-unavailable'
        | 'focus-unavailable'
        | 'candidate-unavailable'
        | 'station-unavailable'
        | 'invalid-request'
        | 'failed';
      message: string;
      diagnosticEventId: string;
    };

export type BackendSemanticCommand =
  | { type: 'start-session'; rootFocusNodeId: string; rootFocusNodeType?: BackendSemanticNodeType | null; sessionId?: string; idempotencyKey?: string }
  | {
      type: 'fork-session';
      sourceSessionId: string;
      sourceNodeId: string;
      rootFocusNodeId: string;
      forkMetadata?: Omit<BackendSemanticForkMetadata, 'forkedAt'> | null;
      idempotencyKey?: string;
    }
  | { type: 'follow-candidate'; sessionId: string; candidateId: string; lens: BackendSemanticLens; idempotencyKey?: string }
  | {
      type: 'create-branch-edge';
      sessionId: string;
      fromNodeId: string;
      toNodeId: string;
      lens: BackendSemanticLens;
      explanation?: BackendSemanticEdgeExplanation | null;
      idempotencyKey?: string;
    }
  | { type: 'move-active-cursor'; sessionId: string; nodeId: string; idempotencyKey?: string }
  | { type: 'archive-branch'; sessionId: string; branchId: string; idempotencyKey?: string }
  | { type: 'restore-branch'; sessionId: string; branchId: string; idempotencyKey?: string }
  | { type: 'add-later'; sessionId: string; nodeId: string; reason?: string | null; idempotencyKey?: string }
  | { type: 'remove-later'; sessionId: string; nodeId: string; idempotencyKey?: string }
  | {
      type: 'create-suggestion';
      sessionId: string;
      suggestionId: string;
      source: 'ai' | 'system';
      summary: string;
      targetNodeId?: string | null;
      idempotencyKey?: string;
    }
  | { type: 'ignore-suggestion'; sessionId: string; suggestionId: string; idempotencyKey?: string }
  | { type: 'bind-suggestion'; sessionId: string; suggestionId: string; nodeId: string; idempotencyKey?: string }
  | { type: 'materialize-suggestion'; sessionId: string; suggestionId: string; blockId: string; cardId?: string | null; idempotencyKey?: string }
  | { type: 'switch-lens'; sessionId: string; lens: BackendSemanticLens; idempotencyKey?: string }
  | { type: 'create-station'; sessionId: string; stationType: BackendSemanticStationType; idempotencyKey?: string }
  | {
      type: 'record-implicit-node-action';
      sessionId: string;
      nodeId: string;
      action: 'follow' | 'expand' | 'node-station' | 'path-station' | 'skip' | 'mark-irrelevant';
      lens?: BackendSemanticLens;
      idempotencyKey?: string;
    }
  | {
      type: 'accept-relation' | 'reject-relation';
      sessionId: string;
      relationId: string;
      fromNodeId: string;
      toNodeId: string;
      confidence?: number;
      reason?: string | null;
      source?: 'manual' | 'ai';
      idempotencyKey?: string;
    }
  | { type: 'mark-irrelevant'; sessionId: string; nodeId: string; scope?: 'session' | 'root'; idempotencyKey?: string }
  | { type: 'archive-station'; sessionId: string; stationId: string; idempotencyKey?: string }
  | { type: 'restore-path-station'; sessionId: string; stationId: string; idempotencyKey?: string }
  | { type: 'end-session'; sessionId: string; idempotencyKey?: string }
  | { type: 'restore-session'; sessionId: string; idempotencyKey?: string };

export interface BackendSemanticCommandRequest {
  requestId: string;
  method: 'semantic.command.execute';
  callerIntent: string;
  idempotencyKey: string;
  command: BackendSemanticCommand;
}

export type BackendSemanticCommandResult =
  | {
      status: 'ok';
      commandId: string;
      writerInstanceId: string;
      changed: MutationChangedSet;
      session?: unknown | null;
      event?: unknown | null;
      events?: unknown[] | null;
      station?: unknown | null;
      relation?: unknown | null;
      archivedStationId?: string | null;
      diagnosticEventId: string;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason:
        | 'writer-unavailable'
        | 'projection-unavailable'
        | 'graph-unavailable'
        | 'session-unavailable'
        | 'focus-unavailable'
        | 'candidate-unavailable'
        | 'station-unavailable'
        | 'inactive-station'
        | 'invalid-request'
        | 'failed';
      message: string;
      diagnosticEventId: string;
    };

export interface PrivateApiAuditQueryRequest {
  requestId: string;
  method: 'private.audit.query';
  callerIntent: string;
  limit?: number;
}

export type P6OwnershipSurface =
  | 'xiuyuan'
  | 'progressive'
  | 'topic-derived'
  | 'autocard-scanner'
  | 'block-menu'
  | 'dialog-manager'
  | 'data-access-facade';

export type P6OwnershipOperation =
  | 'scan-candidates'
  | 'resolve-list-children'
  | 'resolve-concept'
  | 'read-block-meta'
  | 'read-block-content'
  | 'read-card-context'
  | 'execute-side-effect';

export interface P6OwnershipQueryRequest {
  requestId?: string;
  surface: P6OwnershipSurface;
  operation: Exclude<P6OwnershipOperation, 'execute-side-effect'>;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface P6OwnershipCommandRequest {
  requestId?: string;
  surface: P6OwnershipSurface;
  operation: 'execute-side-effect';
  payload?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface P6OwnershipResult {
  ok: true;
  surface: P6OwnershipSurface;
  operation: P6OwnershipOperation;
  owner: 'application-command' | 'backend-worker' | 'writer-relay' | 'compatibility-read';
  status: 'completed' | 'unavailable' | 'failed';
  unavailableClass?: BackendUnavailableClass | null;
  diagnosticEventId: string;
  data?: unknown;
}

export interface BackendBrowserDeckSnapshotQuery {
  preset?: string;
  searchText?: string;
  docId?: string;
  scopeDocIds?: string[] | null;
  states?: number[];
  cardTypes?: string[];
  deckIds?: string[];
  tags?: string[];
  sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
  fullUniverseReason?: string | null;
}

export interface BackendBrowserDeckPageRequest {
  startRow?: number;
  endRow?: number;
}

export interface BackendBrowserDeckPageResult {
  total: number;
  cards: unknown[];
  generation?: number | null;
}

export type BackendBrowserDocumentCountsScopeKind =
  | 'deck'
  | 'queue';

export interface BackendBrowserDocumentCountsScope {
  kind: BackendBrowserDocumentCountsScopeKind;
  preset?: string | null;
  searchText?: string | null;
  docId?: string | null;
  scopeDocIds?: string[] | null;
  cardType?: string | null;
  queueType?: string | null;
}

export interface BackendBrowserDocumentCountsQueueReadiness {
  status: 'ready' | 'refreshing' | 'unavailable';
  queueId: string;
  policyId: string;
  generation?: number;
  cause?: string;
  reason?: string;
  retryAfterMs?: number;
}

export interface BackendBrowserDocumentCountRow {
  rootId: string;
  count: number;
}

export type BackendBrowserDocumentCountsOwner =
  | 'sql-card-universe'
  | 'queue-projection';

export interface BackendBrowserDocumentCountsDiagnostics {
  countOnly: true;
  rowsHydratedForHierarchy: number;
  countMs?: number | null;
  queueReadiness?: BackendBrowserDocumentCountsQueueReadiness | null;
  projectionIdentity?: {
    queueId: string;
    policyId: string;
    generation: number;
  } | null;
}

export type BackendBrowserDocumentCountsResult =
  | {
      status: 'ready';
      owner: BackendBrowserDocumentCountsOwner;
      scope: BackendBrowserDocumentCountsScope;
      rows: BackendBrowserDocumentCountRow[];
      diagnostics: BackendBrowserDocumentCountsDiagnostics;
    }
  | {
      status: 'unsupported' | 'unavailable';
      owner: BackendBrowserDocumentCountsOwner | 'none';
      scope: BackendBrowserDocumentCountsScope;
      rows: [];
      reason: string;
      diagnostics: BackendBrowserDocumentCountsDiagnostics;
    };

export interface BackendSourceExistenceRefreshRequest {
  blockIds?: string[];
  limit?: number;
  staleBefore?: number;
  includeKnownMissing?: boolean;
  force?: boolean;
}

export interface BackendSourceExistenceRefreshCandidate {
  cardId: string;
  blockId: string;
  sourceExists: boolean | null;
  sourceCheckedAt: number | null;
}

export interface BackendSourceExistenceUpdate {
  cardId?: string;
  blockId: string;
  exists: boolean;
}

export interface BackendSourceExistenceSummary {
  unknown: number;
  stale: number;
  missing: number;
}

export interface BackendSourceExistenceSweepApplyRequest {
  request?: BackendSourceExistenceRefreshRequest;
  existingBlockIds: string[];
  checkedAt?: number;
}

export interface BackendSourceExistenceSweepApplyResult {
  checked: number;
  updated: number;
  changed: boolean;
  changedToMissing: boolean;
  changedBlockIds?: string[];
}

export interface BackendQueueProjectionSnapshotRequest {
  queueType: string;
  policyHash?: string | null;
  generation?: number | null;
  limit?: number | null;
  offset?: number | null;
  allowStale?: boolean | null;
}

export type QueueProjectionReadinessCause =
  | 'projection_stale'
  | 'materialization_in_progress'
  | 'backend_busy'
  | 'backend_unavailable'
  | 'writer_unavailable'
  | 'contract_mismatch'
  | 'invalid_queue'
  | 'projection_unavailable'
  | 'materialization_failed';

export interface QueueProjectionReadinessRequest {
  queueType: string;
  preset?: string | null;
  searchText?: string | null;
  docId?: string | null;
  scopeDocIds?: string[] | null;
  cardType?: string | null;
  source?: string | null;
  filterHash?: string | null;
  manualCardIds?: string[] | null;
  temporaryBlacklistIds?: string[] | null;
  customOrder?: string[] | null;
  transferSessionId?: string | null;
  sessionId?: string | null;
  commitPolicy?: string | null;
}

export interface QueueProjectionReady {
  status: 'ready';
  queueId: string;
  policyId: string;
  generation: number;
  stale?: boolean;
}

export interface QueueProjectionRefreshing {
  status: 'refreshing';
  queueId: string;
  policyId: string;
  cause: QueueProjectionReadinessCause;
  retryAfterMs?: number;
}

export interface QueueProjectionUnavailable {
  status: 'unavailable';
  queueId: string;
  policyId: string;
  cause: QueueProjectionReadinessCause;
  reason: string;
  recoverable: boolean;
  retryAfterMs?: number;
}

export type QueueProjectionReadiness =
  | QueueProjectionReady
  | QueueProjectionRefreshing
  | QueueProjectionUnavailable;

export interface BackendQueueProjectionRowsByIdsRequest {
  queueType: string;
  ids: string[];
  policyHash?: string | null;
  generation?: number | null;
}

export interface BackendQueueProjectionSnapshotRow {
  id: string;
  fsrsCardId: string;
  blockId: string;
  deckId: string;
  rootId: string;
  content: string;
  fullContent: string;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: number | null;
  interval: number;
  firstReview: number | null;
  priority: number;
  suspended: boolean;
  cardType?: string;
  aFactor?: number;
  queueIndex?: number;
  tags: string[];
  blockType?: string | null;
}

export interface BackendQueueProjectionFreshnessEvidence {
  checkedAt: number;
  totalRows: number;
  freshRows: number;
  staleRows: number;
  missingRows: number;
  staleCardIds: string[];
  missingCardIds: string[];
}

export interface BackendQueueProjectionSnapshotResult {
  queueType: string;
  policyHash: string | null;
  generation: number | null;
  status: 'ready' | 'refreshing' | 'invalidated' | 'rebuilding' | 'repairing' | 'unavailable' | string;
  rows: BackendQueueProjectionSnapshotRow[];
  counters: BackendReviewFeedbackQueueImpactCounters | null;
  freshness?: BackendQueueProjectionFreshnessEvidence | null;
  stale?: boolean;
}

export interface BackendQueueProjectionRowsByIdsResult {
  queueType: string;
  policyHash: string | null;
  generation: number | null;
  status: BackendQueueProjectionSnapshotResult['status'];
  rows: BackendQueueProjectionSnapshotRow[];
  cards: unknown[];
  freshness?: BackendQueueProjectionFreshnessEvidence | null;
}

export interface BackendQueueProjectionReplaceRequest {
  queueType: string;
  policyHash: string;
  generation?: number | null;
  reason?: string | null;
  rows: BackendReviewFeedbackQueueImpactRow[];
  metadata?: Record<string, unknown> | null;
}

export interface BackendQueueProjectionReplaceResult {
  queueType: string;
  policyHash: string;
  generation: number;
  status: 'ready';
  rows: number;
  counters: BackendReviewFeedbackQueueImpactCounters;
}

export interface BackendReviewFeedbackRequest {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  queueType?: string;
  queueMode?: string;
  commitPolicy?: string;
  sessionId?: string;
  reviewedAt?: number;
  idempotencyKey?: string | null;
  projectionGeneration?: number;
  projectionPolicyHash?: string;
  scheduler?: BackendReviewSchedulerConfig;
}

export interface BackendReviewSchedulerConfig {
  defaultScheduler?: 'fsrs-v6' | 'a-factor-v2';
  fsrsParams?: unknown;
}

export interface BackendReviewFeedbackQueueImpactRow {
  queueType: string;
  rowId: string;
  cardId: string;
  blockId: string | null;
  deckId: string | null;
  membershipReason: string;
  dueAt: number | null;
  dueBucket: string;
  priorityScore: number;
  sortKey: string;
  queueIndexHint: number | null;
  policyHash: string;
  sourceGeneration: number;
  payload: Record<string, unknown>;
  updatedAt: number;
}

export interface BackendReviewFeedbackQueueImpactCounters {
  queueType: string;
  policyHash: string;
  generation: number;
  version: number;
  remaining: number;
  due: number;
  total: number;
  currentLearningDue?: number;
  todayReviewDue?: number;
  allowedNew?: number;
  learnAheadAvailable?: number;
  scheduledTotal?: number;
  buckets: Record<string, number>;
  updatedAt: number;
}

export interface BackendReviewFeedbackQueueImpactReorderHint {
  rowId: string;
  cardId: string;
  sortKey: string | null;
  queueIndexHint: number | null;
  previousSortKey?: string | null;
  previousQueueIndexHint?: number | null;
  reason: 'inserted' | 'updated' | 'removed' | 'refresh-required' | string;
}

export type BackendReviewFeedbackQueueImpactOutcome =
  | 'patch-applied'
  | 'refresh-required'
  | 'deferred'
  | 'unavailable';

export interface BackendReviewFeedbackDeferredQueueImpact {
  reason: 'review-feedback' | string;
  scheduled: boolean;
  coalesced?: boolean;
  queuedAt: number;
}

export interface BackendReviewFeedbackQueueImpactEntry {
  queueType: string;
  policyHash: string | null;
  generation: number | null;
  requestedGeneration?: number | null;
  currentGeneration?: number | null;
  outcome?: BackendReviewFeedbackQueueImpactOutcome;
  unavailableReason?: string | null;
  deferred?: BackendReviewFeedbackDeferredQueueImpact | null;
  hotPatchable: boolean;
  refreshRequired: boolean;
  reason: 'review-feedback' | 'projection-unavailable' | 'generation-mismatch' | 'projection-invalidated' | string;
  removedRowIds: string[];
  insertedRows: BackendReviewFeedbackQueueImpactRow[];
  updatedRows: BackendReviewFeedbackQueueImpactRow[];
  reorderHints: BackendReviewFeedbackQueueImpactReorderHint[];
  counterGeneration: number | null;
  counters: BackendReviewFeedbackQueueImpactCounters | null;
}

export interface BackendReviewFeedbackQueueImpact {
  hotPatchable: boolean;
  refreshRequired: boolean;
  affectedQueues: BackendReviewFeedbackQueueImpactEntry[];
}

export type BackendReviewFeedbackLocalIntentStatus =
  | 'recorded'
  | 'not-required'
  | 'unavailable';

export type BackendReviewFeedbackTruthFlushStatus =
  | 'pending'
  | 'flushed'
  | 'not-required'
  | 'unavailable';

export type BackendReviewFeedbackSqlProjectionStatus =
  | 'patched'
  | 'deferred'
  | 'refresh-required'
  | 'unavailable'
  | 'not-applicable';

export type BackendReviewFeedbackSqlCheckpointStatus =
  | 'not-run'
  | 'checkpointed'
  | 'failed'
  | 'unknown';

export interface BackendReviewFeedbackStorageState {
  localIntent: {
    status: BackendReviewFeedbackLocalIntentStatus;
    durable: boolean;
    storage: 'non-siyuan' | 'unavailable';
    entryId: string | null;
    idempotencyKey: string | null;
    journalStatus: BackendReviewFeedbackJournalEntryStatus | null;
    pendingCount: number | null;
    pendingBytes: number | null;
    error: string | null;
  };
  truthFlush: {
    status: BackendReviewFeedbackTruthFlushStatus;
    family: 'review-events';
    syncVisible: boolean;
    pendingCount: number | null;
    oldestPendingAgeMs: number | null;
    lastError: string | null;
  };
  sqlProjection: {
    status: BackendReviewFeedbackSqlProjectionStatus;
    hotPatchable: boolean;
    refreshRequired: boolean;
    affectedQueueCount: number;
    projectionGeneration: number | null;
  };
  sqlCheckpoint: {
    status: BackendReviewFeedbackSqlCheckpointStatus;
    hotPath: boolean;
    cause: string | null;
    initiator: string | null;
    projectionGeneration: number | null;
    byteLength: number | null;
    error: string | null;
  };
}

export interface BackendReviewFeedbackResult {
  cardId: string;
  committed: boolean;
  reviewedAt: number;
  queueType: string;
  updatedCard: unknown | null;
  idempotencyKey?: string | null;
  duplicate?: boolean;
  queueImpact?: BackendReviewFeedbackQueueImpact | null;
  storage?: BackendReviewFeedbackStorageState;
}

export interface BackendPreRequestMergeDiagnostic {
  method: BackendRpcMethod | string;
  timestamp: number;
  sources: number;
  sourceIds: string[];
  importedOperations?: number;
  ignoredOperations?: number;
  processedSourceIds?: string[];
  skippedSourceReasons?: Record<string, number>;
  sanityStatus?: BackendDomainSyncSanityStatus;
  mergedReviewEvents: number;
  mergedCards: number;
  ignoredReviewEvents: number;
  ignoredCards: number;
  skippedSources: Array<{ sourceId: string; reason: string }>;
  divergenceCount: number;
  divergenceReasonCounts: Record<string, number>;
}

export interface BackendPreRequestMergeDiagnosticsState {
  latest: BackendPreRequestMergeDiagnostic | null;
  history: BackendPreRequestMergeDiagnostic[];
}

export type BackendNeuralRoamFeedbackAction = 'rate' | 'skip' | 'custom';

export interface BackendNeuralRoamFeedback {
  action: BackendNeuralRoamFeedbackAction;
  rating?: 1 | 2 | 3 | 4;
  customActionId?: string | null;
}

export interface BackendNeuralRoamStartFromFocusRequest {
  routeId?: string | null;
  blockId: string;
  seedBlockId?: string | null;
  sourceReviewCardId?: string | null;
  conceptBlockId?: string | null;
  previousEngineMode?: 'orbit' | 'hyperspace' | null;
  includeFocusAsFirst?: boolean;
  resetHistory?: boolean;
  startNewSession?: boolean;
  entrySessionKind?: 'temporary-current-block' | 'temporary-concept' | 'station-roam' | 'concept-card-roam' | 'direct-focus' | null;
}

export interface BackendNeuralRoamItem {
  id: string;
  cardId: string;
  blockId: string;
  deckId?: string | null;
  due?: number | null;
  type?: string | null;
  meta?: Record<string, unknown> | null;
  sourceKind?: 'virtual' | 'associated-review' | 'unknown';
  payload?: Record<string, unknown> | null;
}

export interface BackendNeuralRoamAdvanceRequest {
  queueType: 'neural-roam';
  routeId?: string | null;
  sessionId?: string | null;
  currentItem?: BackendNeuralRoamItem | Record<string, unknown> | null;
  feedback?: BackendNeuralRoamFeedback | null;
  projectionGeneration?: number | null;
  policyHash?: string | null;
  reviewedAt?: number | null;
  idempotencyKey?: string | null;
  scheduler?: BackendReviewSchedulerConfig;
  startFromFocus?: BackendNeuralRoamStartFromFocusRequest | null;
}

export type BackendNeuralRoamAdvanceUnavailableReason =
  | 'advance-contract-unavailable'
  | 'graph-query-unavailable'
  | 'writer-unavailable'
  | 'current-item-missing'
  | 'source-block-missing'
  | 'generation-mismatch'
  | 'policy-mismatch'
  | 'route-mismatch'
  | 'invalid-request'
  | 'failed';

export interface BackendNeuralRoamCounters {
  routeId?: string | null;
  remaining: number;
  due: number;
  total: number;
  pendingAssociatedReview: number;
  sourceNodes: number;
}

export interface BackendNeuralRoamSessionState {
  sessionId: string | null;
  routeId: string | null;
  engineMode: string | null;
  currentNodeId: string | null;
  currentEventId: string | null;
  pathLength: number;
  historyCount: number;
  exhausted: boolean;
  projectionGeneration: number | null;
  policyHash: string | null;
}

export interface BackendNeuralRoamViewStateRoute {
  id: string | null;
  name: string | null;
  temporary: boolean;
  previousRouteId: string | null;
}

export interface BackendNeuralRoamRouteStats {
  routeId: string;
  seedCount: number;
  anchorCount: number;
  historyCount: number;
  totalPoolEntries: number;
}

export interface BackendNeuralRoamRouteListItem {
  id: string;
  name: string;
  temporary: boolean;
  previousRouteId: string | null;
  initialSeedNodeIds: string[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  stats: BackendNeuralRoamRouteStats;
  isActive: boolean;
}

export interface BackendNeuralRoamViewStateProgress {
  kind: 'orbit-round' | 'hyperspace-current-node' | 'none';
  viewedCount: number;
  totalCount: number;
  remainingCount: number;
  label: string;
}

export interface BackendNeuralRoamViewState {
  version: 1;
  queueType: 'neural-roam';
  route: BackendNeuralRoamViewStateRoute;
  routes: BackendNeuralRoamRouteListItem[];
  engineMode: string | null;
  currentNodeId: string | null;
  currentEventId: string | null;
  navigationState: Record<string, unknown> | null;
  counters: BackendNeuralRoamCounters;
  sources: unknown[];
  anchors: unknown[];
  engineHistory: unknown[];
  routeHistory: unknown[];
  batchProgress: BackendNeuralRoamViewStateProgress;
  updatedAt: number;
}

export interface BackendNeuralRoamViewStateRequest {
  queueType: 'neural-roam';
  routeId?: string | null;
  sessionId?: string | null;
}

export type BackendNeuralRoamViewStateResult =
  | {
      queueType: 'neural-roam';
      status: 'ready';
      viewState: BackendNeuralRoamViewState;
      unavailableReason: null;
      message?: string | null;
    }
  | {
      queueType: 'neural-roam';
      status: 'unavailable' | 'mismatch' | 'failed';
      viewState: BackendNeuralRoamViewState | null;
      unavailableReason: BackendNeuralRoamAdvanceUnavailableReason;
      message: string;
    };

export type BackendNeuralRoamCommand =
  | { type: 'start-roaming-from-focus'; focusId: string; includeFocusAsFirst?: boolean; resetHistory?: boolean; startNewSession?: boolean; routeId?: string | null }
  | { type: 'switch-engine-mode'; mode: 'orbit' | 'hyperspace'; carryCurrentNode?: boolean; routeId?: string | null }
  | { type: 'switch-route'; routeId: string }
  | { type: 'create-route'; name?: string | null }
  | { type: 'rename-route'; routeId: string; name: string }
  | { type: 'delete-route'; routeId: string }
  | { type: 'jump-history-node'; nodeId: string; routeId?: string | null }
  | { type: 'set-navigation-mode'; mode: 'explore' | 'follow'; routeId?: string | null }
  | { type: 'return-to-bookmark'; routeId?: string | null }
  | { type: 'create-temporary-route'; name?: string | null; seedBlockId: string; previousRouteId?: string | null }
  | { type: 'replace-active-temporary-route'; name?: string | null; seedBlockId: string }
  | { type: 'save-temporary-route'; routeId?: string | null; name?: string | null }
  | { type: 'close-temporary-route'; action: 'save' | 'discard' | 'cancel'; routeId?: string | null; name?: string | null }
  | { type: 'set-sources'; nodeIds: string[]; enabled?: boolean; routeId?: string | null }
  | { type: 'set-source'; nodeId: string; enabled?: boolean; routeId?: string | null }
  | { type: 'set-anchor'; nodeId: string; enabled?: boolean; routeId?: string | null }
  | { type: 'set-current-focus'; nodeId: string; includeFocusAsFirst?: boolean; resetHistory?: boolean; bookmarkCurrentPath?: boolean; routeId?: string | null }
  | { type: 'clear-history'; scope?: 'current' | 'all'; routeId?: string | null }
  | { type: 'clear-route-history'; routeId?: string | null };

export interface BackendNeuralRoamCommandRequest {
  queueType: 'neural-roam';
  sessionId?: string | null;
  command: BackendNeuralRoamCommand;
  idempotencyKey?: string | null;
}

export type BackendNeuralRoamCommandResult =
  | {
      queueType: 'neural-roam';
      status: 'ok';
      viewState: BackendNeuralRoamViewState;
      queueState: Record<string, unknown> | null;
      unavailableReason: null;
      message?: string | null;
    }
  | {
      queueType: 'neural-roam';
      status: 'unavailable' | 'mismatch' | 'failed';
      viewState: BackendNeuralRoamViewState | null;
      queueState: Record<string, unknown> | null;
      unavailableReason: BackendNeuralRoamAdvanceUnavailableReason;
      message: string;
    };

export interface BackendNeuralRoamAdvanceResult {
  queueType: 'neural-roam';
  routeId: string | null;
  sessionId: string | null;
  status: 'advanced' | 'exhausted' | 'unavailable' | 'mismatch' | 'failed';
  nextItem: BackendNeuralRoamItem | null;
  counters: BackendNeuralRoamCounters;
  sessionState: BackendNeuralRoamSessionState;
  viewState?: BackendNeuralRoamViewState | null;
  queueState: Record<string, unknown> | null;
  projectionImpact: BackendReviewFeedbackQueueImpact | null;
  unavailableReason: BackendNeuralRoamAdvanceUnavailableReason | null;
  message?: string | null;
}

export type BackendNeuralGraphQueryOperation =
  | 'fetchBlockData'
  | 'fetchNeighbors'
  | 'fetchBacklinks'
  | 'fetchDirectOutgoingLinks'
  | 'fetchIndirectOutgoingLinks'
  | 'fetchOutgoingLinks'
  | 'fetchDescriptors'
  | 'isConceptCard'
  | 'fetchSubtreeBlockIds'
  | 'fetchEdges'
  | 'fetchHyperspaceEdges'
  | 'fetchConceptMapEdges'
  | 'fetchElementLinkEdges'
  | 'fetchBlockTreeEdges'
  | 'fetchDocumentTreeEdges'
  | 'fetchNodePriority';

export interface BackendNeuralGraphQueryRequest {
  operation: BackendNeuralGraphQueryOperation;
  blockId: string;
  relatedBlockIds?: string[];
  options?: Record<string, unknown> | null;
}

export interface BackendNeuralGraphQueryResult<TData = unknown> {
  status: 'found' | 'known-missing' | 'unknown' | 'failed';
  blockId: string;
  data: TData | null;
  error?: string | null;
}

export interface BackendAutoCardDecisionSettings {
  enabledSymbols?: {
    basic?: boolean;
    concept?: boolean;
    descriptor?: boolean;
    cloze?: boolean;
    multiLine?: boolean;
  };
  topicDerivation?: {
    enabled?: boolean;
  };
}

export interface BackendAutoCardDecisionResolveRequest {
  candidateId?: string;
  idempotencyKey?: string;
  requesterInstanceId?: string;
  blockId: string;
  content: string;
  blockType?: string;
  resolvedCardType?: 'topic' | 'item';
  source?: 'symbol-listener' | 'doc-oneclick-scan';
  ruleScope?: 'all' | 'single-block' | 'structural';
  hasParentTopicCard?: boolean;
  settings?: BackendAutoCardDecisionSettings;
}

export interface BackendAutoCardDecisionProjection {
  id: string;
  family: string;
  templateId: string;
  cardType: string;
  mode: string;
  executorKind: string;
  renderProfile?: string;
  direction?: 'forward' | 'backward' | 'both';
  priority: number;
  conflictGroup?: string;
  hints?: Record<string, unknown>;
}

export interface BackendAutoCardDecisionResolveResult {
  candidateId: string;
  decisionEventId: string;
  status: 'selected' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
  unavailableClass: BackendUnavailableClass | null;
  matchedRuleIds: string[];
  enabledDecisions: BackendAutoCardDecisionProjection[];
  filteredDecisions: BackendAutoCardDecisionProjection[];
  selectedDecision: BackendAutoCardDecisionProjection | null;
  conflicted: boolean;
  strategyUsed: 'semantic-first' | 'cloze-first' | 'basic-first' | 'skip';
  markOnlyClozeCandidate: boolean;
  shouldUseTopicDerivation: boolean;
}

export interface BackendAutoCardExecutePlannerEnvelope {
  kind: 'planner-decision';
  blockId: string;
  content: string;
  decision: BackendAutoCardDecisionProjection;
  source: 'symbol-listener' | 'doc-oneclick-scan';
  docRootId?: string;
}

export interface BackendAutoCardExecuteTopicDerivedEnvelope {
  kind: 'topic-derived';
  input: {
    sourceBlockId: string;
    sourceDocId: string;
    parentTopicCardId: string;
    parentExcerptId?: string;
    sourceRootKind?: 'ordinary-doc' | 'piece' | 'excerpt-doc' | 'excerpt-block' | 'topic-doc';
    plannerContent: string;
    artifactContentDom?: string;
    mode?: 'planner-derived' | 'manual-cloze';
    answerFingerprint?: string;
    previewText?: string;
    decisions: BackendAutoCardDecisionProjection[];
    storageMode?: 'workbench' | 'source-child';
  };
}

export type BackendAutoCardExecuteEnvelope =
  | BackendAutoCardExecutePlannerEnvelope
  | BackendAutoCardExecuteTopicDerivedEnvelope;

export interface BackendAutoCardExecuteRequest {
  envelope: BackendAutoCardExecuteEnvelope;
}

export interface BackendAutoCardExecuteResult {
  candidateId?: string;
  decisionEventId?: string;
  status?: 'created' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
  unavailableClass?: BackendUnavailableClass | null;
  executed: boolean;
  created: number;
  skipped: number;
}

export interface BackendKernelTransactionIngestRequest {
  source?: 'kernel-sidecar' | 'ws-main';
  transactions?: unknown[];
  receivedAt?: number;
  idempotencyKey?: string;
}

export interface BackendKernelTransactionIngestResult {
  accepted: number;
  queued: number;
  receivedAt: number;
  duplicate: boolean;
  queueLength: number;
  maxQueueLength: number;
}

export interface BackendKernelTransactionActionBase {
  source: 'kernel-sidecar' | 'ws-main';
  receivedAt: number;
  idempotencyKey: string;
}

export interface BackendKernelTransactionRemoveAction extends BackendKernelTransactionActionBase {
  type: 'native-riff-remove';
  blockIds: string[];
}

export interface BackendKernelTransactionUpsertAction extends BackendKernelTransactionActionBase {
  type: 'native-riff-upsert';
  blockIds: string[];
}

export interface BackendKernelTransactionAutoCardAction extends BackendKernelTransactionActionBase {
  type: 'auto-card-candidates';
  operations: Array<{
    action: 'insert' | 'update' | 'delete';
    blockId: string;
  }>;
}

export type BackendKernelTransactionAction =
  | BackendKernelTransactionRemoveAction
  | BackendKernelTransactionUpsertAction
  | BackendKernelTransactionAutoCardAction;

export interface BackendKernelTransactionDequeueRequest {
  maxActions?: number;
}

export interface BackendKernelTransactionDequeueResult {
  actions: BackendKernelTransactionAction[];
  remaining: number;
}

export interface BackendKernelTransactionRequeueRequest {
  actions?: BackendKernelTransactionAction[];
}

export interface BackendKernelTransactionRequeueResult {
  requeued: number;
  queueLength: number;
  maxQueueLength: number;
}
