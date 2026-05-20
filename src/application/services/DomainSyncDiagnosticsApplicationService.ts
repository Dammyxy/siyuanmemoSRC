import type {
  BackendDomainSyncRepairApplyRequest,
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewRequest,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusResult,
  BackendDomainSyncConflictSourceCleanupRequest,
  BackendDomainSyncConflictSourceCleanupResult,
} from '../../../packages/contracts/src/backend-rpc';

export interface DomainSyncDiagnosticsBackend {
  domainSyncStatus(): Promise<BackendDomainSyncStatusResult>;
  domainSyncRepairPreview(request?: BackendDomainSyncRepairPreviewRequest): Promise<BackendDomainSyncRepairPreviewResult>;
  domainSyncRepairApply(request: BackendDomainSyncRepairApplyRequest): Promise<BackendDomainSyncRepairApplyResult>;
  domainSyncConflictSourcesCleanup(request: BackendDomainSyncConflictSourceCleanupRequest): Promise<BackendDomainSyncConflictSourceCleanupResult>;
}

export interface DomainSyncDiagnosticsLogger {
  info(message: string, context?: Record<string, unknown>): void;
}

export interface DomainSyncDiagnosticsFrontendRuntime {
  getMode(): 'writer' | 'follower' | string;
  getInstanceId(): string | null;
}

export interface DomainSyncDiagnosticsFollowerCommandClient {
  submitAndWait<TResult>(request: {
    instanceId: string;
    method: 'domainSync.repair.apply' | 'domainSync.conflictSources.cleanup';
    params: BackendDomainSyncRepairApplyRequest | BackendDomainSyncConflictSourceCleanupRequest;
  }): Promise<TResult>;
}

export class DomainSyncDiagnosticsApplicationService {
  constructor(
    private readonly backend: DomainSyncDiagnosticsBackend,
    private readonly logger: DomainSyncDiagnosticsLogger = console,
    private readonly frontendRuntime: DomainSyncDiagnosticsFrontendRuntime | null = null,
    private readonly followerCommandClient: DomainSyncDiagnosticsFollowerCommandClient | null = null,
  ) {}

  async readStatus(): Promise<BackendDomainSyncStatusResult> {
    const result = await this.backend.domainSyncStatus();
    this.logger.info('Domain sync diagnostics status read', {
      sanityStatus: result.sanity.status,
      operationCount: result.ledger.operationCount,
      processedSources: result.processedSources.totalProcessed,
      skippedSources: result.processedSources.totalSkipped,
      repairableDivergenceCount: result.sanity.repairableDivergenceCount,
    });
    return result;
  }

  async previewRepair(request: BackendDomainSyncRepairPreviewRequest = {}): Promise<BackendDomainSyncRepairPreviewResult> {
    const result = await this.backend.domainSyncRepairPreview(request);
    this.logger.info('Domain sync repair preview read', {
      status: result.status,
      affectedCardCount: result.affectedCardCount,
      plannedMutations: result.plannedMutations.length,
      truncated: result.truncated,
    });
    return result;
  }

  async applyRepair(request: BackendDomainSyncRepairApplyRequest): Promise<BackendDomainSyncRepairApplyResult> {
    const runtime = this.frontendRuntime;
    if (runtime?.getMode() === 'follower') {
      const instanceId = runtime.getInstanceId();
      if (!instanceId || !this.followerCommandClient) {
        return {
          ok: false,
          status: 'unavailable',
          planId: request.planId,
          idempotencyKey: request.idempotencyKey,
          reason: 'domainSync.repair.apply requires writer relay runtime',
        };
      }
      return this.followerCommandClient.submitAndWait<BackendDomainSyncRepairApplyResult>({
        instanceId,
        method: 'domainSync.repair.apply',
        params: request,
      });
    }
    return this.backend.domainSyncRepairApply(request);
  }

  async cleanupConflictSources(
    request: BackendDomainSyncConflictSourceCleanupRequest,
  ): Promise<BackendDomainSyncConflictSourceCleanupResult> {
    const runtime = this.frontendRuntime;
    if (runtime?.getMode() === 'follower') {
      const instanceId = runtime.getInstanceId();
      if (!instanceId || !this.followerCommandClient) {
        return {
          ok: false,
          idempotencyKey: request.idempotencyKey,
          cleaned: [],
          skipped: request.sourceIds.map((sourceId) => ({ sourceId, reason: 'writer relay unavailable' })),
          failed: [],
          status: 'unavailable',
        };
      }
      return this.followerCommandClient.submitAndWait<BackendDomainSyncConflictSourceCleanupResult>({
        instanceId,
        method: 'domainSync.conflictSources.cleanup',
        params: request,
      });
    }
    return this.backend.domainSyncConflictSourcesCleanup(request);
  }
}
