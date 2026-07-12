import type {
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendAutoCardExecuteBatchRequest,
  BackendAutoCardExecuteBatchResult,
  BackendDbLoadRequest,
  BackendDbReloadResult,
  BackendBrowserAggregateFocusRequest,
  BackendBrowserAggregateFocusResult,
  BackendBrowserAggregatePageRequest,
  BackendBrowserAggregatePageResult,
  BackendBrowserAggregateSnapshotRequest,
  BackendBrowserAggregateSnapshotResult,
  BackendCardCrudBatchMutateRequest,
  BackendCardCrudBatchMutateResult,
  BackendNativeRiffImportExclusionFindRequest,
  BackendNativeRiffImportExclusionFindResult,
  BackendCardScheduleBatchUpdateRequest,
  BackendCardScheduleBatchUpdateResult,
  BackendBrowserDocumentCountsResult,
  BackendBrowserDocumentCountsScope,
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
  BackendBrowserDeckPageRequest,
  BackendBrowserDeckPageResult,
  BackendBrowserDeckSnapshotQuery,
  BackendSourceExistenceSweepApplyResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionDequeueRequest,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionRequeueRequest,
  BackendKernelTransactionRequeueResult,
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamViewState,
  BackendNeuralRoamViewStateRequest,
  BackendNeuralRoamViewStateResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendStorageProjectionRebuildRequest,
  BackendStorageProjectionRebuildResult,
  BackendStorageMaintenanceApplyBatchRequest,
  BackendStorageMaintenanceApplyBatchResult,
  BackendStorageMaintenanceStatusRequest,
  BackendStorageMaintenanceStatusResult,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
  BackendReviewSessionCurrentRequest,
  BackendReviewSessionFeedbackRequest,
  BackendReviewSessionFeedbackResult,
  BackendReviewSessionSkipRequest,
  BackendReviewSessionSkipResult,
  BackendReviewSessionStartRequest,
  BackendReviewSessionState,
  BackendReviewSessionUndoRequest,
  BackendReviewSessionUndoResult,
  BackendReviewFeedbackTruthFlushRequest,
  BackendReviewFeedbackTruthFlushResult,
  BackendReviewTruthBackfillRequest,
  BackendReviewTruthBackfillResult,
  BackendReviewTruthMaintenanceStatusResult,
  BackendReviewSourceRefreshExecuteRequest,
  BackendReviewSourceRefreshExecuteResult,
  BackendDomainSyncRepairApplyRequest,
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewRequest,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusResult,
  BackendDomainSyncConflictSourceCleanupCandidatesResult,
  BackendDomainSyncConflictSourceCleanupRequest,
  BackendDomainSyncConflictSourceCleanupResult,
  BackendReviewSyncDivergenceAuditRequest,
  BackendReviewSyncDivergenceAuditResult,
  BackendDomainSyncStatusRequest,
  BackendSyncConflictReloadResult,
  BackendSyncConflictSummarizeRequest,
  BackendSyncConflictSummarizeResult,
  BackendTruthReconciliationRunRequest,
  BackendTruthReconciliationRunResult,
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
  BackendSemanticCommandRequest,
  BackendSemanticCommandResult,
  BackendSemanticSidebarReadRequest,
  BackendSemanticSidebarReadResult,
  BackendSemanticSessionReadRequest,
  BackendSemanticSessionReadResult,
  P6OwnershipCommandRequest,
  P6OwnershipQueryRequest,
  P6OwnershipResult,
  PrivateApiMutationRequest,
  PrivateApiMutationResult,
  PrivateApiAuditQueryRequest,
  PrivateApiAuditQueryResult,
  PrivateApiReadRequest,
  PrivateApiReadResult,
  BackendSourceExistenceRefreshCandidate,
  BackendSourceExistenceRefreshRequest,
  BackendSourceExistenceSummary,
  BackendSourceExistenceUpdate,
  BackendDiagnosticsStatusResult,
  BackendReviewTruthDeviceDiagnostics,
  BackendStartupIdentityDisposition,
  BackendHealthResult,
  BackendPrivateDiagnosticsStatusResult,
  BackendPrivateHealthResult,
  BackendGraphQueryRequest,
  BackendGraphQueryResult,
  BackendHotspotCommandSubmitRequest,
  BackendHotspotCommandSubmitResult,
  BackendHotspotJobGetRequest,
  BackendHotspotJobGetResult,
  BackendProgressiveCommandExecuteRequest,
  BackendProgressiveCommandExecuteResult,
  BackendTopicDerivedCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteResult,
} from '../../../packages/contracts/src/backend-rpc';
import { MESSAGEPACK_TRUTH_SCHEMA_VERSION } from '../../../packages/contracts/src/backend-rpc';
import type { StructuredCardQuery } from '@/types/card-query';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import {
  BackendBrowserRpcClient,
  BackendCardRpcClient,
  BackendCoreRpcClient,
  BackendIntegrationRpcClient,
  BackendNeuralRoamRpcClient,
  BackendPrivateApiRpcClient,
  BackendQueueRpcClient,
  BackendQueueProjectionRpcClient,
  BackendReviewRpcClient,
  BackendRpcCaller,
  BackendSemanticRpcClient,
  type SrsBackendTransport,
} from './backend';
import { assertCommittedReviewFeedbackDurability } from './reviewFeedbackDurability';
import {
  KernelCompanionBackgroundWorkRegistry,
  type KernelCompanionBackgroundWorkHandlerResult,
  type KernelCompanionBackgroundWorkRegistryInterface,
  type KernelCompanionBackgroundWorkRunContext,
  type KernelCompanionReviewTruthFlushDiagnostics,
  type KernelCompanionReviewTruthBackfillDiagnostics,
  type KernelCompanionTruthPromotionDiagnostics,
} from '../backgroundWork/KernelCompanionBackgroundWorkRegistry';
import {
  KernelCompanionBackgroundWorkStatusReadModel,
  type KernelCompanionBackgroundWorkStatusJob,
  type KernelCompanionBackgroundWorkStatusReadModelInterface,
  type KernelCompanionBackgroundWorkStatusReadOptions,
} from '../backgroundWork/KernelCompanionBackgroundWorkStatusReadModel';

const logger = createLogger('SrsBackendClient');
const REVIEW_FEEDBACK_CLIENT_STEP_SLOW_MS = 500;
const REVIEW_TRUTH_FLUSH_STARTUP_DELAY_MS = 2_100;
const REVIEW_TRUTH_FLUSH_LONG_IDLE_DELAY_MS = 5 * 60 * 1000;
const REVIEW_TRUTH_FLUSH_DEFAULT_THRESHOLD = 8;
const REVIEW_TRUTH_FLUSH_UNLOAD_WAIT_MS = 1000;
const REVIEW_TRUTH_BACKFILL_DEFAULT_BATCH_LIMIT = 64;
const REVIEW_TRUTH_BACKFILL_MAX_STARTUP_BATCHES = 16;
const TRUTH_PROMOTION_STATUS_MAX_POLLS = 16;
const TRUTH_PROMOTION_STATUS_POLL_MS = 25;
const REVIEW_TRUTH_MUTATION_IDENTITY_SOURCES = new Set<BackendReviewTruthDeviceDiagnostics['source']>([
  'authority-copies',
  'indexeddb-repaired-localStorage',
  'localStorage-repaired-indexeddb',
]);

function isReviewTruthFlushPressureSuppressed(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('review.feedback suppressed SiYuan persistence host effect truth.writeBinary')
    || message.includes('review.feedback suppressed SiYuan persistence host effect truth.writeJSON');
}

function delayReviewTruthFlush(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.floor(delayMs)));
  });
}

export type { SrsBackendTransport } from './backend/BackendRpcCaller';

export interface SrsBackendReviewTruthFlushSchedulerOptions {
  deviceId: string;
  identityEpoch?: string | null;
  generationId: string;
  schemaVersion?: number;
  maxSegmentBytes?: number;
  batchLimit?: number;
  delayMs?: number;
  longIdleDelayMs?: number;
  flushThreshold?: number;
  unloadWaitMs?: number;
}

export interface SrsBackendClientOptions {
  startupIdentityDisposition?: BackendStartupIdentityDisposition | null;
  reviewTruthFlush?: SrsBackendReviewTruthFlushSchedulerOptions | null;
  reviewTruthDevice?: BackendReviewTruthDeviceDiagnostics | null;
  canWriteReviewTruth?: () => boolean;
  backgroundWorkRegistry?: KernelCompanionBackgroundWorkRegistryInterface | null;
}

export class SrsBackendClient {
  private readonly coreClient: BackendCoreRpcClient;
  private readonly browserClient: BackendBrowserRpcClient;
  private readonly cardClient: BackendCardRpcClient;
  private readonly queueClient: BackendQueueRpcClient;
  private readonly queueProjectionClient: BackendQueueProjectionRpcClient;
  private readonly reviewClient: BackendReviewRpcClient;
  private readonly neuralRoamClient: BackendNeuralRoamRpcClient;
  private readonly semanticClient: BackendSemanticRpcClient;
  private readonly privateApiClient: BackendPrivateApiRpcClient;
  private readonly integrationClient: BackendIntegrationRpcClient;
  private readonly startupIdentityDisposition: BackendStartupIdentityDisposition | null;
  private readonly reviewTruthFlushOptions: SrsBackendReviewTruthFlushSchedulerOptions | null;
  private readonly reviewTruthDeviceDiagnostics: BackendReviewTruthDeviceDiagnostics | null;
  private readonly canWriteReviewTruth: () => boolean;
  private readonly backgroundWorkRegistry: KernelCompanionBackgroundWorkRegistryInterface;
  private readonly backgroundWorkStatusReadModel: KernelCompanionBackgroundWorkStatusReadModelInterface;
  private reviewTruthFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private reviewTruthFlushJobId: string | null = null;
  private reviewTruthFlushInFlight = false;
  private reviewTruthFlushInFlightPromise: Promise<void> | null = null;
  private reviewTruthFlushQueued = false;
  private truthPromotionTrackingJobId: string | null = null;
  private disposed = false;

  constructor(
    transport: SrsBackendTransport,
    options: SrsBackendClientOptions = {},
  ) {
    const rpcCaller = new BackendRpcCaller(transport);
    this.coreClient = new BackendCoreRpcClient(rpcCaller);
    this.browserClient = new BackendBrowserRpcClient(rpcCaller);
    this.cardClient = new BackendCardRpcClient(rpcCaller);
    this.queueClient = new BackendQueueRpcClient(rpcCaller);
    this.queueProjectionClient = new BackendQueueProjectionRpcClient(rpcCaller);
    this.reviewClient = new BackendReviewRpcClient(rpcCaller);
    this.neuralRoamClient = new BackendNeuralRoamRpcClient(rpcCaller);
    this.semanticClient = new BackendSemanticRpcClient(rpcCaller);
    this.privateApiClient = new BackendPrivateApiRpcClient(rpcCaller);
    this.integrationClient = new BackendIntegrationRpcClient(rpcCaller);
    this.startupIdentityDisposition = options.startupIdentityDisposition ?? null;
    this.reviewTruthFlushOptions = options.reviewTruthFlush ?? null;
    this.reviewTruthDeviceDiagnostics = options.reviewTruthDevice ?? null;
    this.canWriteReviewTruth = options.canWriteReviewTruth ?? (() => true);
    this.backgroundWorkRegistry = options.backgroundWorkRegistry ?? new KernelCompanionBackgroundWorkRegistry();
    this.backgroundWorkStatusReadModel = new KernelCompanionBackgroundWorkStatusReadModel(this.backgroundWorkRegistry);
  }

  async systemHealth(): Promise<BackendHealthResult> {
    return this.coreClient.systemHealth();
  }

  async loadDatabase(): Promise<BackendDbLoadResult> {
    return this.coreClient.loadDatabase(this.createDbLoadRequest());
  }

  async reloadDatabase(): Promise<BackendDbReloadResult> {
    return this.coreClient.reloadDatabase(this.createDbLoadRequest());
  }

  isStartupWriteCapable(): boolean {
    return this.startupIdentityDisposition?.writable !== false;
  }

  async storageMaintenanceStatus(
    request: BackendStorageMaintenanceStatusRequest,
  ): Promise<BackendStorageMaintenanceStatusResult> {
    return this.coreClient.storageMaintenanceStatus(request);
  }

  async applyStorageMaintenanceBatch(
    request: BackendStorageMaintenanceApplyBatchRequest,
  ): Promise<BackendStorageMaintenanceApplyBatchResult> {
    return this.coreClient.applyStorageMaintenanceBatch(request);
  }

  private createDbLoadRequest(): BackendDbLoadRequest | undefined {
    if (!this.reviewTruthFlushOptions && !this.startupIdentityDisposition) {
      return undefined;
    }
    const truthSchemaVersion = this.reviewTruthFlushOptions?.schemaVersion ?? MESSAGEPACK_TRUTH_SCHEMA_VERSION;
    const identityEpoch = this.reviewTruthFlushOptions?.identityEpoch
      ?? this.startupIdentityDisposition?.identityEpoch
      ?? this.reviewTruthDeviceDiagnostics?.identityEpoch
      ?? null;
    return {
      startupIdentityDisposition: this.startupIdentityDisposition,
      truthDeviceId: this.reviewTruthFlushOptions?.deviceId
        ?? this.startupIdentityDisposition?.deviceId
        ?? null,
      identityEpoch,
      cardTruthGenerationId: `card-memory-facts-v${truthSchemaVersion}`,
      reviewTruthGenerationId: this.reviewTruthFlushOptions?.generationId
        ?? `review-events-v${truthSchemaVersion}`,
      truthSchemaVersion,
      maxSegmentBytes: this.reviewTruthFlushOptions?.maxSegmentBytes ?? null,
    };
  }

  async diagnosticsStatus(): Promise<BackendDiagnosticsStatusResult> {
    const status = await this.coreClient.diagnosticsStatus();
    if (!this.reviewTruthDeviceDiagnostics) {
      return status;
    }
    return {
      ...status,
      review: {
        feedbackTotal: 0,
        feedbackCommittedTotal: 0,
        feedbackPreviewTotal: 0,
        feedbackUnavailableTotal: 0,
        ...(status.review ?? {}),
        truthDevice: this.reviewTruthDeviceDiagnostics,
      },
    };
  }

  async schedulePendingReviewTruthFlush(reason = 'startup'): Promise<boolean> {
    try {
      return await this.schedulePendingReviewTruthFlushChecked(reason);
    } catch (error) {
      logger.warn('[SiYuanMemo][SrsBackendClient] skipped pending Review truth flush scheduling', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async schedulePendingReviewTruthFlushChecked(reason = 'startup'): Promise<boolean> {
    if (!this.canRunReviewTruthFlush(reason)) {
      return false;
    }
    const status = await this.reviewTruthMaintenanceStatus();
    if (this.disposed || !this.canRunReviewTruthFlush(reason)) {
      this.clearQueuedReviewTruthMaintenance();
      return false;
    }
    const journal = status.journal;
    const projectionApplied = Number(journal?.statusCounts?.['projection-applied'] ?? 0);
    const pendingCount = Number(journal?.pendingCount ?? 0);
    const pendingBackfillRows = Number(status.truthBackfill?.pendingSqlRows ?? 0);
    const truthPromotionJobId = status.truthPromotion?.available
      && (status.truthPromotion.pendingMutationCount > 0 || status.truthPromotion.active)
      ? this.submitTruthPromotionTrackingJob(reason, status.truthPromotion)
      : null;
    const truthPromotionSubmitted = truthPromotionJobId !== null;
    if (
      projectionApplied <= 0
      && pendingCount <= 0
      && pendingBackfillRows <= 0
      && !truthPromotionSubmitted
    ) {
      return false;
    }
    const shouldFlush = projectionApplied > 0 || pendingCount > 0;
    const backfillSubmitted = pendingBackfillRows > 0
      ? this.submitReviewTruthBackfillJob(reason, pendingBackfillRows)
      : false;
    if (shouldFlush) {
      this.reviewTruthFlushQueued = true;
    }
    logger.info('[SiYuanMemo][SrsBackendClient] scheduled pending Review truth flush', {
      reason,
      pendingCount,
      projectionApplied,
      pendingBackfillRows,
      reviewTruthBackfillJobSubmitted: backfillSubmitted,
      truthPromotionJobSubmitted: truthPromotionSubmitted,
    });
    if (shouldFlush) {
      this.armReviewTruthFlushTimer(undefined, { reason });
    }
    return shouldFlush || backfillSubmitted || truthPromotionSubmitted;
  }

  async domainSyncStatus(request: BackendDomainSyncStatusRequest = {}): Promise<BackendDomainSyncStatusResult> {
    return this.integrationClient.domainSyncStatus(request);
  }

  async domainSyncRepairPreview(
    request: BackendDomainSyncRepairPreviewRequest = {},
  ): Promise<BackendDomainSyncRepairPreviewResult> {
    return this.integrationClient.domainSyncRepairPreview(request);
  }

  async domainSyncRepairApply(
    request: BackendDomainSyncRepairApplyRequest,
  ): Promise<BackendDomainSyncRepairApplyResult> {
    return this.integrationClient.domainSyncRepairApply(request);
  }

  async domainSyncConflictSourcesCleanup(
    request: BackendDomainSyncConflictSourceCleanupRequest,
  ): Promise<BackendDomainSyncConflictSourceCleanupResult> {
    return this.integrationClient.domainSyncConflictSourcesCleanup(request);
  }

  async domainSyncConflictSourceCleanupCandidates(): Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult> {
    return this.integrationClient.domainSyncConflictSourceCleanupCandidates();
  }

  async browserDeckPage(
    query: BackendBrowserDeckSnapshotQuery,
    page: BackendBrowserDeckPageRequest,
  ): Promise<BackendBrowserDeckPageResult> {
    return this.browserClient.browserDeckPage(query, page);
  }

  async browserDeckMatchedIds(query: BackendBrowserDeckSnapshotQuery): Promise<string[]> {
    return this.browserClient.browserDeckMatchedIds(query);
  }

  async browserDeckRowsByIds(ids: string[]): Promise<FSRSCard[]> {
    return this.browserClient.browserDeckRowsByIds(ids);
  }

  async browserDeckDocumentCounts(scope: BackendBrowserDocumentCountsScope): Promise<BackendBrowserDocumentCountsResult> {
    return this.browserClient.browserDeckDocumentCounts(scope);
  }

  async browserStats(now?: number): Promise<BrowserStats> {
    return this.browserClient.browserStats(now);
  }

  async browserCountCards(query?: StructuredCardQuery): Promise<number> {
    return this.browserClient.browserCountCards(query);
  }

  async browserSourceExistenceRefreshCandidates(
    request: BackendSourceExistenceRefreshRequest,
  ): Promise<BackendSourceExistenceRefreshCandidate[]> {
    return this.browserClient.browserSourceExistenceRefreshCandidates(request);
  }

  async browserSourceExistenceUpdate(updates: BackendSourceExistenceUpdate[], checkedAt = Date.now()): Promise<number> {
    return this.browserClient.browserSourceExistenceUpdate(updates, checkedAt);
  }

  async browserSourceExistenceByBlockIds(blockIds: string[]): Promise<Map<string, boolean | null>> {
    return this.browserClient.browserSourceExistenceByBlockIds(blockIds);
  }

  async browserSourceExistenceSummary(staleBefore?: number): Promise<BackendSourceExistenceSummary> {
    return this.browserClient.browserSourceExistenceSummary(staleBefore);
  }

  async browserSourceExistenceApplySweep(
    request: BackendSourceExistenceRefreshRequest,
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<BackendSourceExistenceSweepApplyResult> {
    return this.browserClient.browserSourceExistenceApplySweep(request, existingBlockIds, checkedAt);
  }

  async browserSourceExistenceApplySweepHost(
    request: BackendSourceExistenceRefreshRequest,
    checkedAt = Date.now(),
  ): Promise<BackendSourceExistenceSweepApplyResult> {
    return this.browserClient.browserSourceExistenceApplySweepHost(request, checkedAt);
  }

  async cardScheduleBatchUpdate(
    request: BackendCardScheduleBatchUpdateRequest,
  ): Promise<BackendCardScheduleBatchUpdateResult> {
    return this.cardClient.cardScheduleBatchUpdate(request);
  }

  async cardCrudBatchMutate(
    request: BackendCardCrudBatchMutateRequest,
  ): Promise<BackendCardCrudBatchMutateResult> {
    return this.cardClient.cardCrudBatchMutate(request);
  }

  async findNativeRiffImportExclusion(
    request: BackendNativeRiffImportExclusionFindRequest,
  ): Promise<BackendNativeRiffImportExclusionFindResult> {
    return this.cardClient.findNativeRiffImportExclusion(request);
  }

  async queueStateLoadAll(): Promise<BackendQueueStateLoadAllResult> {
    return this.queueClient.queueStateLoadAll();
  }

  async queueStateBatchMutate(
    request: BackendQueueStateBatchMutateRequest,
  ): Promise<BackendQueueStateBatchMutateResult> {
    return this.queueClient.queueStateBatchMutate(request);
  }

  async reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    const result = await this.measureReviewFeedbackClientStep('rpc-call', request, () => (
      this.reviewClient.reviewFeedback(request)
    ));
    assertCommittedReviewFeedbackDurability(result, {
      source: 'SrsBackendClient',
      requireQueueImpact: request.commitPolicy === 'write-schedule',
    });
    this.scheduleReviewTruthFlushAfterFeedback(result);
    return result;
  }

  async reviewSessionStart(request: BackendReviewSessionStartRequest): Promise<BackendReviewSessionState> {
    return this.reviewClient.reviewSessionStart(request);
  }

  async reviewSessionCurrent(request: BackendReviewSessionCurrentRequest): Promise<BackendReviewSessionState> {
    return this.reviewClient.reviewSessionCurrent(request);
  }

  async reviewSessionFeedback(
    request: BackendReviewSessionFeedbackRequest,
  ): Promise<BackendReviewSessionFeedbackResult> {
    const result = await this.reviewClient.reviewSessionFeedback(request);
    this.scheduleReviewTruthFlushAfterFeedback({
      cardId: result.receipt.answeredCardId,
      committed: result.receipt.commit.outcome === 'committed',
      reviewedAt: result.receipt.reviewedAt,
      queueType: result.receipt.queueType,
      updatedCard: result.receipt.commit.updatedCard,
      idempotencyKey: result.receipt.factIdentity.kind === 'idempotency-key'
        ? result.receipt.factIdentity.idempotencyKey
        : null,
      duplicate: result.receipt.commit.duplicate,
      undoJournalPersisted: result.receipt.undo.evidence === 'transaction-journal',
      queueImpact: result.receipt.queueImpact,
      ...(result.receipt.storage ? { storage: result.receipt.storage } : {}),
    });
    return result;
  }

  async reviewSessionSkip(
    request: BackendReviewSessionSkipRequest,
  ): Promise<BackendReviewSessionSkipResult> {
    return this.reviewClient.reviewSessionSkip(request);
  }

  async reviewSessionUndo(
    request: BackendReviewSessionUndoRequest,
  ): Promise<BackendReviewSessionUndoResult> {
    return this.reviewClient.reviewSessionUndo(request);
  }

  async reviewTruthFlush(
    request: BackendReviewFeedbackTruthFlushRequest,
  ): Promise<BackendReviewFeedbackTruthFlushResult> {
    return this.reviewClient.reviewTruthFlush(request);
  }

  async reviewTruthBackfill(
    request: BackendReviewTruthBackfillRequest,
  ): Promise<BackendReviewTruthBackfillResult> {
    return this.reviewClient.reviewTruthBackfill(request);
  }

  async reviewTruthMaintenanceStatus(): Promise<BackendReviewTruthMaintenanceStatusResult> {
    return this.reviewClient.reviewTruthMaintenanceStatus();
  }

  scheduleTruthPromotionTracking(reason = 'post-ready'): string | null {
    return this.submitTruthPromotionTrackingJob(reason);
  }

  backgroundWorkStatus(options?: KernelCompanionBackgroundWorkStatusReadOptions): KernelCompanionBackgroundWorkStatusJob[];
  backgroundWorkStatus(jobId: string): KernelCompanionBackgroundWorkStatusJob | null;
  backgroundWorkStatus(
    optionsOrJobId: KernelCompanionBackgroundWorkStatusReadOptions | string = {},
  ): KernelCompanionBackgroundWorkStatusJob[] | KernelCompanionBackgroundWorkStatusJob | null {
    return typeof optionsOrJobId === 'string'
      ? this.backgroundWorkStatusReadModel.get(optionsOrJobId)
      : this.backgroundWorkStatusReadModel.list(optionsOrJobId);
  }

  getBackgroundWorkRegistry(): KernelCompanionBackgroundWorkRegistryInterface {
    return this.backgroundWorkRegistry;
  }

  private canRunReviewTruthFlush(reason: string): boolean {
    if (this.disposed) {
      return false;
    }
    if (!this.reviewTruthFlushOptions) {
      return false;
    }
    if (!this.resolveReviewTruthMutationIdentity()) {
      return false;
    }
    try {
      if (this.canWriteReviewTruth()) {
        return true;
      }
    } catch (error) {
      logger.warn('[SiYuanMemo][SrsBackendClient] skipped Review truth flush because write-authority check failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
    logger.info('[SiYuanMemo][SrsBackendClient] skipped Review truth flush because current runtime cannot write truth', {
      reason,
    });
    return false;
  }

  async auditReviewSyncDivergence(
    request: BackendReviewSyncDivergenceAuditRequest = {},
  ): Promise<BackendReviewSyncDivergenceAuditResult> {
    return this.integrationClient.auditReviewSyncDivergence(request);
  }

  async reconcileCanonicalTruth(
    request: BackendTruthReconciliationRunRequest = {},
  ): Promise<BackendTruthReconciliationRunResult> {
    return this.integrationClient.reconcileCanonicalTruth(request);
  }

  async summarizeSyncConflicts(
    request: BackendSyncConflictSummarizeRequest,
  ): Promise<BackendSyncConflictSummarizeResult> {
    return this.integrationClient.summarizeSyncConflicts(request);
  }

  async reloadSyncConflictDatabase(): Promise<BackendSyncConflictReloadResult> {
    return this.integrationClient.reloadSyncConflictDatabase();
  }

  async queueProjectionSnapshot(
    request: BackendQueueProjectionSnapshotRequest,
  ): Promise<BackendQueueProjectionSnapshotResult> {
    return this.queueProjectionClient.queueProjectionSnapshot(request);
  }

  async queueProjectionRowsByIds(
    request: BackendQueueProjectionRowsByIdsRequest,
  ): Promise<BackendQueueProjectionRowsByIdsResult> {
    return this.queueProjectionClient.queueProjectionRowsByIds(request);
  }

  async queueProjectionReplace(
    request: BackendQueueProjectionReplaceRequest,
  ): Promise<BackendQueueProjectionReplaceResult> {
    return this.queueProjectionClient.queueProjectionReplace(request);
  }

  async storageProjectionRebuild(
    request: BackendStorageProjectionRebuildRequest,
  ): Promise<BackendStorageProjectionRebuildResult> {
    return this.queueProjectionClient.storageProjectionRebuild(request);
  }

  async neuralRoamAdvance(
    request: BackendNeuralRoamAdvanceRequest,
  ): Promise<BackendNeuralRoamAdvanceResult> {
    const result = await this.neuralRoamClient.neuralRoamAdvance(request);
    return this.validateNeuralRoamAdvanceResult(result);
  }

  async neuralRoamViewState(
    request: BackendNeuralRoamViewStateRequest,
  ): Promise<BackendNeuralRoamViewStateResult> {
    const result = await this.neuralRoamClient.neuralRoamViewState(request);
    return this.validateNeuralRoamViewStateResult(result);
  }

  async neuralRoamCommand(
    request: BackendNeuralRoamCommandRequest,
  ): Promise<BackendNeuralRoamCommandResult> {
    const result = await this.neuralRoamClient.neuralRoamCommand(request);
    return this.validateNeuralRoamCommandResult(result);
  }

  async privateHealth(): Promise<BackendPrivateHealthResult> {
    return this.coreClient.privateHealth();
  }

  async privateDiagnosticsStatus(): Promise<BackendPrivateDiagnosticsStatusResult> {
    return this.coreClient.privateDiagnosticsStatus();
  }

  async privateAuditQuery(request: PrivateApiAuditQueryRequest): Promise<PrivateApiAuditQueryResult> {
    return this.privateApiClient.privateAuditQuery(request);
  }

  async privateRead(request: PrivateApiReadRequest): Promise<PrivateApiReadResult> {
    return this.privateApiClient.privateRead(request);
  }

  async privateCommand(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> {
    return this.privateApiClient.privateCommand(request);
  }

  async submitHotspotCommand<TResult = unknown>(
    request: BackendHotspotCommandSubmitRequest,
  ): Promise<BackendHotspotCommandSubmitResult<TResult>> {
    return this.integrationClient.submitHotspotCommand<TResult>(request);
  }

  async getHotspotJob<TResult = unknown>(
    request: BackendHotspotJobGetRequest,
  ): Promise<BackendHotspotJobGetResult<TResult>> {
    return this.integrationClient.getHotspotJob<TResult>(request);
  }

  async executeProgressiveCommand<TResult = unknown>(
    request: BackendProgressiveCommandExecuteRequest,
  ): Promise<BackendProgressiveCommandExecuteResult<TResult>> {
    return this.integrationClient.executeProgressiveCommand<TResult>(request);
  }

  async executeTopicDerivedCommand<TResult = unknown>(
    request: BackendTopicDerivedCommandExecuteRequest,
  ): Promise<BackendTopicDerivedCommandExecuteResult<TResult>> {
    return this.integrationClient.executeTopicDerivedCommand<TResult>(request);
  }

  async executeReviewSourceRefresh(
    request: BackendReviewSourceRefreshExecuteRequest,
  ): Promise<BackendReviewSourceRefreshExecuteResult> {
    return this.reviewClient.executeReviewSourceRefresh(request);
  }

  async browserAggregateSnapshot(
    request: BackendBrowserAggregateSnapshotRequest,
  ): Promise<BackendBrowserAggregateSnapshotResult> {
    return this.browserClient.browserAggregateSnapshot(request);
  }

  async browserAggregatePage<TRow = unknown>(
    request: BackendBrowserAggregatePageRequest,
  ): Promise<BackendBrowserAggregatePageResult<TRow>> {
    return this.browserClient.browserAggregatePage<TRow>(request);
  }

  async browserAggregateFocus<TRow = unknown>(
    request: BackendBrowserAggregateFocusRequest,
  ): Promise<BackendBrowserAggregateFocusResult<TRow>> {
    return this.browserClient.browserAggregateFocus<TRow>(request);
  }

  async graphQuery(request: BackendGraphQueryRequest): Promise<BackendGraphQueryResult> {
    return this.integrationClient.graphQuery(request);
  }

  requestReviewTruthFlush(reason: 'review-exit' | 'queue-complete' | 'manual' = 'manual'): boolean {
    if (!this.canRunReviewTruthFlush(reason)) {
      return false;
    }
    this.reviewTruthFlushQueued = true;
    this.armReviewTruthFlushTimer(0, { replaceExisting: true, reason });
    return true;
  }

  async flushReviewTruthNow(reason: 'review-exit' | 'queue-complete' | 'manual' = 'manual'): Promise<boolean> {
    if (!this.canRunReviewTruthFlush(reason)) {
      return false;
    }
    this.reviewTruthFlushQueued = true;
    this.clearReviewTruthFlushTimer();
    await this.runQueuedReviewTruthFlush({ waitForInFlight: true });
    return true;
  }

  async flushReviewTruthBeforeUnload(timeoutMs = this.resolveReviewTruthFlushUnloadWaitMs()): Promise<boolean> {
    if (!this.canRunReviewTruthFlush('before-unload')) {
      return false;
    }
    if (this.reviewTruthFlushInFlight) {
      return false;
    }
    this.reviewTruthFlushQueued = true;
    this.backgroundWorkRegistry.shutdown('review-truth-before-unload');
    this.clearReviewTruthFlushTimer();
    const flush = this.runQueuedReviewTruthFlush({
      waitForInFlight: false,
    }).then(() => !this.disposed);
    const boundedWait = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), Math.max(0, Math.floor(timeoutMs)));
    });
    return Promise.race([flush, boundedWait]);
  }

  dispose(): void {
    this.disposed = true;
    this.clearReviewTruthFlushTimer();
    this.clearQueuedReviewTruthMaintenance();
    this.backgroundWorkRegistry.shutdown('srs-backend-client-dispose');
  }

  async semanticCommand(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult> {
    return this.semanticClient.semanticCommand(request);
  }

  async semanticSessionRead(request: BackendSemanticSessionReadRequest): Promise<BackendSemanticSessionReadResult> {
    return this.semanticClient.semanticSessionRead(request);
  }

  async semanticSidebarRead(request: BackendSemanticSidebarReadRequest): Promise<BackendSemanticSidebarReadResult> {
    return this.semanticClient.semanticSidebarRead(request);
  }

  async semanticBrowserRead(request: BackendSemanticBrowserReadRequest): Promise<BackendSemanticBrowserReadResult> {
    return this.semanticClient.semanticBrowserRead(request);
  }

  async p6OwnershipQuery(request: P6OwnershipQueryRequest): Promise<P6OwnershipResult> {
    return this.integrationClient.p6OwnershipQuery(request);
  }

  async p6OwnershipCommand(request: P6OwnershipCommandRequest): Promise<P6OwnershipResult> {
    return this.integrationClient.p6OwnershipCommand(request);
  }

  async ingestKernelTransactions(
    request: BackendKernelTransactionIngestRequest,
  ): Promise<BackendKernelTransactionIngestResult> {
    return this.integrationClient.ingestKernelTransactions(request);
  }

  async dequeueKernelTransactions(
    request: BackendKernelTransactionDequeueRequest = {},
  ): Promise<BackendKernelTransactionDequeueResult> {
    return this.integrationClient.dequeueKernelTransactions(request);
  }

  async requeueKernelTransactions(
    request: BackendKernelTransactionRequeueRequest = {},
  ): Promise<BackendKernelTransactionRequeueResult> {
    return this.integrationClient.requeueKernelTransactions(request);
  }

  async resolveAutoCardDecision(
    request: BackendAutoCardDecisionResolveRequest,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    const result = await this.integrationClient.resolveAutoCardDecision(request);
    return this.validateAutoCardDecisionResolveResult(result);
  }

  async executeAutoCard(
    request: BackendAutoCardExecuteRequest,
  ): Promise<BackendAutoCardExecuteResult> {
    return this.integrationClient.executeAutoCard(request);
  }

  async executeAutoCardBatch(
    request: BackendAutoCardExecuteBatchRequest,
  ): Promise<BackendAutoCardExecuteBatchResult> {
    return this.integrationClient.executeAutoCardBatch(request);
  }

  private scheduleReviewTruthFlushAfterFeedback(result: BackendReviewFeedbackResult): void {
    if (result.committed && result.durabilityReceipt?.stage === 'journaled') {
      this.submitTruthPromotionTrackingJob('review.feedback');
    }
    if (!this.canRunReviewTruthFlush('review.feedback') || !this.shouldScheduleReviewTruthFlush(result)) {
      return;
    }
    this.reviewTruthFlushQueued = true;
    const pendingCount = Number(result.storage?.truthFlush?.pendingCount ?? 0);
    const reachedThreshold = Number.isFinite(pendingCount)
      && pendingCount >= this.resolveReviewTruthFlushThreshold();
    this.armReviewTruthFlushTimer(
      reachedThreshold ? 0 : this.resolveReviewTruthFlushLongIdleDelayMs(),
      { replaceExisting: reachedThreshold, reason: reachedThreshold ? 'threshold' : 'long-idle' },
    );
  }

  private shouldScheduleReviewTruthFlush(result: BackendReviewFeedbackResult): boolean {
    return result.committed === true
      && result.storage?.truthFlush?.status === 'pending';
  }

  private armReviewTruthFlushTimer(
    delayMs = this.resolveReviewTruthFlushDelayMs(REVIEW_TRUTH_FLUSH_STARTUP_DELAY_MS),
    options: { replaceExisting?: boolean; reason?: string } = {},
  ): void {
    if (this.disposed || !this.reviewTruthFlushOptions || this.reviewTruthFlushInFlight) {
      return;
    }
    if (this.reviewTruthFlushJobId) {
      const current = this.backgroundWorkRegistry.status(this.reviewTruthFlushJobId);
      if (current && (current.state === 'accepted' || current.state === 'running')) {
        if (!options.replaceExisting) {
          return;
        }
        this.backgroundWorkRegistry.cancel(current.jobId, 'review-truth-flush-replaced');
      }
      this.reviewTruthFlushJobId = null;
    }
    if (this.reviewTruthFlushTimer) {
      if (!options.replaceExisting) {
        return;
      }
      this.clearReviewTruthFlushTimer();
    }
    const resolvedDelayMs = Math.max(0, Math.floor(delayMs));
    if (resolvedDelayMs === 0) {
      void this.runQueuedReviewTruthFlush({ waitForInFlight: true });
      return;
    }
    const flushRequest = this.buildReviewTruthFlushRequest();
    if (!flushRequest) {
      this.clearQueuedReviewTruthMaintenance();
      return;
    }
    const reason = options.reason ?? 'timer';
    const dedupeKey = [
      'review-truth-flush-lifecycle-v1',
      flushRequest.deviceId,
      flushRequest.identityEpoch,
      flushRequest.generationId,
    ].join(':');
    const result = this.backgroundWorkRegistry.submit<KernelCompanionReviewTruthFlushDiagnostics>({
      kind: 'review-truth-flush',
      dedupeKey,
      diagnostics: {
        reason,
        delayMs: resolvedDelayMs,
        queued: this.reviewTruthFlushQueued,
      },
      run: async (context) => {
        do {
          await delayReviewTruthFlush(resolvedDelayMs);
          if (this.disposed || context.isCanceled()) {
            this.clearQueuedReviewTruthMaintenance();
            return {
              state: 'canceled',
              reason: this.disposed ? 'srs-backend-client-dispose' : 'background-work-canceled',
              diagnostics: {
                reason,
                delayMs: resolvedDelayMs,
                queued: false,
                unavailable: true,
              },
            };
          }
          await this.runQueuedReviewTruthFlush({ waitForInFlight: true });
        } while (this.reviewTruthFlushQueued && !this.disposed && !context.isCanceled());
        return {
          state: 'completed',
          diagnostics: {
            reason,
            delayMs: resolvedDelayMs,
            queued: this.reviewTruthFlushQueued,
            flushed: true,
          },
        };
      },
    });
    if (result.accepted || result.coalesced) {
      this.reviewTruthFlushJobId = result.job.jobId;
    }
  }

  private clearReviewTruthFlushTimer(): void {
    if (!this.reviewTruthFlushTimer) {
      if (this.reviewTruthFlushJobId) {
        if (!this.disposed) {
          this.backgroundWorkRegistry.cancel(this.reviewTruthFlushJobId, 'review-truth-flush-cleared');
        }
        this.reviewTruthFlushJobId = null;
      }
      return;
    }
    clearTimeout(this.reviewTruthFlushTimer);
    this.reviewTruthFlushTimer = null;
    if (this.reviewTruthFlushJobId) {
      if (!this.disposed) {
        this.backgroundWorkRegistry.cancel(this.reviewTruthFlushJobId, 'review-truth-flush-cleared');
      }
      this.reviewTruthFlushJobId = null;
    }
  }

  private clearQueuedReviewTruthMaintenance(): void {
    this.reviewTruthFlushQueued = false;
  }

  private async runQueuedReviewTruthFlush(
    options: { waitForInFlight: boolean },
  ): Promise<void> {
    if (!this.canRunReviewTruthFlush('queued')) {
      this.clearQueuedReviewTruthMaintenance();
      return;
    }
    if (this.reviewTruthFlushInFlight) {
      if (options.waitForInFlight) {
        await this.reviewTruthFlushInFlightPromise;
      }
      return;
    }
    const flush = this.executeQueuedReviewTruthFlush();
    this.reviewTruthFlushInFlightPromise = flush;
    try {
      await flush;
    } finally {
      this.reviewTruthFlushInFlightPromise = null;
    }
  }

  private async executeQueuedReviewTruthFlush(): Promise<void> {
    const request = this.buildReviewTruthFlushRequest();
    if (!request) {
      this.clearQueuedReviewTruthMaintenance();
      logger.warn('[SiYuanMemo][SrsBackendClient] skipped Review truth flush because identity is unavailable');
      return;
    }
    this.reviewTruthFlushQueued = false;
    this.reviewTruthFlushInFlight = true;
    try {
      if (this.disposed) {
        return;
      }
      const result = await this.reviewTruthFlush(request);
      if (!result.ok) {
        if (isReviewTruthFlushPressureSuppressed(result.error)) {
          if (!this.disposed) {
            this.reviewTruthFlushQueued = true;
          }
          logger.info('[SiYuanMemo][SrsBackendClient] Review truth flush deferred under feedback pressure', {
            error: result.error,
            journalQueued: result.journalQueued,
            recordsWritten: result.recordsWritten,
          });
          return;
        }
        logger.warn('[SiYuanMemo][SrsBackendClient] Review truth flush finished with pending error', {
          error: result.error,
          journalQueued: result.journalQueued,
          recordsWritten: result.recordsWritten,
        });
      }
    } catch (error) {
      if (isReviewTruthFlushPressureSuppressed(error)) {
        if (!this.disposed) {
          this.reviewTruthFlushQueued = true;
        }
        logger.info('[SiYuanMemo][SrsBackendClient] Review truth flush deferred under feedback pressure', {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      logger.warn('[SiYuanMemo][SrsBackendClient] Review truth flush failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.reviewTruthFlushInFlight = false;
      if (this.disposed) {
        this.clearQueuedReviewTruthMaintenance();
      } else if (this.reviewTruthFlushQueued) {
        this.armReviewTruthFlushTimer();
      }
    }
  }

  private submitReviewTruthBackfillJob(reason: string, pendingRows: number): boolean {
    const flushRequest = this.buildReviewTruthFlushRequest();
    if (!flushRequest) {
      logger.warn('[SiYuanMemo][SrsBackendClient] skipped Review truth backfill job because identity is unavailable', {
        reason,
        pendingRows,
      });
      return false;
    }
    const request = this.buildReviewTruthBackfillRequest(flushRequest);
    const batchLimit = this.resolveReviewTruthBackfillBatchLimit(request);
    const plannedBatches = Math.max(1, Math.ceil(Math.max(0, Math.floor(pendingRows)) / batchLimit));
    const maxBatches = Math.min(REVIEW_TRUTH_BACKFILL_MAX_STARTUP_BATCHES, plannedBatches);
    const result = this.backgroundWorkRegistry.submit<KernelCompanionReviewTruthBackfillDiagnostics>({
      kind: 'review-truth-backfill',
      diagnostics: {
        reason,
        pendingRows,
        batchLimit,
        plannedBatches,
        maxBatches,
      },
      run: (context) => this.runReviewTruthBackfillJob(context, request, pendingRows),
    });
    if (!result.accepted) {
      logger.warn('[SiYuanMemo][SrsBackendClient] Review truth backfill job unavailable', {
        reason,
        pendingRows,
        state: result.job.state,
        diagnostics: result.job.diagnostics,
        lastError: result.job.lastError,
      });
    }
    return result.accepted;
  }

  private submitTruthPromotionTrackingJob(
    reason: string,
    initial: BackendReviewTruthMaintenanceStatusResult['truthPromotion'] | null = null,
  ): string | null {
    if (this.disposed) {
      return null;
    }
    if (this.truthPromotionTrackingJobId) {
      const current = this.backgroundWorkRegistry.status(this.truthPromotionTrackingJobId);
      if (current && (current.state === 'accepted' || current.state === 'running')) {
        return current.jobId;
      }
      this.truthPromotionTrackingJobId = null;
    }
    const result = this.backgroundWorkRegistry.submit<KernelCompanionTruthPromotionDiagnostics>({
      kind: 'truth-promotion',
      diagnostics: {
        reason,
        ...(initial ?? {}),
        pollsAttempted: 0,
      },
      run: (context) => this.runTruthPromotionTrackingJob(context, reason),
    });
    if (result.accepted || result.coalesced) {
      this.truthPromotionTrackingJobId = result.job.jobId;
      return result.job.jobId;
    }
    return null;
  }

  private async runTruthPromotionTrackingJob(
    context: KernelCompanionBackgroundWorkRunContext,
    reason: string,
  ): Promise<KernelCompanionBackgroundWorkHandlerResult<KernelCompanionTruthPromotionDiagnostics>> {
    let diagnostics: KernelCompanionTruthPromotionDiagnostics = {
      reason,
      pollsAttempted: 0,
    };
    try {
      for (let poll = 1; poll <= TRUTH_PROMOTION_STATUS_MAX_POLLS; poll += 1) {
        if (this.disposed || context.isCanceled()) {
          return {
            state: 'canceled',
            reason: this.disposed ? 'srs-backend-client-dispose' : 'background-work-canceled',
            diagnostics,
          };
        }
        const status = await this.reviewTruthMaintenanceStatus();
        const promotion = status.truthPromotion;
        diagnostics = {
          reason,
          ...(promotion ?? {}),
          pollsAttempted: poll,
          unavailable: !promotion?.available,
        };
        if (!promotion?.available) {
          return {
            state: 'deferred',
            reason: promotion?.retryReason ?? 'truth-promotion-unavailable',
            diagnostics,
          };
        }
        if (promotion.pendingMutationCount <= 0 && !promotion.active) {
          return {
            state: 'completed',
            diagnostics,
          };
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, TRUTH_PROMOTION_STATUS_POLL_MS);
        });
      }
      return {
        state: 'deferred',
        reason: diagnostics.retryReason ?? 'truth-promotion-pending',
        diagnostics,
      };
    } catch (error) {
      return {
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
        diagnostics,
      };
    } finally {
      this.truthPromotionTrackingJobId = null;
    }
  }

  private async runReviewTruthBackfillJob(
    context: KernelCompanionBackgroundWorkRunContext,
    request: BackendReviewTruthBackfillRequest,
    pendingRows: number,
  ): Promise<KernelCompanionBackgroundWorkHandlerResult<KernelCompanionReviewTruthBackfillDiagnostics>> {
    const batchLimit = this.resolveReviewTruthBackfillBatchLimit(request);
    const plannedBatches = Math.max(1, Math.ceil(Math.max(0, Math.floor(pendingRows)) / batchLimit));
    const maxBatches = Math.min(REVIEW_TRUTH_BACKFILL_MAX_STARTUP_BATCHES, plannedBatches);
    const diagnostics: KernelCompanionReviewTruthBackfillDiagnostics = {
      pendingRows,
      batchLimit,
      plannedBatches,
      maxBatches,
      batchesAttempted: 0,
      sqlRowsRead: 0,
      recordsWritten: 0,
      idempotencyDuplicateSkipped: 0,
      repairRequiredEventIds: [],
      backfilledEventIds: [],
      duplicateEventIds: [],
      segmentPaths: [],
    };
    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      if (this.disposed || context.isCanceled()) {
        return {
          state: 'canceled',
          reason: this.disposed ? 'srs-backend-client-dispose' : 'background-work-canceled',
          diagnostics,
        };
      }
      try {
        const backfillResult = await this.reviewTruthBackfill(request);
        diagnostics.batchesAttempted = Number(diagnostics.batchesAttempted ?? 0) + 1;
        diagnostics.sqlRowsRead = Number(diagnostics.sqlRowsRead ?? 0) + backfillResult.sqlRowsRead;
        diagnostics.recordsWritten = Number(diagnostics.recordsWritten ?? 0) + backfillResult.recordsWritten;
        diagnostics.idempotencyDuplicateSkipped = Number(diagnostics.idempotencyDuplicateSkipped ?? 0)
          + backfillResult.idempotencyDuplicateSkipped;
        diagnostics.repairRequiredEventIds = [
          ...(diagnostics.repairRequiredEventIds ?? []),
          ...(backfillResult.repairRequiredEventIds ?? []),
        ];
        diagnostics.backfilledEventIds = [
          ...(diagnostics.backfilledEventIds ?? []),
          ...(backfillResult.backfilledEventIds ?? []),
        ];
        diagnostics.duplicateEventIds = [
          ...(diagnostics.duplicateEventIds ?? []),
          ...(backfillResult.duplicateEventIds ?? []),
        ];
        diagnostics.segmentPaths = [
          ...(diagnostics.segmentPaths ?? []),
          ...(backfillResult.segmentPaths ?? []),
        ];
        if (!backfillResult.ok) {
          logger.warn('[SiYuanMemo][SrsBackendClient] Review truth backfill finished with pending error', {
            error: backfillResult.error,
            sqlRowsRead: backfillResult.sqlRowsRead,
            recordsWritten: backfillResult.recordsWritten,
            repairRequiredEventIds: backfillResult.repairRequiredEventIds,
          });
          return {
            state: 'failed',
            error: backfillResult.error ?? 'review.truth.backfill failed',
            diagnostics,
          };
        }
        if (backfillResult.sqlRowsRead < batchLimit) {
          break;
        }
        if (backfillResult.recordsWritten <= 0 && backfillResult.idempotencyDuplicateSkipped <= 0) {
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('[SiYuanMemo][SrsBackendClient] Review truth backfill failed', {
          error: message,
        });
        return {
          state: 'failed',
          error: message,
          diagnostics,
        };
      }
    }
    if (plannedBatches > maxBatches) {
      diagnostics.deferredBatches = plannedBatches - maxBatches;
      logger.info('[SiYuanMemo][SrsBackendClient] deferred remaining Review truth backfill batches', {
        plannedBatches,
        maxBatches,
        batchLimit,
      });
      return {
        state: 'deferred',
        reason: 'review-truth-backfill-startup-batch-cap',
        diagnostics,
      };
    }
    return {
      state: 'completed',
      diagnostics,
    };
  }

  private buildReviewTruthFlushRequest(): BackendReviewFeedbackTruthFlushRequest | null {
    const options = this.reviewTruthFlushOptions;
    const identity = this.resolveReviewTruthMutationIdentity();
    const generationId = String(options?.generationId || '').trim();
    if (!identity || !generationId) {
      return null;
    }
    const request: BackendReviewFeedbackTruthFlushRequest = {
      deviceId: identity.deviceId,
      identityEpoch: identity.identityEpoch,
      generationId,
    };
    if (Number.isFinite(Number(options?.schemaVersion))) {
      request.schemaVersion = Math.max(1, Math.floor(Number(options?.schemaVersion)));
    }
    if (Number.isFinite(Number(options?.maxSegmentBytes))) {
      request.maxSegmentBytes = Math.max(256, Math.floor(Number(options?.maxSegmentBytes)));
    }
    if (Number.isFinite(Number(options?.batchLimit))) {
      request.batchLimit = Math.max(1, Math.floor(Number(options?.batchLimit)));
    }
    return request;
  }

  private resolveReviewTruthMutationIdentity(): { deviceId: string; identityEpoch: string } | null {
    const options = this.reviewTruthFlushOptions;
    const deviceId = String(options?.deviceId || '').trim();
    const identityEpoch = String(
      options?.identityEpoch ?? this.reviewTruthDeviceDiagnostics?.identityEpoch ?? '',
    ).trim();
    if (!deviceId || !identityEpoch) {
      return null;
    }
    if (!this.reviewTruthDeviceDiagnostics) {
      return { deviceId, identityEpoch };
    }
    const diagnosticDeviceId = String(this.reviewTruthDeviceDiagnostics.deviceId || '').trim();
    const diagnosticIdentityEpoch = String(this.reviewTruthDeviceDiagnostics.identityEpoch || '').trim();
    if (
      diagnosticDeviceId !== deviceId
      || diagnosticIdentityEpoch !== identityEpoch
      || !REVIEW_TRUTH_MUTATION_IDENTITY_SOURCES.has(this.reviewTruthDeviceDiagnostics.source)
    ) {
      return null;
    }
    return { deviceId, identityEpoch };
  }

  private buildReviewTruthBackfillRequest(
    request: BackendReviewFeedbackTruthFlushRequest,
  ): BackendReviewTruthBackfillRequest {
    return {
      ...request,
    };
  }

  private resolveReviewTruthBackfillBatchLimit(request: BackendReviewTruthBackfillRequest): number {
    const configured = Number(request.batchLimit);
    return Number.isFinite(configured)
      ? Math.max(1, Math.floor(configured))
      : REVIEW_TRUTH_BACKFILL_DEFAULT_BATCH_LIMIT;
  }

  private resolveReviewTruthFlushDelayMs(defaultDelayMs: number): number {
    const configured = Number(this.reviewTruthFlushOptions?.delayMs);
    return Number.isFinite(configured)
      ? Math.max(0, Math.floor(configured))
      : defaultDelayMs;
  }

  private resolveReviewTruthFlushLongIdleDelayMs(): number {
    const configured = Number(this.reviewTruthFlushOptions?.longIdleDelayMs);
    return Number.isFinite(configured)
      ? Math.max(0, Math.floor(configured))
      : this.resolveReviewTruthFlushDelayMs(REVIEW_TRUTH_FLUSH_LONG_IDLE_DELAY_MS);
  }

  private resolveReviewTruthFlushThreshold(): number {
    const configured = Number(this.reviewTruthFlushOptions?.flushThreshold);
    return Number.isFinite(configured)
      ? Math.max(1, Math.floor(configured))
      : REVIEW_TRUTH_FLUSH_DEFAULT_THRESHOLD;
  }

  private resolveReviewTruthFlushUnloadWaitMs(): number {
    const configured = Number(this.reviewTruthFlushOptions?.unloadWaitMs);
    return Number.isFinite(configured)
      ? Math.max(0, Math.floor(configured))
      : REVIEW_TRUTH_FLUSH_UNLOAD_WAIT_MS;
  }

  private async measureReviewFeedbackClientStep<TResult>(
    step: string,
    request: BackendReviewFeedbackRequest,
    task: () => Promise<TResult>,
  ): Promise<TResult> {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= REVIEW_FEEDBACK_CLIENT_STEP_SLOW_MS) {
        logger.trace?.('[SiYuanMemo][SrsBackendClient] slow review.feedback client step', {
          step,
          cardId: request.cardId,
          queueType: request.queueType,
          queueMode: request.queueMode,
          commitPolicy: request.commitPolicy,
          rating: request.rating,
          durationMs,
        });
      }
    }
  }

  private assertObjectResult<T extends Record<string, unknown>>(method: string, payload: unknown): T {
    if (!payload || typeof payload !== 'object') {
      throw new Error(`${method} returned invalid payload`);
    }
    return payload as T;
  }

  private validateAutoCardDecisionResolveResult(
    payload: unknown,
  ): BackendAutoCardDecisionResolveResult {
    const candidate = this.assertObjectResult<Record<string, unknown>>('autocard.decision.resolve', payload);
    const status = String(candidate.status || '').trim();
    if (!this.isAutoCardDecisionStatus(status)) {
      throw new Error('autocard.decision.resolve returned invalid payload');
    }
    const candidateId = String(candidate.candidateId || '').trim();
    const decisionEventId = String(candidate.decisionEventId || '').trim();
    if (!candidateId || !decisionEventId) {
      throw new Error('autocard.decision.resolve returned invalid payload');
    }
    return candidate as BackendAutoCardDecisionResolveResult;
  }

  private isAutoCardDecisionStatus(
    value: string,
  ): value is BackendAutoCardDecisionResolveResult['status'] {
    return value === 'selected'
      || value === 'skipped'
      || value === 'no-op'
      || value === 'unavailable'
      || value === 'failed';
  }

  private validateNeuralRoamAdvanceResult(payload: unknown): BackendNeuralRoamAdvanceResult {
    const candidate = this.assertObjectResult<Record<string, unknown>>('neural-roam.advance', payload);
    const status = String(candidate.status || '').trim();
    const validStatus = status === 'advanced'
      || status === 'exhausted'
      || status === 'unavailable'
      || status === 'mismatch'
      || status === 'failed';
    if (candidate.queueType !== 'neural-roam' || !validStatus || !candidate.counters || !candidate.sessionState) {
      throw new Error('neural-roam.advance returned invalid payload');
    }
    const queueState = candidate.queueState;
    const requiresQueueState = status === 'advanced' || status === 'exhausted';
    if (requiresQueueState && (typeof queueState !== 'object' || queueState === null)) {
      throw new Error('neural-roam.advance returned invalid payload');
    }
    if (!requiresQueueState && queueState !== null && queueState !== undefined
        && (typeof queueState !== 'object')) {
      throw new Error('neural-roam.advance returned invalid payload');
    }
    return candidate as unknown as BackendNeuralRoamAdvanceResult;
  }

  private validateNeuralRoamViewStateResult(payload: unknown): BackendNeuralRoamViewStateResult {
    const candidate = this.assertObjectResult<Record<string, unknown>>('neural-roam.viewState', payload);
    const status = String(candidate.status || '').trim();
    const validStatus = status === 'ready'
      || status === 'unavailable'
      || status === 'mismatch'
      || status === 'failed';
    if (candidate.queueType !== 'neural-roam' || !validStatus) {
      throw new Error('neural-roam.viewState returned invalid payload');
    }
    if (status === 'ready') {
      const viewState = candidate.viewState;
      if (!this.isValidNeuralRoamViewState(viewState)) {
        throw new Error('neural-roam.viewState returned invalid payload');
      }
    }
    return candidate as unknown as BackendNeuralRoamViewStateResult;
  }

  private validateNeuralRoamCommandResult(payload: unknown): BackendNeuralRoamCommandResult {
    const candidate = this.assertObjectResult<Record<string, unknown>>('neural-roam.command', payload);
    const status = String(candidate.status || '').trim();
    const validStatus = status === 'ok'
      || status === 'unavailable'
      || status === 'mismatch'
      || status === 'failed';
    if (candidate.queueType !== 'neural-roam' || !validStatus) {
      throw new Error('neural-roam.command returned invalid payload');
    }
    if (status === 'ok') {
      const viewState = candidate.viewState;
      const queueState = candidate.queueState;
      if (!this.isValidNeuralRoamViewState(viewState)
          || !queueState || typeof queueState !== 'object') {
        throw new Error('neural-roam.command returned invalid payload');
      }
    }
    return candidate as unknown as BackendNeuralRoamCommandResult;
  }

  private isValidNeuralRoamViewState(viewState: unknown): viewState is BackendNeuralRoamViewState {
    if (!viewState || typeof viewState !== 'object') {
      return false;
    }
    const candidate = viewState as Record<string, unknown>;
    if (Number(candidate.version) !== 1 || candidate.queueType !== 'neural-roam') {
      return false;
    }
    if (!Array.isArray(candidate.routes)) {
      return false;
    }
    for (const route of candidate.routes) {
      if (!route || typeof route !== 'object') {
        return false;
      }
      const routeCandidate = route as Record<string, unknown>;
      if (typeof routeCandidate.id !== 'string'
        || typeof routeCandidate.name !== 'string'
        || typeof routeCandidate.temporary !== 'boolean'
        || !Array.isArray(routeCandidate.initialSeedNodeIds)
        || typeof routeCandidate.createdAt !== 'number'
        || typeof routeCandidate.updatedAt !== 'number'
        || typeof routeCandidate.lastUsedAt !== 'number'
        || !routeCandidate.stats
        || typeof routeCandidate.stats !== 'object'
        || typeof (routeCandidate.stats as Record<string, unknown>).routeId !== 'string'
        || typeof routeCandidate.isActive !== 'boolean') {
        return false;
      }
    }
    return true;
  }

}
