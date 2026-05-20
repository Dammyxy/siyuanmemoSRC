import { describe, expect, it, vi } from 'vitest';
import { SyncConflictDirectionResolutionService } from '../SyncConflictDirectionResolutionService';
import type {
  BackendSyncConflictMergeRequest,
  BackendSyncConflictSummarizeResult,
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
        backupCurrentSqliteDatabase: vi.fn(),
        replaceCurrentSqliteDatabase: vi.fn(),
      },
      {
        summarizeSyncConflicts: vi.fn(async (request) => summaryFor(request.sources)),
        mergeSyncConflicts: vi.fn(),
        reloadSyncConflictDatabase: vi.fn(),
      },
    );

    await expect(service.preview()).resolves.toMatchObject({
      current: { sourceId: 'current-local:siyuanmemo.db' },
      sources: [{ sourceId: 'conflict-a', parseStatus: 'ok' }],
    });
  });

  it('keeps current local without mutation', async () => {
    const mergeSyncConflicts = vi.fn();
    const replaceCurrentSqliteDatabase = vi.fn();
    const service = new SyncConflictDirectionResolutionService(
      {
        readSyncConflictDatabaseSources: async () => [source],
        backupCurrentSqliteDatabase: vi.fn(),
        replaceCurrentSqliteDatabase,
      },
      {
        summarizeSyncConflicts: vi.fn(async (request) => summaryFor(request.sources)),
        mergeSyncConflicts,
        reloadSyncConflictDatabase: vi.fn(),
      },
    );

    await expect(service.apply({ kind: 'keepCurrentLocal' })).resolves.toEqual({
      kind: 'keepCurrentLocal',
      unchanged: true,
      sources: 1,
    });
    expect(mergeSyncConflicts).not.toHaveBeenCalled();
    expect(replaceCurrentSqliteDatabase).not.toHaveBeenCalled();
  });

  it('smart merges only readable sources', async () => {
    const unreadable = { sourceId: 'conflict-b', bytes: new Uint8Array([0]) };
    const mergeSyncConflicts = vi.fn(async () => ({
      ok: true,
      sources: 1,
      mergedReviewEvents: 2,
      ignoredReviewEvents: 0,
      mergedCards: 3,
      ignoredCards: 0,
      skippedSources: [],
      diagnostics: {
        reviewCardDivergences: [],
      },
    }));
    const service = new SyncConflictDirectionResolutionService(
      {
        readSyncConflictDatabaseSources: async () => [source, unreadable],
        backupCurrentSqliteDatabase: vi.fn(),
        replaceCurrentSqliteDatabase: vi.fn(),
      },
      {
        summarizeSyncConflicts: vi.fn(async (request) => summaryFor(request.sources)),
        mergeSyncConflicts,
        reloadSyncConflictDatabase: vi.fn(),
      },
    );

    await expect(service.apply({ kind: 'smartMerge' })).resolves.toMatchObject({
      kind: 'smartMerge',
      merge: { sources: 1, mergedReviewEvents: 2, mergedCards: 3 },
    });
    expect(mergeSyncConflicts).toHaveBeenCalledWith({
      sources: [source],
      mergedAt: undefined,
    });
  });

  it('backs up, replaces, and reloads for confirmed replacement', async () => {
    const backupCurrentSqliteDatabase = vi.fn(async () => ({
      backupPath: 'manual-sync-backups/siyuanmemo.db.backup',
      bytes: new Uint8Array([9]),
    }));
    const replaceCurrentSqliteDatabase = vi.fn();
    const reloadSyncConflictDatabase = vi.fn(async () => ({
      ok: true,
      reloaded: true,
      dbFile: 'siyuanmemo.db',
    }));
    const service = new SyncConflictDirectionResolutionService(
      {
        readSyncConflictDatabaseSources: async () => [source],
        backupCurrentSqliteDatabase,
        replaceCurrentSqliteDatabase,
      },
      {
        summarizeSyncConflicts: vi.fn(async (request) => summaryFor(request.sources)),
        mergeSyncConflicts: vi.fn(),
        reloadSyncConflictDatabase,
      },
    );

    await expect(service.apply({
      kind: 'replaceWithConflictCopy',
      sourceId: 'conflict-a',
      confirmed: true,
      now: 1,
    })).resolves.toMatchObject({
      kind: 'replaceWithConflictCopy',
      sourceId: 'conflict-a',
      backupPath: 'manual-sync-backups/siyuanmemo.db.backup',
    });
    expect(backupCurrentSqliteDatabase).toHaveBeenCalledWith({ sourceId: 'conflict-a', now: 1 });
    expect(replaceCurrentSqliteDatabase).toHaveBeenCalledWith(source.bytes);
    expect(reloadSyncConflictDatabase).toHaveBeenCalled();
  });

  it('treats declined replacement as cancel', async () => {
    const replaceCurrentSqliteDatabase = vi.fn();
    const service = new SyncConflictDirectionResolutionService(
      {
        readSyncConflictDatabaseSources: async () => [source],
        backupCurrentSqliteDatabase: vi.fn(),
        replaceCurrentSqliteDatabase,
      },
      {
        summarizeSyncConflicts: vi.fn(async (request) => summaryFor(request.sources)),
        mergeSyncConflicts: vi.fn(),
        reloadSyncConflictDatabase: vi.fn(),
      },
    );

    await expect(service.apply({
      kind: 'replaceWithConflictCopy',
      sourceId: 'conflict-a',
      confirmed: false,
    })).resolves.toEqual({ kind: 'cancel', unchanged: true });
    expect(replaceCurrentSqliteDatabase).not.toHaveBeenCalled();
  });
});
