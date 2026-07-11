import { BACKEND_AUTOCARD_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/autocard';
import { BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/browser';
import { BACKEND_CARD_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/card';
import { BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/core';
import { BACKEND_GRAPH_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/graph';
import { BACKEND_HOTSPOT_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/hotspot';
import { BACKEND_KERNEL_TRANSACTION_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/kernel-transaction';
import { BACKEND_NEURAL_ROAM_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/neural-roam';
import { BACKEND_P6_OWNERSHIP_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/p6-ownership';
import { BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/private-api';
import { BACKEND_PROGRESSIVE_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/progressive';
import { BACKEND_QUEUE_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/queue';
import { BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/queue-projection';
import { BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/review';
import { BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/semantic';
import { BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/sync';
import { BACKEND_TOPIC_DERIVED_RPC_METHOD_CONTRACT_BY_METHOD } from './backend-rpc/topic-derived';
import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  SQL_PROJECTION_SCHEMA_VERSION,
} from './backend-rpc/storage-policy-catalog';
import type {
  MessagePackTruthFamily,
  SqlProjectionFamily,
} from './backend-rpc/storage-policy-catalog';
import type {
  StorageInventoryRecord,
  StoragePressureRecord,
  StorageRecoveryState,
} from './backend-rpc/storage-durability-contracts';

export {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  STORAGE_INVENTORY_RECORD_VERSION,
  STORAGE_MUTATION_ENVELOPE_VERSION,
  STORAGE_PRESSURE_RECORD_VERSION,
  STORAGE_RECOVERY_STATE_VERSION,
  TRUTH_COVERAGE_WATERMARK_VERSION,
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  TRUTH_GENERATION_RECORD_VERSION,
} from './backend-rpc/storage-durability-contracts';
export type {
  StorageAggregateReference,
  StorageDurabilityReceipt,
  StorageDurabilityRetryState,
  StorageDurabilityStage,
  StorageInventoryCompactionStatus,
  StorageInventoryMetric,
  StorageInventoryRecord,
  StorageMutationEnvelope,
  StorageMutationFamily,
  StorageMutationOperation,
  StoragePressureLevel,
  StoragePressureMetric,
  StoragePressureRecord,
  StorageRecoveryState,
  StorageRecoveryStatus,
  StorageRequiredTruthOutput,
  TruthCoverageWatermark,
  TruthDeviceIdentityRecordContract,
  TruthGenerationFamilyPublication,
  TruthGenerationRecord,
} from './backend-rpc/storage-durability-contracts';

export {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  MESSAGEPACK_TRUTH_FAMILY_SCHEMAS,
  MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES,
  SQL_PROJECTION_SCHEMA_VERSION,
  SQL_PROJECTION_FAMILY_SCHEMAS,
  STORAGE_SLIMMING_FAMILY_POLICIES,
  getMessagePackTruthFamilyStoragePolicy,
} from './backend-rpc/storage-policy-catalog';
export type {
  MessagePackTruthFamily,
  MessagePackTruthPayloadPolicy,
  MessagePackTruthFamilySchema,
  MessagePackTruthRetentionMode,
  MessagePackTruthCompactionPolicy,
  MessagePackTruthRetentionPolicy,
  MessagePackTruthFamilyStoragePolicy,
  SqlProjectionFamily,
  SqlProjectionSource,
  SqlProjectionColumnRole,
  SqlProjectionPayloadColumnPolicy,
  SqlProjectionColumnOwnership,
  SqlProjectionFamilySchema,
  StorageSlimmingFamily,
  StorageSlimmingOwner,
  StorageSlimmingSqlPayloadRole,
  StorageSlimmingWriteMode,
  StorageSlimmingLegacyCompatibilityPolicy,
  StorageSlimmingFamilyPolicy,
} from './backend-rpc/storage-policy-catalog';

export * from './backend-rpc/index';

export const BACKEND_RPC_VERSION = '2.0';

export const BACKEND_RPC_METHODS = [
  'system.health',
  'db.load',
  'db.reload',
  'storage.maintenance.status',
  'storage.maintenance.applyBatch',
  'truth.reconciliation.run',
  'sync.reviewDivergence.audit',
  'sync.conflict.summarize',
  'sync.conflict.reload',
  'diagnostics.status',
  'domainSync.status',
  'domainSync.repair.preview',
  'domainSync.repair.apply',
  'domainSync.conflictSources.cleanupCandidates',
  'domainSync.conflictSources.cleanup',
  'browser.deck.page',
  'browser.deck.matchedIds',
  'browser.deck.rowsByIds',
  'browser.deck.documentCounts',
  'browser.stats',
  'browser.count',
  'browser.sourceExistence.refreshCandidates',
  'browser.sourceExistence.update',
  'browser.sourceExistence.byBlockIds',
  'browser.sourceExistence.summary',
  'browser.sourceExistence.applySweep',
  'browser.sourceExistence.applySweepHost',
  'card.crud.batchMutate',
  'card.schedule.batchUpdate',
  'card.nativeRiffImportExclusion.find',
  'queue.state.loadAll',
  'queue.state.batchMutate',
  'storage.projection.rebuild',
  'queue.projection.snapshot',
  'queue.projection.rowsByIds',
  'queue.projection.replace',
  'neural-roam.advance',
  'neural-roam.viewState',
  'neural-roam.command',
  'kernel.transaction.ingest',
  'kernel.transaction.dequeue',
  'kernel.transaction.requeue',
  'autocard.decision.resolve',
  'autocard.execute',
  'autocard.executeBatch',
  'review.feedback',
  'review.session.start',
  'review.session.current',
  'review.session.feedback',
  'review.session.skip',
  'review.session.undo',
  'review.truth.flush',
  'review.truth.backfill',
  'review.truth.maintenanceStatus',
  'private.health',
  'private.diagnostics.status',
  'private.audit.query',
  'private.read.cards',
  'private.read.queues',
  'private.read.sessions',
  'private.command.execute',
  'semantic.command.execute',
  'semantic.session.read',
  'semantic.sidebar.read',
  'semantic.browser.read',
  'hotspot.command.submit',
  'hotspot.job.get',
  'progressive.command.execute',
  'topic-derived.command.execute',
  'review.sourceRefresh.execute',
  'browser.aggregate.snapshot',
  'browser.aggregate.page',
  'browser.aggregate.focus',
  'graph.query',
  'p6.ownership.query',
  'p6.ownership.command',
] as const;

export type BackendRpcMethod = typeof BACKEND_RPC_METHODS[number];

export const BACKEND_RPC_FAMILIES = [
  'core',
  'sync',
  'domain-sync',
  'browser',
  'card',
  'queue',
  'queue-projection',
  'neural-roam',
  'kernel-transaction',
  'autocard',
  'review',
  'private-api',
  'semantic',
  'hotspot',
  'progressive',
  'topic-derived',
  'graph',
  'p6-ownership',
] as const;

export type BackendRpcFamily = typeof BACKEND_RPC_FAMILIES[number];

export const BACKEND_RPC_CLIENT_EXPOSURES = [
  'facade',
  'facet',
  'internal',
  'none',
] as const;

export type BackendRpcClientExposure = typeof BACKEND_RPC_CLIENT_EXPOSURES[number];

export type BackendCardScheduleWriteSource =
  | 'review-commit'
  | 'manual-reschedule'
  | 'scheduler-migration'
  | 'riff-import';

export interface BackendCardScheduleBatchUpdateRequest {
  mutationId: string;
  schedulingWriteSource: BackendCardScheduleWriteSource;
  cards: unknown[];
}

export interface BackendCardScheduleBatchUpdateResult {
  updatedCardIds: string[];
  durabilityReceipt: StorageDurabilityReceipt;
}

export interface BackendCardCrudBatchMutateRequest {
  mutationId: string;
  upsertCards: unknown[];
  upsertXiuyuans: unknown[];
  deleteCardIds: string[];
  deleteXiuyuanIds: string[];
}

export interface BackendCardCrudBatchMutateResult {
  upsertedCardIds: string[];
  upsertedXiuyuanIds: string[];
  deletedCardIds: string[];
  deletedXiuyuanIds: string[];
  durabilityReceipt: StorageDurabilityReceipt;
}

export interface BackendNativeRiffImportExclusionRecord {
  version: 1;
  blockId: string;
  nativeCardId?: string;
  deckId?: string;
  excludedAt: number;
  source: 'legacy-blacklist' | 'user';
  reason?: string;
}

export interface BackendNativeRiffImportExclusionFindRequest {
  blockId: string;
}

export interface BackendNativeRiffImportExclusionFindResult {
  exclusion: BackendNativeRiffImportExclusionRecord | null;
}

export interface BackendQueueStateLoadAllRequest {}

export interface BackendQueueStateLoadAllResult {
  values: Record<string, unknown>;
}

export type BackendQueueStateMutation =
  | {
      operation: 'set';
      key: string;
      value: unknown;
    }
  | {
      operation: 'delete';
      key: string;
    };

export interface BackendQueueStateBatchMutateRequest {
  mutationId: string;
  mutations: BackendQueueStateMutation[];
}

export interface BackendQueueStateBatchMutateResult {
  updatedKeys: string[];
  deletedKeys: string[];
  durabilityReceipt: StorageDurabilityReceipt;
}

export type BackendRpcMethodContract<
  TMethod extends BackendRpcMethod = BackendRpcMethod,
  TParams = unknown,
  TResult = unknown,
> = {
  readonly method: TMethod;
  readonly family: BackendRpcFamily;
  readonly clientExposure: BackendRpcClientExposure;
  readonly __params?: TParams;
  readonly __result?: TResult;
};

export interface BackendRpcHandlerAdapter<TParams = unknown, TResult = unknown, TContext = unknown> {
  readonly method: BackendRpcMethod;
  readonly family: BackendRpcFamily;
  handle(params: TParams | undefined, context: TContext): Promise<TResult> | TResult;
}

export interface BackendRpcClientMethodCatalogEntry<TMethod extends BackendRpcMethod = BackendRpcMethod> {
  readonly clientMethod: string;
  readonly rpcMethod: TMethod;
  readonly family: BackendRpcFamily;
  readonly exposure: Extract<BackendRpcClientExposure, 'facade' | 'facet'>;
}

export const BACKEND_RPC_METHOD_FAMILY_CATALOG = [
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['system.health'],
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['db.load'],
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['db.reload'],
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['storage.maintenance.status'],
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['storage.maintenance.applyBatch'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['truth.reconciliation.run'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['sync.reviewDivergence.audit'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['sync.conflict.summarize'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['sync.conflict.reload'],
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['diagnostics.status'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['domainSync.status'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['domainSync.repair.preview'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['domainSync.repair.apply'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['domainSync.conflictSources.cleanupCandidates'],
  BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD['domainSync.conflictSources.cleanup'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.deck.page'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.deck.matchedIds'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.deck.rowsByIds'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.deck.documentCounts'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.stats'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.count'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.sourceExistence.refreshCandidates'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.sourceExistence.update'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.sourceExistence.byBlockIds'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.sourceExistence.summary'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.sourceExistence.applySweep'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.sourceExistence.applySweepHost'],
  BACKEND_CARD_RPC_METHOD_CONTRACT_BY_METHOD['card.crud.batchMutate'],
  BACKEND_CARD_RPC_METHOD_CONTRACT_BY_METHOD['card.schedule.batchUpdate'],
  BACKEND_CARD_RPC_METHOD_CONTRACT_BY_METHOD['card.nativeRiffImportExclusion.find'],
  BACKEND_QUEUE_RPC_METHOD_CONTRACT_BY_METHOD['queue.state.loadAll'],
  BACKEND_QUEUE_RPC_METHOD_CONTRACT_BY_METHOD['queue.state.batchMutate'],
  BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD['storage.projection.rebuild'],
  BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD['queue.projection.snapshot'],
  BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD['queue.projection.rowsByIds'],
  BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD['queue.projection.replace'],
  BACKEND_NEURAL_ROAM_RPC_METHOD_CONTRACT_BY_METHOD['neural-roam.advance'],
  BACKEND_NEURAL_ROAM_RPC_METHOD_CONTRACT_BY_METHOD['neural-roam.viewState'],
  BACKEND_NEURAL_ROAM_RPC_METHOD_CONTRACT_BY_METHOD['neural-roam.command'],
  BACKEND_KERNEL_TRANSACTION_RPC_METHOD_CONTRACT_BY_METHOD['kernel.transaction.ingest'],
  BACKEND_KERNEL_TRANSACTION_RPC_METHOD_CONTRACT_BY_METHOD['kernel.transaction.dequeue'],
  BACKEND_KERNEL_TRANSACTION_RPC_METHOD_CONTRACT_BY_METHOD['kernel.transaction.requeue'],
  BACKEND_AUTOCARD_RPC_METHOD_CONTRACT_BY_METHOD['autocard.decision.resolve'],
  BACKEND_AUTOCARD_RPC_METHOD_CONTRACT_BY_METHOD['autocard.execute'],
  BACKEND_AUTOCARD_RPC_METHOD_CONTRACT_BY_METHOD['autocard.executeBatch'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.feedback'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.session.start'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.session.current'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.session.feedback'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.session.skip'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.session.undo'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.truth.flush'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.truth.backfill'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.truth.maintenanceStatus'],
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['private.health'],
  BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD['private.diagnostics.status'],
  BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD['private.audit.query'],
  BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD['private.read.cards'],
  BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD['private.read.queues'],
  BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD['private.read.sessions'],
  BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD['private.command.execute'],
  BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD['semantic.command.execute'],
  BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD['semantic.session.read'],
  BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD['semantic.sidebar.read'],
  BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD['semantic.browser.read'],
  BACKEND_HOTSPOT_RPC_METHOD_CONTRACT_BY_METHOD['hotspot.command.submit'],
  BACKEND_HOTSPOT_RPC_METHOD_CONTRACT_BY_METHOD['hotspot.job.get'],
  BACKEND_PROGRESSIVE_RPC_METHOD_CONTRACT_BY_METHOD['progressive.command.execute'],
  BACKEND_TOPIC_DERIVED_RPC_METHOD_CONTRACT_BY_METHOD['topic-derived.command.execute'],
  BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD['review.sourceRefresh.execute'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.aggregate.snapshot'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.aggregate.page'],
  BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD['browser.aggregate.focus'],
  BACKEND_GRAPH_RPC_METHOD_CONTRACT_BY_METHOD['graph.query'],
  BACKEND_P6_OWNERSHIP_RPC_METHOD_CONTRACT_BY_METHOD['p6.ownership.query'],
  BACKEND_P6_OWNERSHIP_RPC_METHOD_CONTRACT_BY_METHOD['p6.ownership.command'],
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<Record<BackendRpcMethod, BackendRpcMethodContract>>;

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
  'TRUTH_VALIDATION_FAILED',
  'PROJECTION_REBUILD_FAILED',
  'SOURCE_READ_UNAVAILABLE',
  'STORAGE_PRESSURE',
  'STORAGE_RECOVERY_REQUIRED',
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

export interface BackendUnifiedStorageSnapshot {
  version: number;
  xiuyuans: Record<string, unknown>;
  cards: Record<string, unknown>;
  cardDTOs?: Record<string, unknown>;
  deletedCardDTOs?: Record<string, unknown>;
  deletedXiuyuans?: Record<string, unknown>;
  syncMetadata?: {
    revision: number;
    contentHash: string;
    lastModifiedAt: number;
    lastModifiedBy: string;
  };
}

export interface BackendDbLoadResult {
  ok: true;
  initialized: boolean;
  dbFile: string;
  projectionSnapshot: BackendUnifiedStorageSnapshot;
}

export interface BackendDbLoadRequest {
  truthDeviceId?: string | null;
  identityEpoch?: string | null;
  cardTruthGenerationId?: string | null;
  reviewTruthGenerationId?: string | null;
  truthSchemaVersion?: number | null;
  maxSegmentBytes?: number | null;
}

export interface BackendDbReloadResult {
  ok: true;
  reloaded: true;
  dbFile: string;
}

export type BackendLegacyUnifiedImportRecord =
  | {
      kind: 'card';
      id: string;
      card: unknown;
      dto?: unknown;
      tombstone?: unknown;
    }
  | {
      kind: 'xiuyuan';
      id: string;
      value: unknown;
    }
  | {
      kind: 'card-tombstone';
      id: string;
      value: unknown;
      card?: unknown;
      dto?: unknown;
    }
  | {
      kind: 'xiuyuan-tombstone';
      id: string;
      value: unknown;
    };

export type BackendLegacyReviewImportRecord =
  | { kind: 'review'; value: unknown }
  | { kind: 'review-v2'; value: unknown }
  | { kind: 'drill-v2'; value: unknown }
  | { kind: 'reschedule'; value: unknown };

export type BackendLegacyArenaImportRecord =
  | { kind: 'match'; value: unknown }
  | { kind: 'score'; value: unknown }
  | { kind: 'attribution'; value: unknown };

export type BackendStorageMaintenanceBatch =
  | {
      kind: 'legacy-storage-import-begin';
      appliedAt: number;
    }
  | {
      kind: 'legacy-unified-reset';
    }
  | {
      kind: 'legacy-unified-records';
      records: BackendLegacyUnifiedImportRecord[];
    }
  | {
      kind: 'legacy-queue-records';
      entries: Array<[string, unknown]>;
    }
  | {
      kind: 'legacy-review-records';
      records: BackendLegacyReviewImportRecord[];
    }
  | {
      kind: 'legacy-arena-records';
      records: BackendLegacyArenaImportRecord[];
    }
  | {
      kind: 'legacy-unified-finalize';
      version: number;
      syncMetadata?: unknown;
      appliedAt: number;
    }
  | {
      kind: 'native-riff-retirement';
      blockIds: string[];
      appliedAt: number;
      includeStoredBlacklist?: boolean;
      dropLegacyTable?: boolean;
    }
  | {
      kind: 'algorithm-card-state-backup';
      fileName: string;
      capturedAt: number;
    }
  | {
      kind: 'algorithm-card-state-backfill';
      appliedAt: number;
    }
  | {
      kind: 'neural-roam-route-migration';
      appliedAt: number;
    };

export interface BackendStorageMaintenanceApplyBatchRequest {
  operationId: string;
  migrationId: string;
  batchIndex: number;
  totalBatches: number;
  batch: BackendStorageMaintenanceBatch;
}

export interface BackendStorageMaintenanceStatusRequest {
  operationId: string;
  migrationId: string;
}

export interface BackendStorageMaintenanceStatusResult {
  operationId: string;
  migrationId: string;
  required: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed';
  completedBatches: number;
  totalBatches: number | null;
  lastMutationId: string | null;
  completedAt: number | null;
  error: string | null;
}

export interface BackendStorageMaintenanceApplyBatchResult {
  operationId: string;
  migrationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  completedBatches: number;
  totalBatches: number;
  lastMutationId: string | null;
  completedAt: number | null;
  error: string | null;
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

export interface BackendReviewSyncUndoAuditSummary {
  answerUndoPairs: number;
  openUndoPlans: number;
  staleUndoPlans: number;
  undonePlans: number;
}

export interface BackendReviewSyncDivergenceAuditResult {
  ok: true;
  scannedCards: number;
  divergentCards: number;
  limit: number;
  truncated: boolean;
  reasons: Record<BackendSyncConflictMergeDivergenceReason, number>;
  undo: BackendReviewSyncUndoAuditSummary;
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

export interface BackendTruthReconciliationRunRequest {
  reason?: string | null;
}

export interface BackendTruthReconciliationConflict {
  aggregateType: 'card' | 'queue' | 'mutation';
  aggregateId: string;
  reason:
    | 'duplicate-mutation-payload-mismatch'
    | 'non-commutative-concurrent-mutations'
    | 'disconnected-causal-history';
  mutationIds: string[];
  sourceIds: string[];
  causalBaseRevision: string | null;
}

export interface BackendTruthReconciliationRunResult {
  ok: true;
  sourceCount: number;
  acceptedMutationIds: string[];
  duplicateMutationIds: string[];
  blockedAggregateIds: string[];
  conflicts: BackendTruthReconciliationConflict[];
  mergeDecisionCount: number;
  generationIds: {
    card: string | null;
    queue: string | null;
    review: string;
    domainSync: string;
  };
  projectionRebuilt: boolean;
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

export interface BackendStorageIdentityDiagnostics {
  available: boolean;
  deviceId: string | null;
  identityEpoch: string | null;
}

export interface BackendStorageReceiptStageDiagnostics {
  stageCounts: {
    failed: number | null;
    journaled: number;
    'truth-committed': number;
  };
  latestRetryReason: string | null;
}

export interface BackendTruthPromotionStatusDiagnostics {
  available: boolean;
  active: boolean;
  shutdownStarted: boolean;
  pendingMutationCount: number;
  oldestPendingAgeMs: number | null;
  journalSequenceFrontier: number;
  truthCoverageFrontier: number;
  retryReason: string | null;
  lastSuccessfulPromotionAt: number | null;
}

export interface BackendTruthCoverageDiagnostics {
  available: boolean;
  journalSequenceFrontier: number;
  truthCoverageFrontier: number;
  uncoveredMutationCount: number;
  lag: number;
}

export interface BackendTruthReconciliationDiagnostics {
  status: 'never-run' | 'succeeded' | 'failed';
  reason: string | null;
  startedAt: number | null;
  completedAt: number | null;
  sourceCount: number;
  acceptedMutationCount: number;
  duplicateMutationCount: number;
  blockedAggregateIds: string[];
  conflictCount: number;
  mergeDecisionCount: number;
  generationIds: {
    card: string | null;
    queue: string | null;
    review: string | null;
    domainSync: string | null;
  };
  projectionRebuilt: boolean;
  lastError: string | null;
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
    identity?: BackendStorageIdentityDiagnostics;
    receipts?: BackendStorageReceiptStageDiagnostics;
    promotion?: BackendTruthPromotionStatusDiagnostics;
    coverage?: BackendTruthCoverageDiagnostics;
    inventory?: StorageInventoryRecord;
    budget?: StoragePressureRecord;
    recovery?: StorageRecoveryState | null;
    reconciliation?: BackendTruthReconciliationDiagnostics;
    disabledCapabilities?: string[];
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
  identityEpoch?: string | null;
  source:
    | 'authority-copies'
    | 'indexeddb-repaired-localStorage'
    | 'localStorage-repaired-indexeddb'
    | 'identity-recovery-required'
    | 'temp-local'
    | 'localStorage'
    | 'legacy-localStorage'
    | 'generated'
    | 'unavailable';
  localStatePath: string;
  persisted: boolean;
  cacheUpdated: boolean;
  hostFingerprintMatch?: 'match' | 'changed' | 'unknown';
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
  skippedDerivedTables?: string[];
  skippedDerivedChangeCount?: number;
  byteLength?: number | null;
  cleared?: boolean;
  checkpointStorageClass?: BackendSqliteCheckpointStorageClass;
  error?: string | null;
}

export interface BackendSqliteDeltaDiagnostics {
  fileName: string;
  version: number;
  registeredTables: string[];
  durableReplayTables?: string[];
  derivedCacheTables?: string[];
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

export interface MessagePackCardAggregateCardState {
  id: string;
  blockId: string;
  xiuyuanId: string | null;
  faceKey: {
    ruleId: string;
    faceIndex?: number | null;
  } | null;
  type: string;
  priority: number;
  tags: string[];
  cardTypeMarker: string | null;
  neuralRoamSeed: boolean;
  skipped: boolean;
  skipNote: string | null;
  skipUntil: number | null;
  sourceUrl: string | null;
  extractedFrom: string | null;
  createdAt: number;
  updatedAt: number;
  meta: Record<string, unknown> | null;
}

export interface MessagePackCardAggregateScheduleState {
  schedulerType: string | null;
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number;
  elapsedDays: number;
  scheduledDays: number;
  learningStep: number | null;
  leechCount: number;
  isLeech: boolean;
  aFactor: number | null;
  riffCardId: string | null;
  schedulerMeta: Record<string, unknown> | null;
  postponeCount: number;
  lastPostponeDate: number | null;
  rescheduleHistory: Array<Record<string, unknown>>;
}

export interface MessagePackCardAggregateTombstoneMetadata {
  deletedAt: number;
  deletedByMutationId: string;
  deletedByDeviceId: string;
  identityEpoch: string;
  reason: string | null;
}

interface MessagePackCardAggregateTruthRecordBase {
  family: 'card-memory-facts';
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  idempotencyKey: string;
  mutationId: string;
  aggregateId: string;
  causalBaseRevision: string | null;
  revision: string;
  journalSequence: number;
  logicalTime: number;
  recordedAt: number;
}

export interface MessagePackCardAggregateSnapshotTruthRecord
  extends MessagePackCardAggregateTruthRecordBase {
  type: 'card-aggregate.snapshot.v1';
  card: MessagePackCardAggregateCardState;
  schedule: MessagePackCardAggregateScheduleState;
  tombstone: null;
}

export interface MessagePackCardAggregateChangesetTruthRecord
  extends MessagePackCardAggregateTruthRecordBase {
  type: 'card-aggregate.changeset.v1';
  card: MessagePackCardAggregateCardState;
  schedule: MessagePackCardAggregateScheduleState;
  tombstone: null;
}

export interface MessagePackCardAggregateTombstoneTruthRecord
  extends MessagePackCardAggregateTruthRecordBase {
  type: 'card-aggregate.tombstone.v1';
  card: null;
  schedule: null;
  tombstone: MessagePackCardAggregateTombstoneMetadata;
}

export type MessagePackCardAggregateTruthRecord =
  | MessagePackCardAggregateSnapshotTruthRecord
  | MessagePackCardAggregateChangesetTruthRecord
  | MessagePackCardAggregateTombstoneTruthRecord;

function isMessagePackRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isMessagePackCardAggregateTruthRecord(
  value: unknown,
): value is MessagePackCardAggregateTruthRecord {
  if (
    !isMessagePackRecord(value)
    || value.family !== 'card-memory-facts'
    || value.schemaVersion !== MESSAGEPACK_TRUTH_SCHEMA_VERSION
    || !hasNonEmptyString(value.idempotencyKey)
    || !hasNonEmptyString(value.mutationId)
    || !hasNonEmptyString(value.aggregateId)
    || !hasNonEmptyString(value.revision)
    || !(value.causalBaseRevision === null || hasNonEmptyString(value.causalBaseRevision))
    || !hasFiniteNumber(value.journalSequence)
    || value.journalSequence < 1
    || !hasFiniteNumber(value.logicalTime)
    || !hasFiniteNumber(value.recordedAt)
  ) {
    return false;
  }
  if (
    value.type === 'card-aggregate.snapshot.v1'
    || value.type === 'card-aggregate.changeset.v1'
  ) {
    return isMessagePackRecord(value.card)
      && value.card.id === value.aggregateId
      && hasNonEmptyString(value.card.blockId)
      && isMessagePackRecord(value.schedule)
      && value.tombstone === null;
  }
  if (value.type === 'card-aggregate.tombstone.v1') {
    return value.card === null
      && value.schedule === null
      && isMessagePackRecord(value.tombstone)
      && hasFiniteNumber(value.tombstone.deletedAt)
      && hasNonEmptyString(value.tombstone.deletedByMutationId)
      && hasNonEmptyString(value.tombstone.deletedByDeviceId)
      && hasNonEmptyString(value.tombstone.identityEpoch);
  }
  return false;
}

export interface MessagePackQueueMemberState {
  cardId: string;
  due: number;
  priority: number;
  state: number;
  schedulerType: string | null;
  membershipReason: string | null;
  sortKey: string | null;
}

export interface MessagePackQueueMemberChange {
  operation: 'upsert' | 'remove';
  cardId: string;
  member: MessagePackQueueMemberState | null;
}

interface MessagePackQueueTruthRecordBase {
  family: 'queue-facts';
  schemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  idempotencyKey: string;
  mutationId: string;
  queueFamily: string;
  causalBaseRevision: string | null;
  revision: string;
  journalSequence: number;
  logicalTime: number;
  recordedAt: number;
}

export interface MessagePackQueueSnapshotTruthRecord
  extends MessagePackQueueTruthRecordBase {
  type: 'queue-family.snapshot.v1';
  members: MessagePackQueueMemberState[];
  changes: null;
}

export interface MessagePackQueueChangesetTruthRecord
  extends MessagePackQueueTruthRecordBase {
  type: 'queue-family.changeset.v1';
  members: null;
  changes: MessagePackQueueMemberChange[];
}

export interface MessagePackQueueStateChange {
  operation: 'set' | 'delete';
  key: string;
  value: unknown | null;
}

export interface MessagePackQueueStateChangesetTruthRecord
  extends MessagePackQueueTruthRecordBase {
  type: 'queue-state.changeset.v1';
  members: null;
  changes: null;
  stateChange: MessagePackQueueStateChange;
}

export type MessagePackQueueTruthRecord =
  | MessagePackQueueSnapshotTruthRecord
  | MessagePackQueueChangesetTruthRecord
  | MessagePackQueueStateChangesetTruthRecord;

function isMessagePackQueueMemberState(value: unknown): value is MessagePackQueueMemberState {
  return isMessagePackRecord(value)
    && hasNonEmptyString(value.cardId)
    && hasFiniteNumber(value.due)
    && hasFiniteNumber(value.priority)
    && hasFiniteNumber(value.state)
    && (value.schedulerType === null || typeof value.schedulerType === 'string')
    && (value.membershipReason === null || typeof value.membershipReason === 'string')
    && (value.sortKey === null || typeof value.sortKey === 'string');
}

function isMessagePackJsonValue(value: unknown): boolean {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isMessagePackJsonValue);
  }
  return isMessagePackRecord(value)
    && Object.values(value).every(isMessagePackJsonValue);
}

export function isMessagePackQueueTruthRecord(value: unknown): value is MessagePackQueueTruthRecord {
  if (
    !isMessagePackRecord(value)
    || value.family !== 'queue-facts'
    || value.schemaVersion !== MESSAGEPACK_TRUTH_SCHEMA_VERSION
    || !hasNonEmptyString(value.idempotencyKey)
    || !hasNonEmptyString(value.mutationId)
    || !hasNonEmptyString(value.queueFamily)
    || !hasNonEmptyString(value.revision)
    || !(value.causalBaseRevision === null || hasNonEmptyString(value.causalBaseRevision))
    || !hasFiniteNumber(value.journalSequence)
    || value.journalSequence < 1
    || !hasFiniteNumber(value.logicalTime)
    || !hasFiniteNumber(value.recordedAt)
  ) {
    return false;
  }
  if (value.type === 'queue-family.snapshot.v1') {
    return Array.isArray(value.members)
      && value.members.every(isMessagePackQueueMemberState)
      && value.changes === null;
  }
  if (value.type === 'queue-family.changeset.v1') {
    return value.members === null
      && Array.isArray(value.changes)
      && value.changes.every((change) => (
        isMessagePackRecord(change)
        && (change.operation === 'upsert' || change.operation === 'remove')
        && hasNonEmptyString(change.cardId)
        && (
          (change.operation === 'upsert' && isMessagePackQueueMemberState(change.member))
          || (change.operation === 'remove' && change.member === null)
        )
      ));
  }
  if (value.type === 'queue-state.changeset.v1') {
    return value.members === null
      && value.changes === null
      && isMessagePackRecord(value.stateChange)
      && (value.stateChange.operation === 'set' || value.stateChange.operation === 'delete')
      && hasNonEmptyString(value.stateChange.key)
      && value.stateChange.key === value.queueFamily
      && (
        (value.stateChange.operation === 'set' && isMessagePackJsonValue(value.stateChange.value))
        || (value.stateChange.operation === 'delete' && value.stateChange.value === null)
      );
  }
  return false;
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
  | MessagePackCardAggregateTruthRecord
  | MessagePackQueueTruthRecord
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

export interface BackendTruthPromotionDiagnostics {
  available: boolean;
  active: boolean;
  shutdownStarted: boolean;
  pendingMutationCount: number;
  oldestPendingAgeMs: number | null;
  journalSequenceFrontier: number;
  truthCoverageFrontier: number;
  retryReason: string | null;
  lastSuccessfulPromotionAt: number | null;
}

export interface BackendReviewTruthMaintenanceStatusResult {
  family: 'review-events';
  journal: BackendReviewFeedbackJournalDiagnostics;
  truthBackfill: BackendReviewTruthBackfillDiagnostics;
  truthPromotion: BackendTruthPromotionDiagnostics;
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
  | 'progressive.command'
  | 'topic-derived.command'
  | 'ai.tool-job'
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
  | 'missing_derived_cache'
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

export type BackendQueueProjectionCacheState =
  | 'ready-empty'
  | 'ready-populated'
  | 'missing-derived-cache'
  | 'stale';

export interface BackendQueueProjectionSnapshotResult {
  queueType: string;
  policyHash: string | null;
  generation: number | null;
  status: 'ready' | 'refreshing' | 'invalidated' | 'rebuilding' | 'repairing' | 'unavailable' | string;
  rows: BackendQueueProjectionSnapshotRow[];
  counters: BackendReviewFeedbackQueueImpactCounters | null;
  freshness?: BackendQueueProjectionFreshnessEvidence | null;
  cacheState?: BackendQueueProjectionCacheState | null;
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
  cacheState?: BackendQueueProjectionCacheState | null;
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
  | 'delta-recorded'
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
  undoJournalPersisted?: boolean;
  queueImpact?: BackendReviewFeedbackQueueImpact | null;
  durabilityReceipt?: StorageDurabilityReceipt | null;
  storage?: BackendReviewFeedbackStorageState;
}

export interface BackendReviewSessionStartRequest {
  sessionId?: string | null;
  queueType?: string | null;
  limit?: number | null;
  entrySurface?: string | null;
  projectionPolicyHash?: string | null;
  projectionGeneration?: number | null;
}

export interface BackendReviewSessionCurrentRequest {
  sessionId: string;
}

export type BackendReviewSessionRepairGateState =
  | 'clean'
  | 'accepted-repairable'
  | 'blocking'
  | 'unavailable';

export interface BackendReviewSessionRepairGateEvidence {
  state: BackendReviewSessionRepairGateState;
  reason: string;
  createdAt: number;
  cardId?: string | null;
  sanityStatus?: BackendDomainSyncSanityStatus | null;
}

export interface BackendReviewSessionFeedbackRequest {
  sessionId: string;
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  reviewedAt?: number | null;
  idempotencyKey?: string | null;
  repairGate?: BackendReviewSessionRepairGateEvidence | null;
}

export interface BackendReviewSessionSkipRequest {
  sessionId: string;
  cardId: string;
}

export interface BackendReviewSessionUndoRequest {
  sessionId: string;
  undoToken?: string | null;
}

export interface BackendReviewSessionCounterSnapshot {
  remaining: number;
  due: number;
  total: number;
  source: 'worker-session';
}

export type BackendReviewSessionProjectionState =
  | 'ready'
  | 'stale'
  | 'deferred'
  | 'refresh-required'
  | 'not-used';

export interface BackendReviewSessionState {
  sessionId: string;
  queueType: string;
  current: unknown | null;
  lookaheadCards?: unknown[] | null;
  counters: BackendReviewSessionCounterSnapshot;
  projectionState: BackendReviewSessionProjectionState;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
}

export type BackendSrsReviewKernelFactIdentity =
  | {
    kind: 'idempotency-key';
    idempotencyKey: string;
  }
  | {
    kind: 'unavailable';
    idempotencyKey: null;
  };

export interface BackendSrsReviewKernelAnswerReceipt {
  answeredCardId: string;
  reviewedAt: number;
  queueType: string;
  commit: {
    outcome: 'committed' | 'not-committed';
    updatedCard: unknown | null;
    duplicate: boolean;
  };
  factIdentity: BackendSrsReviewKernelFactIdentity;
  durability: {
    status: 'durable' | 'not-durable';
    evidence: 'storage-summary' | 'worker-commit';
  };
  undo: {
    token: string | null;
    evidence: 'transaction-journal' | 'session-snapshot' | 'unavailable';
  };
  queueImpact: BackendReviewFeedbackQueueImpact | null;
  storage: BackendReviewFeedbackStorageState | null;
  diagnostics: {
    authority: 'worker-review-session';
    projectionState: BackendReviewSessionProjectionState;
    storageSummaryAvailable: boolean;
  };
}

export interface BackendReviewSessionFeedbackResult extends BackendReviewSessionState {
  receipt: BackendSrsReviewKernelAnswerReceipt;
}

export interface BackendReviewSessionSkipResult extends BackendReviewSessionState {
  skippedCardId: string;
  undoToken?: string | null;
}

export interface BackendReviewSessionUndoResult extends BackendReviewSessionState {
  restoredCardId: string | null;
  replayedCardId: string | null;
  undoToken: string;
  durabilityReceipt?: StorageDurabilityReceipt | null;
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

export interface BackendAutoCardExecuteBatchItem {
  envelope: BackendAutoCardExecuteEnvelope;
}

export interface BackendAutoCardExecuteBatchRequest {
  items: BackendAutoCardExecuteBatchItem[];
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

export interface BackendAutoCardExecuteBatchResult {
  executed: boolean;
  created: number;
  skipped: number;
  failed?: number;
}

export interface BackendKernelTransactionIngestRequest {
  source?: 'kernel-sidecar' | 'ws-main';
  transactions?: unknown[];
  receivedAt?: number;
  idempotencyKey?: string;
  enabledActionTypes?: BackendKernelTransactionActionType[];
  provenanceSnapshot?: {
    capturedAt?: number;
    entries?: Array<{
      blockId?: string;
      expiresAt?: number;
      reason?: string;
      source?: string;
      suppressAutoCard?: boolean;
    }>;
  };
}

export type BackendKernelTransactionActionType = 'auto-card-candidates';

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

export interface BackendKernelTransactionAutoCardAction extends BackendKernelTransactionActionBase {
  type: Extract<BackendKernelTransactionActionType, 'auto-card-candidates'>;
  operations: Array<{
    action: 'insert' | 'update' | 'delete';
    blockId: string;
  }>;
}

export type BackendKernelTransactionAction = BackendKernelTransactionAutoCardAction;

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
