import { describe, expect, it, vi } from 'vitest';
import { SyncConflictMergeApplicationService } from '../SyncConflictMergeApplicationService';
import type { BackendTruthReconciliationRunResult } from '../../../../../packages/contracts/src/backend-rpc';

describe('SyncConflictMergeApplicationService', () => {
  it('routes manual sync conflict handling to canonical truth reconciliation', async () => {
    const expected: BackendTruthReconciliationRunResult = {
      ok: true,
      sourceCount: 2,
      acceptedMutationIds: ['mutation-a', 'mutation-b'],
      duplicateMutationIds: [],
      blockedAggregateIds: [],
      conflicts: [],
      mergeDecisionCount: 0,
      generationIds: {
        card: 'card-generation',
        queue: 'queue-generation',
        review: 'review-generation',
        domainSync: 'domain-sync-generation',
      },
      projectionRebuilt: true,
    };
    const reconcileCanonicalTruth = vi.fn().mockResolvedValue(expected);
    const service = new SyncConflictMergeApplicationService({
      reconcileCanonicalTruth,
    });

    await expect(service.mergeNow()).resolves.toBe(expected);
    expect(reconcileCanonicalTruth).toHaveBeenCalledWith({
      reason: 'manual-sync-conflict-reconciliation',
    });
  });
});
