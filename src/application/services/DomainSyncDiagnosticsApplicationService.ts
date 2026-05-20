import type { BackendDomainSyncStatusResult } from '../../../packages/contracts/src/backend-rpc';

export interface DomainSyncDiagnosticsBackend {
  domainSyncStatus(): Promise<BackendDomainSyncStatusResult>;
}

export interface DomainSyncDiagnosticsLogger {
  info(message: string, context?: Record<string, unknown>): void;
}

export class DomainSyncDiagnosticsApplicationService {
  constructor(
    private readonly backend: DomainSyncDiagnosticsBackend,
    private readonly logger: DomainSyncDiagnosticsLogger = console,
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
}
