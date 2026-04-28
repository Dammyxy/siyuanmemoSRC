import { beforeEach, describe, expect, it } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { IXiuyuan } from '../../xiuyuan/types';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import type { CardType } from '@/types/card';

describe('UnifiedStorageManager batchUpdateCards', () => {
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
      })
    );
  });

  function createXiuyuan(id: string, blockId: string): IXiuyuan {
    return {
      id,
      blockIDs: [blockId],
      templateID: 'builtin-quick-card',
      fields: [{ name: 'content', blockID: blockId }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function createDTO(id: string, xiuyuanID: string, blockId: string): CardPersistenceDTO {
    return {
      id,
      blockId,
      due: Date.now() + 86_400_000,
      stability: 1,
      difficulty: 5,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: Date.now(),
      elapsedDays: 0,
      scheduledDays: 1,
      learning_step: 0,
      type: 'item' as CardType,
      priority: 50,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      xiuyuanID,
      templateID: 'builtin-quick-card',
      frontBlockIDs: [blockId],
      backBlockIDs: [],
      xiuyuanPriority: 50,
    };
  }

  it('updates cards in one batch and keeps due index ordered', async () => {
    await storage.createCardDTO(createXiuyuan('xy-1', 'block-1'), createDTO('card-1', 'xy-1', 'block-1'));
    await storage.createCardDTO(createXiuyuan('xy-2', 'block-2'), createDTO('card-2', 'xy-2', 'block-2'));

    const now = Date.now();
    const card1 = storage.getCard('card-1')!;
    const card2 = storage.getCard('card-2')!;
    const result = await storage.batchUpdateCards([
      { ...card1, due: now - 1_000, priority: 10, updatedAt: now },
      { ...card2, due: now - 2_000, priority: 20, updatedAt: now },
    ], {
      preferIncomingScheduling: true,
      schedulingWriteSource: 'review-commit',
    });

    expect(result.ok).toBe(true);
    expect(storage.getCardDTO('card-1')?.priority).toBe(10);
    expect(storage.getCardDTO('card-2')?.priority).toBe(20);
    expect(storage.getDueCards(2).map(card => card.id)).toEqual(['card-2', 'card-1']);
  });
});
