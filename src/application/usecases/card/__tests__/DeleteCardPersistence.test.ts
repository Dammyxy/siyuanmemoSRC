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

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createXiuyuanWithCards(faceCount = 1): { xiuyuan: Xiuyuan; cardIds: string[]; blockId: string } {
  const blockId = '20260308010101-cardblk';
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
    removeRiffCards: vi.fn().mockResolvedValue({ name: 'deck', size: 0 }),
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
    saveMany: vi.fn(),
    deleteMany: vi.fn(),
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
    expect(repo.delete).toHaveBeenCalledTimes(1);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
