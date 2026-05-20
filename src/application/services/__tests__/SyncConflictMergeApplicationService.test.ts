import { describe, expect, it, vi } from 'vitest';
import { SyncConflictMergeApplicationService } from '../SyncConflictMergeApplicationService';
import type { BackendSyncConflictMergeResult } from '../../../../../packages/contracts/src/backend-rpc';

describe('SyncConflictMergeApplicationService', () => {
  it('returns an empty merge result when no SiYuan sync conflict database copies exist', async () => {
    const mergeSyncConflicts = vi.fn();
    const service = new SyncConflictMergeApplicationService(
      {
        readSyncConflictDatabaseSources: async () => [],
      },
      { mergeSyncConflicts },
    );

    await expect(service.mergeNow({ mergedAt: 123 })).resolves.toEqual({
      ok: true,
      sources: 0,
      mergedReviewEvents: 0,
      ignoredReviewEvents: 0,
      mergedCards: 0,
      ignoredCards: 0,
      skippedSources: [],
      diagnostics: {
        reviewCardDivergences: [],
      },
    });
    expect(mergeSyncConflicts).not.toHaveBeenCalled();
  });

  it('sends discovered conflict database copies to the backend merge RPC', async () => {
    const expected: BackendSyncConflictMergeResult = {
      ok: true,
      sources: 1,
      mergedReviewEvents: 2,
      ignoredReviewEvents: 3,
      mergedCards: 1,
      ignoredCards: 4,
      skippedSources: [],
      diagnostics: {
        reviewCardDivergences: [],
      },
    };
    const mergeSyncConflicts = vi.fn().mockResolvedValue(expected);
    const source = {
      sourceId: '2026-05-19-231420/siyuanmemo.db',
      bytes: new Uint8Array([1, 2, 3]),
    };
    const service = new SyncConflictMergeApplicationService(
      {
        readSyncConflictDatabaseSources: async () => [source],
      },
      { mergeSyncConflicts },
    );

    await expect(service.mergeNow({ mergedAt: 456 })).resolves.toBe(expected);
    expect(mergeSyncConflicts).toHaveBeenCalledWith({
      sources: [source],
      mergedAt: 456,
    });
  });
});
