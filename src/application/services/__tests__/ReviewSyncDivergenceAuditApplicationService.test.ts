import { describe, expect, it, vi } from 'vitest';
import { ReviewSyncDivergenceAuditApplicationService } from '../ReviewSyncDivergenceAuditApplicationService';
import type { BackendReviewSyncDivergenceAuditResult } from '../../../../../packages/contracts/src/backend-rpc';

describe('ReviewSyncDivergenceAuditApplicationService', () => {
  it('runs backend audit and logs a concise diagnostic summary without blocking on divergence', async () => {
    const result: BackendReviewSyncDivergenceAuditResult = {
      ok: true,
      scannedCards: 2,
      divergentCards: 1,
      limit: 10,
      truncated: false,
      reasons: {
        'review-history-newer-than-card-state': 1,
        'review-event-count-exceeds-card-reps': 0,
      },
      undo: {
        answerUndoPairs: 1,
        openUndoPlans: 0,
        staleUndoPlans: 0,
        undonePlans: 1,
      },
      records: [{
        cardId: 'card-1',
        blockId: 'block-1',
        reason: 'review-history-newer-than-card-state',
        newestReviewEventAt: 2,
        cardLastReview: 1,
        reviewEventCount: 1,
        cardReps: 1,
        sourceExists: true,
        sourceCheckedAt: null,
        sourceMissingAt: null,
      }],
    };
    const auditReviewSyncDivergence = vi.fn(async () => result);
    const logger = { info: vi.fn() };
    const service = new ReviewSyncDivergenceAuditApplicationService(
      { auditReviewSyncDivergence },
      logger,
    );

    await expect(service.runAudit({ cardIds: ['card-1'], limit: 10 })).resolves.toBe(result);
    expect(auditReviewSyncDivergence).toHaveBeenCalledWith({ cardIds: ['card-1'], limit: 10 });
    expect(logger.info).toHaveBeenCalledWith('Review sync divergence audit completed', {
      scannedCards: 2,
      divergentCards: 1,
      truncated: false,
      reasons: {
        'review-history-newer-than-card-state': 1,
        'review-event-count-exceeds-card-reps': 0,
      },
      undo: {
        answerUndoPairs: 1,
        openUndoPlans: 0,
        staleUndoPlans: 0,
        undonePlans: 1,
      },
    });
  });
});
