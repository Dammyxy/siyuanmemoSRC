import { describe, expect, it } from 'vitest';
import { UnifiedStorageManager, type UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanRepository } from '../XiuyuanRepository';

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createEmptyStore(): UnifiedCardStore {
  return {
    version: 1,
    xiuyuans: {},
    cards: {},
    cardDTOs: {},
    riffBlacklist: [],
    riffSyncState: {},
  };
}

function createManagedXiuyuan(blockId: string): Xiuyuan {
  const xiuyuan = must(Xiuyuan.create({
    blockIDs: [must(BlockId.create(blockId))],
    templateID: must(TemplateId.create('builtin-riff-sync')),
    faces: [
      must(CardFace.create({
        question: `question-${blockId}`,
        answer: '',
        questionBlockId: blockId,
        answerBlockId: blockId,
      })),
    ],
    meta: {
      ownership: 'riff-managed',
      source: 'riff-sync',
      schedulerType: 'fsrs-v6',
      cardType: 'concept',
    },
  }));
  must(xiuyuan.createCard(0));
  return xiuyuan;
}

describe('XiuyuanRepository.applySyncChangeSet', () => {
  it('persists creates and checkpoint in one save', async () => {
    const storage = new UnifiedStorageManager();
    const repository = new XiuyuanRepository(storage);
    let persistedStore = createEmptyStore();
    let saveCount = 0;
    storage.setPersistenceCallbacks(
      async (store) => {
        saveCount++;
        persistedStore = JSON.parse(JSON.stringify(store)) as UnifiedCardStore;
      },
      async () => persistedStore,
    );

    const xiuyuan = createManagedXiuyuan('20260417123000-sync001');
    const result = await repository.applySyncChangeSet({
      creates: [{ blockId: '20260417123000-sync001', xiuyuanEntity: xiuyuan }],
      metadataUpdates: [],
      deletes: [],
      blacklistCleanup: [],
      checkpointAdvance: {
        lastSuccessfulIncrementalAt: 123,
        lastSuccessfulIncrementalCursor: 'timestamp:123',
      },
      stats: {
        addedCount: 1,
        updatedCount: 0,
        deletedCount: 0,
        skippedCount: 0,
        blacklistCleanedCount: 0,
      },
    });

    expect(result.ok).toBe(true);
    expect(saveCount).toBe(1);
    expect(storage.getXiuYuan(xiuyuan.getId().getValue())?.meta?.ownership).toBe('riff-managed');
    expect(storage.getRiffSyncState().lastSuccessfulIncrementalAt).toBe(123);
  });

  it('rolls back in-memory changes when the single save fails', async () => {
    const storage = new UnifiedStorageManager();
    const repository = new XiuyuanRepository(storage);
    storage.setPersistenceCallbacks(
      async () => {
        throw new Error('disk full');
      },
      async () => createEmptyStore(),
    );

    const xiuyuan = createManagedXiuyuan('20260417123100-sync002');
    const result = await repository.applySyncChangeSet({
      creates: [{ blockId: '20260417123100-sync002', xiuyuanEntity: xiuyuan }],
      metadataUpdates: [],
      deletes: [],
      blacklistCleanup: [],
      checkpointAdvance: {
        lastSuccessfulIncrementalAt: 456,
        lastSuccessfulIncrementalCursor: 'timestamp:456',
      },
      stats: {
        addedCount: 1,
        updatedCount: 0,
        deletedCount: 0,
        skippedCount: 0,
        blacklistCleanedCount: 0,
      },
    });

    expect(result.ok).toBe(false);
    expect(storage.getXiuYuan(xiuyuan.getId().getValue())).toBeUndefined();
    expect(storage.getRiffSyncState().lastSuccessfulIncrementalAt).toBeUndefined();
  });
});
