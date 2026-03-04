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
  saveResult?: Result<void>;
}) {
  const dtoMap = new Map<string, CardPersistenceDTO>(Object.entries(params.cardDTOMap || {}));
  const byId = params.byId;
  const all = params.all || [];

  const storage = {
    getXiuYuan: vi.fn((id: string) => (byId && byId.id === id ? byId : undefined)),
    getAllXiuYuans: vi.fn(() => all),
    getCardDTO: vi.fn((cardId: string) => dtoMap.get(cardId)),
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
