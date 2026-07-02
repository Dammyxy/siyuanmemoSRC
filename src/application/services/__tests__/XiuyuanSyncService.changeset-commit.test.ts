import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { XiuyuanSyncRiffBlock, XiuyuanSyncSiyuanPort } from '@/application/ports/XiuyuanSyncSiyuanPort';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import type { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import type { RiffBlacklistService } from '../RiffBlacklistService';
import { XiuyuanSyncService } from '../XiuyuanSyncService';
import type { HybridSyncConfig } from '../XiuyuanSyncService.types';

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createConfig(storage: unknown = null): HybridSyncConfig {
  return {
    deckId: 'deck-1',
    storage,
    incrementalSync: {
      enabled: false,
      triggers: ['plugin-start'],
      useBlacklist: false,
      autoDetectCardType: false,
    },
    fullSync: {
      enabled: true,
      interval: 0,
      cleanupBlacklist: false,
    },
    deleteSync: {
      enabled: false,
      useBlacklistFallback: false,
    },
  };
}

function createRiffBlock(blockId: string, cardType?: 'topic' | 'item'): XiuyuanSyncRiffBlock {
  return {
    id: blockId,
    content: `Question for ${blockId}`,
    ial: cardType ? { 'custom-fsrs-card-type': cardType } : undefined,
    riffCardID: `riff-${blockId}`,
    riffCard: {
      id: `riff-${blockId}`,
      due: '2026-03-01T00:00:00.000Z',
      lastReview: '2026-03-01T00:00:00.000Z',
      reps: 0,
      lapses: 0,
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
    },
  };
}

function createManagedXiuyuan(blockId: string, meta: Record<string, unknown> = {}): Xiuyuan {
  const xiuyuan = must(Xiuyuan.create({
    blockIDs: [must(BlockId.create(blockId))],
    templateID: must(TemplateId.create('builtin-riff-sync')),
    faces: [
      must(CardFace.create({
        question: `managed-${blockId}`,
        answer: '',
        questionBlockId: blockId,
        answerBlockId: blockId,
      })),
    ],
    meta: {
      ownership: 'riff-managed',
      source: 'riff-sync',
      schedulerType: 'fsrs-v6',
      ...meta,
    },
  }));
  must(xiuyuan.createCard(0));
  return xiuyuan;
}

function createLocalOwnedXiuyuan(blockId: string, meta: Record<string, unknown> = {}): Xiuyuan {
  const xiuyuan = must(Xiuyuan.create({
    blockIDs: [must(BlockId.create(blockId))],
    templateID: must(TemplateId.create('builtin-quick-card')),
    faces: [
      must(CardFace.create({
        question: `local-${blockId}`,
        answer: '',
        questionBlockId: blockId,
        answerBlockId: blockId,
      })),
    ],
    meta: {
      ownership: 'local-owned',
      source: 'quick-card',
      schedulerType: 'fsrs-v6',
      ...meta,
    },
  }));
  must(xiuyuan.createCard(0));
  return xiuyuan;
}

function createXiuyuanRepositoryMock(): IXiuyuanRepository {
  return {
    save: vi.fn(async () => ({ ok: true, value: undefined })),
    findById: vi.fn(async () => ({ ok: true, value: null })),
    findByBlockId: vi.fn(async () => ({ ok: true, value: [] })),
    findAll: vi.fn(async () => ({ ok: true, value: [] })),
    delete: vi.fn(async () => ({ ok: true, value: undefined })),
    saveMany: vi.fn(async () => ({ ok: true, value: undefined })),
    deleteMany: vi.fn(async () => ({ ok: true, value: undefined })),
    applySyncChangeSet: vi.fn(async (changeSet) => ({
      ok: true,
      value: {
        createdCount: changeSet.creates.length,
        updatedCount: changeSet.metadataUpdates.length,
        deletedCount: changeSet.deletes.length,
        blacklistCleanedCount: changeSet.blacklistCleanup.length,
        checkpointApplied: Boolean(changeSet.checkpointAdvance),
      },
    })),
    getXiuyuanIdByCardId: vi.fn(() => undefined),
  };
}

function createSiyuanApiMock(): XiuyuanSyncSiyuanPort {
  return {
    BUILTIN_DECK_ID: 'deck-1',
    ATTR_CARD_TYPE: 'custom-fsrs-card-type',
    getRiffCards: vi.fn(async () => []),
    getRiffNewCards: vi.fn(async () => []),
    removeRiffCards: vi.fn(async () => undefined),
    setBlockAttrs: vi.fn(async () => undefined),
    getBlockAttrs: vi.fn(async () => ({})),
  };
}

function createService(input: {
  repository: IXiuyuanRepository;
  siyuanApi: XiuyuanSyncSiyuanPort;
  storage?: unknown;
}): XiuyuanSyncService {
  return new XiuyuanSyncService(
    createConfig(input.storage),
    new EventBus(),
    input.repository,
    {
      filterBlacklist: vi.fn(async (cards: XiuyuanSyncRiffBlock[]) => cards),
      getBlacklist: vi.fn(async () => new Set<string>()),
      cleanupBlacklist: vi.fn(async () => 0),
    } as unknown as RiffBlacklistService,
    {
      detectCardType: vi.fn(async () => 'topic'),
      batchDetectCardTypes: vi.fn(async () => new Map()),
    } as unknown as CardTypeDetectionService,
    {
      isRecentlyDeleted: vi.fn(() => false),
    } as unknown as IDeletionTracker,
    input.siyuanApi
  );
}

describe('XiuyuanSyncService ChangeSet commit path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plans full sync creates, metadata updates, and deletes before one repository commit', async () => {
    const repository = createXiuyuanRepositoryMock();
    const siyuanApi = createSiyuanApiMock();
    const service = createService({ repository, siyuanApi });
    const createBlockId = '20260301190000-create1';
    const updateBlockId = '20260301190000-update1';
    const deleteBlockId = '20260301190000-delete1';
    const existingUpdate = createManagedXiuyuan(updateBlockId, { cardType: 'topic' });
    const existingDelete = createManagedXiuyuan(deleteBlockId, { cardType: 'topic' });

    vi.mocked(siyuanApi.getRiffCards).mockResolvedValue([
      createRiffBlock(createBlockId, 'topic'),
      createRiffBlock(updateBlockId, 'item'),
    ]);
    vi.mocked(repository.findByBlockId).mockImplementation(async (blockId: BlockId) => {
      return blockId.getValue() === updateBlockId
        ? { ok: true, value: [existingUpdate] }
        : { ok: true, value: [] };
    });
    vi.mocked(repository.findAll).mockResolvedValue({
      ok: true,
      value: [existingUpdate, existingDelete],
    });

    const result = await service.fullSync();

    expect(result).toMatchObject({
      success: true,
      addedCount: 1,
      updatedCount: 1,
      deletedCount: 1,
    });
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.saveMany).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.deleteMany).not.toHaveBeenCalled();
    expect(repository.applySyncChangeSet).toHaveBeenCalledTimes(1);

    const changeSet = vi.mocked(repository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates.map((entry) => entry.blockId)).toEqual([createBlockId]);
    expect(changeSet?.metadataUpdates.map((entry) => entry.blockId)).toEqual([updateBlockId]);
    expect(changeSet?.deletes.map((entry) => entry.blockId)).toEqual([deleteBlockId]);
    expect(changeSet?.stats).toMatchObject({
      addedCount: 1,
      updatedCount: 1,
      deletedCount: 1,
    });
    expect(changeSet?.checkpointAdvance?.lastSuccessfulFullAt).toEqual(expect.any(Number));
  });

  it('does not mutate existing local Xiuyuan entities when full sync planning fails before commit', async () => {
    const repository = createXiuyuanRepositoryMock();
    const siyuanApi = createSiyuanApiMock();
    const service = createService({ repository, siyuanApi });
    const updateBlockId = '20260301190000-update2';
    const failingCreateBlockId = '20260301190000-create2';
    const existingUpdate = createManagedXiuyuan(updateBlockId, { cardType: 'topic' });

    vi.mocked(siyuanApi.getRiffCards).mockResolvedValue([
      createRiffBlock(updateBlockId, 'item'),
      createRiffBlock(failingCreateBlockId, 'topic'),
    ]);
    vi.mocked(repository.findByBlockId).mockImplementation(async (blockId: BlockId) => {
      return blockId.getValue() === updateBlockId
        ? { ok: true, value: [existingUpdate] }
        : { ok: true, value: [] };
    });
    vi.mocked(repository.findAll).mockResolvedValue({
      ok: true,
      value: [existingUpdate],
    });
    vi.mocked(siyuanApi.getBlockAttrs).mockImplementation(async (blockId: string) => {
      if (blockId === failingCreateBlockId) {
        throw new Error('attrs unavailable');
      }
      return {};
    });

    await expect(service.fullSync()).rejects.toThrow('XIUYUAN_BINDING_ATTRS_UNAVAILABLE');

    expect(repository.applySyncChangeSet).not.toHaveBeenCalled();
    expect(existingUpdate.getMeta().cardType).toBe('topic');
  });

  it('skips full sync create when a native Riff card matches a persistent local tombstone', async () => {
    const repository = createXiuyuanRepositoryMock();
    const siyuanApi = createSiyuanApiMock();
    const hiddenBlockId = '20260301190000-hidden1';
    const storage = {
      hasNativeRiffDeletionTombstone: vi.fn(() => true),
    };
    const service = createService({ repository, siyuanApi, storage });

    vi.mocked(siyuanApi.getRiffCards).mockResolvedValue([
      createRiffBlock(hiddenBlockId, 'topic'),
    ]);

    const result = await service.fullSync();

    expect(result).toMatchObject({
      success: true,
      addedCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      skippedCount: 1,
    });
    expect(repository.findByBlockId).not.toHaveBeenCalled();
    expect(repository.applySyncChangeSet).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(repository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toEqual([]);
    expect(storage.hasNativeRiffDeletionTombstone).toHaveBeenCalledWith(expect.objectContaining({
      cardId: hiddenBlockId,
      blockId: hiddenBlockId,
      blockIds: [hiddenBlockId],
      xiuyuanId: `xy_${hiddenBlockId}`,
      riffCardId: `riff-${hiddenBlockId}`,
    }));
  });

  it('skips incremental sync create when a native Riff add/update matches a persistent local tombstone', async () => {
    const repository = createXiuyuanRepositoryMock();
    const siyuanApi = createSiyuanApiMock();
    const hiddenBlockId = '20260301190000-hidden2';
    const storage = {
      hasNativeRiffDeletionTombstone: vi.fn((candidate: { riffCardId?: string }) => candidate.riffCardId === `riff-${hiddenBlockId}`),
    };
    const service = createService({ repository, siyuanApi, storage });

    vi.mocked(siyuanApi.getRiffNewCards).mockResolvedValue([
      createRiffBlock(hiddenBlockId, 'item'),
    ]);

    const result = await service.incrementalSync();

    expect(result).toMatchObject({
      success: true,
      addedCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      skippedCount: 1,
    });
    expect(repository.findByBlockId).not.toHaveBeenCalled();
    expect(repository.applySyncChangeSet).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(repository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toEqual([]);
    expect(storage.hasNativeRiffDeletionTombstone).toHaveBeenCalledWith(expect.objectContaining({
      blockId: hiddenBlockId,
      riffCardId: `riff-${hiddenBlockId}`,
    }));
  });

  it('marks imported native Riff records as compatibility data without overriding local-owned scheduling truth', async () => {
    const repository = createXiuyuanRepositoryMock();
    const siyuanApi = createSiyuanApiMock();
    const service = createService({ repository, siyuanApi });
    const importBlockId = '20260301190000-import1';
    const localOwnedBlockId = '20260301190000-local01';
    const localOwnedXiuyuan = createLocalOwnedXiuyuan(localOwnedBlockId);

    vi.mocked(siyuanApi.getRiffCards).mockResolvedValue([
      createRiffBlock(importBlockId, 'topic'),
      createRiffBlock(localOwnedBlockId, 'item'),
    ]);
    vi.mocked(repository.findByBlockId).mockImplementation(async (blockId: BlockId) => {
      return blockId.getValue() === localOwnedBlockId
        ? { ok: true, value: [localOwnedXiuyuan] }
        : { ok: true, value: [] };
    });
    vi.mocked(repository.findAll).mockResolvedValue({
      ok: true,
      value: [localOwnedXiuyuan],
    });

    const result = await service.fullSync();

    expect(result).toMatchObject({
      success: true,
      addedCount: 1,
      updatedCount: 0,
      skippedCount: 1,
    });
    expect(repository.applySyncChangeSet).toHaveBeenCalledTimes(1);
    const changeSet = vi.mocked(repository.applySyncChangeSet).mock.calls[0]?.[0];
    expect(changeSet?.creates).toHaveLength(1);
    expect(changeSet?.creates[0]?.blockId).toBe(importBlockId);
    expect(changeSet?.creates[0]?.xiuyuanEntity.getMeta()).toMatchObject({
      ownership: 'riff-managed',
      source: 'riff-sync',
      nativeRiffCompatibility: {
        owner: 'native-riff',
        source: 'riff-sync',
      },
    });
    expect(changeSet?.metadataUpdates.map((entry) => entry.blockId)).not.toContain(localOwnedBlockId);
    expect(localOwnedXiuyuan.getMeta()).toMatchObject({
      ownership: 'local-owned',
      source: 'quick-card',
    });
  });
});
