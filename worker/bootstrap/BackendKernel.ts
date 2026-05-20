import {
  BACKEND_RPC_VERSION,
  type BackendAiPromptExecuteRequest,
  type BackendAiPromptExecuteResult,
  type BackendAiJobCancelRequest,
  type BackendAiJobGetRequest,
  type BackendAiJobResult,
  type BackendAiSessionCancelRequest,
  type BackendAiSessionCreateRequest,
  type BackendAiSessionGetRequest,
  type BackendAiSessionResult,
  type BackendAiSessionUpdateRequest,
  type BackendAiStreamCancelRequest,
  type BackendAiStreamResult,
  type BackendAiStreamStartRequest,
  type BackendAutoCardExecuteRequest,
  type BackendAutoCardExecuteResult,
  type BackendAutoCardDecisionResolveRequest,
  type BackendAutoCardDecisionResolveResult,
  type BackendNeuralGraphQueryRequest,
  type BackendNeuralGraphQueryResult,
  type BackendNeuralRoamAdvanceRequest,
  type BackendNeuralRoamAdvanceResult,
  type BackendBrowserDeckPageRequest,
  type BackendBrowserDeckSnapshotQuery,
  type BackendSourceExistenceSweepApplyRequest,
  type BackendSourceExistenceSweepApplyResult,
  type BackendQueueProjectionSnapshotRequest,
  type BackendQueueProjectionSnapshotResult,
  type BackendQueueProjectionRowsByIdsRequest,
  type BackendQueueProjectionRowsByIdsResult,
  type BackendQueueProjectionReplaceRequest,
  type BackendQueueProjectionReplaceResult,
  type BackendKernelTransactionIngestRequest,
  type BackendKernelTransactionIngestResult,
  type BackendKernelTransactionDequeueRequest,
  type BackendKernelTransactionDequeueResult,
  type BackendKernelTransactionRequeueRequest,
  type BackendKernelTransactionRequeueResult,
  type BackendReviewFeedbackResult,
  type BackendReviewSyncDivergenceAuditRequest,
  type BackendReviewSyncDivergenceAuditResult,
  type BackendSyncConflictMergeRequest,
  type BackendSyncConflictMergeResult,
  type BackendSyncConflictReloadResult,
  type BackendSyncConflictSummarizeRequest,
  type BackendSyncConflictSummarizeResult,
  type PrivateApiAuditQueryRequest,
  type PrivateApiMutationRequest,
  type PrivateApiMutationResult,
  type PrivateApiReadRequest,
  type PrivateApiReadResult,
  type BackendSourceExistenceRefreshCandidate,
  type BackendSourceExistenceRefreshRequest,
  type BackendSourceExistenceSummary,
  type BackendSourceExistenceUpdate,
  type BackendReviewFeedbackRequest,
  type BackendDiagnosticsStatusResult,
  type BackendDomainSyncStatusResult,
  type BackendPreRequestMergeDiagnostic,
  type BackendPreRequestMergeDiagnosticsState,
  type BackendHealthResult,
  type BackendRpcRequest,
  type BackendRpcResponse,
  type BackendSemanticCommandRequest,
  type BackendSemanticCommandResult,
  type BackendSemanticSidebarReadRequest,
  type BackendSemanticSidebarReadResult,
  type BackendSemanticSessionReadRequest,
  type BackendSemanticSessionReadResult,
  type BackendSemanticBrowserReadRequest,
  type BackendSemanticBrowserReadResult,
  type P6OwnershipCommandRequest,
  type P6OwnershipOperation,
  type P6OwnershipQueryRequest,
  type P6OwnershipResult,
  type P6OwnershipSurface,
} from '../../packages/contracts/src/backend-rpc';
import type { StructuredCardQuery } from '@/types/card-query';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { BackendJobRuntime } from './BackendJobRuntime';
import { WorkerNeuralRoamAdvanceService } from './WorkerNeuralRoamAdvanceService';
import {
  createUnavailableSqlitePersistenceBridge,
  type SqlitePersistenceBridge,
} from '../db/SqlitePersistenceBridge';

interface BackendKernelDependencies {
  database: WorkerSqliteDatabaseService;
  resolveExistingBlockIds?: (blockIds: string[]) => Promise<string[]>;
  resolveNeuralGraphQuery?: (
    request: BackendNeuralGraphQueryRequest,
  ) => Promise<BackendNeuralGraphQueryResult>;
  executeAutoCard?: (request: BackendAutoCardExecuteRequest) => Promise<BackendAutoCardExecuteResult>;
  executeAiPrompt?: (
    request: BackendAiPromptExecuteRequest['request'],
    context: BackendAiPromptExecuteRequest,
  ) => Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }>;
}

function buildSuccess<TResult>(
  id: number | string,
  result: TResult,
): BackendRpcResponse<TResult> {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    result,
  };
}

function buildError(
  id: number | string,
  code: 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'METHOD_NOT_FOUND' | 'INTERNAL_ERROR',
  message: string,
): BackendRpcResponse {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    error: {
      code,
      message,
    },
  };
}

function isAuthorizedPrivateMutationCapability(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const capability = value as {
    available?: unknown;
    methodAllowed?: unknown;
    backendWorkerAvailable?: unknown;
    writerAvailable?: unknown;
  };
  return capability.available === true
    && capability.methodAllowed === true
    && capability.backendWorkerAvailable === true
    && capability.writerAvailable === true;
}

const P6_OWNERSHIP_SURFACES = new Set<P6OwnershipSurface>([
  'xiuyuan',
  'progressive',
  'topic-derived',
  'autocard-scanner',
  'block-menu',
  'dialog-manager',
  'data-access-facade',
]);

const P6_OWNERSHIP_QUERY_OPERATIONS = new Set<P6OwnershipOperation>([
  'scan-candidates',
  'resolve-list-children',
  'resolve-concept',
  'read-block-meta',
  'read-block-content',
  'read-card-context',
]);

const STORAGE_REFRESH_EXEMPT_METHODS = new Set<string>([
  'system.health',
  'diagnostics.status',
  'domainSync.status',
  'sync.reviewDivergence.audit',
  'sync.conflict.merge',
  'sync.conflict.summarize',
  'sync.conflict.reload',
]);

export class BackendKernel {
  private readonly privateApiAuditTrail: Array<{
    requestId: string;
    method: string;
    callerIntent: string;
    status: 'accepted' | 'completed' | 'rejected' | 'failed';
    timestamp: number;
  }> = [];
  private readonly privateCommandResultsByIdempotencyKey = new Map<string, PrivateApiMutationResult>();
  private readonly preRequestMergeDiagnostics: BackendPreRequestMergeDiagnostic[] = [];
  private readonly aiRuntime: BackendJobRuntime;
  private readonly neuralRoamRuntime: WorkerNeuralRoamAdvanceService;

  constructor(private readonly deps: BackendKernelDependencies) {
    this.aiRuntime = new BackendJobRuntime({
      onSessionCreate: () => this.deps.database.recordAiSessionOutcome('create'),
      onSessionUpdate: () => this.deps.database.recordAiSessionOutcome('update'),
      onSessionCancel: () => this.deps.database.recordAiSessionOutcome('cancel'),
      onStreamStart: () => this.deps.database.recordAiStreamOutcome('start'),
      onStreamCancel: () => this.deps.database.recordAiStreamOutcome('cancel'),
      onJobCreated: () => this.deps.database.recordAiJobOutcome('created'),
      onJobCompleted: () => this.deps.database.recordAiJobOutcome('completed'),
      onJobCanceled: () => this.deps.database.recordAiJobOutcome('canceled'),
      onJobTimeout: () => this.deps.database.recordAiJobOutcome('timeout'),
      onJobFailed: () => this.deps.database.recordAiJobOutcome('failed'),
    });
    this.neuralRoamRuntime = new WorkerNeuralRoamAdvanceService({
      database: this.deps.database,
      resolveNeuralGraphQuery: this.deps.resolveNeuralGraphQuery,
    });
  }

  static createWithoutBridge(): BackendKernel {
    const reason = 'SrsBackendWorker persistence bridge is unavailable';
    const bridge = createUnavailableSqlitePersistenceBridge(reason);
    return BackendKernel.createWithBridge(bridge);
  }

  static createWithBridge(bridge: SqlitePersistenceBridge): BackendKernel {
    return new BackendKernel({
      database: new WorkerSqliteDatabaseService(bridge),
    });
  }

  async handle(request: BackendRpcRequest): Promise<BackendRpcResponse> {
    if (!request || request.jsonrpc !== BACKEND_RPC_VERSION || !request.method) {
      return buildError(
        request?.id ?? 'invalid-request',
        'INVALID_REQUEST',
        'Invalid SrsBackendWorker JSON-RPC request',
      );
    }

    try {
      if (!STORAGE_REFRESH_EXEMPT_METHODS.has(request.method)) {
        const merge = await this.deps.database.mergeExternalDatabaseIfChanged();
        this.recordPreRequestMergeDiagnostic(request.method, merge);
      }
      switch (request.method) {
        case 'system.health':
          return buildSuccess(request.id, this.systemHealth());
        case 'db.load':
          return buildSuccess(request.id, await this.deps.database.load());
        case 'db.persist':
          return buildSuccess(request.id, await this.deps.database.persist());
        case 'sync.conflict.merge':
          return buildSuccess(request.id, await this.handleSyncConflictMerge(request.params));
        case 'sync.conflict.summarize':
          return buildSuccess(request.id, await this.handleSyncConflictSummarize(request.params));
        case 'sync.conflict.reload':
          return buildSuccess(request.id, await this.handleSyncConflictReload());
        case 'diagnostics.status':
          return buildSuccess(request.id, await this.diagnosticsStatus());
        case 'domainSync.status':
          return buildSuccess(request.id, await this.handleDomainSyncStatus());
        case 'sync.reviewDivergence.audit':
          return buildSuccess(request.id, await this.handleReviewSyncDivergenceAudit(request.params));
        case 'browser.deck.page':
          return buildSuccess(request.id, await this.handleBrowserDeckPage(request.params));
        case 'browser.deck.matchedIds':
          return buildSuccess(request.id, await this.handleBrowserDeckMatchedIds(request.params));
        case 'browser.deck.rowsByIds':
          return buildSuccess(request.id, await this.handleBrowserDeckRowsByIds(request.params));
        case 'browser.count':
          return buildSuccess(request.id, await this.handleBrowserCount(request.params));
        case 'browser.stats':
          return buildSuccess(request.id, await this.handleBrowserStats(request.params));
        case 'browser.sourceExistence.refreshCandidates':
          return buildSuccess(request.id, await this.handleSourceExistenceRefreshCandidates(request.params));
        case 'browser.sourceExistence.update':
          return buildSuccess(request.id, await this.handleSourceExistenceUpdate(request.params));
        case 'browser.sourceExistence.byBlockIds':
          return buildSuccess(request.id, await this.handleSourceExistenceByBlockIds(request.params));
        case 'browser.sourceExistence.summary':
          return buildSuccess(request.id, await this.handleSourceExistenceSummary(request.params));
        case 'browser.sourceExistence.applySweepHost':
          return buildSuccess(request.id, await this.handleSourceExistenceApplySweepHost(request.params));
        case 'queue.projection.snapshot':
          return buildSuccess(request.id, await this.handleQueueProjectionSnapshot(request.params));
        case 'queue.projection.rowsByIds':
          return buildSuccess(request.id, await this.handleQueueProjectionRowsByIds(request.params));
        case 'queue.projection.replace':
          return buildSuccess(request.id, await this.handleQueueProjectionReplace(request.params));
        case 'neural-roam.advance':
          return buildSuccess(request.id, await this.handleNeuralRoamAdvance(request.params));
        case 'kernel.transaction.ingest':
          return buildSuccess(request.id, await this.handleKernelTransactionIngest(request.params));
        case 'kernel.transaction.dequeue':
          return buildSuccess(request.id, await this.handleKernelTransactionDequeue(request.params));
        case 'kernel.transaction.requeue':
          return buildSuccess(request.id, await this.handleKernelTransactionRequeue(request.params));
        case 'autocard.decision.resolve':
          return buildSuccess(request.id, await this.handleAutoCardDecisionResolve(request.params));
        case 'autocard.execute':
          return buildSuccess(request.id, await this.handleAutoCardExecute(request.params));
        case 'review.feedback':
          return buildSuccess(request.id, await this.handleReviewFeedback(request.params));
        case 'ai.session.create':
          return buildSuccess(request.id, this.handleAiSessionCreate(request.params));
        case 'ai.session.get':
          return buildSuccess(request.id, this.handleAiSessionGet(request.params));
        case 'ai.session.update':
          return buildSuccess(request.id, this.handleAiSessionUpdate(request.params));
        case 'ai.session.cancel':
          return buildSuccess(request.id, this.handleAiSessionCancel(request.params));
        case 'ai.prompt.execute':
          return buildSuccess(request.id, await this.handleAiPromptExecute(request.params));
        case 'ai.stream.start':
          return buildSuccess(request.id, this.handleAiStreamStart(request.params));
        case 'ai.stream.cancel':
          return buildSuccess(request.id, this.handleAiStreamCancel(request.params));
        case 'job.get':
          return buildSuccess(request.id, this.handleAiJobGet(request.params));
        case 'job.cancel':
          return buildSuccess(request.id, this.handleAiJobCancel(request.params));
        case 'private.health':
          return buildSuccess(request.id, this.handlePrivateHealth());
        case 'private.diagnostics.status':
          return buildSuccess(request.id, this.handlePrivateDiagnosticsStatus());
        case 'private.audit.query':
          return buildSuccess(request.id, this.handlePrivateAuditQuery(request.params));
        case 'private.read.cards':
        case 'private.read.queues':
        case 'private.read.sessions':
          return buildSuccess(request.id, await this.handlePrivateRead(request.method, request.params));
        case 'private.command.execute':
          return buildSuccess(request.id, await this.handlePrivateCommand(request.params));
        case 'semantic.command.execute':
          return buildSuccess(request.id, await this.handleSemanticCommand(request.params));
        case 'semantic.session.read':
          return buildSuccess(request.id, this.handleSemanticSessionRead(request.params));
        case 'semantic.sidebar.read':
          return buildSuccess(request.id, this.handleSemanticSidebarRead(request.params));
        case 'semantic.browser.read':
          return buildSuccess(request.id, this.handleSemanticBrowserRead(request.params));
        case 'p6.ownership.query':
          return buildSuccess(request.id, this.handleP6OwnershipQuery(request.params));
        case 'p6.ownership.command':
          return buildSuccess(request.id, this.handleP6OwnershipCommand(request.params));
        case 'browser.sourceExistence.applySweep':
          return buildSuccess(request.id, await this.handleSourceExistenceApplySweep(request.params));
        default:
          return buildError(request.id, 'METHOD_NOT_FOUND', `Unknown method: ${request.method}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('INVALID_REQUEST:')) {
        return buildError(request.id, 'INVALID_REQUEST', message.replace(/^INVALID_REQUEST:\s*/, ''));
      }
      if (
        message.includes('persistence bridge is unavailable')
        || message.includes('is unavailable')
        || message.includes(' unavailable ')
        || message.includes('unavailable:')
        || message.startsWith('unavailable')
      ) {
        return buildError(request.id, 'BACKEND_UNAVAILABLE', message);
      }
      return buildError(request.id, 'INTERNAL_ERROR', message);
    }
  }

  private systemHealth(): BackendHealthResult {
    return {
      ok: true,
      runtime: 'srs-backend-worker',
      initialized: this.deps.database.getStatus().initialized,
    };
  }

  private async diagnosticsStatus(): Promise<BackendDiagnosticsStatusResult> {
    const status = this.deps.database.getStatus();
    return {
      runtime: 'srs-backend-worker',
      initialized: status.initialized,
      dbFile: status.dbFile,
      ingest: status.ingest,
      autoCard: status.autoCard,
      review: status.review,
      ai: status.ai,
      preRequestMerge: this.getPreRequestMergeDiagnostics(),
      domainSync: await this.deps.database.getDomainSyncStatus(),
    };
  }

  private async handleDomainSyncStatus(): Promise<BackendDomainSyncStatusResult> {
    return this.deps.database.getDomainSyncStatus();
  }

  private recordPreRequestMergeDiagnostic(
    method: string,
    merge: Awaited<ReturnType<WorkerSqliteDatabaseService['mergeExternalDatabaseIfChanged']>>,
  ): void {
    if (
      merge.mergedReviewEvents <= 0
      && merge.mergedCards <= 0
      && merge.ignoredReviewEvents <= 0
      && merge.ignoredCards <= 0
      && merge.importedOperations <= 0
      && merge.ignoredOperations <= 0
      && merge.skippedSources.length === 0
    ) {
      return;
    }
    const divergenceReasonCounts: Record<string, number> = {};
    for (const record of merge.diagnostics.reviewCardDivergences || []) {
      const reason = String(record.reason || 'unknown');
      divergenceReasonCounts[reason] = (divergenceReasonCounts[reason] || 0) + 1;
    }
    this.preRequestMergeDiagnostics.push({
      method,
      timestamp: Date.now(),
      sources: merge.sourceIds.length,
      sourceIds: merge.sourceIds,
      importedOperations: merge.importedOperations,
      ignoredOperations: merge.ignoredOperations,
      processedSourceIds: merge.processedSourceIds,
      skippedSourceReasons: merge.skippedSourceReasons,
      sanityStatus: merge.sanityStatus,
      mergedReviewEvents: merge.mergedReviewEvents,
      mergedCards: merge.mergedCards,
      ignoredReviewEvents: merge.ignoredReviewEvents,
      ignoredCards: merge.ignoredCards,
      skippedSources: merge.skippedSources,
      divergenceCount: merge.diagnostics.reviewCardDivergences?.length ?? 0,
      divergenceReasonCounts,
    });
    if (this.preRequestMergeDiagnostics.length > 20) {
      this.preRequestMergeDiagnostics.splice(0, this.preRequestMergeDiagnostics.length - 20);
    }
  }

  private getPreRequestMergeDiagnostics(): BackendPreRequestMergeDiagnosticsState {
    const history = this.preRequestMergeDiagnostics.slice(-20);
    return {
      latest: history.at(-1) ?? null,
      history,
    };
  }

  private readNamedParams<TParams extends object>(params: unknown): TParams | null {
    if (!params) {
      return null;
    }
    if (Array.isArray(params)) {
      const [first] = params;
      if (!first || typeof first !== 'object') {
        return null;
      }
      return first as TParams;
    }
    if (typeof params === 'object') {
      return params as TParams;
    }
    return null;
  }

  private async handleBrowserDeckPage(params: unknown): Promise<{ total: number; cards: unknown[] }> {
    const named = this.readNamedParams<{ query?: BackendBrowserDeckSnapshotQuery; page?: BackendBrowserDeckPageRequest }>(params);
    const query = named?.query ?? {};
    const page = named?.page ?? {};
    const result = await this.deps.database.queryDeckPage(query, page);
    return {
      total: result?.total ?? 0,
      cards: result?.cards ?? [],
    };
  }

  private async handleBrowserDeckMatchedIds(params: unknown): Promise<{ ids: string[] }> {
    const named = this.readNamedParams<{ query?: BackendBrowserDeckSnapshotQuery }>(params);
    const ids = await this.deps.database.queryDeckMatchedIds(named?.query ?? {});
    return { ids: ids ?? [] };
  }

  private async handleBrowserDeckRowsByIds(params: unknown): Promise<{ cards: unknown[] }> {
    const named = this.readNamedParams<{ ids?: string[] }>(params);
    const ids = Array.isArray(named?.ids) ? named.ids : [];
    const cards = await this.deps.database.getDeckRowsByIds(ids);
    return { cards };
  }

  private async handleBrowserCount(params: unknown): Promise<{ count: number }> {
    const named = this.readNamedParams<{ query?: StructuredCardQuery }>(params);
    const count = await this.deps.database.countCards(named?.query);
    return { count };
  }

  private async handleBrowserStats(params: unknown): Promise<Record<string, number>> {
    const named = this.readNamedParams<{ now?: number }>(params);
    return this.deps.database.getBrowserStats(named?.now);
  }

  private async handleSourceExistenceRefreshCandidates(
    params: unknown,
  ): Promise<{ candidates: BackendSourceExistenceRefreshCandidate[] }> {
    const named = this.readNamedParams<{ request?: BackendSourceExistenceRefreshRequest }>(params);
    const candidates = await this.deps.database.getSourceExistenceRefreshCandidates(named?.request ?? {});
    return { candidates };
  }

  private async handleSourceExistenceUpdate(params: unknown): Promise<{ updated: number }> {
    const named = this.readNamedParams<{ updates?: BackendSourceExistenceUpdate[]; checkedAt?: number }>(params);
    const updates = Array.isArray(named?.updates) ? named.updates : [];
    await this.deps.database.updateSourceExistence(updates, named?.checkedAt);
    return { updated: updates.length };
  }

  private async handleSourceExistenceByBlockIds(params: unknown): Promise<{ statusByBlockId: Array<{ blockId: string; exists: boolean | null }> }> {
    const named = this.readNamedParams<{ blockIds?: string[] }>(params);
    const blockIds = Array.isArray(named?.blockIds) ? named.blockIds : [];
    const statusByBlockId = await this.deps.database.getSourceExistenceByBlockIds(blockIds);
    return { statusByBlockId };
  }

  private async handleSourceExistenceSummary(params: unknown): Promise<BackendSourceExistenceSummary> {
    const named = this.readNamedParams<{ staleBefore?: number }>(params);
    return this.deps.database.getSourceExistenceSummary(named?.staleBefore);
  }

  private async handleSourceExistenceApplySweep(params: unknown): Promise<BackendSourceExistenceSweepApplyResult> {
    const named = this.readNamedParams<BackendSourceExistenceSweepApplyRequest>(params);
    const existingBlockIds = Array.isArray(named?.existingBlockIds) ? named.existingBlockIds : [];
    return this.deps.database.applySourceExistenceSweep(
      named?.request ?? {},
      existingBlockIds,
      named?.checkedAt,
    );
  }

  private async handleSourceExistenceApplySweepHost(params: unknown): Promise<BackendSourceExistenceSweepApplyResult> {
    const applied = await this.applySourceExistenceSweepHostWithChanges(params);
    return {
      ...applied.result,
      changedBlockIds: applied.changedBlockIds,
    };
  }

  private async applySourceExistenceSweepHostWithChanges(params: unknown): Promise<{
    result: BackendSourceExistenceSweepApplyResult;
    changedBlockIds: string[];
  }> {
    if (!this.deps.resolveExistingBlockIds) {
      throw new Error('SrsBackendWorker host source-existence resolver is unavailable');
    }
    const named = this.readNamedParams<{ request?: BackendSourceExistenceRefreshRequest; checkedAt?: number }>(params);
    const request = named?.request ?? {};
    const candidates = await this.deps.database.getSourceExistenceRefreshCandidates(request);
    if (candidates.length === 0) {
      return {
        result: { checked: 0, updated: 0, changed: false, changedToMissing: false },
        changedBlockIds: [],
      };
    }
    const existingBlockIds = await this.deps.resolveExistingBlockIds(
      candidates.map((candidate) => candidate.blockId),
    );
    const existingSet = new Set(
      existingBlockIds
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean),
    );
    const changedBlockIds = candidates
      .filter((candidate) => candidate.sourceExists !== existingSet.has(candidate.blockId))
      .map((candidate) => candidate.blockId);
    const result = await this.deps.database.applySourceExistenceSweepFromCandidates(
      candidates,
      existingBlockIds,
      named?.checkedAt,
    );
    return {
      result,
      changedBlockIds: result.changedBlockIds.length > 0 ? result.changedBlockIds : changedBlockIds,
    };
  }

  private async handleReviewFeedback(params: unknown): Promise<BackendReviewFeedbackResult> {
    const named = this.readNamedParams<BackendReviewFeedbackRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('review.feedback requires named params');
    }
    return this.deps.database.reviewFeedback(named);
  }

  private async handleSyncConflictMerge(params: unknown): Promise<BackendSyncConflictMergeResult> {
    const named = this.readNamedParams<BackendSyncConflictMergeRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('sync.conflict.merge requires named params');
    }
    return this.deps.database.mergeSyncConflictDatabases(named);
  }

  private async handleReviewSyncDivergenceAudit(params: unknown): Promise<BackendReviewSyncDivergenceAuditResult> {
    const named = this.readNamedParams<BackendReviewSyncDivergenceAuditRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('sync.reviewDivergence.audit requires named params');
    }
    return this.deps.database.auditReviewSyncDivergence(named);
  }

  private async handleSyncConflictSummarize(params: unknown): Promise<BackendSyncConflictSummarizeResult> {
    const named = this.readNamedParams<BackendSyncConflictSummarizeRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('sync.conflict.summarize requires named params');
    }
    return this.deps.database.summarizeSyncConflictDatabases(named);
  }

  private async handleSyncConflictReload(): Promise<BackendSyncConflictReloadResult> {
    return this.deps.database.reloadFromDisk();
  }

  private async handleQueueProjectionSnapshot(params: unknown): Promise<BackendQueueProjectionSnapshotResult> {
    const named = this.readNamedParams<BackendQueueProjectionSnapshotRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('queue.projection.snapshot requires named params');
    }
    return this.deps.database.queueProjectionSnapshot(named);
  }

  private async handleQueueProjectionRowsByIds(params: unknown): Promise<BackendQueueProjectionRowsByIdsResult> {
    const named = this.readNamedParams<BackendQueueProjectionRowsByIdsRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('queue.projection.rowsByIds requires named params');
    }
    return this.deps.database.queueProjectionRowsByIds(named);
  }

  private async handleQueueProjectionReplace(params: unknown): Promise<BackendQueueProjectionReplaceResult> {
    const named = this.readNamedParams<BackendQueueProjectionReplaceRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('queue.projection.replace requires named params');
    }
    return this.deps.database.replaceQueueProjection(named);
  }

  private async handleNeuralRoamAdvance(params: unknown): Promise<BackendNeuralRoamAdvanceResult> {
    const named = this.readNamedParams<BackendNeuralRoamAdvanceRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('neural-roam.advance requires named params');
    }
    return this.neuralRoamRuntime.advance(named);
  }

  private handleAiSessionCreate(params: unknown): BackendAiSessionResult {
    const named = this.readNamedParams<BackendAiSessionCreateRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('ai.session.create requires named params');
    }
    return this.aiRuntime.createSession(named);
  }

  private handleAiSessionGet(params: unknown): BackendAiSessionResult {
    const named = this.readNamedParams<BackendAiSessionGetRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('ai.session.get requires named params');
    }
    return this.aiRuntime.getSession(named);
  }

  private handleAiSessionUpdate(params: unknown): BackendAiSessionResult {
    const named = this.readNamedParams<BackendAiSessionUpdateRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('ai.session.update requires named params');
    }
    return this.aiRuntime.updateSession(named);
  }

  private handleAiSessionCancel(params: unknown): BackendAiSessionResult {
    const named = this.readNamedParams<BackendAiSessionCancelRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('ai.session.cancel requires named params');
    }
    return this.aiRuntime.cancelSession(named);
  }

  private async handleAiPromptExecute(params: unknown): Promise<BackendAiPromptExecuteResult> {
    const named = this.readNamedParams<BackendAiPromptExecuteRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('ai.prompt.execute requires named params');
    }
    return this.aiRuntime.executePrompt(named, this.deps.executeAiPrompt);
  }

  private handleAiStreamStart(params: unknown): BackendAiStreamResult {
    const named = this.readNamedParams<BackendAiStreamStartRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('ai.stream.start requires named params');
    }
    return this.aiRuntime.startStream(named);
  }

  private handleAiStreamCancel(params: unknown): BackendAiStreamResult {
    const named = this.readNamedParams<BackendAiStreamCancelRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('ai.stream.cancel requires named params');
    }
    return this.aiRuntime.cancelStream(named);
  }

  private handleAiJobGet(params: unknown): BackendAiJobResult {
    const named = this.readNamedParams<BackendAiJobGetRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('job.get requires named params');
    }
    return this.aiRuntime.getJob(named);
  }

  private handleAiJobCancel(params: unknown): BackendAiJobResult {
    const named = this.readNamedParams<BackendAiJobCancelRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('job.cancel requires named params');
    }
    return this.aiRuntime.cancelJob(named);
  }

  private async handleKernelTransactionIngest(params: unknown): Promise<BackendKernelTransactionIngestResult> {
    const named = this.readNamedParams<BackendKernelTransactionIngestRequest>(params);
    return this.deps.database.ingestKernelTransactions(named ?? {});
  }

  private async handleKernelTransactionDequeue(params: unknown): Promise<BackendKernelTransactionDequeueResult> {
    const named = this.readNamedParams<BackendKernelTransactionDequeueRequest>(params);
    const maxActions = Number(named?.maxActions);
    return this.deps.database.dequeueKernelTransactionActions(Number.isFinite(maxActions) ? maxActions : 16);
  }

  private async handleKernelTransactionRequeue(params: unknown): Promise<BackendKernelTransactionRequeueResult> {
    const named = this.readNamedParams<BackendKernelTransactionRequeueRequest>(params);
    const actions = Array.isArray(named?.actions) ? named.actions : [];
    return this.deps.database.requeueKernelTransactionActions(actions);
  }

  private async handleAutoCardDecisionResolve(
    params: unknown,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    const named = this.readNamedParams<BackendAutoCardDecisionResolveRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('autocard.decision.resolve requires named params');
    }
    return this.deps.database.resolveAutoCardDecision(named);
  }

  private async handleAutoCardExecute(
    params: unknown,
  ): Promise<BackendAutoCardExecuteResult> {
    const named = this.readNamedParams<BackendAutoCardExecuteRequest>(params);
    if (!named || typeof named !== 'object' || !named.envelope || typeof named.envelope !== 'object') {
      throw new Error('autocard.execute requires named params with envelope');
    }
    if (typeof this.deps.executeAutoCard !== 'function') {
      this.deps.database.recordAutoCardExecuteOutcome({
        status: 'unavailable',
      });
      throw new Error('SrsBackendWorker autocard.execute unavailable: execute callback is not configured');
    }
    try {
      const result = await this.deps.executeAutoCard(named);
      this.deps.database.recordAutoCardExecuteOutcome({
        status: result.executed ? 'created' : result.skipped > 0 ? 'skipped' : 'no-op',
        created: result.created,
        skipped: result.skipped,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      this.deps.database.recordAutoCardExecuteOutcome({
        status: message.startsWith('BACKEND_UNAVAILABLE:') ? 'unavailable' : 'failed',
      });
      throw error;
    }
  }

  private handlePrivateHealth(): { ok: true; runtime: 'srs-backend-worker'; feature: 'private-api' } {
    return {
      ok: true,
      runtime: 'srs-backend-worker',
      feature: 'private-api',
    };
  }

  private handlePrivateDiagnosticsStatus(): {
    ok: true;
    runtime: 'srs-backend-worker';
    status: BackendDiagnosticsStatusResult;
    auditEvents: number;
  } {
    return {
      ok: true,
      runtime: 'srs-backend-worker',
      status: this.diagnosticsStatus(),
      auditEvents: this.privateApiAuditTrail.length,
    };
  }

  private handlePrivateAuditQuery(params: unknown): {
    ok: true;
    data: unknown[];
    diagnosticEventId: string;
    auditStatus: 'recorded';
  } {
    const named = this.readNamedParams<PrivateApiAuditQueryRequest>(params);
    const limit = Math.max(1, Math.floor(Number(named?.limit ?? 20)));
    const rows = this.privateApiAuditTrail.slice(-limit).reverse();
    return {
      ok: true,
      data: rows,
      diagnosticEventId: `private-audit:${Date.now()}`,
      auditStatus: 'recorded',
    };
  }

  private async handlePrivateRead(
    method: 'private.read.cards' | 'private.read.queues' | 'private.read.sessions',
    params: unknown,
  ): Promise<PrivateApiReadResult> {
    const named = this.readNamedParams<PrivateApiReadRequest>(params);
    const requestId = String(named?.requestId || `private-read:${Date.now()}`).trim();
    const callerIntent = String(named?.callerIntent || 'unknown').trim() || 'unknown';
    const limit = Math.max(1, Math.floor(Number(named?.limit ?? 20)));
    this.recordPrivateApiAudit({
      requestId,
      method,
      callerIntent,
      status: 'accepted',
    });
    let data: unknown;
    if (method === 'private.read.cards') {
      const page = await this.deps.database.queryDeckPage({}, { startRow: 0, endRow: limit });
      data = page.cards ?? [];
    } else if (method === 'private.read.queues') {
      const status = this.deps.database.getStatus();
      data = {
        ingest: status.ingest,
      };
    } else {
      data = [];
    }
    this.recordPrivateApiAudit({
      requestId,
      method,
      callerIntent,
      status: 'completed',
    });
    return {
      ok: true,
      data,
      diagnosticEventId: `private-read:${requestId}`,
      auditStatus: 'recorded',
    };
  }

  private async handlePrivateCommand(params: unknown): Promise<PrivateApiMutationResult> {
    const named = this.readNamedParams<PrivateApiMutationRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: private.command.execute requires named params');
    }
    const requestId = String(named.requestId || '').trim();
    const callerIntent = String(named.callerIntent || '').trim();
    const idempotencyKey = String(named.idempotencyKey || '').trim();
    if (!requestId || !callerIntent || !idempotencyKey) {
      throw new Error('INVALID_REQUEST: private.command.execute requires requestId/callerIntent/idempotencyKey');
    }
    if (!isAuthorizedPrivateMutationCapability(named.capabilityResult)) {
      throw new Error('INVALID_REQUEST: private.command.execute requires authorized private API capability');
    }
    const cached = this.privateCommandResultsByIdempotencyKey.get(idempotencyKey);
    if (cached) {
      this.recordPrivateApiAudit({
        requestId,
        method: 'private.command.execute',
        callerIntent,
        status: 'completed',
      });
      return cached;
    }
    this.recordPrivateApiAudit({
      requestId,
      method: 'private.command.execute',
      callerIntent,
      status: 'accepted',
    });
    const commandParams = named.params && typeof named.params === 'object'
      ? named.params as Record<string, unknown>
      : {};
    const operation = String(commandParams.operation || '').trim();
    if (operation !== 'browser.sourceExistence.applySweepHost') {
      throw new Error(`INVALID_REQUEST: unsupported private.command.execute operation: ${operation || '<missing>'}`);
    }
    const applied = await this.applySourceExistenceSweepHostWithChanges({
      request: commandParams.request,
      checkedAt: commandParams.checkedAt,
    });
    const result = {
      ok: true,
      commandId: requestId,
      writerInstanceId: 'backend-worker',
      changed: applied.changedBlockIds.length > 0
        ? { blockIds: applied.changedBlockIds }
        : {},
      result: {
        operation,
        idempotencyKey,
        committed: true,
        sweep: applied.result,
      },
      auditStatus: 'recorded',
      diagnosticEventId: `private-command:${requestId}`,
    } as PrivateApiMutationResult;
    this.privateCommandResultsByIdempotencyKey.set(idempotencyKey, result);
    this.recordPrivateApiAudit({
      requestId,
      method: 'private.command.execute',
      callerIntent,
      status: 'completed',
    });
    return result;
  }

  private async handleSemanticCommand(params: unknown): Promise<BackendSemanticCommandResult> {
    const named = this.readNamedParams<BackendSemanticCommandRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: semantic.command.execute requires named params');
    }
    return this.deps.database.executeSemanticCommand(named);
  }

  private handleSemanticSessionRead(params: unknown): BackendSemanticSessionReadResult {
    const named = this.readNamedParams<BackendSemanticSessionReadRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: semantic.session.read requires named params');
    }
    return this.deps.database.readSemanticSession(named);
  }

  private handleSemanticSidebarRead(params: unknown): BackendSemanticSidebarReadResult {
    const named = this.readNamedParams<BackendSemanticSidebarReadRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: semantic.sidebar.read requires named params');
    }
    return this.deps.database.readSemanticSidebar(named);
  }

  private handleSemanticBrowserRead(params: unknown): BackendSemanticBrowserReadResult {
    const named = this.readNamedParams<BackendSemanticBrowserReadRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: semantic.browser.read requires named params');
    }
    return this.deps.database.readSemanticBrowser(named);
  }

  private handleP6OwnershipQuery(params: unknown): P6OwnershipResult {
    const named = this.readNamedParams<P6OwnershipQueryRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: p6.ownership.query requires named params');
    }
    const surface = String(named.surface || '').trim() as P6OwnershipSurface;
    const operation = String(named.operation || '').trim() as P6OwnershipOperation;
    if (!P6_OWNERSHIP_SURFACES.has(surface)) {
      throw new Error(`INVALID_REQUEST: p6.ownership.query unsupported surface: ${surface || '<missing>'}`);
    }
    if (!P6_OWNERSHIP_QUERY_OPERATIONS.has(operation)) {
      throw new Error(`INVALID_REQUEST: p6.ownership.query unsupported operation: ${operation || '<missing>'}`);
    }
    return {
      ok: true,
      surface,
      operation,
      owner: 'compatibility-read',
      status: 'completed',
      unavailableClass: null,
      diagnosticEventId: `p6-ownership:${surface}:${operation}:${String(named.requestId || Date.now())}`,
      data: named.payload ?? {},
    };
  }

  private handleP6OwnershipCommand(params: unknown): P6OwnershipResult {
    const named = this.readNamedParams<P6OwnershipCommandRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: p6.ownership.command requires named params');
    }
    const surface = String(named.surface || '').trim() as P6OwnershipSurface;
    const operation = String(named.operation || '').trim() as P6OwnershipOperation;
    const idempotencyKey = String(named.idempotencyKey || '').trim();
    if (!P6_OWNERSHIP_SURFACES.has(surface)) {
      throw new Error(`INVALID_REQUEST: p6.ownership.command unsupported surface: ${surface || '<missing>'}`);
    }
    if (operation !== 'execute-side-effect') {
      throw new Error(`INVALID_REQUEST: p6.ownership.command unsupported operation: ${operation || '<missing>'}`);
    }
    if (!idempotencyKey) {
      throw new Error('INVALID_REQUEST: p6.ownership.command requires idempotencyKey');
    }
    return {
      ok: true,
      surface,
      operation,
      owner: 'writer-relay',
      status: 'completed',
      unavailableClass: null,
      diagnosticEventId: `p6-ownership:${surface}:${operation}:${String(named.requestId || idempotencyKey)}`,
      data: named.payload ?? {},
    };
  }

  private recordPrivateApiAudit(input: {
    requestId: string;
    method: string;
    callerIntent: string;
    status: 'accepted' | 'completed' | 'rejected' | 'failed';
  }): void {
    this.privateApiAuditTrail.push({
      requestId: input.requestId,
      method: input.method,
      callerIntent: input.callerIntent,
      status: input.status,
      timestamp: Date.now(),
    });
    if (this.privateApiAuditTrail.length > 500) {
      this.privateApiAuditTrail.splice(0, this.privateApiAuditTrail.length - 500);
    }
  }
}
