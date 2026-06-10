import type {
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendDomainSyncConflictSourceCleanupCandidatesResult,
  BackendDomainSyncConflictSourceCleanupRequest,
  BackendDomainSyncConflictSourceCleanupResult,
  BackendDomainSyncRepairApplyRequest,
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewRequest,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusRequest,
  BackendDomainSyncStatusResult,
  BackendGraphQueryRequest,
  BackendGraphQueryResult,
  BackendHotspotCommandSubmitRequest,
  BackendHotspotCommandSubmitResult,
  BackendHotspotJobGetRequest,
  BackendHotspotJobGetResult,
  BackendKernelTransactionDequeueRequest,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionRequeueRequest,
  BackendKernelTransactionRequeueResult,
  BackendProgressiveCommandExecuteRequest,
  BackendProgressiveCommandExecuteResult,
  BackendReviewSyncDivergenceAuditRequest,
  BackendReviewSyncDivergenceAuditResult,
  BackendSyncConflictMergeRequest,
  BackendSyncConflictMergeResult,
  BackendSyncConflictReloadResult,
  BackendSyncConflictSummarizeRequest,
  BackendSyncConflictSummarizeResult,
  BackendTopicDerivedCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteResult,
  BackendXiuyuanSyncExecuteRequest,
  BackendXiuyuanSyncExecuteResult,
  P6OwnershipCommandRequest,
  P6OwnershipQueryRequest,
  P6OwnershipResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendIntegrationClientFacet {
  domainSyncStatus(request?: BackendDomainSyncStatusRequest): Promise<BackendDomainSyncStatusResult>;
  domainSyncRepairPreview(request?: BackendDomainSyncRepairPreviewRequest): Promise<BackendDomainSyncRepairPreviewResult>;
  domainSyncRepairApply(request: BackendDomainSyncRepairApplyRequest): Promise<BackendDomainSyncRepairApplyResult>;
  domainSyncConflictSourceCleanupCandidates(): Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult>;
  domainSyncConflictSourcesCleanup(
    request: BackendDomainSyncConflictSourceCleanupRequest,
  ): Promise<BackendDomainSyncConflictSourceCleanupResult>;
  mergeSyncConflicts(request: BackendSyncConflictMergeRequest): Promise<BackendSyncConflictMergeResult>;
  auditReviewSyncDivergence(
    request?: BackendReviewSyncDivergenceAuditRequest,
  ): Promise<BackendReviewSyncDivergenceAuditResult>;
  summarizeSyncConflicts(request: BackendSyncConflictSummarizeRequest): Promise<BackendSyncConflictSummarizeResult>;
  reloadSyncConflictDatabase(): Promise<BackendSyncConflictReloadResult>;
  submitHotspotCommand<TResult = unknown>(
    request: BackendHotspotCommandSubmitRequest,
  ): Promise<BackendHotspotCommandSubmitResult<TResult>>;
  getHotspotJob<TResult = unknown>(request: BackendHotspotJobGetRequest): Promise<BackendHotspotJobGetResult<TResult>>;
  graphQuery(request: BackendGraphQueryRequest): Promise<BackendGraphQueryResult>;
  p6OwnershipQuery(request: P6OwnershipQueryRequest): Promise<P6OwnershipResult>;
  p6OwnershipCommand(request: P6OwnershipCommandRequest): Promise<P6OwnershipResult>;
  ingestKernelTransactions(request: BackendKernelTransactionIngestRequest): Promise<BackendKernelTransactionIngestResult>;
  dequeueKernelTransactions(request?: BackendKernelTransactionDequeueRequest): Promise<BackendKernelTransactionDequeueResult>;
  requeueKernelTransactions(request?: BackendKernelTransactionRequeueRequest): Promise<BackendKernelTransactionRequeueResult>;
  executeXiuyuanSync(request: BackendXiuyuanSyncExecuteRequest): Promise<BackendXiuyuanSyncExecuteResult>;
  executeProgressiveCommand<TResult = unknown>(
    request: BackendProgressiveCommandExecuteRequest,
  ): Promise<BackendProgressiveCommandExecuteResult<TResult>>;
  executeTopicDerivedCommand<TResult = unknown>(
    request: BackendTopicDerivedCommandExecuteRequest,
  ): Promise<BackendTopicDerivedCommandExecuteResult<TResult>>;
  resolveAutoCardDecision(request: BackendAutoCardDecisionResolveRequest): Promise<BackendAutoCardDecisionResolveResult>;
  executeAutoCard(request: BackendAutoCardExecuteRequest): Promise<BackendAutoCardExecuteResult>;
}

export class BackendIntegrationRpcClient implements BackendIntegrationClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  domainSyncStatus(request: BackendDomainSyncStatusRequest = {}): Promise<BackendDomainSyncStatusResult> {
    return this.rpcCaller.call<BackendDomainSyncStatusResult>('domainSync.status', request);
  }

  domainSyncRepairPreview(
    request: BackendDomainSyncRepairPreviewRequest = {},
  ): Promise<BackendDomainSyncRepairPreviewResult> {
    return this.rpcCaller.call<BackendDomainSyncRepairPreviewResult>('domainSync.repair.preview', request);
  }

  domainSyncRepairApply(request: BackendDomainSyncRepairApplyRequest): Promise<BackendDomainSyncRepairApplyResult> {
    return this.rpcCaller.call<BackendDomainSyncRepairApplyResult>('domainSync.repair.apply', request);
  }

  domainSyncConflictSourceCleanupCandidates(): Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult> {
    return this.rpcCaller.call<BackendDomainSyncConflictSourceCleanupCandidatesResult>(
      'domainSync.conflictSources.cleanupCandidates',
    );
  }

  domainSyncConflictSourcesCleanup(
    request: BackendDomainSyncConflictSourceCleanupRequest,
  ): Promise<BackendDomainSyncConflictSourceCleanupResult> {
    return this.rpcCaller.call<BackendDomainSyncConflictSourceCleanupResult>(
      'domainSync.conflictSources.cleanup',
      request,
    );
  }

  mergeSyncConflicts(request: BackendSyncConflictMergeRequest): Promise<BackendSyncConflictMergeResult> {
    return this.rpcCaller.call<BackendSyncConflictMergeResult>('sync.conflict.merge', request);
  }

  auditReviewSyncDivergence(
    request: BackendReviewSyncDivergenceAuditRequest = {},
  ): Promise<BackendReviewSyncDivergenceAuditResult> {
    return this.rpcCaller.call<BackendReviewSyncDivergenceAuditResult>('sync.reviewDivergence.audit', request);
  }

  summarizeSyncConflicts(request: BackendSyncConflictSummarizeRequest): Promise<BackendSyncConflictSummarizeResult> {
    return this.rpcCaller.call<BackendSyncConflictSummarizeResult>('sync.conflict.summarize', request);
  }

  reloadSyncConflictDatabase(): Promise<BackendSyncConflictReloadResult> {
    return this.rpcCaller.call<BackendSyncConflictReloadResult>('sync.conflict.reload');
  }

  submitHotspotCommand<TResult = unknown>(
    request: BackendHotspotCommandSubmitRequest,
  ): Promise<BackendHotspotCommandSubmitResult<TResult>> {
    return this.rpcCaller.call<BackendHotspotCommandSubmitResult<TResult>>('hotspot.command.submit', request);
  }

  getHotspotJob<TResult = unknown>(
    request: BackendHotspotJobGetRequest,
  ): Promise<BackendHotspotJobGetResult<TResult>> {
    return this.rpcCaller.call<BackendHotspotJobGetResult<TResult>>('hotspot.job.get', request);
  }

  graphQuery(request: BackendGraphQueryRequest): Promise<BackendGraphQueryResult> {
    return this.rpcCaller.call<BackendGraphQueryResult>('graph.query', request);
  }

  p6OwnershipQuery(request: P6OwnershipQueryRequest): Promise<P6OwnershipResult> {
    return this.rpcCaller.call<P6OwnershipResult>('p6.ownership.query', request);
  }

  p6OwnershipCommand(request: P6OwnershipCommandRequest): Promise<P6OwnershipResult> {
    return this.rpcCaller.call<P6OwnershipResult>('p6.ownership.command', request);
  }

  ingestKernelTransactions(request: BackendKernelTransactionIngestRequest): Promise<BackendKernelTransactionIngestResult> {
    return this.rpcCaller.call<BackendKernelTransactionIngestResult>('kernel.transaction.ingest', request);
  }

  dequeueKernelTransactions(
    request: BackendKernelTransactionDequeueRequest = {},
  ): Promise<BackendKernelTransactionDequeueResult> {
    return this.rpcCaller.call<BackendKernelTransactionDequeueResult>('kernel.transaction.dequeue', request);
  }

  requeueKernelTransactions(
    request: BackendKernelTransactionRequeueRequest = {},
  ): Promise<BackendKernelTransactionRequeueResult> {
    return this.rpcCaller.call<BackendKernelTransactionRequeueResult>('kernel.transaction.requeue', request);
  }

  executeXiuyuanSync(request: BackendXiuyuanSyncExecuteRequest): Promise<BackendXiuyuanSyncExecuteResult> {
    return this.rpcCaller.call<BackendXiuyuanSyncExecuteResult>('xiuyuan.sync.execute', request);
  }

  executeProgressiveCommand<TResult = unknown>(
    request: BackendProgressiveCommandExecuteRequest,
  ): Promise<BackendProgressiveCommandExecuteResult<TResult>> {
    return this.rpcCaller.call<BackendProgressiveCommandExecuteResult<TResult>>(
      'progressive.command.execute',
      request,
    );
  }

  executeTopicDerivedCommand<TResult = unknown>(
    request: BackendTopicDerivedCommandExecuteRequest,
  ): Promise<BackendTopicDerivedCommandExecuteResult<TResult>> {
    return this.rpcCaller.call<BackendTopicDerivedCommandExecuteResult<TResult>>(
      'topic-derived.command.execute',
      request,
    );
  }

  resolveAutoCardDecision(request: BackendAutoCardDecisionResolveRequest): Promise<BackendAutoCardDecisionResolveResult> {
    return this.rpcCaller.call<BackendAutoCardDecisionResolveResult>('autocard.decision.resolve', request);
  }

  executeAutoCard(request: BackendAutoCardExecuteRequest): Promise<BackendAutoCardExecuteResult> {
    return this.rpcCaller.call<BackendAutoCardExecuteResult>('autocard.execute', request);
  }
}
