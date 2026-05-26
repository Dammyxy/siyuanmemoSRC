import { beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok, type Result } from '@/types/result';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardState, CardType } from '@/types/card';
import type { IXiuyuan } from '../../types';
import { XiuyuanId } from '../../domain/XiuyuanId';
import { XiuyuanRepository } from '../XiuyuanRepository';

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createCardDTO(cardId: string): CardPersistenceDTO {
  const now = Date.now();
  return {
    id: cardId,
    blockId: '20220714182037-9weokvh',
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 0,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {
      faceIndex: 0,
    },
  };
}

function createXiuyuanData(id: string, cardIds: string[]): IXiuyuan {
  const now = Date.now();
  return {
    id,
    blockIDs: ['20220714182037-9weokvh'],
    fields: [
      {
        name: 'face-0',
        blockID: '20220714182037-9weokvh',
        marker: 'question',
      },
    ],
    templateID: 'basic',
    createdAt: now,
    updatedAt: now,
    meta: {
      priority: 0,
      faces: [
        {
          question: 'Q',
          answer: 'A',
          questionBlockId: '20220714182037-9weokvh',
          answerBlockId: '20220714182037-9weokvh',
        },
      ],
      cardIds: [...cardIds],
    },
  };
}

function createStorageMock(params: {
  byId?: IXiuyuan;
  all?: IXiuyuan[];
  cardDTOMap?: Record<string, CardPersistenceDTO>;
  cardDTOsByXiuyuanId?: Record<string, CardPersistenceDTO[]>;
  saveResult?: Result<void>;
}) {
  const dtoMap = new Map<string, CardPersistenceDTO>(Object.entries(params.cardDTOMap || {}));
  const byId = params.byId;
  const all = params.all || [];

  const storage = {
    getXiuYuan: vi.fn((id: string) => (byId && byId.id === id ? byId : undefined)),
    getAllXiuYuans: vi.fn(() => all),
    getCardDTO: vi.fn((cardId: string) => dtoMap.get(cardId)),
    getCardDTOsByXiuyuanId: vi.fn((xiuyuanId: string) => (
      params.cardDTOsByXiuyuanId?.[xiuyuanId]
      ?? Array.from(dtoMap.values()).filter((dto) => dto.xiuyuanID === xiuyuanId)
    )),
    upsertXiuYuan: vi.fn(),
    save: vi.fn(async () => params.saveResult ?? ok(undefined)),
  };

  return storage;
}

describe('XiuyuanRepository cardIds repair on read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repairs stale cardIds in findById and returns only resolvable cards', async () => {
    const xiuyuan = createXiuyuanData('xiuyuan-a', ['card-valid', 'card-missing']);
    const storage = createStorageMock({
      byId: xiuyuan,
      cardDTOMap: {
        'card-valid': createCardDTO('card-valid'),
      },
    });
    const repository = new XiuyuanRepository(storage as any);

    const result = await repository.findById(must(XiuyuanId.create('xiuyuan-a')));

    expect(result.ok).toBe(true);
    if (!result.ok || !result.value) return;
    expect(result.value.getCards()).toHaveLength(1);
    expect(storage.upsertXiuYuan).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledTimes(1);

    const repaired = storage.upsertXiuYuan.mock.calls[0]?.[0] as IXiuyuan;
    expect(repaired.meta?.cardIds).toEqual(['card-valid']);
  });

  it('batches multiple repairs in findAll and saves once', async () => {
    const xiuyuanA = createXiuyuanData('xiuyuan-a', ['card-a', 'missing-a']);
    const xiuyuanB = createXiuyuanData('xiuyuan-b', ['missing-b', 'card-b', 'missing-c']);
    const storage = createStorageMock({
      all: [xiuyuanA, xiuyuanB],
      cardDTOMap: {
        'card-a': createCardDTO('card-a'),
        'card-b': createCardDTO('card-b'),
      },
    });
    const repository = new XiuyuanRepository(storage as any);

    const result = await repository.findAll();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.getCards()).toHaveLength(1);
    expect(result.value[1]?.getCards()).toHaveLength(1);

    expect(storage.upsertXiuYuan).toHaveBeenCalledTimes(2);
    expect(storage.save).toHaveBeenCalledTimes(1);

    const repairedA = storage.upsertXiuYuan.mock.calls[0]?.[0] as IXiuyuan;
    const repairedB = storage.upsertXiuYuan.mock.calls[1]?.[0] as IXiuyuan;
    expect(repairedA.meta?.cardIds).toEqual(['card-a']);
    expect(repairedB.meta?.cardIds).toEqual(['card-b']);
  });

  it('rebuilds cards from xiuyuan-bound DTOs when persisted cardIds are missing', async () => {
    const xiuyuan = createXiuyuanData('xiuyuan-missing-cardids', []);
    delete (xiuyuan.meta as Record<string, unknown>).cardIds;
    const cardDTO: CardPersistenceDTO = {
      ...createCardDTO('card-recovered'),
      xiuyuanID: 'xiuyuan-missing-cardids',
    };
    const storage = createStorageMock({
      all: [xiuyuan],
      cardDTOMap: {
        'card-recovered': cardDTO,
      },
      cardDTOsByXiuyuanId: {
        'xiuyuan-missing-cardids': [cardDTO],
      },
    });
    const repository = new XiuyuanRepository(storage as any);

    const result = await repository.findAll();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.getCards().map((card) => card.getId().getValue())).toEqual(['card-recovered']);
    expect(repository.getXiuyuanIdByCardId('card-recovered')).toBe('xiuyuan-missing-cardids');
    expect(storage.getCardDTOsByXiuyuanId).toHaveBeenCalledWith('xiuyuan-missing-cardids');
    expect(storage.upsertXiuYuan).toHaveBeenCalledTimes(1);
    const repaired = storage.upsertXiuYuan.mock.calls[0]?.[0] as IXiuyuan;
    expect(repaired.meta?.cardIds).toEqual(['card-recovered']);
  });

  it('hydrates missing Xiuyuan faces and semantic metadata from bound card DTOs', async () => {
    const xiuyuan = createXiuyuanData('xiuyuan-half', []);
    xiuyuan.meta = {
      ownership: 'riff-managed',
      source: 'riff-sync',
    };
    const cardDTO: CardPersistenceDTO = {
      ...createCardDTO('card-semantic-half'),
      xiuyuanID: 'xiuyuan-half',
      type: CardType.Descriptor,
      templateID: 'builtin-riff-sync',
      frontBlockIDs: ['20260422074134-404qdfx'],
      backBlockIDs: ['20260422074141-s8fcj23'],
      fieldMapping: {
        concept: '20260422074134-404qdfx',
        descriptor: '20260422074141-s8fcj23',
      },
      meta: {
        faceIndex: 0,
        typeMarker: 'concept-descriptor',
        content: '界面→不支持跨卡片批量操作',
        faces: [{
          question: 'SRS卡片独立单元问题',
          answer: 'SRS卡片独立单元问题',
          questionBlockId: '20260422074134-404qdfx',
          answerBlockId: '20260422074141-s8fcj23',
        }],
      },
    };
    const storage = createStorageMock({
      all: [xiuyuan],
      cardDTOMap: {
        'card-semantic-half': cardDTO,
      },
      cardDTOsByXiuyuanId: {
        'xiuyuan-half': [cardDTO],
      },
    });
    const repository = new XiuyuanRepository(storage as any);

    const result = await repository.findAll();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [hydrated] = result.value;
    expect(hydrated?.getCards().map((card) => card.getId().getValue())).toEqual(['card-semantic-half']);
    expect(hydrated?.getFaces()[0]).toMatchObject({
      question: 'SRS卡片独立单元问题',
      questionBlockId: '20260422074134-404qdfx',
    });
    expect(hydrated?.getMeta()).toMatchObject({
      typeMarker: 'concept-descriptor',
      fieldMapping: {
        concept: '20260422074134-404qdfx',
        descriptor: '20260422074141-s8fcj23',
      },
    });
    expect(repository.getXiuyuanIdByCardId('card-semantic-half')).toBe('xiuyuan-half');
  });

  it('does not repair when cardIds are already consistent', async () => {
    const xiuyuan = createXiuyuanData('xiuyuan-c', ['card-c']);
    const storage = createStorageMock({
      all: [xiuyuan],
      cardDTOMap: {
        'card-c': createCardDTO('card-c'),
      },
    });
    const repository = new XiuyuanRepository(storage as any);

    const result = await repository.findAll();

    expect(result.ok).toBe(true);
    expect(storage.upsertXiuYuan).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('keeps read success when repair persistence fails', async () => {
    const xiuyuan = createXiuyuanData('xiuyuan-d', ['card-d', 'missing-d']);
    const storage = createStorageMock({
      byId: xiuyuan,
      cardDTOMap: {
        'card-d': createCardDTO('card-d'),
      },
      saveResult: err(new Error('persist failed')),
    });
    const repository = new XiuyuanRepository(storage as any);
    const result = await repository.findById(must(XiuyuanId.create('xiuyuan-d')));

    expect(result.ok).toBe(true);
    if (!result.ok || !result.value) return;
    expect(result.value.getCards()).toHaveLength(1);
    expect(storage.upsertXiuYuan).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });
});
