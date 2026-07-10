import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { CardDeletionSiyuanPort } from '@/application/ports/CardDeletionSiyuanPort';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { DeleteCardUseCase } from '../DeleteCardUseCase';
import { DeleteCardsUseCase } from '../DeleteCardsUseCase';
import { UnifiedStorageManager, type UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import { XiuyuanRepository } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createXiuyuanWithCards(
  faceCount = 1,
  blockId = '20260308010101-cardblk',
  meta?: Record<string, unknown>
): { xiuyuan: Xiuyuan; cardIds: string[]; blockId: string } {
  const xiuyuan = must(
    Xiuyuan.create({
      blockIDs: [must(BlockId.create(blockId))],
      templateID: must(TemplateId.create('template-basic')),
      faces: Array.from({ length: faceCount }, (_, index) =>
        must(
          CardFace.create({
            question: `Question ${index + 1}`,
            answer: `Answer ${index + 1}`,
            questionBlockId: blockId,
            answerBlockId: blockId,
          })
          )
      ),
      ...(meta ? { meta } : {}),
    })
  );

  const cardCreationService = new CardCreationService();
  const cardIds = Array.from({ length: faceCount }, (_, index) =>
    must(cardCreationService.createCard(xiuyuan, index)).getId().getValue()
  );

  return { xiuyuan, cardIds, blockId };
}

function createDeletionApiMock(): CardDeletionSiyuanPort {
  return {
    BUILTIN_DECK_ID: 'builtin-deck',
    getBlockAttrs: vi.fn().mockResolvedValue({
      'custom-xiuyuan-id': 'xy_test',
      'custom-fsrs-card-type': 'item',
    }),
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
  };
}

function createEmptyStore(): UnifiedCardStore {
  return {
    version: 2,
    xiuyuans: {},
    cards: {},
    cardDTOs: {},
    deletedCardDTOs: {},
    deletedXiuyuans: {},
  };
}

function createPersistedRepositoryHarness(): {
  repository: XiuyuanRepository;
  storage: UnifiedStorageManager;
  resetSaveCount: () => void;
  getSaveCount: () => number;
  getPersistedStore: () => UnifiedCardStore;
} {
  const storage = new UnifiedStorageManager();
  const repository = new XiuyuanRepository(storage);
  let saveCount = 0;
  let persistedStore = createEmptyStore();

  storage.setPersistenceCallbacks(
    async (store) => {
      saveCount += 1;
      persistedStore = JSON.parse(JSON.stringify(store)) as UnifiedCardStore;
    },
    async () => persistedStore,
  );

  return {
    repository,
    storage,
    resetSaveCount: () => {
      saveCount = 0;
    },
    getSaveCount: () => saveCount,
    getPersistedStore: () => persistedStore,
  };
}

function createRepoMock(xiuyuan: Xiuyuan, cardIds: string[]): IXiuyuanRepository {
  const xiuyuanId = xiuyuan.getId().getValue();
  return {
    save: vi.fn().mockResolvedValue(ok(undefined)),
    findById: vi.fn().mockResolvedValue(ok(xiuyuan)),
    findByBlockId: vi.fn(),
    findAll: vi.fn().mockResolvedValue(ok([xiuyuan])),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    saveMany: vi.fn().mockResolvedValue(ok(undefined)),
    deleteMany: vi.fn().mockResolvedValue(ok(undefined)),
    getXiuyuanIdByCardId: vi.fn((cardId: string) => (cardIds.includes(cardId) ? xiuyuanId : undefined)),
  } as unknown as IXiuyuanRepository;
}

describe('Delete card persistence', () => {
  it('DeleteCardUseCase deletes the Xiuyuan when the last card is removed', async () => {
    const { xiuyuan, cardIds, blockId } = createXiuyuanWithCards(1);
    const repo = createRepoMock(xiuyuan, cardIds);
    const deletionTracker: IDeletionTracker = {
      markAsDeleted: vi.fn(),
      markManyAsDeleted: vi.fn(),
      isRecentlyDeleted: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
    };

    const useCase = new DeleteCardUseCase(
      repo,
      new CardDeletionService(),
      new EventBus(),
      {
        siyuanApi: createDeletionApiMock(),
        deletionTracker,
      }
    );

    const result = await useCase.execute({ cardId: cardIds[0] });
    expect(result.ok).toBe(true);
    expect(repo.delete).toHaveBeenCalledTimes(1);
    expect(repo.save).not.toHaveBeenCalled();
    expect(deletionTracker.markAsDeleted).toHaveBeenCalledWith(blockId);
  });

  it('DeleteCardUseCase keeps save path when cards remain', async () => {
    const { xiuyuan, cardIds } = createXiuyuanWithCards(2);
    const repo = createRepoMock(xiuyuan, cardIds);

    const useCase = new DeleteCardUseCase(
      repo,
      new CardDeletionService(),
      new EventBus(),
      { siyuanApi: createDeletionApiMock() }
    );

    const result = await useCase.execute({ cardId: cardIds[0] });
    expect(result.ok).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('DeleteCardsUseCase deletes the Xiuyuan when batch deletion removes the last cards', async () => {
    const { xiuyuan, cardIds } = createXiuyuanWithCards(2);
    const repo = createRepoMock(xiuyuan, cardIds);
    const deletionTracker: IDeletionTracker = {
      markAsDeleted: vi.fn(),
      markManyAsDeleted: vi.fn(),
      isRecentlyDeleted: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
    };

    const useCase = new DeleteCardsUseCase(
      repo,
      new CardDeletionService(),
      new EventBus(),
      deletionTracker,
      { siyuanApi: createDeletionApiMock() }
    );

    const result = await useCase.execute({ cardIds });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.deletedCount).toBe(2);
    expect(repo.deleteMany).toHaveBeenCalledTimes(1);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('DeleteCardsUseCase persists multi-Xiuyuan tombstone deletion in one save', async () => {
    const first = createXiuyuanWithCards(1, '20260308010101-batcha1', { ownership: 'riff-managed' });
    const second = createXiuyuanWithCards(1, '20260308010101-batchb2', { ownership: 'riff-managed' });
    const { repository, resetSaveCount, getSaveCount, getPersistedStore } = createPersistedRepositoryHarness();
    const seedResult = await repository.saveMany([first.xiuyuan, second.xiuyuan]);
    expect(seedResult.ok).toBe(true);
    resetSaveCount();

    const deletionTracker: IDeletionTracker = {
      markAsDeleted: vi.fn(),
      markManyAsDeleted: vi.fn(),
      isRecentlyDeleted: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
    };

    const useCase = new DeleteCardsUseCase(
      repository,
      new CardDeletionService(),
      new EventBus(),
      deletionTracker,
      { siyuanApi: createDeletionApiMock() }
    );

    const result = await useCase.execute({
      cardIds: [first.cardIds[0], second.cardIds[0]],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      deletedCount: 2,
      failedCardIds: [],
    });
    expect(getSaveCount()).toBe(1);
    expect(getPersistedStore().deletedCardDTOs?.[first.cardIds[0]]).toBeDefined();
    expect(getPersistedStore().deletedCardDTOs?.[second.cardIds[0]]).toBeDefined();
    expect(deletionTracker.markManyAsDeleted).toHaveBeenCalledWith([first.blockId, second.blockId]);
  });

  it('DeleteCardsUseCase persists multi-Xiuyuan partial deletion in one save', async () => {
    const first = createXiuyuanWithCards(2, '20260308010101-partia1', { ownership: 'riff-managed' });
    const second = createXiuyuanWithCards(2, '20260308010101-partib2', { ownership: 'riff-managed' });
    const { repository, resetSaveCount, getSaveCount, getPersistedStore } = createPersistedRepositoryHarness();
    const seedResult = await repository.saveMany([first.xiuyuan, second.xiuyuan]);
    expect(seedResult.ok).toBe(true);
    resetSaveCount();

    const deletionTracker: IDeletionTracker = {
      markAsDeleted: vi.fn(),
      markManyAsDeleted: vi.fn(),
      isRecentlyDeleted: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
    };

    const useCase = new DeleteCardsUseCase(
      repository,
      new CardDeletionService(),
      new EventBus(),
      deletionTracker,
      { siyuanApi: createDeletionApiMock() }
    );

    const result = await useCase.execute({
      cardIds: [first.cardIds[0], second.cardIds[0]],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      deletedCount: 2,
      failedCardIds: [],
    });
    expect(getSaveCount()).toBe(1);
    expect(getPersistedStore().deletedCardDTOs?.[first.cardIds[0]]).toBeDefined();
    expect(getPersistedStore().deletedCardDTOs?.[second.cardIds[0]]).toBeDefined();
    expect(getPersistedStore().cardDTOs?.[first.cardIds[1]]).toBeDefined();
    expect(getPersistedStore().cardDTOs?.[second.cardIds[1]]).toBeDefined();
  });

  it('DeleteCardsUseCase repairs a missing Xiuyuan binding before batch delete', async () => {
    const { xiuyuan, cardIds } = createXiuyuanWithCards(1, '20260308010101-repair1', {
      ownership: 'riff-managed',
    });
    const { repository, storage, resetSaveCount, getSaveCount, getPersistedStore } =
      createPersistedRepositoryHarness();
    const seedResult = await repository.saveMany([xiuyuan]);
    expect(seedResult.ok).toBe(true);
    resetSaveCount();

    const xiuyuanId = xiuyuan.getId().getValue();
    const storageState = storage as unknown as {
      cardDTOs: Map<string, Record<string, unknown>>;
      xiuyuans: Map<string, Record<string, unknown>>;
    };
    const persistedCard = storageState.cardDTOs.get(cardIds[0]);
    expect(persistedCard).toBeDefined();
    if (!persistedCard) {
      return;
    }
    storageState.cardDTOs.set(cardIds[0], {
      ...persistedCard,
      xiuyuanID: undefined,
      meta: {
        ...(persistedCard.meta || {}),
        xiuyuanID: undefined,
      },
    });

    const persistedXiuyuan = storageState.xiuyuans.get(xiuyuanId);
    expect(persistedXiuyuan).toBeDefined();
    if (!persistedXiuyuan) {
      return;
    }
    storageState.xiuyuans.set(xiuyuanId, {
      ...persistedXiuyuan,
      meta: {
        ...(persistedXiuyuan.meta || {}),
        cardIds: [],
      },
    });

    const deletionTracker: IDeletionTracker = {
      markAsDeleted: vi.fn(),
      markManyAsDeleted: vi.fn(),
      isRecentlyDeleted: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
    };

    const useCase = new DeleteCardsUseCase(
      repository,
      new CardDeletionService(),
      new EventBus(),
      deletionTracker,
      { siyuanApi: createDeletionApiMock() }
    );

    const result = await useCase.execute({ cardIds });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      deletedCount: 1,
      failedCardIds: [],
    });
    expect(getSaveCount()).toBe(1);
    expect(getPersistedStore().deletedCardDTOs?.[cardIds[0]]).toBeDefined();
    expect(getPersistedStore().cardDTOs?.[cardIds[0]]).toBeUndefined();
  });
});
