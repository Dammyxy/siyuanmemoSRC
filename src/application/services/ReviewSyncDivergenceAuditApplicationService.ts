import type {
  BackendReviewSyncDivergenceAuditRequest,
  BackendReviewSyncDivergenceAuditResult,
} from '../../../packages/contracts/src/backend-rpc';

export interface ReviewSyncDivergenceAuditBackend {
  auditReviewSyncDivergence(request: BackendReviewSyncDivergenceAuditRequest): Promise<BackendReviewSyncDivergenceAuditResult>;
}

export interface ReviewSyncDivergenceAuditLogger {
  info(message: string, context?: Record<string, unknown>): void;
}

export class ReviewSyncDivergenceAuditApplicationService {
  constructor(
    private readonly backend: ReviewSyncDivergenceAuditBackend,
    private readonly logger: ReviewSyncDivergenceAuditLogger = console,
  ) {}

  async runAudit(
    request: BackendReviewSyncDivergenceAuditRequest = {},
  ): Promise<BackendReviewSyncDivergenceAuditResult> {
    const result = await this.backend.auditReviewSyncDivergence(request);
    this.logger.info('Review sync divergence audit completed', {
      scannedCards: result.scannedCards,
      divergentCards: result.divergentCards,
      truncated: result.truncated,
      reasons: result.reasons,
    });
    return result;
  }
}
