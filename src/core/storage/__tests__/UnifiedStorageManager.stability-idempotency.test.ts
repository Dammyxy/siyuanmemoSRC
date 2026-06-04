import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedStorageManager, type UnifiedCardStore } from '../UnifiedStorageManager';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardState, CardType } from '@/types/card';
import { mergeCardDTOsLocalFirst } from '../stability/logicalKeys';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyStore(): UnifiedCardStore {
  return {
    version: 1,
    xiuyuans: {},
    cards: {},
    cardDTOs: {},
    riffBlacklist: [],
  };
}

function createXiuyuan(id: string, blockId: string, updatedAt: number): IXiuyuan {
  return {
    id,
    blockIDs: [blockId],
    fields: [{ name: 'content', blockID: blockId }],
    templateID: 'builtin-quick-card',
    createdAt: updatedAt - 1000,
    updatedAt,
    meta: {
      cardIds: [],
    },
  };
}

function createDTO(
  cardId: string,
  xiuyuanId: string,
  faceIndex: number,
  overrides: Partial<CardPersistenceDTO> = {},
): CardPersistenceDTO {
  const now = 1_710_000_000_000 + faceIndex;
  return {
    id: cardId,
    blockId: `block-${cardId}`,
    due: now + 86_400_000,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 1,
    learning_step: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    xiuyuanID: xiuyuanId,
    templateID: 'builtin-quick-card',
    frontBlockIDs: [`block-${cardId}`],
    backBlockIDs: [],
    xiuyuanPriority: 50,
    meta: {
      faceIndex,
    },
    ...overrides,
  };
}

function createCdfXiuyuan(
  id: string,
  sourceBlockId: string,
  conceptBlockId: string,
  liveRelationKey: string,
  updatedAt: number,
): IXiuyuan {
  return {
    id,
    blockIDs: [conceptBlockId, sourceBlockId],
    fields: [
      { name: 'concept', blockID: conceptBlockId },
      { name: 'definition', blockID: sourceBlockId },
    ],
    templateID: 'builtin-concept-definition-forward',
    createdAt: updatedAt - 1000,
    updatedAt,
    meta: {
      liveRelationKey,
      relationAuthority: 'live-backlink',
      sourceBlockId,
      conceptBlockId,
      relationKind: 'definition-forward',
      cardIds: [],
    },
  };
}

function createCdfDTO(
  cardId: string,
  xiuyuanId: string,
  sourceBlockId: string,
  conceptBlockId: string,
  liveRelationKey: string,
): CardPersistenceDTO {
  return createDTO(cardId, xiuyuanId, 0, {
    blockId: sourceBlockId,
    type: CardType.Concept,
    templateID: 'builtin-concept-definition-forward',
    frontBlockIDs: [conceptBlockId],
    backBlockIDs: [sourceBlockId],
    fieldMapping: {
      concept: conceptBlockId,
      definition: sourceBlockId,
    },
    meta: {
      faceIndex: 0,
      liveRelationKey,
      relationAuthority: 'live-backlink',
      sourceBlockId,
      conceptBlockId,
      relationKind: 'definition-forward',
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-complete',
    },
  });
}

describe('UnifiedStorageManager stability and idempotency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('canonicalizes duplicate xiuyuans with the same logical block on load', async () => {
    const remoteStore: UnifiedCardStore = {
      version: 1,
      xiuyuans: {
        'xy-a': createXiuyuan('xy-a', 'shared-block', 2_000),
        'xy-b': createXiuyuan('xy-b', 'shared-block', 1_000),
      },
      cards: {},
      cardDTOs: {
        'card-a': createDTO('card-a', 'xy-a', 0),
        'card-b': createDTO('card-b', 'xy-b', 1),
      },
      riffBlacklist: [],
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async () => {},
      async () => deepClone(remoteStore),
    );

    const result = await storage.load();

    expect(result.ok).toBe(true);
    expect(storage.getAllXiuYuans().map((xiuyuan) => xiuyuan.id)).toEqual(['xy-a']);
    expect(storage.getAllCards().map((card) => card.xiuyuanID)).toEqual(['xy-a', 'xy-a']);
  });

  it('merges logical duplicate cards locally first instead of creating a second card', async () => {
    let remoteStore = createEmptyStore();
    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async (store) => {
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore),
    );

    const localXiuyuan = createXiuyuan('xy-local', 'shared-block', 1_000);
    const remoteXiuyuan = createXiuyuan('xy-remote', 'shared-block', 2_000);

    const localCreate = await storage.createCardDTO(localXiuyuan, createDTO('card-local', 'xy-local', 0, {
      due: 1_000,
      scheduledDays: 2,
      reps: 7,
      priority: 11,
      meta: {
        faceIndex: 0,
        localOnly: true,
      },
    }));
    const remoteCreate = await storage.createCardDTO(remoteXiuyuan, createDTO('card-remote', 'xy-remote', 0, {
      due: 9_000,
      scheduledDays: 9,
      reps: 1,
      priority: 99,
      meta: {
        faceIndex: 0,
        remoteOnly: true,
      },
    }));
    const saveResult = await storage.save();

    expect(localCreate.ok).toBe(true);
    expect(remoteCreate.ok).toBe(true);
    expect(saveResult.ok).toBe(true);

    const cards = storage.getAllCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe('card-local');
    expect(cards[0]?.due).toBe(1_000);
    expect(cards[0]?.scheduledDays).toBe(2);
    expect(cards[0]?.reps).toBe(7);
    expect(cards[0]?.priority).toBe(11);
    expect(cards[0]?.meta).toMatchObject({
      faceIndex: 0,
      localOnly: true,
      remoteOnly: true,
    });

    expect(storage.getAllXiuYuans()).toHaveLength(1);
    expect(Object.keys(remoteStore.cardDTOs || {})).toEqual(['card-local']);
    expect(Object.keys(remoteStore.xiuyuans || {})).toHaveLength(1);
  });

  it('keeps same-source CDF live relation cards distinct by live relation key', async () => {
    const storage = new UnifiedStorageManager();
    const sourceBlockId = 'cdf-source-shared';
    const conceptAId = 'concept-a';
    const conceptBId = 'concept-b';
    const relationA = `${sourceBlockId}:${conceptAId}:definition-forward`;
    const relationB = `${sourceBlockId}:${conceptBId}:definition-forward`;

    const firstCreate = await storage.createCardDTO(
      createCdfXiuyuan('xy-cdf-a', sourceBlockId, conceptAId, relationA, 1_000),
      createCdfDTO('card-cdf-a', 'xy-cdf-a', sourceBlockId, conceptAId, relationA),
    );
    const secondCreate = await storage.createCardDTO(
      createCdfXiuyuan('xy-cdf-b', sourceBlockId, conceptBId, relationB, 2_000),
      createCdfDTO('card-cdf-b', 'xy-cdf-b', sourceBlockId, conceptBId, relationB),
    );

    expect(firstCreate.ok).toBe(true);
    expect(secondCreate.ok).toBe(true);
    expect(storage.getAllCards().map((card) => card.id).sort()).toEqual(['card-cdf-a', 'card-cdf-b']);
    expect(storage.getCardsByBlockId(sourceBlockId).map((card) => card.id).sort()).toEqual(['card-cdf-a', 'card-cdf-b']);
    expect(storage.getAllXiuYuans().map((xiuyuan) => xiuyuan.id).sort()).toEqual(['xy-cdf-a', 'xy-cdf-b']);
    expect(storage.getCardDTO('card-cdf-a')?.meta?.liveRelationKey).toBe(relationA);
    expect(storage.getCardDTO('card-cdf-b')?.meta?.liveRelationKey).toBe(relationB);
  });

  it('keeps scheduler-updated fields from incoming DTO during a scheduler logical merge', () => {
    const local = createDTO('card-local', 'xy-local', 0, {
      blockId: 'shared-block',
      due: 1_000,
      stability: 1,
      difficulty: 8,
      reps: 1,
      lapses: 1,
      state: CardState.Learning,
      lastReview: 900,
      elapsedDays: 0,
      scheduledDays: 0,
      learning_step: 1,
      priority: 11,
    });
    const incoming = createDTO('card-incoming', 'xy-remote', 0, {
      blockId: 'shared-block',
      due: 1_000 + 3 * 86_400_000,
      stability: 4.5,
      difficulty: 4,
      reps: 2,
      lapses: 1,
      state: CardState.Review,
      lastReview: 1_000,
      elapsedDays: 0,
      scheduledDays: 3,
      learning_step: undefined,
      priority: 99,
      updatedAt: local.updatedAt + 100,
    });

    const merged = mergeCardDTOsLocalFirst(local, incoming, {
      canonicalXiuyuanId: 'xy-local',
      preferIncomingScheduling: true,
      schedulingWriteSource: 'review-commit',
    }).value;

    expect(merged.id).toBe(local.id);
    expect(merged.xiuyuanID).toBe('xy-local');
    expect(merged.priority).toBe(local.priority);
    expect(merged.due).toBe(incoming.due);
    expect(merged.stability).toBe(incoming.stability);
    expect(merged.difficulty).toBe(incoming.difficulty);
    expect(merged.reps).toBe(incoming.reps);
    expect(merged.lapses).toBe(incoming.lapses);
    expect(merged.state).toBe(CardState.Review);
    expect(merged.lastReview).toBe(incoming.lastReview);
    expect(merged.elapsedDays).toBe(incoming.elapsedDays);
    expect(merged.scheduledDays).toBe(incoming.scheduledDays);
    expect(merged.learning_step).toBeUndefined();
  });

  it('rejects incoming scheduling fields when merge source is content sync', () => {
    const local = createDTO('card-local', 'xy-local', 0, {
      blockId: 'shared-block',
      due: 1_000,
      stability: 1,
      difficulty: 8,
      reps: 1,
      state: CardState.Learning,
      scheduledDays: 0,
    });
    const incoming = createDTO('card-incoming', 'xy-remote', 0, {
      blockId: 'shared-block',
      due: 9_999,
      stability: 4.5,
      difficulty: 4,
      reps: 2,
      state: CardState.Review,
      scheduledDays: 3,
      priority: 99,
    });

    const merged = mergeCardDTOsLocalFirst(local, incoming, {
      canonicalXiuyuanId: 'xy-local',
      preferIncomingScheduling: true,
    }).value;

    expect(merged.priority).toBe(local.priority);
    expect(merged.due).toBe(local.due);
    expect(merged.stability).toBe(local.stability);
    expect(merged.difficulty).toBe(local.difficulty);
    expect(merged.reps).toBe(local.reps);
    expect(merged.state).toBe(local.state);
    expect(merged.scheduledDays).toBe(local.scheduledDays);
  });

  it('preserves existing scheduling on same-id content updates without an authorized source', async () => {
    const storage = new UnifiedStorageManager();
    const xiuyuan = createXiuyuan('xy-local', 'shared-block', 1_000);
    const local = createDTO('card-local', 'xy-local', 0, {
      blockId: 'shared-block',
      due: 1_000,
      stability: 2,
      difficulty: 7,
      reps: 3,
      state: CardState.Review,
      scheduledDays: 2,
      priority: 11,
    });
    expect((await storage.createCardDTO(xiuyuan, local)).ok).toBe(true);

    const incoming = {
      ...local,
      due: 9_999,
      stability: 9,
      difficulty: 1,
      reps: 99,
      scheduledDays: 9,
      priority: 22,
      meta: {
        ...local.meta,
        content: 'content update',
      },
    };
    expect((await storage.updateCardDTO(incoming, {
      preferIncomingScheduling: true,
    })).ok).toBe(true);

    expect(storage.getCardDTO('card-local')).toMatchObject({
      due: 1_000,
      stability: 2,
      difficulty: 7,
      reps: 3,
      scheduledDays: 2,
      priority: 22,
      meta: expect.objectContaining({
        content: 'content update',
      }),
    });
  });
});
