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
  BackendRpcHandlerAdapter,
  BackendSyncConflictReloadResult,
  BackendSyncConflictSummarizeRequest,
  BackendSyncConflictSummarizeResult,
  BackendTruthReconciliationRunRequest,
  BackendTruthReconciliationRunResult,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_SYNC_RPC_METHODS, type BackendSyncRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendSyncRpcDatabase {
  reconcileCanonicalTruth(
    request: BackendTruthReconciliationRunRequest,
  ): Promise<BackendTruthReconciliationRunResult> | BackendTruthReconciliationRunResult;
  auditReviewSyncDivergence(
    request: BackendReviewSyncDivergenceAuditRequest,
  ): Promise<BackendReviewSyncDivergenceAuditResult> | BackendReviewSyncDivergenceAuditResult;
  summarizeSyncConflictDatabases(
    request: BackendSyncConflictSummarizeRequest,
  ): Promise<BackendSyncConflictSummarizeResult> | BackendSyncConflictSummarizeResult;
  reloadFromDisk(): Promise<BackendSyncConflictReloadResult> | BackendSyncConflictReloadResult;
  mergeExternalDatabaseIfChanged(
    source?: unknown,
    options?: {
      context?: string;
      cardId?: string | null;
      skipMainDbRead?: boolean;
    },
  ): Promise<unknown>;
  getDomainSyncStatus(): Promise<BackendDomainSyncStatusResult> | BackendDomainSyncStatusResult;
  getDomainSyncStatusForPreflight(
    context: BackendDomainSyncStatusRequest['context'],
  ): Promise<BackendDomainSyncStatusResult> | BackendDomainSyncStatusResult;
  previewDomainSyncRepair(
    request: BackendDomainSyncRepairPreviewRequest,
  ): Promise<BackendDomainSyncRepairPreviewResult> | BackendDomainSyncRepairPreviewResult;
  applyDomainSyncRepair(
    request: BackendDomainSyncRepairApplyRequest,
  ): Promise<BackendDomainSyncRepairApplyResult> | BackendDomainSyncRepairApplyResult;
  listDomainSyncConflictSourceCleanupCandidates():
    | Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult>
    | BackendDomainSyncConflictSourceCleanupCandidatesResult;
  cleanupDomainSyncConflictSources(
    request: BackendDomainSyncConflictSourceCleanupRequest,
  ): Promise<BackendDomainSyncConflictSourceCleanupResult> | BackendDomainSyncConflictSourceCleanupResult;
}

export interface BackendSyncRpcRuntime {
  readonly database: BackendSyncRpcDatabase;
}

export interface BackendSyncRpcHandlerContext extends BackendRpcHandlerContext {
  readonly sync: BackendSyncRpcRuntime;
}

export type BackendSyncRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendSyncRpcHandlerContext
>;

const BACKEND_SYNC_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendSyncRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendSyncRpcHandlerContext
  >;
} = {
  'truth.reconciliation.run': {
    method: 'truth.reconciliation.run',
    family: 'domain-sync',
    handle(params, context): Promise<BackendTruthReconciliationRunResult> | BackendTruthReconciliationRunResult {
      return context.sync.database.reconcileCanonicalTruth(
        readNamedParams<BackendTruthReconciliationRunRequest>(params) ?? {},
      );
    },
  },
  'sync.reviewDivergence.audit': {
    method: 'sync.reviewDivergence.audit',
    family: 'sync',
    handle(params, context): Promise<BackendReviewSyncDivergenceAuditResult> | BackendReviewSyncDivergenceAuditResult {
      return context.sync.database.auditReviewSyncDivergence(
        readRequiredNamedParams<BackendReviewSyncDivergenceAuditRequest>(
          params,
          'sync.reviewDivergence.audit requires named params',
        ),
      );
    },
  },
  'sync.conflict.summarize': {
    method: 'sync.conflict.summarize',
    family: 'sync',
    handle(params, context): Promise<BackendSyncConflictSummarizeResult> | BackendSyncConflictSummarizeResult {
      return context.sync.database.summarizeSyncConflictDatabases(
        readRequiredNamedParams<BackendSyncConflictSummarizeRequest>(
          params,
          'sync.conflict.summarize requires named params',
        ),
      );
    },
  },
  'sync.conflict.reload': {
    method: 'sync.conflict.reload',
    family: 'sync',
    handle(_params, context): Promise<BackendSyncConflictReloadResult> | BackendSyncConflictReloadResult {
      return context.sync.database.reloadFromDisk();
    },
  },
  'domainSync.status': {
    method: 'domainSync.status',
    family: 'domain-sync',
    async handle(params, context): Promise<BackendDomainSyncStatusResult> {
      const statusRequest = readNamedParams<BackendDomainSyncStatusRequest>(params) ?? {};
      if (statusRequest.context === 'review-feedback-preflight') {
        await context.sync.database.mergeExternalDatabaseIfChanged(undefined, {
          context: 'review-feedback-preflight',
          cardId: typeof statusRequest.cardId === 'string' ? statusRequest.cardId : null,
          skipMainDbRead: true,
        });
        return context.sync.database.getDomainSyncStatusForPreflight('review-feedback-preflight');
      }
      return context.sync.database.getDomainSyncStatus();
    },
  },
  'domainSync.repair.preview': {
    method: 'domainSync.repair.preview',
    family: 'domain-sync',
    handle(params, context): Promise<BackendDomainSyncRepairPreviewResult> | BackendDomainSyncRepairPreviewResult {
      return context.sync.database.previewDomainSyncRepair(
        readNamedParams<BackendDomainSyncRepairPreviewRequest>(params) ?? {},
      );
    },
  },
  'domainSync.repair.apply': {
    method: 'domainSync.repair.apply',
    family: 'domain-sync',
    handle(params, context): Promise<BackendDomainSyncRepairApplyResult> | BackendDomainSyncRepairApplyResult {
      return context.sync.database.applyDomainSyncRepair(
        readNamedParams<BackendDomainSyncRepairApplyRequest>(params) ?? {},
      );
    },
  },
  'domainSync.conflictSources.cleanupCandidates': {
    method: 'domainSync.conflictSources.cleanupCandidates',
    family: 'domain-sync',
    handle(_params, context):
      | Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult>
      | BackendDomainSyncConflictSourceCleanupCandidatesResult {
      return context.sync.database.listDomainSyncConflictSourceCleanupCandidates();
    },
  },
  'domainSync.conflictSources.cleanup': {
    method: 'domainSync.conflictSources.cleanup',
    family: 'domain-sync',
    handle(params, context): Promise<BackendDomainSyncConflictSourceCleanupResult> | BackendDomainSyncConflictSourceCleanupResult {
      return context.sync.database.cleanupDomainSyncConflictSources(
        readNamedParams<BackendDomainSyncConflictSourceCleanupRequest>(params) ?? {},
      );
    },
  },
};

export const BACKEND_SYNC_RPC_HANDLER_REGISTRATIONS: readonly BackendSyncRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_SYNC_RPC_METHODS.map((method) => ({
      ...BACKEND_SYNC_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendSyncRpcAdapter',
    })),
  );

function readNamedParams<TParams extends object>(params: unknown): TParams | null {
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

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const named = readNamedParams<TParams>(params);
  if (!named || typeof named !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return named;
}
