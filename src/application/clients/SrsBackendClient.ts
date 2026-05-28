import type {
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendBrowserAggregateFocusRequest,
  BackendBrowserAggregateFocusResult,
  BackendBrowserAggregatePageRequest,
  BackendBrowserAggregatePageResult,
  BackendBrowserAggregateSnapshotRequest,
  BackendBrowserAggregateSnapshotResult,
  BackendAiJobCancelRequest,
  BackendAiJobGetRequest,
  BackendAiJobResult,
  BackendAiSessionCancelRequest,
  BackendAiSessionCreateRequest,
  BackendAiPromptExecuteRequest,
  BackendAiPromptExecuteResult,
  BackendAiToolJobApprovalRequest,
  BackendAiToolJobExecuteRequest,
  BackendAiToolJobResult,
  BackendAiSessionGetRequest,
  BackendAiSessionResult,
  BackendAiSessionUpdateRequest,
  BackendAiStreamCancelRequest,
  BackendAiStreamResult,
  BackendAiStreamStartRequest,
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
  BackendNeuralRoamViewStateRequest,
  BackendNeuralRoamViewStateResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
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
  PrivateApiReadRequest,
  PrivateApiReadResult,
  BackendSourceExistenceRefreshCandidate,
  BackendSourceExistenceRefreshRequest,
  BackendSourceExistenceSummary,
  BackendSourceExistenceUpdate,
  BackendDiagnosticsStatusResult,
  BackendHealthResult,
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
  BackendRpcRequest,
  BackendRpcResponse,
  BackendRpcSuccess,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_RPC_VERSION } from '../../../packages/contracts/src/backend-rpc';
import type { StructuredCardQuery } from '@/types/card-query';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SrsBackendClient');
const REVIEW_FEEDBACK_CLIENT_STEP_SLOW_MS = 120;

export interface SrsBackendTransport {
  request(request: BackendRpcRequest): Promise<BackendRpcResponse>;
}

export class SrsBackendClient {
  private requestId = 0;

  constructor(private readonly transport: SrsBackendTransport) {}

  async systemHealth(): Promise<BackendHealthResult> {
    return this.call<BackendHealthResult>('system.health');
  }

  async loadDatabase(): Promise<{ ok: true; initialized: true; dbFile: string }> {
    return this.call('db.load');
  }

  async persistDatabase(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    return this.call('db.persist');
  }

  async diagnosticsStatus(): Promise<BackendDiagnosticsStatusResult> {
    return this.call<BackendDiagnosticsStatusResult>('diagnostics.status');
  }

  async domainSyncStatus(): Promise<BackendDomainSyncStatusResult> {
    return this.call<BackendDomainSyncStatusResult>('domainSync.status');
  }

  async domainSyncRepairPreview(
    request: BackendDomainSyncRepairPreviewRequest = {},
  ): Promise<BackendDomainSyncRepairPreviewResult> {
    return this.call<BackendDomainSyncRepairPreviewResult>('domainSync.repair.preview', request);
  }

  async domainSyncRepairApply(
    request: BackendDomainSyncRepairApplyRequest,
  ): Promise<BackendDomainSyncRepairApplyResult> {
    return this.call<BackendDomainSyncRepairApplyResult>('domainSync.repair.apply', request);
  }

  async domainSyncConflictSourcesCleanup(
    request: BackendDomainSyncConflictSourceCleanupRequest,
  ): Promise<BackendDomainSyncConflictSourceCleanupResult> {
    return this.call<BackendDomainSyncConflictSourceCleanupResult>('domainSync.conflictSources.cleanup', request);
  }

  async domainSyncConflictSourceCleanupCandidates(): Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult> {
    return this.call<BackendDomainSyncConflictSourceCleanupCandidatesResult>('domainSync.conflictSources.cleanupCandidates');
  }

  async browserDeckPage(
    query: BackendBrowserDeckSnapshotQuery,
    page: BackendBrowserDeckPageRequest,
  ): Promise<BackendBrowserDeckPageResult> {
    return this.call('browser.deck.page', { query, page });
  }

  async browserDeckMatchedIds(query: BackendBrowserDeckSnapshotQuery): Promise<string[]> {
    const result = await this.call<{ ids: string[] }>('browser.deck.matchedIds', { query });
    return result.ids || [];
  }

  async browserDeckRowsByIds(ids: string[]): Promise<FSRSCard[]> {
    const result = await this.call<{ cards: FSRSCard[] }>('browser.deck.rowsByIds', { ids });
    return result.cards || [];
  }

  async browserStats(now?: number): Promise<BrowserStats> {
    return this.call<BrowserStats>('browser.stats', { now });
  }

  async browserCountCards(query?: StructuredCardQuery): Promise<number> {
    const result = await this.call<{ count: number }>('browser.count', { query });
    return Number(result.count || 0);
  }

  async browserSourceExistenceRefreshCandidates(
    request: BackendSourceExistenceRefreshRequest,
  ): Promise<BackendSourceExistenceRefreshCandidate[]> {
    const result = await this.call<{ candidates: BackendSourceExistenceRefreshCandidate[] }>(
      'browser.sourceExistence.refreshCandidates',
      { request },
    );
    return result.candidates || [];
  }

  async browserSourceExistenceUpdate(updates: BackendSourceExistenceUpdate[], checkedAt = Date.now()): Promise<number> {
    const result = await this.call<{ updated: number }>(
      'browser.sourceExistence.update',
      { updates, checkedAt },
    );
    return Number(result.updated || 0);
  }

  async browserSourceExistenceByBlockIds(blockIds: string[]): Promise<Map<string, boolean | null>> {
    const result = await this.call<{ statusByBlockId: Array<{ blockId: string; exists: boolean | null }> }>(
      'browser.sourceExistence.byBlockIds',
      { blockIds },
    );
    return new Map((result.statusByBlockId || []).map((row) => [row.blockId, row.exists] as const));
  }

  async browserSourceExistenceSummary(staleBefore?: number): Promise<BackendSourceExistenceSummary> {
    return this.call<BackendSourceExistenceSummary>('browser.sourceExistence.summary', { staleBefore });
  }

  async browserSourceExistenceApplySweep(
    request: BackendSourceExistenceRefreshRequest,
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<BackendSourceExistenceSweepApplyResult> {
    return this.call<BackendSourceExistenceSweepApplyResult>('browser.sourceExistence.applySweep', {
      request,
      existingBlockIds,
      checkedAt,
    });
  }

  async browserSourceExistenceApplySweepHost(
    request: BackendSourceExistenceRefreshRequest,
    checkedAt = Date.now(),
  ): Promise<BackendSourceExistenceSweepApplyResult> {
    return this.call<BackendSourceExistenceSweepApplyResult>('browser.sourceExistence.applySweepHost', {
      request,
      checkedAt,
    });
  }

  async reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    return this.measureReviewFeedbackClientStep('rpc-call', request, () => (
      this.call<BackendReviewFeedbackResult>('review.feedback', request)
    ));
  }

  async mergeSyncConflicts(
    request: BackendSyncConflictMergeRequest,
  ): Promise<BackendSyncConflictMergeResult> {
    return this.call<BackendSyncConflictMergeResult>('sync.conflict.merge', request);
  }

  async auditReviewSyncDivergence(
    request: BackendReviewSyncDivergenceAuditRequest = {},
  ): Promise<BackendReviewSyncDivergenceAuditResult> {
    return this.call<BackendReviewSyncDivergenceAuditResult>('sync.reviewDivergence.audit', request);
  }

  async summarizeSyncConflicts(
    request: BackendSyncConflictSummarizeRequest,
  ): Promise<BackendSyncConflictSummarizeResult> {
    return this.call<BackendSyncConflictSummarizeResult>('sync.conflict.summarize', request);
  }

  async reloadSyncConflictDatabase(): Promise<BackendSyncConflictReloadResult> {
    return this.call<BackendSyncConflictReloadResult>('sync.conflict.reload');
  }

  async queueProjectionSnapshot(
    request: BackendQueueProjectionSnapshotRequest,
  ): Promise<BackendQueueProjectionSnapshotResult> {
    return this.call<BackendQueueProjectionSnapshotResult>('queue.projection.snapshot', request);
  }

  async queueProjectionRowsByIds(
    request: BackendQueueProjectionRowsByIdsRequest,
  ): Promise<BackendQueueProjectionRowsByIdsResult> {
    return this.call<BackendQueueProjectionRowsByIdsResult>('queue.projection.rowsByIds', request);
  }

  async queueProjectionReplace(
    request: BackendQueueProjectionReplaceRequest,
  ): Promise<BackendQueueProjectionReplaceResult> {
    return this.call<BackendQueueProjectionReplaceResult>('queue.projection.replace', request);
  }

  async neuralRoamAdvance(
    request: BackendNeuralRoamAdvanceRequest,
  ): Promise<BackendNeuralRoamAdvanceResult> {
    const result = await this.call<BackendNeuralRoamAdvanceResult>('neural-roam.advance', request);
    return this.validateNeuralRoamAdvanceResult(result);
  }

  async neuralRoamViewState(
    request: BackendNeuralRoamViewStateRequest,
  ): Promise<BackendNeuralRoamViewStateResult> {
    const result = await this.call<BackendNeuralRoamViewStateResult>('neural-roam.viewState', request);
    return this.validateNeuralRoamViewStateResult(result);
  }

  async neuralRoamCommand(
    request: BackendNeuralRoamCommandRequest,
  ): Promise<BackendNeuralRoamCommandResult> {
    const result = await this.call<BackendNeuralRoamCommandResult>('neural-roam.command', request);
    return this.validateNeuralRoamCommandResult(result);
  }

  async createAiSession(request: BackendAiSessionCreateRequest): Promise<BackendAiSessionResult> {
    return this.call<BackendAiSessionResult>('ai.session.create', request);
  }

  async getAiSession(request: BackendAiSessionGetRequest): Promise<BackendAiSessionResult> {
    return this.call<BackendAiSessionResult>('ai.session.get', request);
  }

  async updateAiSession(request: BackendAiSessionUpdateRequest): Promise<BackendAiSessionResult> {
    return this.call<BackendAiSessionResult>('ai.session.update', request);
  }

  async cancelAiSession(request: BackendAiSessionCancelRequest): Promise<BackendAiSessionResult> {
    return this.call<BackendAiSessionResult>('ai.session.cancel', request);
  }

  async executeAiPrompt(request: BackendAiPromptExecuteRequest): Promise<BackendAiPromptExecuteResult> {
    const result = await this.call<BackendAiPromptExecuteResult>('ai.prompt.execute', request);
    return this.validateAiPromptExecuteResult(result, 'ai.prompt.execute');
  }

  async executeAiToolJob(request: BackendAiToolJobExecuteRequest): Promise<BackendAiToolJobResult> {
    return this.call<BackendAiToolJobResult>('ai.tool.job.execute', request);
  }

  async submitAiToolJobApproval(request: BackendAiToolJobApprovalRequest): Promise<BackendAiToolJobResult> {
    return this.call<BackendAiToolJobResult>('ai.tool.job.approval', request);
  }

  async startAiStream(request: BackendAiStreamStartRequest): Promise<BackendAiStreamResult> {
    const result = await this.call<BackendAiStreamResult>('ai.stream.start', request);
    return this.validateAiStreamResult(result, 'ai.stream.start');
  }

  async cancelAiStream(request: BackendAiStreamCancelRequest): Promise<BackendAiStreamResult> {
    const result = await this.call<BackendAiStreamResult>('ai.stream.cancel', request);
    return this.validateAiStreamResult(result, 'ai.stream.cancel');
  }

  async getAiJob(request: BackendAiJobGetRequest): Promise<BackendAiJobResult> {
    const result = await this.call<BackendAiJobResult>('job.get', request);
    return this.validateAiJobResult(result, 'job.get');
  }

  async cancelAiJob(request: BackendAiJobCancelRequest): Promise<BackendAiJobResult> {
    const result = await this.call<BackendAiJobResult>('job.cancel', request);
    return this.validateAiJobResult(result, 'job.cancel');
  }

  async privateHealth(): Promise<{ ok: true; runtime: 'srs-backend-worker'; feature: 'private-api' }> {
    return this.call('private.health');
  }

  async privateDiagnosticsStatus(): Promise<unknown> {
    return this.call('private.diagnostics.status');
  }

  async privateAuditQuery(request: { requestId: string; method: 'private.audit.query'; callerIntent: string; limit?: number }): Promise<unknown> {
    return this.call('private.audit.query', request);
  }

  async privateRead(request: PrivateApiReadRequest): Promise<PrivateApiReadResult> {
    return this.call<PrivateApiReadResult>(request.method, request);
  }

  async privateCommand(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> {
    return this.call<PrivateApiMutationResult>(request.method, request);
  }

  async submitHotspotCommand<TResult = unknown>(
    request: BackendHotspotCommandSubmitRequest,
  ): Promise<BackendHotspotCommandSubmitResult<TResult>> {
    return this.call<BackendHotspotCommandSubmitResult<TResult>>('hotspot.command.submit', request);
  }

  async getHotspotJob<TResult = unknown>(
    request: BackendHotspotJobGetRequest,
  ): Promise<BackendHotspotJobGetResult<TResult>> {
    return this.call<BackendHotspotJobGetResult<TResult>>('hotspot.job.get', request);
  }

  async executeXiuyuanSync(
    request: BackendXiuyuanSyncExecuteRequest,
  ): Promise<BackendXiuyuanSyncExecuteResult> {
    return this.call<BackendXiuyuanSyncExecuteResult>('xiuyuan.sync.execute', request);
  }

  async executeProgressiveCommand<TResult = unknown>(
    request: BackendProgressiveCommandExecuteRequest,
  ): Promise<BackendProgressiveCommandExecuteResult<TResult>> {
    return this.call<BackendProgressiveCommandExecuteResult<TResult>>('progressive.command.execute', request);
  }

  async executeTopicDerivedCommand<TResult = unknown>(
    request: BackendTopicDerivedCommandExecuteRequest,
  ): Promise<BackendTopicDerivedCommandExecuteResult<TResult>> {
    return this.call<BackendTopicDerivedCommandExecuteResult<TResult>>('topic-derived.command.execute', request);
  }

  async executeReviewRiffFeedback(
    request: BackendReviewRiffFeedbackExecuteRequest,
  ): Promise<BackendReviewRiffFeedbackExecuteResult> {
    return this.call<BackendReviewRiffFeedbackExecuteResult>('review.riffFeedback.execute', request);
  }

  async executeReviewSourceRefresh(
    request: BackendReviewSourceRefreshExecuteRequest,
  ): Promise<BackendReviewSourceRefreshExecuteResult> {
    return this.call<BackendReviewSourceRefreshExecuteResult>('review.sourceRefresh.execute', request);
  }

  async browserAggregateSnapshot(
    request: BackendBrowserAggregateSnapshotRequest,
  ): Promise<BackendBrowserAggregateSnapshotResult> {
    return this.call<BackendBrowserAggregateSnapshotResult>('browser.aggregate.snapshot', request);
  }

  async browserAggregatePage<TRow = unknown>(
    request: BackendBrowserAggregatePageRequest,
  ): Promise<BackendBrowserAggregatePageResult<TRow>> {
    return this.call<BackendBrowserAggregatePageResult<TRow>>('browser.aggregate.page', request);
  }

  async browserAggregateFocus<TRow = unknown>(
    request: BackendBrowserAggregateFocusRequest,
  ): Promise<BackendBrowserAggregateFocusResult<TRow>> {
    return this.call<BackendBrowserAggregateFocusResult<TRow>>('browser.aggregate.focus', request);
  }

  async graphQuery(request: BackendGraphQueryRequest): Promise<BackendGraphQueryResult> {
    return this.call<BackendGraphQueryResult>('graph.query', request);
  }

  async semanticCommand(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult> {
    return this.call<BackendSemanticCommandResult>(request.method, request);
  }

  async semanticSessionRead(request: BackendSemanticSessionReadRequest): Promise<BackendSemanticSessionReadResult> {
    return this.call<BackendSemanticSessionReadResult>(request.method, request);
  }

  async semanticSidebarRead(request: BackendSemanticSidebarReadRequest): Promise<BackendSemanticSidebarReadResult> {
    return this.call<BackendSemanticSidebarReadResult>(request.method, request);
  }

  async semanticBrowserRead(request: BackendSemanticBrowserReadRequest): Promise<BackendSemanticBrowserReadResult> {
    return this.call<BackendSemanticBrowserReadResult>(request.method, request);
  }

  async p6OwnershipQuery(request: P6OwnershipQueryRequest): Promise<P6OwnershipResult> {
    return this.call<P6OwnershipResult>('p6.ownership.query', request);
  }

  async p6OwnershipCommand(request: P6OwnershipCommandRequest): Promise<P6OwnershipResult> {
    return this.call<P6OwnershipResult>('p6.ownership.command', request);
  }

  async ingestKernelTransactions(
    request: BackendKernelTransactionIngestRequest,
  ): Promise<BackendKernelTransactionIngestResult> {
    return this.call<BackendKernelTransactionIngestResult>('kernel.transaction.ingest', request);
  }

  async dequeueKernelTransactions(
    request: BackendKernelTransactionDequeueRequest = {},
  ): Promise<BackendKernelTransactionDequeueResult> {
    return this.call<BackendKernelTransactionDequeueResult>('kernel.transaction.dequeue', request);
  }

  async requeueKernelTransactions(
    request: BackendKernelTransactionRequeueRequest = {},
  ): Promise<BackendKernelTransactionRequeueResult> {
    return this.call<BackendKernelTransactionRequeueResult>('kernel.transaction.requeue', request);
  }

  async resolveAutoCardDecision(
    request: BackendAutoCardDecisionResolveRequest,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    const result = await this.call<BackendAutoCardDecisionResolveResult>('autocard.decision.resolve', request);
    return this.validateAutoCardDecisionResolveResult(result);
  }

  async executeAutoCard(
    request: BackendAutoCardExecuteRequest,
  ): Promise<BackendAutoCardExecuteResult> {
    return this.call<BackendAutoCardExecuteResult>('autocard.execute', request);
  }

  private async call<TResult>(method: BackendRpcRequest['method'], params?: unknown): Promise<TResult> {
    const request: BackendRpcRequest = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: ++this.requestId,
      method,
      params: params == null ? [] : [params],
    };
    const response = await this.transport.request(request);
    if ('error' in response) {
      throw new Error(`${response.error.code}: ${response.error.message}`);
    }
    return (response as BackendRpcSuccess<TResult>).result;
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

  private validateAiStreamResult(payload: unknown, method: string): BackendAiStreamResult {
    const candidate = this.assertObjectResult<Record<string, unknown>>(method, payload);
    if (candidate.ok !== true) {
      throw new Error(`${method} returned invalid payload`);
    }
    const streamId = String(candidate.streamId || '').trim();
    const sessionId = String(candidate.sessionId || '').trim();
    const jobId = String(candidate.jobId || '').trim();
    if (!streamId || !sessionId || !jobId) {
      throw new Error(`${method} returned invalid payload`);
    }
    return candidate as BackendAiStreamResult;
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

  private validateAiJobResult(payload: unknown, method: string): BackendAiJobResult {
    const candidate = this.assertObjectResult<Record<string, unknown>>(method, payload);
    if (candidate.ok !== true || !candidate.job || typeof candidate.job !== 'object') {
      throw new Error(`${method} returned invalid payload`);
    }
    return candidate as BackendAiJobResult;
  }

  private validateAiPromptExecuteResult(payload: unknown, method: string): BackendAiPromptExecuteResult {
    const candidate = this.assertObjectResult<Record<string, unknown>>(method, payload);
    if (candidate.ok !== true) {
      throw new Error(`${method} returned invalid payload`);
    }
    const streamId = String(candidate.streamId || '').trim();
    const sessionId = String(candidate.sessionId || '').trim();
    const jobId = String(candidate.jobId || '').trim();
    if (!streamId || !sessionId || !jobId) {
      throw new Error(`${method} returned invalid payload`);
    }
    return candidate as BackendAiPromptExecuteResult;
  }
}
