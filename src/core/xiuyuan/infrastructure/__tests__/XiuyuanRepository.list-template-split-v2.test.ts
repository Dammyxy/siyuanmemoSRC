import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import type { FSRSCard } from '@/types/card';
import { XiuyuanRepository } from '../XiuyuanRepository';
import { Xiuyuan } from '../../domain/Xiuyuan';
import { BlockId } from '../../domain/BlockId';
import { TemplateId } from '../../domain/TemplateId';
import { CardFace } from '../../domain/CardFace';
import { Priority } from '../../domain/Priority';

const { setBlockAttrsMock } = vi.hoisted(() => ({
  setBlockAttrsMock: vi.fn(),
}));

vi.mock('@/core/siyuan/api', () => ({
  setBlockAttrs: setBlockAttrsMock,
}));

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createStorageMock() {
  const cardStore = new Map<string, FSRSCard>();

  const createCard = vi.fn(async (_: unknown, card: FSRSCard) => {
    cardStore.set(card.id, card);
  });

  const updateCard = vi.fn(async (card: FSRSCard) => {
    cardStore.set(card.id, card);
  });

  return {
    mock: {
      getXiuYuan: vi.fn(() => undefined),
      upsertXiuYuan: vi.fn(),
      getAllCards: vi.fn(() => []),
      deleteCard: vi.fn(async () => undefined),
      getCard: vi.fn((cardId: string) => cardStore.get(cardId)),
      updateCard,
      createCard,
      save: vi.fn(async () => ok(undefined)),
      getAllXiuYuans: vi.fn(() => []),
      deleteXiuYuan: vi.fn(async () => ok(undefined)),
      getCardDTO: vi.fn(),
    },
    createCard,
  };
}

describe('XiuyuanRepository list-template split-v2 mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBlockAttrsMock.mockResolvedValue(undefined);
  });

  it('uses meta.listTemplate.currentIndex as override for cue/answer/currentIndex in split-v2', async () => {
    const { mock: storageMock, createCard } = createStorageMock();
    const repository = new XiuyuanRepository(storageMock as any);

    const childBlockId = '20260102000002-child11';
    const parentParagraphId = '20260102000001-paragr2';

    const xiuyuan = must(
      Xiuyuan.create({
        blockIDs: [must(BlockId.create(childBlockId)), must(BlockId.create(parentParagraphId))],
        templateID: must(TemplateId.create('builtin-list-item')),
        faces: [
          must(
            CardFace.create({
              question: parentParagraphId,
              answer: '提示1→答案1',
              questionBlockId: parentParagraphId,
              answerBlockId: childBlockId,
            })
          ),
        ],
        priority: must(Priority.create(50)),
        meta: {
          listTemplate: {
            mode: 'split-v2',
            currentIndex: 2,
            childrenData: [
              { id: '20260102000003-child12', cue: '提示1', answer: '答案1', index: 0 },
              { id: '20260102000004-child13', cue: '提示2', answer: '答案2', index: 1 },
              { id: '20260102000005-child14', cue: '提示3', answer: '答案3', index: 2 },
            ],
          },
        },
      })
    );
    must(xiuyuan.createCard(0));

    const saveResult = await repository.save(xiuyuan);
    expect(saveResult.ok).toBe(true);

    const savedFsrsCard = createCard.mock.calls[0]?.[1] as FSRSCard;
    expect(savedFsrsCard.blockId).toBe(childBlockId);
    expect(savedFsrsCard.meta?.currentIndex).toBe(2);
    expect(savedFsrsCard.meta?.cue).toBe('提示3');
    expect(savedFsrsCard.meta?.answer).toBe('答案3');
    expect(Array.isArray(savedFsrsCard.meta?.allChildren)).toBe(true);
    expect((savedFsrsCard.meta?.allChildren as unknown[]).length).toBe(3);

    // split-v2 should only write representative child attrs once.
    expect(setBlockAttrsMock).toHaveBeenCalledTimes(1);
    expect(setBlockAttrsMock).toHaveBeenCalledWith(
      childBlockId,
      expect.objectContaining({
        'custom-fsrs-card-type': 'item',
      })
    );
  });

  it('keeps legacy model behavior by falling back to faceIndex when no currentIndex override', async () => {
    const { mock: storageMock, createCard } = createStorageMock();
    const repository = new XiuyuanRepository(storageMock as any);

    const parentParagraphId = '20260103000001-paragr3';
    const child1 = '20260103000002-child21';
    const child2 = '20260103000003-child22';

    const xiuyuan = must(
      Xiuyuan.create({
        blockIDs: [
          must(BlockId.create(parentParagraphId)),
          must(BlockId.create(child1)),
          must(BlockId.create(child2)),
        ],
        templateID: must(TemplateId.create('builtin-list-item')),
        faces: [
          must(
            CardFace.create({
              question: parentParagraphId,
              answer: '提示1→答案1',
              questionBlockId: parentParagraphId,
              answerBlockId: child1,
            })
          ),
          must(
            CardFace.create({
              question: parentParagraphId,
              answer: '提示2→答案2',
              questionBlockId: parentParagraphId,
              answerBlockId: child2,
            })
          ),
        ],
        meta: {
          listTemplate: {
            childrenData: [
              { id: child1, cue: '提示1', answer: '答案1', index: 0 },
              { id: child2, cue: '提示2', answer: '答案2', index: 1 },
            ],
          },
        },
      })
    );
    must(xiuyuan.createCard(1));

    const saveResult = await repository.save(xiuyuan);
    expect(saveResult.ok).toBe(true);

    const savedFsrsCard = createCard.mock.calls[0]?.[1] as FSRSCard;
    expect(savedFsrsCard.meta?.currentIndex).toBe(1);
    expect(savedFsrsCard.meta?.cue).toBe('提示2');
    expect(savedFsrsCard.meta?.answer).toBe('答案2');
  });
});
