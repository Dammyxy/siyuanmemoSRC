import { describe, expect, it } from 'vitest';
import type {
  BackendDomainSyncRepairApplyRequest,
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewRequest,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusResult,
  QueueProjectionReadiness,
  QueueProjectionReadinessCause,
} from '../backend-rpc';

describe('backend queue projection readiness contract', () => {
  it('represents ready, refreshing, and unavailable states as a discriminated union', () => {
    const ready = {
      status: 'ready',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      generation: 1,
    } satisfies QueueProjectionReadiness;
    const refreshing = {
      status: 'refreshing',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      cause: 'materialization_in_progress',
      retryAfterMs: 150,
    } satisfies QueueProjectionReadiness;
    const unavailable = {
      status: 'unavailable',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      cause: 'writer_unavailable',
      reason: 'writer unavailable',
      recoverable: true,
      retryAfterMs: 300,
    } satisfies QueueProjectionReadiness;

    expect([ready.status, refreshing.status, unavailable.status]).toEqual([
      'ready',
      'refreshing',
      'unavailable',
    ]);
  });

  it('uses machine-readable causes instead of UI copy strings', () => {
    const cause: QueueProjectionReadinessCause = 'contract_mismatch';
    expect(cause).toBe('contract_mismatch');
  });
});

describe('backend domain sync contract', () => {
  it('serializes status diagnostics with ledger, processed source, sanity, and repair fields', () => {
    const status = {
      ok: true,
      ledger: {
        operationCount: 2,
        newestOperationAt: 1_700_000_000_001,
        operationTypes: {
          'review-committed': 1,
          'card-deleted': 1,
        },
      },
      processedSources: {
        recent: [
          {
            sourceId: 'conflict-a',
            sourceKind: 'siyuan-conflict-db',
            fingerprint: 'sha256-a',
            path: 'temp/repo/sync/conflicts/a.db',
            processedAt: 1_700_000_000_002,
            importedOperations: 1,
            ignoredOperations: 0,
            importedReviewEvents: 1,
            ignoredReviewEvents: 0,
            importedCards: 0,
            ignoredCards: 0,
            skippedReason: null,
            latestSanityStatus: 'merged',
          },
        ],
        skipped: [],
        totalProcessed: 1,
        totalSkipped: 0,
      },
      sanity: {
        status: 'repairable',
        checkedAt: 1_700_000_000_003,
        ledgerOperationCount: 2,
        pendingImportCount: 0,
        processedSourceCount: 1,
        skippedSourceCount: 0,
        repairableDivergenceCount: 1,
        divergentCardCount: 1,
        reasonCounts: {
          'review-history-newer-than-card-state': 1,
        },
        affectedCardIds: ['card-a'],
        truncated: false,
      },
      repair: {
        available: true,
        repairableDivergenceCount: 1,
        latestPlanId: 'plan-a',
      },
    } satisfies BackendDomainSyncStatusResult;

    expect(JSON.parse(JSON.stringify(status))).toMatchObject({
      ok: true,
      sanity: { status: 'repairable' },
      repair: { latestPlanId: 'plan-a' },
    });
  });

  it('serializes repair preview request and result without mutating ordinary RPC shapes', () => {
    const request = {
      cardIds: ['card-a'],
      limit: 50,
      includeUnrepairable: true,
    } satisfies BackendDomainSyncRepairPreviewRequest;
    const result = {
      ok: true,
      planId: 'plan-a',
      status: 'preview',
      createdAt: 1_700_000_000_010,
      affectedCardCount: 1,
      evidence: [
        {
          cardId: 'card-a',
          blockId: 'block-a',
          reason: 'review-event-count-exceeds-card-reps',
          newestReviewEventAt: 1_700_000_000_001,
          cardLastReview: 1_699_000_000_000,
          reviewEventCount: 2,
          cardReps: 1,
        },
      ],
      plannedMutations: [
        {
          cardId: 'card-a',
          mutationType: 'card-state-repair',
          summary: 'repair review counters from review history',
          before: { reps: 1 },
          after: { reps: 2 },
        },
      ],
      unrepairableReasons: [],
      schedulerEvidence: {
        schedulerType: 'fsrs-v6',
        configHash: 'config-a',
        capturedAt: 1_700_000_000_010,
      },
      truncated: false,
      limit: 50,
    } satisfies BackendDomainSyncRepairPreviewResult;

    expect(JSON.parse(JSON.stringify({ request, result }))).toMatchObject({
      request: { cardIds: ['card-a'] },
      result: { planId: 'plan-a', affectedCardCount: 1 },
    });
  });

  it('serializes repair apply request and duplicate-safe result states', () => {
    const request = {
      planId: 'plan-a',
      idempotencyKey: 'apply-a',
      confirmedAt: 1_700_000_000_020,
      confirmedBy: 'user',
      confirmationText: 'apply repair',
    } satisfies BackendDomainSyncRepairApplyRequest;
    const applied = {
      ok: true,
      status: 'applied',
      planId: 'plan-a',
      idempotencyKey: 'apply-a',
      appliedAt: 1_700_000_000_021,
      appliedCards: 1,
      skippedCards: 0,
      invalidatedQueueProjections: 2,
    } satisfies BackendDomainSyncRepairApplyResult;
    const stale = {
      ok: false,
      status: 'stale-plan',
      planId: 'plan-a',
      idempotencyKey: 'apply-a',
      reason: 'card state changed since preview',
    } satisfies BackendDomainSyncRepairApplyResult;

    expect(JSON.parse(JSON.stringify({ request, applied, stale }))).toMatchObject({
      applied: { status: 'applied', appliedCards: 1 },
      stale: { ok: false, status: 'stale-plan' },
    });
  });
});
