import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedStorageManager, type UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import type { UnifiedStorageXiuyuanCardDelta } from '@/core/storage/UnifiedStorageManager';
import { CardState, CardType } from '@/types/card';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { BlockId } from '../../domain/BlockId';
import { CardFace } from '../../domain/CardFace';
import { CardId } from '../../domain/CardId';
import { TemplateId } from '../../domain/TemplateId';
import { Xiuyuan } from '../../domain/Xiuyuan';
import { XiuyuanId } from '../../domain/XiuyuanId';
import { XiuyuanRepository } from '../XiuyuanRepository';

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

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyStore(): UnifiedCardStore {
  return {
    version: 2,
    xiuyuans: {},
    cards: {},
    cardDTOs: {},
    deletedCardDTOs: {},
    deletedXiuyuans: {},
    riffBlacklist: [],
    riffSyncState: {},
  };
}

function createQuickXiuyuan(blockId: string, cardId?: string): Xiuyuan {
  const xiuyuan = must(
    Xiuyuan.create({
      blockIDs: [must(BlockId.create(blockId))],
      templateID: must(TemplateId.create('builtin-quick-card')),
      faces: [
        must(
          CardFace.create({
            question: `Question ${blockId}`,
            answer: `Answer ${blockId}`,
            questionBlockId: blockId,
            answerBlockId: blockId,
          }),
        ),
      ],
      meta: {
        cardType: 'item',
        source: 'symbol',
        symbolDetected: true,
      },
    }),
  );
  must(xiuyuan.createCard(0, cardId ? must(CardId.create(cardId)) : undefined));
  return xiuyuan;
}

function createStoredDTO(params: {
  id: string;
  xiuyuanID: string;
  blockId: string;
  faceIndex?: number;
}): CardPersistenceDTO {
  const now = 1_700_000_000_000;
  const faceIndex = params.faceIndex ?? 0;
  return {
    id: params.id,
    blockId: params.blockId,
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learning_step: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    xiuyuanID: params.xiuyuanID,
    templateID: 'builtin-quick-card',
    frontBlockIDs: [params.blockId],
    backBlockIDs: [params.blockId],
    xiuyuanPriority: 50,
    meta: {
      xiuyuanID: params.xiuyuanID,
      faceIndex,
    },
  };
}

describe('XiuyuanRepository delta persistence routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlockAttrsMock.mockResolvedValue({});
    setBlockAttrsMock.mockResolvedValue(undefined);
  });

  it('routes one upsert-only Xiuyuan save through delta persistence', async () => {
    const storage = new UnifiedStorageManager();
    const repository = new XiuyuanRepository(storage);
    let persistedStore = createEmptyStore();
    const fullSave = vi.fn(async (store: UnifiedCardStore) => {
      persistedStore = deepClone(store);
    });
    const deltaSave = vi.fn(async (_delta: UnifiedStorageXiuyuanCardDelta) => undefined);
    storage.setPersistenceCallbacks(fullSave, async () => deepClone(persistedStore), {
      saveXiuyuanCardDelta: deltaSave,
    });
    expect((await storage.load()).ok).toBe(true);

    const xiuyuan = createQuickXiuyuan('20260626000001-fast001', 'card-fast-001');
    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(deltaSave).toHaveBeenCalledTimes(1);
    expect(fullSave).not.toHaveBeenCalled();
    expect(deltaSave.mock.calls[0]?.[0]).toMatchObject({
      xiuyuans: {
        [xiuyuan.getId().getValue()]: {
          id: xiuyuan.getId().getValue(),
          blockIDs: ['20260626000001-fast001'],
        },
      },
      cardDTOs: {
        'card-fast-001': {
          id: 'card-fast-001',
          blockId: '20260626000001-fast001',
          xiuyuanID: xiuyuan.getId().getValue(),
        },
      },
    });
  });

  it('routes batch upsert-only Xiuyuan saves through one delta persistence call', async () => {
    const storage = new UnifiedStorageManager();
    const repository = new XiuyuanRepository(storage);
    let persistedStore = createEmptyStore();
    const fullSave = vi.fn(async (store: UnifiedCardStore) => {
      persistedStore = deepClone(store);
    });
    const deltaSave = vi.fn(async (_delta: UnifiedStorageXiuyuanCardDelta) => undefined);
    storage.setPersistenceCallbacks(fullSave, async () => deepClone(persistedStore), {
      saveXiuyuanCardDelta: deltaSave,
    });
    expect((await storage.load()).ok).toBe(true);

    const first = createQuickXiuyuan('20260626000002-fast002', 'card-fast-002');
    const second = createQuickXiuyuan('20260626000003-fast003', 'card-fast-003');
    const result = await repository.saveMany([first, second]);

    expect(result.ok).toBe(true);
    expect(deltaSave).toHaveBeenCalledTimes(1);
    expect(fullSave).not.toHaveBeenCalled();
    expect(Object.keys(deltaSave.mock.calls[0]?.[0].xiuyuans ?? {}).sort()).toEqual([
      first.getId().getValue(),
      second.getId().getValue(),
    ].sort());
    expect(Object.keys(deltaSave.mock.calls[0]?.[0].cardDTOs ?? {}).sort()).toEqual([
      'card-fast-002',
      'card-fast-003',
    ]);
  });

  it('uses full save when saving would remove an existing persisted card', async () => {
    const storage = new UnifiedStorageManager();
    const repository = new XiuyuanRepository(storage);
    const xiuyuanId = must(XiuyuanId.create('xy-existing-delta-unsafe'));
    const currentCardId = 'card-current-delta-unsafe';
    const staleCardId = 'card-stale-delta-unsafe';
    const blockId = '20260626000004-unsafe1';
    const currentDTO = createStoredDTO({
      id: currentCardId,
      xiuyuanID: xiuyuanId.getValue(),
      blockId,
      faceIndex: 0,
    });
    const staleDTO = createStoredDTO({
      id: staleCardId,
      xiuyuanID: xiuyuanId.getValue(),
      blockId,
      faceIndex: 1,
    });
    let persistedStore: UnifiedCardStore = {
      ...createEmptyStore(),
      xiuyuans: {
        [xiuyuanId.getValue()]: {
          id: xiuyuanId.getValue(),
          blockIDs: [blockId],
          templateID: 'builtin-quick-card',
          fields: [{ name: 'content', blockID: blockId }],
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
      },
      cardDTOs: {
        [currentCardId]: currentDTO,
        [staleCardId]: staleDTO,
      },
    };
    const fullSave = vi.fn(async (store: UnifiedCardStore) => {
      persistedStore = deepClone(store);
    });
    const deltaSave = vi.fn(async (_delta: UnifiedStorageXiuyuanCardDelta) => undefined);
    storage.setPersistenceCallbacks(fullSave, async () => deepClone(persistedStore), {
      saveXiuyuanCardDelta: deltaSave,
    });
    expect((await storage.load()).ok).toBe(true);

    const xiuyuan = must(
      Xiuyuan.create({
        id: xiuyuanId,
        blockIDs: [must(BlockId.create(blockId))],
        templateID: must(TemplateId.create('builtin-quick-card')),
        faces: [
          must(
            CardFace.create({
              question: 'Current question',
              answer: 'Current answer',
              questionBlockId: blockId,
              answerBlockId: blockId,
            }),
          ),
        ],
        meta: {
          cardType: 'item',
        },
      }),
    );
    must(xiuyuan.createCard(0, must(CardId.create(currentCardId))));

    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(deltaSave).not.toHaveBeenCalled();
    expect(fullSave).toHaveBeenCalledTimes(1);
    expect(persistedStore.cardDTOs?.[currentCardId]).toBeDefined();
    expect(persistedStore.cardDTOs?.[staleCardId]).toBeUndefined();
  });

  it('rolls back in-memory storage when delta persistence fails', async () => {
    const storage = new UnifiedStorageManager();
    const repository = new XiuyuanRepository(storage);
    let persistedStore = createEmptyStore();
    storage.setPersistenceCallbacks(
      async (store: UnifiedCardStore) => {
        persistedStore = deepClone(store);
      },
      async () => deepClone(persistedStore),
      {
        saveXiuyuanCardDelta: async () => {
          throw new Error('delta write failed');
        },
      },
    );
    expect((await storage.load()).ok).toBe(true);

    const xiuyuan = createQuickXiuyuan('20260626000005-fail001', 'card-fail-001');
    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(false);
    expect(storage.getXiuYuan(xiuyuan.getId().getValue())).toBeUndefined();
    expect(storage.getCard('card-fail-001')).toBeUndefined();
  });
});
