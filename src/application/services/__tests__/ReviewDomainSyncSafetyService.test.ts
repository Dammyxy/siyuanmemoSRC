import { describe, expect, it } from 'vitest';
import type { BackendDomainSyncStatusResult, BackendDomainSyncSanityStatus } from '../../../../packages/contracts/src/backend-rpc';
import { buildReviewDomainSyncSafetyDecision } from '../ReviewDomainSyncSafetyService';

function status(input: {
  status: BackendDomainSyncSanityStatus;
  repairable?: number;
  unrepairable?: number;
  ledgerDivergent?: number;
  divergent?: number;
  skipped?: number;
  pending?: number;
  affectedCardIds?: string[];
  reasonCounts?: BackendDomainSyncStatusResult['sanity']['reasonCounts'];
}): BackendDomainSyncStatusResult {
  const repairable = input.repairable ?? 0;
  const unrepairable = input.unrepairable ?? 0;
  const ledgerDivergent = input.ledgerDivergent ?? 0;
  const skipped = input.skipped ?? 0;
  return {
    ok: true,
    ledger: {
      operationCount: 1,
      newestOperationAt: 1,
      operationTypes: {},
    },
    processedSources: {
      recent: [],
      skipped: [],
      totalProcessed: 0,
      totalSkipped: skipped,
    },
    sanity: {
      status: input.status,
      checkedAt: 1,
      ledgerOperationCount: 1,
      pendingImportCount: input.pending ?? 0,
      processedSourceCount: 0,
      skippedSourceCount: skipped,
      repairableDivergenceCount: repairable,
      unrepairableDivergenceCount: unrepairable,
      divergentLedgerCount: ledgerDivergent,
      divergentCardCount: input.divergent ?? repairable,
      reasonCounts: input.reasonCounts ?? {},
      affectedCardIds: input.affectedCardIds ?? [],
      truncated: false,
    },
    repair: {
      available: repairable > 0,
      repairableDivergenceCount: repairable,
      latestPlanId: null,
    },
  };
}

describe('ReviewDomainSyncSafetyService', () => {
  it('allows clean domain sync state', () => {
    expect(buildReviewDomainSyncSafetyDecision(status({ status: 'clean' }))).toMatchObject({
      kind: 'allow',
      canOpenReview: true,
    });
  });

  it.each([
    ['repairable', 'block-repairable'],
    ['needs-direction', 'block-needs-direction'],
    ['source-error', 'block-source-error'],
  ] as const)('blocks %s state', (sanityStatus, expectedKind) => {
    expect(buildReviewDomainSyncSafetyDecision(status({
      status: sanityStatus,
      repairable: sanityStatus === 'repairable' ? 2 : 0,
      divergent: sanityStatus === 'divergent' ? 2 : 0,
      skipped: sanityStatus === 'source-error' ? 1 : 0,
    }))).toMatchObject({
      kind: expectedKind,
      canOpenReview: false,
    });
  });

  it('blocks merged state when it still has unsafe evidence', () => {
    expect(buildReviewDomainSyncSafetyDecision(status({
      status: 'merged',
      repairable: 1,
    }))).toMatchObject({
      kind: 'block-repairable',
      canOpenReview: false,
    });
  });

  it('allows Review when only card reps trail already-applied review history', () => {
    expect(buildReviewDomainSyncSafetyDecision(status({
      status: 'repairable',
      repairable: 72,
      divergent: 72,
      reasonCounts: {
        'review-history-newer-than-card-state': 0,
        'review-event-count-exceeds-card-reps': 72,
      },
    }))).toMatchObject({
      kind: 'allow',
      canOpenReview: true,
    });
  });

  it('still blocks Review when review history is newer than card state', () => {
    expect(buildReviewDomainSyncSafetyDecision(status({
      status: 'repairable',
      repairable: 1,
      divergent: 1,
      reasonCounts: {
        'review-history-newer-than-card-state': 1,
        'review-event-count-exceeds-card-reps': 0,
      },
    }))).toMatchObject({
      kind: 'block-repairable',
      canOpenReview: false,
    });
  });

  it('allows Review when repairable divergence belongs to other cards', () => {
    expect(buildReviewDomainSyncSafetyDecision(status({
      status: 'repairable',
      repairable: 84,
      divergent: 118,
      affectedCardIds: ['card-a', 'card-b'],
      reasonCounts: {
        'review-history-newer-than-card-state': 84,
        'review-event-count-exceeds-card-reps': 34,
      },
    }), undefined, {
      currentCardId: 'card-current',
    })).toMatchObject({
      kind: 'allow',
      canOpenReview: true,
    });
  });

  it('allows divergent state when only unrepairable evidence remains', () => {
    expect(buildReviewDomainSyncSafetyDecision(status({
      status: 'divergent',
      unrepairable: 2,
      divergent: 2,
    }))).toMatchObject({
      kind: 'allow',
      canOpenReview: true,
    });
  });

  it('blocks divergent state when ledger divergence remains', () => {
    expect(buildReviewDomainSyncSafetyDecision(status({
      status: 'divergent',
      ledgerDivergent: 1,
      divergent: 1,
    }))).toMatchObject({
      kind: 'block-divergent',
      canOpenReview: false,
    });
  });

  it('reports unavailable when diagnostics cannot be read', () => {
    expect(buildReviewDomainSyncSafetyDecision(null, new Error('backend unavailable'))).toMatchObject({
      kind: 'unavailable',
      canOpenReview: false,
      message: expect.stringContaining('backend unavailable'),
    });
  });
});
