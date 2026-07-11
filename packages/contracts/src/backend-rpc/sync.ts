import type {
  BackendDomainSyncConflictSourceCleanupCandidatesResult,
  BackendDomainSyncConflictSourceCleanupRequest,
  BackendDomainSyncConflictSourceCleanupResult,
  BackendDomainSyncRepairApplyRequest,
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewRequest,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusRequest,
  BackendDomainSyncStatusResult,
  BackendReviewSyncDivergenceAuditRequest,
  BackendReviewSyncDivergenceAuditResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
  BackendSyncConflictReloadResult,
  BackendSyncConflictSummarizeRequest,
  BackendSyncConflictSummarizeResult,
  BackendTruthReconciliationRunRequest,
  BackendTruthReconciliationRunResult,
} from '../backend-rpc';

export const BACKEND_SYNC_RPC_METHODS = [
  'truth.reconciliation.run',
  'sync.reviewDivergence.audit',
  'sync.conflict.summarize',
  'sync.conflict.reload',
  'domainSync.status',
  'domainSync.repair.preview',
  'domainSync.repair.apply',
  'domainSync.conflictSources.cleanupCandidates',
  'domainSync.conflictSources.cleanup',
] as const satisfies readonly BackendRpcMethod[];

export type BackendSyncRpcMethod = typeof BACKEND_SYNC_RPC_METHODS[number];

export type BackendSyncRpcMethodContractMap = {
  readonly 'truth.reconciliation.run': BackendRpcMethodContract<
    'truth.reconciliation.run',
    BackendTruthReconciliationRunRequest,
    BackendTruthReconciliationRunResult
  >;
  readonly 'sync.reviewDivergence.audit': BackendRpcMethodContract<
    'sync.reviewDivergence.audit',
    BackendReviewSyncDivergenceAuditRequest,
    BackendReviewSyncDivergenceAuditResult
  >;
  readonly 'sync.conflict.summarize': BackendRpcMethodContract<
    'sync.conflict.summarize',
    BackendSyncConflictSummarizeRequest,
    BackendSyncConflictSummarizeResult
  >;
  readonly 'sync.conflict.reload': BackendRpcMethodContract<
    'sync.conflict.reload',
    void,
    BackendSyncConflictReloadResult
  >;
  readonly 'domainSync.status': BackendRpcMethodContract<
    'domainSync.status',
    BackendDomainSyncStatusRequest,
    BackendDomainSyncStatusResult
  >;
  readonly 'domainSync.repair.preview': BackendRpcMethodContract<
    'domainSync.repair.preview',
    BackendDomainSyncRepairPreviewRequest,
    BackendDomainSyncRepairPreviewResult
  >;
  readonly 'domainSync.repair.apply': BackendRpcMethodContract<
    'domainSync.repair.apply',
    BackendDomainSyncRepairApplyRequest,
    BackendDomainSyncRepairApplyResult
  >;
  readonly 'domainSync.conflictSources.cleanupCandidates': BackendRpcMethodContract<
    'domainSync.conflictSources.cleanupCandidates',
    void,
    BackendDomainSyncConflictSourceCleanupCandidatesResult
  >;
  readonly 'domainSync.conflictSources.cleanup': BackendRpcMethodContract<
    'domainSync.conflictSources.cleanup',
    BackendDomainSyncConflictSourceCleanupRequest,
    BackendDomainSyncConflictSourceCleanupResult
  >;
};

export const BACKEND_SYNC_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'truth.reconciliation.run', family: 'domain-sync', clientExposure: 'facade' },
  { method: 'sync.reviewDivergence.audit', family: 'sync', clientExposure: 'facade' },
  { method: 'sync.conflict.summarize', family: 'sync', clientExposure: 'facade' },
  { method: 'sync.conflict.reload', family: 'sync', clientExposure: 'facade' },
  { method: 'domainSync.status', family: 'domain-sync', clientExposure: 'facade' },
  { method: 'domainSync.repair.preview', family: 'domain-sync', clientExposure: 'facade' },
  { method: 'domainSync.repair.apply', family: 'domain-sync', clientExposure: 'facade' },
  { method: 'domainSync.conflictSources.cleanupCandidates', family: 'domain-sync', clientExposure: 'facade' },
  { method: 'domainSync.conflictSources.cleanup', family: 'domain-sync', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_SYNC_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_SYNC_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendSyncRpcMethodContractMap>;
