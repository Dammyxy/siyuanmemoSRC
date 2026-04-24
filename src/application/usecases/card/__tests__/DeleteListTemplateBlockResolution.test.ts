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
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { CardDeletedEvent } from '@/core/xiuyuan/domain/events/CardDeletedEvent';
import { CardsDeletedEvent } from '@/core/xiuyuan/domain/events/CardsDeletedEvent';
import { DeleteCardUseCase } from '../DeleteCardUseCase';
import { DeleteCardsUseCase } from '../DeleteCardsUseCase';

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createListTemplateXiuyuan() {
  const parentParagraphId = '20260104000001-paragr4';
  const childBlockId = '20260104000002-child31';

  const xiuyuan = must(
    Xiuyuan.create({
      blockIDs: [must(BlockId.create(childBlockId)), must(BlockId.create(parentParagraphId))],
      templateID: must(TemplateId.create('builtin-list-item')),
      faces: [
        must(
          CardFace.create({
            question: parentParagraphId,
            answer: '提示→答案',
            questionBlockId: parentParagraphId,
            answerBlockId: childBlockId,
          })
        ),
      ],
    })
  );

  const card = must(xiuyuan.createCard(0));
  return { xiuyuan, cardId: card.getId().getValue(), parentParagraphId, childBlockId };
}

function createRepositoryMock(xiuyuan: Xiuyuan, cardId: string) {
  const xiuyuanId = xiuyuan.getId().getValue();
  return {
    save: vi.fn().mockResolvedValue(ok(undefined)),
    findById: vi.fn().mockResolvedValue(ok(xiuyuan)),
    findByBlockId: vi.fn(),
    findAll: vi.fn().mockResolvedValue(ok([xiuyuan])),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    saveMany: vi.fn(),
    deleteMany: vi.fn(),
    getXiuyuanIdByCardId: vi.fn((value: string) => (value === cardId ? xiuyuanId : undefined)),
  } as unknown as IXiuyuanRepository;
}

function createCardDeletionApiMock() {
  const getBlockAttrsMock = vi.fn().mockResolvedValue({
    'custom-xiuyuan-id': 'xy_test',
    'custom-fsrs-card-type': 'item',
  });
  const setBlockAttrsMock = vi.fn().mockResolvedValue(undefined);
  const removeRiffCardsMock = vi.fn().mockResolvedValue({ name: 'deck', size: 1 });

  const siyuanApi: CardDeletionSiyuanPort = {
    BUILTIN_DECK_ID: 'builtin-deck',
    getBlockAttrs: getBlockAttrsMock,
    setBlockAttrs: setBlockAttrsMock,
    removeRiffCards: removeRiffCardsMock,
  };

  return { siyuanApi, setBlockAttrsMock, removeRiffCardsMock };
}

describe('Delete list-template block resolution', () => {
  it('DeleteCardUseCase prefers backBlockId (child block) for builtin-list-item', async () => {
    const { xiuyuan, cardId, parentParagraphId, childBlockId } = createListTemplateXiuyuan();
    const repo = createRepositoryMock(xiuyuan, cardId);
    const { siyuanApi, setBlockAttrsMock } = createCardDeletionApiMock();
    const eventBus = new EventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');

    const useCase = new DeleteCardUseCase(
      repo,
      new CardDeletionService(),
      eventBus,
      { siyuanApi }
    );

    const result = await useCase.execute({ cardId });
    expect(result.ok).toBe(true);

    const cleanedBlockIds = setBlockAttrsMock.mock.calls.map((call) => call[0]);
    const deletionEvent = publishSpy.mock.calls
      .map((call) => call[0])
      .find((event): event is CardDeletedEvent => event instanceof CardDeletedEvent);

    expect(cleanedBlockIds).toContain(childBlockId);
    expect(cleanedBlockIds).not.toContain(parentParagraphId);
    expect(deletionEvent).toBeInstanceOf(CardDeletedEvent);
    expect(deletionEvent?.blockId).toBe(childBlockId);
  });

  it('DeleteCardsUseCase prefers backBlockId (child block) for builtin-list-item', async () => {
    const { xiuyuan, cardId, parentParagraphId, childBlockId } = createListTemplateXiuyuan();
    const repo = createRepositoryMock(xiuyuan, cardId);
    const { siyuanApi, setBlockAttrsMock } = createCardDeletionApiMock();
    const eventBus = new EventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');

    const deletionTracker: IDeletionTracker = {
      markAsDeleted: vi.fn(),
      markManyAsDeleted: vi.fn(),
      isRecentlyDeleted: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
    };

    const useCase = new DeleteCardsUseCase(
      repo,
      new CardDeletionService(),
      eventBus,
      deletionTracker,
      { siyuanApi }
    );

    const result = await useCase.execute({ cardIds: [cardId] });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.deletedCount).toBe(1);

    const cleanedBlockIds = setBlockAttrsMock.mock.calls.map((call) => call[0]);
    const deletionEvent = publishSpy.mock.calls
      .map((call) => call[0])
      .find((event): event is CardsDeletedEvent => event instanceof CardsDeletedEvent);

    expect(cleanedBlockIds).toContain(childBlockId);
    expect(cleanedBlockIds).not.toContain(parentParagraphId);
    expect(deletionEvent).toBeInstanceOf(CardsDeletedEvent);
    expect(deletionEvent?.blockIds).toEqual([childBlockId]);
    expect(deletionTracker.markManyAsDeleted).toHaveBeenCalledWith([childBlockId]);
  });
});
