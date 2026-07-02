import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import type { FSRSCard } from '@/types/card';
import { XiuyuanRepository } from '../XiuyuanRepository';
import { Xiuyuan } from '../../domain/Xiuyuan';
import { BlockId } from '../../domain/BlockId';
import { TemplateId } from '../../domain/TemplateId';
import { CardFace } from '../../domain/CardFace';
import { Priority } from '../../domain/Priority';

const { getBlockAttrsMock, setBlockAttrsMock } = vi.hoisted(() => ({
  getBlockAttrsMock: vi.fn(),
  setBlockAttrsMock: vi.fn(),
}));

vi.mock('@/core/siyuan/api', () => ({
  getBlockAttrs: getBlockAttrsMock,
  setBlockAttrs: setBlockAttrsMock,
}));

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createStorageMock() {
  const xiuyuanStore = new Map<string, unknown>();
  const cardStore = new Map<string, FSRSCard>();

  const createCard = vi.fn(async (_: unknown, card: FSRSCard) => {
    cardStore.set(card.id, card);
  });

  const updateCard = vi.fn(async (card: FSRSCard) => {
    cardStore.set(card.id, card);
  });

  return {
    mock: {
      runWriteTransaction: vi.fn(async (_label: string, operation: () => unknown) => operation()),
      getStoreData: vi.fn(() => ({
        version: 1,
        xiuyuans: Object.fromEntries(xiuyuanStore),
        cards: Object.fromEntries(cardStore),
        cardDTOs: {},
      })),
      restoreStoreSnapshot: vi.fn((snapshot: {
        xiuyuans?: Record<string, unknown>;
        cards?: Record<string, FSRSCard>;
      }) => {
        xiuyuanStore.clear();
        cardStore.clear();
        for (const [id, xiuyuan] of Object.entries(snapshot.xiuyuans ?? {})) {
          xiuyuanStore.set(id, xiuyuan);
        }
        for (const [id, card] of Object.entries(snapshot.cards ?? {})) {
          cardStore.set(id, card);
        }
      }),
      getXiuYuan: vi.fn((xiuyuanId: string) => xiuyuanStore.get(xiuyuanId)),
      upsertXiuYuan: vi.fn((xiuyuan: { id: string }) => {
        xiuyuanStore.set(xiuyuan.id, xiuyuan);
      }),
      getAllCards: vi.fn(() => Array.from(cardStore.values())),
      getCardsByBlockId: vi.fn(() => []),
      getCardsByXiuyuanId: vi.fn(() => []),
      deleteCard: vi.fn(async () => undefined),
      getCard: vi.fn((cardId: string) => cardStore.get(cardId)),
      updateCard,
      createCard,
      saveXiuyuanCardDelta: vi.fn(async () => ok({ mode: 'delta' as const })),
      save: vi.fn(async () => ok(undefined)),
      getAllXiuYuans: vi.fn(() => Array.from(xiuyuanStore.values())),
      deleteXiuYuan: vi.fn(async () => ok(undefined)),
      getCardDTO: vi.fn(),
    },
    createCard,
  };
}

describe('XiuyuanRepository list-template split-v2 mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlockAttrsMock.mockResolvedValue({});
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
        'custom-xiuyuan-id': xiuyuan.getId().getValue(),
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

  it('projects list-template source and direct-path metadata into FSRS meta.allChildren', async () => {
    const { mock: storageMock, createCard } = createStorageMock();
    const repository = new XiuyuanRepository(storageMock as any);

    const parentParagraphId = '20260103100001-paragr1';
    const child1 = '20260103100002-child01';
    const child2 = '20260103100003-child02';

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
              answer: '类型→描述性（非规范性）',
              questionBlockId: parentParagraphId,
              answerBlockId: child1,
            })
          ),
        ],
        meta: {
          listTemplate: {
            mode: 'split-v2',
            currentIndex: 0,
            childrenData: [
              {
                id: child1,
                cue: '类型',
                answer: '描述性（非规范性）',
                index: 0,
                source: '类型→描述性（非规范性）',
                directPath: [
                  { kind: 'concept', label: '[[基于识别的决策模型（RPD）]]', blockId: '20260103100000-concp01' },
                  { kind: 'group', label: '特征', blockId: parentParagraphId },
                ],
              },
              {
                id: child2,
                cue: '基础',
                answer: '经验识别',
                index: 1,
                source: '基础→经验识别',
                directPath: [
                  { kind: 'concept', label: '[[基于识别的决策模型（RPD）]]', blockId: '20260103100000-concp01' },
                  { kind: 'group', label: '特征', blockId: parentParagraphId },
                ],
              },
            ],
          },
        },
      })
    );
    must(xiuyuan.createCard(0));

    const saveResult = await repository.save(xiuyuan);
    expect(saveResult.ok).toBe(true);

    const savedFsrsCard = createCard.mock.calls[0]?.[1] as FSRSCard;
    const allChildren = savedFsrsCard.meta?.allChildren as Array<{
      source?: string;
      directPath?: Array<{ kind?: string; label?: string }>;
    }>;

    expect(allChildren[0]?.source).toBe('类型→描述性（非规范性）');
    expect(allChildren[0]?.directPath).toEqual([
      { kind: 'concept', label: '[[基于识别的决策模型（RPD）]]', blockId: '20260103100000-concp01' },
      { kind: 'group', label: '特征', blockId: parentParagraphId },
    ]);
  });
  it('deletes stale cards for the same xiuyuan via xiuyuan index without scanning all cards', async () => {
    const { mock: storageMock } = createStorageMock();
    storageMock.getAllCards.mockImplementation(() => {
      throw new Error('save() should not scan all cards');
    });

    const repository = new XiuyuanRepository(storageMock as any);
    const blockId = '20260104000001-abc1234';
    const staleCardId = '20260104000002-def5678';
    const xiuyuan = must(
      Xiuyuan.create({
        blockIDs: [must(BlockId.create(blockId))],
        templateID: must(TemplateId.create('builtin-multi-cloze')),
        faces: [
          must(
            CardFace.create({
              question: 'Q',
              answer: 'A',
              questionBlockId: blockId,
              answerBlockId: blockId,
            })
          ),
        ],
      })
    );
    must(xiuyuan.createCard(0));

    const xiuyuanId = xiuyuan.getId().getValue();
    storageMock.getCardsByXiuyuanId.mockReturnValue([
      {
        id: staleCardId,
        blockId,
        meta: { xiuyuanID: xiuyuanId },
      } as unknown as FSRSCard,
    ]);

    const saveResult = await repository.save(xiuyuan);

    expect(saveResult.ok).toBe(true);
    expect(storageMock.getCardsByXiuyuanId).toHaveBeenCalledWith(xiuyuanId);
    expect(storageMock.getAllCards).not.toHaveBeenCalled();
    expect(storageMock.deleteCard).toHaveBeenCalledWith(staleCardId);
  });

  it('does not persist custom-fsrs-card-type for progressive-owned cards', async () => {
    const { mock: storageMock } = createStorageMock();
    const repository = new XiuyuanRepository(storageMock as any);
    const cases = [
      {
        blockId: '20260405000001-exc1234',
        cardType: 'topic' as const,
        progressive: {
          kind: 'excerpt',
          sourceDocId: 'doc-source-1',
          sourceBlockId: 'block-source-1',
        },
      },
      {
        blockId: '20260405000002-piece12',
        cardType: 'topic' as const,
        progressive: {
          kind: 'piece',
          sessionId: 'session-1',
          mode: 'linear',
          pieceDocId: '20260405000002-piece12',
          pieceIndex: 0,
          sourceDocId: 'doc-source-1',
        },
      },
      {
        blockId: '20260405000003-derive1',
        cardType: 'item' as const,
        progressive: {
          kind: 'derived-item',
          sourceDocId: 'doc-source-1',
          sourceBlockId: 'block-source-1',
          parentTopicCardId: 'topic-card-1',
          storageMode: 'workbench',
        },
      },
    ];

    for (const testCase of cases) {
      const xiuyuan = must(
        Xiuyuan.create({
          blockIDs: [must(BlockId.create(testCase.blockId))],
          templateID: must(TemplateId.create('builtin-topic')),
          faces: [
            must(
              CardFace.create({
                question: testCase.blockId,
                answer: '',
                questionBlockId: testCase.blockId,
              })
            ),
          ],
          priority: must(Priority.create(50)),
          meta: {
            cardType: testCase.cardType,
            progressive: testCase.progressive,
          },
        })
      );
      must(xiuyuan.createCard(0));

      const saveResult = await repository.save(xiuyuan);
      expect(saveResult.ok).toBe(true);

      expect(setBlockAttrsMock).toHaveBeenCalledWith(
        testCase.blockId,
        {
          'custom-xiuyuan-id': xiuyuan.getId().getValue(),
          'custom-fsrs-card-type': '',
        },
      );
    }
    expect(setBlockAttrsMock).toHaveBeenCalledTimes(cases.length);
  });
});
