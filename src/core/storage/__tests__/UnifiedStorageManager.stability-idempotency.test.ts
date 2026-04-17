import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedStorageManager, type UnifiedCardStore } from '../UnifiedStorageManager';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardState, CardType } from '@/types/card';

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
});
