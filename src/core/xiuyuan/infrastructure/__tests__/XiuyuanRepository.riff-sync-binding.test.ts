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
  const xiuyuanStore = new Map<string, unknown>();
  const cardStore = new Map<string, unknown>();

  return {
    runWriteTransaction: vi.fn(async (_label: string, operation: () => unknown) => operation()),
    getStoreData: vi.fn(() => ({
      version: 1,
      xiuyuans: Object.fromEntries(xiuyuanStore),
      cards: Object.fromEntries(cardStore),
      cardDTOs: {},
    })),
    restoreStoreSnapshot: vi.fn((snapshot: {
      xiuyuans?: Record<string, unknown>;
      cards?: Record<string, unknown>;
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
    deleteCard: vi.fn(async () => ok(undefined)),
    getCard: vi.fn(() => undefined),
    updateCard: vi.fn(async () => ok(undefined)),
    createCard: vi.fn(async (_xiuyuan: unknown, card: { id: string }) => {
      cardStore.set(card.id, card);
      return ok(undefined);
    }),
    save: vi.fn(async () => ok(undefined)),
    getAllXiuYuans: vi.fn(() => Array.from(xiuyuanStore.values())),
    deleteXiuYuan: vi.fn(async (xiuyuanId: string) => {
      xiuyuanStore.delete(xiuyuanId);
      return ok(undefined);
    }),
    getCardDTO: vi.fn(),
  };
}

function createManagedRiffXiuyuan(meta: Record<string, unknown> = {}): Xiuyuan {
  return must(
    Xiuyuan.create({
      blockIDs: [must(BlockId.create('20260102000001-riff001'))],
      templateID: must(TemplateId.create('builtin-riff-sync')),
      faces: [
        must(
          CardFace.create({
            question: 'What is Riff sync?',
            answer: 'Managed by incremental sync',
          })
        ),
      ],
      meta: {
        source: 'riff-sync',
        ...meta,
      },
    })
  );
}

function createProgressiveTopicXiuyuan(): Xiuyuan {
  const xiuyuan = must(
    Xiuyuan.create({
      blockIDs: [must(BlockId.create('20260102000002-topic01'))],
      templateID: must(TemplateId.create('builtin-topic')),
      faces: [
        must(
          CardFace.create({
            question: '20260102000002-topic01',
            answer: '',
            questionBlockId: '20260102000002-topic01',
          })
        ),
      ],
      meta: {
        cardType: 'topic',
        progressive: {
          kind: 'excerpt',
          sourceDocId: '20260102000000-source1',
          sourceBlockId: '20260102000000-block01',
        },
      },
    })
  );
  must(xiuyuan.createCard(0));
  return xiuyuan;
}

function createOrdinaryItemXiuyuan(): Xiuyuan {
  const xiuyuan = must(
    Xiuyuan.create({
      blockIDs: [must(BlockId.create('20260102000003-item001'))],
      templateID: must(TemplateId.create('builtin-quick-card')),
      faces: [
        must(
          CardFace.create({
            question: 'Question',
            answer: 'Answer',
            questionBlockId: '20260102000003-item001',
            answerBlockId: '20260102000003-item001',
          })
        ),
      ],
      meta: {
        cardType: 'item',
      },
    })
  );
  must(xiuyuan.createCard(0));
  return xiuyuan;
}

describe('XiuyuanRepository managed riff binding attrs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlockAttrsMock.mockResolvedValue({});
    setBlockAttrsMock.mockResolvedValue(undefined);
  });

  it('does not persist custom-xiuyuan-id for managed riff xiuyuans on save', async () => {
    const repository = new XiuyuanRepository(createStorageMock() as any);
    const xiuyuan = createManagedRiffXiuyuan();

    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(setBlockAttrsMock).not.toHaveBeenCalled();
  });

  it('does not persist deprecated card type attrs for managed riff xiuyuans', async () => {
    const repository = new XiuyuanRepository(createStorageMock() as any);
    const xiuyuan = createManagedRiffXiuyuan({ cardType: 'topic' });

    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(setBlockAttrsMock).not.toHaveBeenCalled();
  });

  it('persists only xiuyuan binding attrs for ordinary xiuyuans', async () => {
    const repository = new XiuyuanRepository(createStorageMock() as any);
    const xiuyuan = createOrdinaryItemXiuyuan();

    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(setBlockAttrsMock).toHaveBeenCalledWith(
      '20260102000003-item001',
      { 'custom-xiuyuan-id': xiuyuan.getId().getValue() }
    );
  });

  it('skips representative attr writes when persisted binding attrs are already current', async () => {
    const repository = new XiuyuanRepository(createStorageMock() as any);
    const xiuyuan = createProgressiveTopicXiuyuan();
    getBlockAttrsMock.mockResolvedValue({
      'custom-xiuyuan-id': xiuyuan.getId().getValue(),
    });

    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(getBlockAttrsMock).toHaveBeenCalledWith('20260102000002-topic01');
    expect(setBlockAttrsMock).not.toHaveBeenCalled();
  });

  it('still writes representative attrs when persisted binding attrs are stale', async () => {
    const repository = new XiuyuanRepository(createStorageMock() as any);
    const xiuyuan = createProgressiveTopicXiuyuan();
    getBlockAttrsMock.mockResolvedValue({
      'custom-xiuyuan-id': 'xiuyuan-stale',
      'custom-fsrs-card-type': 'topic',
    });

    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(setBlockAttrsMock).toHaveBeenCalledWith(
      '20260102000002-topic01',
      {
        'custom-xiuyuan-id': xiuyuan.getId().getValue(),
        'custom-fsrs-card-type': '',
      }
    );
  });

  it('does not clear custom-xiuyuan-id for managed riff xiuyuans on delete', async () => {
    const storageMock = createStorageMock();
    const repository = new XiuyuanRepository(storageMock as any);
    const xiuyuan = createManagedRiffXiuyuan();

    const result = await repository.delete(xiuyuan);

    expect(result.ok).toBe(true);
    expect(storageMock.deleteXiuYuan).toHaveBeenCalledWith(xiuyuan.getId().getValue());
    expect(setBlockAttrsMock).not.toHaveBeenCalled();
  });
});
