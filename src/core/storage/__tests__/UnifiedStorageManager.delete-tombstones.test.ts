import { beforeEach, describe, expect, it } from 'vitest';
import { UnifiedStorageManager, type UnifiedCardStore } from '../UnifiedStorageManager';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardState, CardType } from '@/types/card';

function createXiuyuan(id: string, blockId: string): IXiuyuan {
  return {
    id,
    blockIDs: [blockId],
    templateID: 'builtin-riff-sync',
    fields: [{ name: 'content', blockID: blockId }],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    meta: {
      ownership: 'riff-managed',
      source: 'riff-sync',
      riffCardId: `riff-${blockId}`,
    },
  };
}

function createDTO(id: string, xiuyuanID: string, blockId: string): CardPersistenceDTO {
  return {
    id,
    blockId,
    due: 1_800_000_000_000,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Topic,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    xiuyuanID,
    templateID: 'builtin-riff-sync',
    frontBlockIDs: [blockId],
    backBlockIDs: [],
    xiuyuanPriority: 50,
    riffCardId: `riff-${blockId}`,
    meta: {
      ownership: 'riff-managed',
      source: 'riff-sync',
      riffCardId: `riff-${blockId}`,
    },
  };
}

describe('UnifiedStorageManager delete tombstones', () => {
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async () => undefined,
      async () => ({
        version: 1,
        xiuyuans: {},
        cards: {},
        cardDTOs: {},
      } satisfies UnifiedCardStore),
    );
  });

  it('records source identities for local card and Xiuyuan tombstones', async () => {
    await storage.createCardDTO(
      createXiuyuan('xy-hidden', 'block-hidden'),
      createDTO('card-hidden', 'xy-hidden', 'block-hidden'),
    );

    const result = await storage.deleteCard('card-hidden');
    expect(result.ok).toBe(true);

    const store = storage.getStoreData();
    expect(store.deletedCardDTOs?.['card-hidden']).toMatchObject({
      blockId: 'block-hidden',
      xiuyuanId: 'xy-hidden',
      riffCardId: 'riff-block-hidden',
    });
    expect(store.deletedXiuyuans?.['xy-hidden']).toMatchObject({
      blockId: 'block-hidden',
      blockIds: ['block-hidden'],
      riffCardId: 'riff-block-hidden',
    });
  });
});
