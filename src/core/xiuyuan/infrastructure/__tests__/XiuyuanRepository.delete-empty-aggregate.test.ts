import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { XiuyuanRepository } from '../XiuyuanRepository';
import { Xiuyuan } from '../../domain/Xiuyuan';
import { BlockId } from '../../domain/BlockId';
import { TemplateId } from '../../domain/TemplateId';
import { CardFace } from '../../domain/CardFace';

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
  const xiuyuans = new Map<string, { id: string }>();

  return {
    mock: {
      runWriteTransaction: vi.fn(async (_label: string, operation: (transaction: unknown) => Promise<unknown>) => {
        return operation({ token: Symbol('test'), label: 'test' });
      }),
      getStoreData: vi.fn(() => ({
        version: 2,
        xiuyuans: Object.fromEntries(xiuyuans.entries()),
        cards: {},
        cardDTOs: {},
      })),
      restoreStoreSnapshot: vi.fn(),
      getXiuYuan: vi.fn((id: string) => xiuyuans.get(id)),
      upsertXiuYuan: vi.fn((xiuyuan: { id: string }) => {
        xiuyuans.set(xiuyuan.id, xiuyuan);
      }),
      getAllCards: vi.fn(() => []),
      getCardsByXiuyuanId: vi.fn(() => []),
      deleteCard: vi.fn(async () => undefined),
      getCard: vi.fn(),
      updateCard: vi.fn(async () => undefined),
      createCard: vi.fn(async () => undefined),
      save: vi.fn(async () => ok(undefined)),
      getAllXiuYuans: vi.fn(() => Array.from(xiuyuans.values())),
      deleteXiuYuan: vi.fn(async (xiuyuanId: string) => {
        xiuyuans.delete(xiuyuanId);
        return ok(undefined);
      }),
      getCardDTO: vi.fn(),
    },
  };
}

describe('XiuyuanRepository delete with empty aggregate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlockAttrsMock.mockResolvedValue({});
    setBlockAttrsMock.mockResolvedValue(undefined);
  });

  it('clears cardToXiuyuanIndex even when the aggregate has no cards left', async () => {
    const { mock: storageMock } = createStorageMock();
    const repository = new XiuyuanRepository(storageMock as any);

    const xiuyuan = must(
      Xiuyuan.create({
        blockIDs: [must(BlockId.create('20260308020202-cardblk'))],
        templateID: must(TemplateId.create('template-basic')),
        faces: [
          must(
            CardFace.create({
              question: 'Question',
              answer: 'Answer',
              questionBlockId: '20260308020202-cardblk',
              answerBlockId: '20260308020202-cardblk',
            })
          ),
        ],
      })
    );

    const card = must(xiuyuan.createCard(0));
    const cardId = card.getId().getValue();

    const saveResult = await repository.save(xiuyuan);
    expect(saveResult.ok).toBe(true);
    expect(repository.getXiuyuanIdByCardId(cardId)).toBe(xiuyuan.getId().getValue());

    must(xiuyuan.deleteCard(card.getId()));
    expect(xiuyuan.getCards()).toHaveLength(0);

    const deleteResult = await repository.delete(xiuyuan);
    expect(deleteResult.ok).toBe(true);
    expect(repository.getXiuyuanIdByCardId(cardId)).toBeUndefined();
  });
});
