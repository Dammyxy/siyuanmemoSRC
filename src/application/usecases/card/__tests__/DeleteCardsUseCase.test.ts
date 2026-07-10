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
import { CardsDeletedEvent } from '@/core/xiuyuan/domain/events/CardsDeletedEvent';
import { DeleteCardsUseCase } from '../DeleteCardsUseCase';

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createDescriptorXiuyuanWithTwoCards() {
  const conceptBlockId = '20260106000001-concept';
  const descriptorBlockId = '20260106000002-descrpt';

  const xiuyuan = must(
    Xiuyuan.create({
      blockIDs: [must(BlockId.create(conceptBlockId)), must(BlockId.create(descriptorBlockId))],
      templateID: must(TemplateId.create('builtin-concept-descriptor-both')),
      faces: [
        must(
          CardFace.create({
            question: conceptBlockId,
            answer: '作者->woz',
            questionBlockId: conceptBlockId,
            answerBlockId: descriptorBlockId,
          })
        ),
        must(
          CardFace.create({
            question: '作者->woz',
            answer: conceptBlockId,
            questionBlockId: descriptorBlockId,
            answerBlockId: conceptBlockId,
          })
        ),
      ],
    })
  );

  const card1 = must(xiuyuan.createCard(0));
  const card2 = must(xiuyuan.createCard(1));
  return {
    xiuyuan,
    cardIds: [card1.getId().getValue(), card2.getId().getValue()],
    descriptorBlockId,
  };
}

describe('DeleteCardsUseCase cleanup aggregation', () => {
  it('aggregates deleted card ids for the same block and cleans/riff once', async () => {
    const { xiuyuan, cardIds, descriptorBlockId } = createDescriptorXiuyuanWithTwoCards();
    const xiuyuanId = xiuyuan.getId().getValue();

    const repo: IXiuyuanRepository = {
      save: vi.fn().mockResolvedValue(ok(undefined)),
      findById: vi.fn().mockResolvedValue(ok(xiuyuan)),
      findByBlockId: vi.fn(),
      findAll: vi.fn().mockResolvedValue(ok([xiuyuan])),
      delete: vi.fn().mockResolvedValue(ok(undefined)),
      saveMany: vi.fn().mockResolvedValue(ok(undefined)),
      deleteMany: vi.fn().mockResolvedValue(ok(undefined)),
      getXiuyuanIdByCardId: vi.fn((cardId: string) => (cardIds.includes(cardId) ? xiuyuanId : undefined)),
    } as unknown as IXiuyuanRepository;

    const getBlockAttrsMock = vi.fn().mockResolvedValue({
      'custom-xiuyuan-id': 'xy_test',
      'custom-fsrs-card-type': 'descriptor',
      'custom-fsrs-image-occlusion': JSON.stringify({
        version: 2,
        masks: [{ id: 'm1' }, { id: 'm2' }],
        maskToCardId: {
          m1: cardIds[0],
          m2: cardIds[1],
        },
      }),
      'custom-fsrs-image-occlusion-version': '2',
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify(cardIds),
    });
    const setBlockAttrsMock = vi.fn().mockResolvedValue(undefined);
    const siyuanApi: CardDeletionSiyuanPort = {
      getBlockAttrs: getBlockAttrsMock,
      setBlockAttrs: setBlockAttrsMock,
    };

    const deletionTracker: IDeletionTracker = {
      markAsDeleted: vi.fn(),
      markManyAsDeleted: vi.fn(),
      isRecentlyDeleted: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
    };

    const eventBus = new EventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');

    const useCase = new DeleteCardsUseCase(
      repo,
      new CardDeletionService(),
      eventBus,
      deletionTracker,
      { siyuanApi }
    );

    const result = await useCase.execute({ cardIds });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.deletedCount).toBe(2);

    expect(setBlockAttrsMock).toHaveBeenCalledTimes(1);
    expect(setBlockAttrsMock).toHaveBeenCalledWith(
      descriptorBlockId,
      expect.objectContaining({
        'custom-fsrs-image-occlusion': '',
        'custom-fsrs-image-occlusion-version': '',
        'custom-fsrs-image-occlusion-card-ids': '',
      })
    );

    const deletionEvent = publishSpy.mock.calls[0]?.[0] as CardsDeletedEvent | undefined;
    expect(deletionEvent).toBeInstanceOf(CardsDeletedEvent);
    expect(deletionEvent?.blockIds).toEqual([descriptorBlockId]);
    expect(deletionTracker.markManyAsDeleted).toHaveBeenCalledWith([descriptorBlockId]);
  });
});
