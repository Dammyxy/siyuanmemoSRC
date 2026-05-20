import { describe, expect, it } from 'vitest';
import type { BackendDomainSyncStatusResult, BackendDomainSyncSanityStatus } from '../../../../packages/contracts/src/backend-rpc';
import { buildReviewDomainSyncSafetyDecision } from '../ReviewDomainSyncSafetyService';

function status(input: {
  status: BackendDomainSyncSanityStatus;
  repairable?: number;
  divergent?: number;
  skipped?: number;
  pending?: number;
}): BackendDomainSyncStatusResult {
  const repairable = input.repairable ?? 0;
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
      divergentCardCount: input.divergent ?? repairable,
      reasonCounts: {},
      affectedCardIds: [],
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
    ['divergent', 'block-divergent'],
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

  it('reports unavailable when diagnostics cannot be read', () => {
    expect(buildReviewDomainSyncSafetyDecision(null, new Error('backend unavailable'))).toMatchObject({
      kind: 'unavailable',
      canOpenReview: false,
      message: expect.stringContaining('backend unavailable'),
    });
  });
});
