import type {
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendDbLoadRequest,
  BackendBrowserAggregateFocusRequest,
  BackendBrowserAggregateFocusResult,
  BackendBrowserAggregatePageRequest,
  BackendBrowserAggregatePageResult,
  BackendBrowserAggregateSnapshotRequest,
  BackendBrowserAggregateSnapshotResult,
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
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
  BackendReviewFeedbackTruthFlushRequest,
  BackendReviewFeedbackTruthFlushResult,
  BackendReviewTruthBackfillRequest,
  BackendReviewTruthBackfillResult,
  BackendReviewRiffFeedbackExecuteRequest,
  BackendReviewRiffFeedbackExecuteResult,
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
  BackendSyncConflictMergeRequest,
  BackendSyncConflictMergeResult,
  BackendSyncConflictReloadResult,
  BackendSyncConflictSummarizeRequest,
  BackendSyncConflictSummarizeResult,
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
  BackendXiuyuanSyncExecuteRequest,
  BackendXiuyuanSyncExecuteResult,
} from '../../../packages/contracts/src/backend-rpc';
import { MESSAGEPACK_TRUTH_SCHEMA_VERSION } from '../../../packages/contracts/src/backend-rpc';
import type { StructuredCardQuery } from '@/types/card-query';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import {
  BackendBrowserRpcClient,
  BackendCoreRpcClient,
  BackendIntegrationRpcClient,
  BackendNeuralRoamRpcClient,
  BackendPrivateApiRpcClient,
  BackendQueueProjectionRpcClient,
  BackendReviewRpcClient,
  BackendRpcCaller,
  BackendSemanticRpcClient,
  type SrsBackendTransport,
} from './backend';
import { assertCommittedReviewFeedbackDurability } from './reviewFeedbackDurability';

const logger = createLogger('SrsBackendClient');
const REVIEW_FEEDBACK_CLIENT_STEP_SLOW_MS = 500;
const REVIEW_TRUTH_FLUSH_STARTUP_DELAY_MS = 2_100;
const REVIEW_TRUTH_FLUSH_LONG_IDLE_DELAY_MS = 5 * 60 * 1000;
const REVIEW_TRUTH_FLUSH_DEFAULT_THRESHOLD = 8;
const REVIEW_TRUTH_FLUSH_UNLOAD_WAIT_MS = 1000;
const REVIEW_TRUTH_BACKFILL_DEFAULT_BATCH_LIMIT = 64;
const REVIEW_TRUTH_BACKFILL_MAX_STARTUP_BATCHES = 16;

export type { SrsBackendTransport } from './backend/BackendRpcCaller';

export interface SrsBackendReviewTruthFlushSchedulerOptions {
  deviceId: string;
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
  reviewTruthFlush?: SrsBackendReviewTruthFlushSchedulerOptions | null;
  reviewTruthDevice?: BackendReviewTruthDeviceDiagnostics | null;
  canWriteReviewTruth?: () => boolean;
}

export class SrsBackendClient {
  private readonly coreClient: BackendCoreRpcClient;
  private readonly browserClient: BackendBrowserRpcClient;
  private readonly queueProjectionClient: BackendQueueProjectionRpcClient;
  private readonly reviewClient: BackendReviewRpcClient;
  private readonly neuralRoamClient: BackendNeuralRoamRpcClient;
  private readonly semanticClient: BackendSemanticRpcClient;
  private readonly privateApiClient: BackendPrivateApiRpcClient;
  private readonly integrationClient: BackendIntegrationRpcClient;
  private readonly reviewTruthFlushOptions: SrsBackendReviewTruthFlushSchedulerOptions | null;
  private readonly reviewTruthDeviceDiagnostics: BackendReviewTruthDeviceDiagnostics | null;
  private readonly canWriteReviewTruth: () => boolean;
  private reviewTruthFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private reviewTruthFlushInFlight = false;
  private reviewTruthFlushInFlightPromise: Promise<void> | null = null;
  private reviewTruthFlushQueued = false;
  private reviewTruthBackfillQueued = false;
  private reviewTruthBackfillPendingRows = 0;

  constructor(
    transport: SrsBackendTransport,
    options: SrsBackendClientOptions = {},
  ) {
    const rpcCaller = new BackendRpcCaller(transport);
    this.coreClient = new BackendCoreRpcClient(rpcCaller);
    this.browserClient = new BackendBrowserRpcClient(rpcCaller);
    this.queueProjectionClient = new BackendQueueProjectionRpcClient(rpcCaller);
    this.reviewClient = new BackendReviewRpcClient(rpcCaller);
    this.neuralRoamClient = new BackendNeuralRoamRpcClient(rpcCaller);
    this.semanticClient = new BackendSemanticRpcClient(rpcCaller);
    this.privateApiClient = new BackendPrivateApiRpcClient(rpcCaller);
    this.integrationClient = new BackendIntegrationRpcClient(rpcCaller);
    this.reviewTruthFlushOptions = options.reviewTruthFlush ?? null;
    this.reviewTruthDeviceDiagnostics = options.reviewTruthDevice ?? null;
    this.canWriteReviewTruth = options.canWriteReviewTruth ?? (() => true);
  }

  async systemHealth(): Promise<BackendHealthResult> {
    return this.coreClient.systemHealth();
  }

  async loadDatabase(): Promise<{ ok: true; initialized: true; dbFile: string }> {
    return this.coreClient.loadDatabase(this.createDbLoadRequest());
  }

  async persistDatabase(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    return this.coreClient.persistDatabase();
  }

  private createDbLoadRequest(): BackendDbLoadRequest | undefined {
    if (!this.reviewTruthFlushOptions) {
      return undefined;
    }
    const truthSchemaVersion = this.reviewTruthFlushOptions.schemaVersion ?? MESSAGEPACK_TRUTH_SCHEMA_VERSION;
    return {
      truthDeviceId: this.reviewTruthFlushOptions.deviceId,
      cardTruthGenerationId: `card-memory-facts-v${truthSchemaVersion}`,
      reviewTruthGenerationId: this.reviewTruthFlushOptions.generationId,
      truthSchemaVersion,
      maxSegmentBytes: this.reviewTruthFlushOptions.maxSegmentBytes ?? null,
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
    if (!this.canRunReviewTruthFlush(reason)) {
      return false;
    }
    try {
      const status = await this.diagnosticsStatus();
      const journal = status.review?.journal;
      const projectionApplied = Number(journal?.statusCounts?.['projection-applied'] ?? 0);
      const pendingCount = Number(journal?.pendingCount ?? 0);
      const pendingBackfillRows = Number(status.review?.truthBackfill?.pendingSqlRows ?? 0);
      if (projectionApplied <= 0 && pendingCount <= 0 && pendingBackfillRows <= 0) {
        this.reviewTruthBackfillPendingRows = 0;
        return false;
      }
      this.reviewTruthFlushQueued = true;
      this.reviewTruthBackfillQueued = pendingBackfillRows > 0;
      this.reviewTruthBackfillPendingRows = pendingBackfillRows > 0 ? pendingBackfillRows : 0;
      logger.info('[SiYuanMemo][SrsBackendClient] scheduled pending Review truth flush', {
        reason,
        pendingCount,
        projectionApplied,
        pendingBackfillRows,
      });
      this.armReviewTruthFlushTimer();
      return true;
    } catch (error) {
      logger.warn('[SiYuanMemo][SrsBackendClient] skipped pending Review truth flush scheduling', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
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

  private canRunReviewTruthFlush(reason: string): boolean {
    if (!this.reviewTruthFlushOptions) {
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

  async mergeSyncConflicts(
    request: BackendSyncConflictMergeRequest,
  ): Promise<BackendSyncConflictMergeResult> {
    return this.integrationClient.mergeSyncConflicts(request);
  }

  async auditReviewSyncDivergence(
    request: BackendReviewSyncDivergenceAuditRequest = {},
  ): Promise<BackendReviewSyncDivergenceAuditResult> {
    return this.integrationClient.auditReviewSyncDivergence(request);
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

  async executeXiuyuanSync(
    request: BackendXiuyuanSyncExecuteRequest,
  ): Promise<BackendXiuyuanSyncExecuteResult> {
    return this.integrationClient.executeXiuyuanSync(request);
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

  async executeReviewRiffFeedback(
    request: BackendReviewRiffFeedbackExecuteRequest,
  ): Promise<BackendReviewRiffFeedbackExecuteResult> {
    return this.reviewClient.executeReviewRiffFeedback(request);
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
    await this.runQueuedReviewTruthFlush();
    return true;
  }

  async flushReviewTruthBeforeUnload(timeoutMs = this.resolveReviewTruthFlushUnloadWaitMs()): Promise<boolean> {
    if (!this.canRunReviewTruthFlush('before-unload')) {
      return false;
    }
    this.reviewTruthFlushQueued = true;
    this.clearReviewTruthFlushTimer();
    const flush = this.runQueuedReviewTruthFlush().then(() => true);
    const boundedWait = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), Math.max(0, Math.floor(timeoutMs)));
    });
    return Promise.race([flush, boundedWait]);
  }

  dispose(): void {
    this.clearReviewTruthFlushTimer();
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

  private scheduleReviewTruthFlushAfterFeedback(result: BackendReviewFeedbackResult): void {
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
    if (!this.reviewTruthFlushOptions || this.reviewTruthFlushInFlight) {
      return;
    }
    if (this.reviewTruthFlushTimer) {
      if (!options.replaceExisting) {
        return;
      }
      this.clearReviewTruthFlushTimer();
    }
    const resolvedDelayMs = Math.max(0, Math.floor(delayMs));
    if (resolvedDelayMs === 0) {
      void this.runQueuedReviewTruthFlush();
      return;
    }
    this.reviewTruthFlushTimer = setTimeout(() => {
      this.reviewTruthFlushTimer = null;
      void this.runQueuedReviewTruthFlush();
    }, resolvedDelayMs);
  }

  private clearReviewTruthFlushTimer(): void {
    if (!this.reviewTruthFlushTimer) {
      return;
    }
    clearTimeout(this.reviewTruthFlushTimer);
    this.reviewTruthFlushTimer = null;
  }

  private async runQueuedReviewTruthFlush(): Promise<void> {
    if (!this.canRunReviewTruthFlush('queued')) {
      this.reviewTruthFlushQueued = false;
      this.reviewTruthBackfillQueued = false;
      this.reviewTruthBackfillPendingRows = 0;
      return;
    }
    if (this.reviewTruthFlushInFlight) {
      await this.reviewTruthFlushInFlightPromise;
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
      this.reviewTruthFlushQueued = false;
      this.reviewTruthBackfillQueued = false;
      this.reviewTruthBackfillPendingRows = 0;
      logger.warn('[SiYuanMemo][SrsBackendClient] skipped Review truth flush because identity is unavailable');
      return;
    }
    const shouldBackfill = this.reviewTruthBackfillQueued;
    const pendingBackfillRows = this.reviewTruthBackfillPendingRows;
    this.reviewTruthFlushQueued = false;
    this.reviewTruthBackfillQueued = false;
    this.reviewTruthBackfillPendingRows = 0;
    this.reviewTruthFlushInFlight = true;
    try {
      if (shouldBackfill) {
        await this.runQueuedReviewTruthBackfill(request, pendingBackfillRows);
      }
      const result = await this.reviewTruthFlush(request);
      if (!result.ok) {
        logger.warn('[SiYuanMemo][SrsBackendClient] Review truth flush finished with pending error', {
          error: result.error,
          journalQueued: result.journalQueued,
          recordsWritten: result.recordsWritten,
        });
      }
    } catch (error) {
      logger.warn('[SiYuanMemo][SrsBackendClient] Review truth flush failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.reviewTruthFlushInFlight = false;
      if (this.reviewTruthFlushQueued) {
        this.armReviewTruthFlushTimer();
      }
    }
  }

  private async runQueuedReviewTruthBackfill(
    request: BackendReviewFeedbackTruthFlushRequest,
    pendingRows: number,
  ): Promise<void> {
    const backfillRequest = this.buildReviewTruthBackfillRequest(request);
    const batchLimit = this.resolveReviewTruthBackfillBatchLimit(backfillRequest);
    const plannedBatches = Math.max(1, Math.ceil(Math.max(0, Math.floor(pendingRows)) / batchLimit));
    const maxBatches = Math.min(REVIEW_TRUTH_BACKFILL_MAX_STARTUP_BATCHES, plannedBatches);
    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      try {
        const backfillResult = await this.reviewTruthBackfill(backfillRequest);
        if (!backfillResult.ok) {
          logger.warn('[SiYuanMemo][SrsBackendClient] Review truth backfill finished with pending error', {
            error: backfillResult.error,
            sqlRowsRead: backfillResult.sqlRowsRead,
            recordsWritten: backfillResult.recordsWritten,
            repairRequiredEventIds: backfillResult.repairRequiredEventIds,
          });
          break;
        }
        if (backfillResult.sqlRowsRead < batchLimit) {
          break;
        }
        if (backfillResult.recordsWritten <= 0 && backfillResult.idempotencyDuplicateSkipped <= 0) {
          break;
        }
      } catch (error) {
        logger.warn('[SiYuanMemo][SrsBackendClient] Review truth backfill failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
    if (plannedBatches > maxBatches) {
      logger.info('[SiYuanMemo][SrsBackendClient] deferred remaining Review truth backfill batches', {
        plannedBatches,
        maxBatches,
        batchLimit,
      });
    }
  }

  private buildReviewTruthFlushRequest(): BackendReviewFeedbackTruthFlushRequest | null {
    const options = this.reviewTruthFlushOptions;
    const deviceId = String(options?.deviceId || '').trim();
    const generationId = String(options?.generationId || '').trim();
    if (!deviceId || !generationId) {
      return null;
    }
    const request: BackendReviewFeedbackTruthFlushRequest = {
      deviceId,
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
        logger.info('[SiYuanMemo][SrsBackendClient] slow review.feedback client step', {
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
