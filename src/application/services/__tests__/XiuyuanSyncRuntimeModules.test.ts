import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/types/result';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { XiuyuanRiffBlacklistRuntime } from '../XiuyuanRiffBlacklistRuntime';
import { XiuyuanRiffInputRuntime } from '../XiuyuanRiffInputRuntime';
import { XiuyuanNativeRiffRemoveRuntime } from '../XiuyuanNativeRiffRemoveRuntime';
import { XiuyuanSyncApplyRuntime } from '../XiuyuanSyncApplyRuntime';

function managedXiuyuan(id: string) {
  return {
    getId: () => ({
      getValue: () => id,
    }),
  };
}

describe('Xiuyuan sync runtime modules', () => {
  it('normalizes valid Riff input and rejects malformed cards without placeholder content', () => {
    const runtime = new XiuyuanRiffInputRuntime({
      warn: vi.fn(),
    });

    const result = runtime.prepareRiffBlocks('full', [
      { blockID: '20260101010101-abcdefg', content: 'Question' } as never,
      { id: 'bad', content: 'Question' } as never,
      { id: '20260101010101-hijklmn', content: '\u200B  ' } as never,
    ]);

    expect(result.blocks).toEqual([
      expect.objectContaining({
        id: '20260101010101-abcdefg',
        content: 'Question',
      }),
    ]);
    expect(result.skippedCount).toBe(2);
  });

  it('filters blacklist candidates before sync apply planning', async () => {
    const filterBlacklist = vi.fn(async (cards: Array<{ id: string }>) => cards.filter((card) => card.id !== 'skip-me'));
    const runtime = new XiuyuanRiffBlacklistRuntime({
      filterBlacklist,
      getBlacklist: vi.fn(async () => new Set(['skip-me', 'stale'])),
    });

    const result = await runtime.filterCandidates({
      enabled: true,
      cards: [{ id: 'keep-me' }, { id: 'skip-me' }],
    });

    expect(result.cards).toEqual([{ id: 'keep-me' }]);
    expect(result.skippedCount).toBe(1);
    expect(await runtime.planCleanup(new Set(['keep-me']))).toEqual(['skip-me', 'stale']);
  });

  it('interprets native Riff remove without making local apply decisions', async () => {
    const runtime = new XiuyuanNativeRiffRemoveRuntime({
      findByBlockId: vi.fn(async (blockId: BlockId) => {
        if (blockId.getValue() === '20260101010101-abcdefg') {
          return ok([managedXiuyuan('xy-1'), managedXiuyuan('xy-1'), managedXiuyuan('xy-local')]);
        }
        return err(new Error('repo unavailable'));
      }),
      isManagedRiffXiuyuan: (xiuyuan) => xiuyuan.getId().getValue() !== 'xy-local',
      warn: vi.fn(),
    });

    const plan = await runtime.planRemovals([
      '20260101010101-abcdefg',
      'bad',
      '20260101010101-hijklmn',
    ]);

    expect(plan.deletes).toHaveLength(1);
    expect(plan.deletes[0]?.blockId).toBe('20260101010101-abcdefg');
    expect(plan.deletes[0]?.xiuyuanEntity.getId().getValue()).toBe('xy-1');
    expect(plan.skippedCount).toBe(2);
  });

  it('applies normalized sync change sets through repository and fails explicitly', async () => {
    const repository = {
      applySyncChangeSet: vi.fn(async () => ok({
        createdCount: 1,
        updatedCount: 2,
        deletedCount: 3,
        blacklistCleanedCount: 4,
      })),
    };
    const runtime = new XiuyuanSyncApplyRuntime({
      applySyncChangeSet: repository.applySyncChangeSet,
    });

    await expect(runtime.apply({
      creates: [],
      metadataUpdates: [],
      deletes: [],
      blacklistCleanup: [],
      stats: { addedCount: 1, updatedCount: 2, deletedCount: 3, skippedCount: 0, blacklistCleanedCount: 4 },
    })).resolves.toMatchObject({
      createdCount: 1,
      updatedCount: 2,
      deletedCount: 3,
    });

    repository.applySyncChangeSet.mockResolvedValueOnce(err(new Error('apply unavailable')));
    await expect(runtime.apply({
      creates: [],
      metadataUpdates: [],
      deletes: [],
      blacklistCleanup: [],
      stats: { addedCount: 0, updatedCount: 0, deletedCount: 0, skippedCount: 0, blacklistCleanedCount: 0 },
    })).rejects.toThrow('apply unavailable');
  });
});
