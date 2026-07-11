import { describe, expect, it, vi } from 'vitest';
import { SyncConflictDirectionResolutionService } from '../SyncConflictDirectionResolutionService';
import type {
  BackendSyncConflictMergeRequest,
  BackendSyncConflictSummarizeResult,
  BackendTruthReconciliationRunResult,
} from '../../../../../packages/contracts/src/backend-rpc';

const source = {
  sourceId: 'conflict-a',
  bytes: new Uint8Array([1, 2, 3]),
};

function summaryFor(sources: BackendSyncConflictMergeRequest['sources']): BackendSyncConflictSummarizeResult {
  return {
    ok: true,
    current: {
      sourceId: 'current-local:siyuanmemo.db',
      path: 'siyuanmemo.db',
      size: 4,
      modifiedAt: null,
      reviewEventCount: 1,
      cardCount: 1,
      latestReviewTimestamp: 1,
      latestCardTimestamp: 1,
      parseStatus: 'ok',
    },
    sources: sources.map((item) => ({
      sourceId: item.sourceId,
      path: item.path || null,
      size: item.bytes.byteLength,
      modifiedAt: null,
      reviewEventCount: item.bytes[0] === 0 ? 0 : 2,
      cardCount: item.bytes[0] === 0 ? 0 : 3,
      latestReviewTimestamp: item.bytes[0] === 0 ? null : 9,
      latestCardTimestamp: item.bytes[0] === 0 ? null : 8,
      parseStatus: item.bytes[0] === 0 ? 'parse-error' : 'ok',
      parseError: item.bytes[0] === 0 ? 'bad db' : undefined,
    })),
  };
}

describe('SyncConflictDirectionResolutionService', () => {
  it('previews current and readable conflict summaries', async () => {
    const service = new SyncConflictDirectionResolutionService(
      {
        readSyncConflictDatabaseSources: async () => [source],
      },
      {
        summarizeSyncConflicts: vi.fn(async (request) => summaryFor(request.sources)),
        reconcileCanonicalTruth: vi.fn(),
      },
    );

    await expect(service.preview()).resolves.toMatchObject({
      current: { sourceId: 'current-local:siyuanmemo.db' },
      sources: [{ sourceId: 'conflict-a', parseStatus: 'ok' }],
    });
  });

  it('keeps current local without mutation', async () => {
    const reconcileCanonicalTruth = vi.fn();
    const service = new SyncConflictDirectionResolutionService(
      {
        readSyncConflictDatabaseSources: async () => [source],
      },
      {
        summarizeSyncConflicts: vi.fn(async (request) => summaryFor(request.sources)),
        reconcileCanonicalTruth,
      },
    );

    await expect(service.apply({ kind: 'keepCurrentLocal' })).resolves.toEqual({
      kind: 'keepCurrentLocal',
      unchanged: true,
      sources: 1,
    });
    expect(reconcileCanonicalTruth).not.toHaveBeenCalled();
  });

  it('routes smart merge to canonical truth reconciliation', async () => {
    const unreadable = { sourceId: 'conflict-b', bytes: new Uint8Array([0]) };
    const reconciliation: BackendTruthReconciliationRunResult = {
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
    const reconcileCanonicalTruth = vi.fn(async () => reconciliation);
    const service = new SyncConflictDirectionResolutionService(
      {
        readSyncConflictDatabaseSources: async () => [source, unreadable],
      },
      {
        summarizeSyncConflicts: vi.fn(async (request) => summaryFor(request.sources)),
        reconcileCanonicalTruth,
      },
    );

    await expect(service.apply({ kind: 'smartMerge' })).resolves.toMatchObject({
      kind: 'smartMerge',
      reconciliation: {
        sourceCount: 2,
        acceptedMutationIds: ['mutation-a', 'mutation-b'],
        projectionRebuilt: true,
      },
    });
    expect(reconcileCanonicalTruth).toHaveBeenCalledWith({
      reason: 'manual-sync-conflict-reconciliation',
    });
  });
});
