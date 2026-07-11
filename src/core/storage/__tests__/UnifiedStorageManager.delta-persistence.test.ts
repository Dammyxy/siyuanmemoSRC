import { describe, expect, it, vi } from 'vitest';
import {
  UnifiedStorageManager,
  type UnifiedCardStore,
  type UnifiedStorageCardCrudMutation,
} from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import { CardState, CardType } from '@/types/card';

function createEmptyStore(): UnifiedCardStore {
  return {
    version: 2,
    xiuyuans: {},
    cards: {},
    cardDTOs: {},
    deletedCardDTOs: {},
    deletedXiuyuans: {},
  };
}

function createXiuyuan(id: string, blockId = `block-${id}`): IXiuyuan {
  const now = 1_700_000_000_000;
  return {
    id,
    blockIDs: [blockId],
    fields: [{ name: 'content', blockID: blockId }],
    templateID: 'builtin-quick-card',
    createdAt: now,
    updatedAt: now,
  };
}

function createDTO(cardId: string, xiuyuanId: string, blockId = `block-${cardId}`): CardPersistenceDTO {
  const now = 1_700_000_000_000;
  return {
    id: cardId,
    blockId,
    due: now + 86_400_000,
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
    xiuyuanID: xiuyuanId,
    templateID: 'builtin-quick-card',
    frontBlockIDs: [blockId],
    backBlockIDs: [],
    xiuyuanPriority: 50,
    meta: {
      xiuyuanID: xiuyuanId,
      content: 'Question>>Answer',
      source: 'symbol',
    },
  };
}

describe('UnifiedStorageManager Worker Card CRUD persistence', () => {
  it('commits one Xiuyuan/card upsert batch through Worker authority', async () => {
    const manager = new UnifiedStorageManager();
    const fullSave = vi.fn(async (_store: UnifiedCardStore) => undefined);
    const commitCardCrudBatch = vi.fn(async (_mutation: UnifiedStorageCardCrudMutation) => undefined);
    manager.setPersistenceCallbacks(fullSave, async () => createEmptyStore(), {
      commitCardCrudBatch,
    });

    expect((await manager.load()).ok).toBe(true);
    expect((await manager.createCardDTO(
      createXiuyuan('xy-a', 'block-a'),
      createDTO('card-a', 'xy-a', 'block-a'),
    )).ok).toBe(true);

    const result = await manager.saveXiuyuanCardDelta({
      xiuyuanIds: ['xy-a'],
      cardIds: ['card-a'],
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.mode : undefined).toBe('worker');
    expect(fullSave).not.toHaveBeenCalled();
    expect(commitCardCrudBatch).toHaveBeenCalledTimes(1);
    expect(commitCardCrudBatch).toHaveBeenCalledWith({
      upsertXiuyuans: [expect.objectContaining({ id: 'xy-a', blockIDs: ['block-a'] })],
      upsertCards: [expect.objectContaining({
        id: 'card-a',
        xiuyuanID: 'xy-a',
        blockId: 'block-a',
      })],
      deleteCardIds: [],
      deleteXiuyuanIds: [],
    });
    expect(manager.isDirty()).toBe(false);
  });

  it('commits card and Xiuyuan deletions in one Worker batch', async () => {
    const manager = new UnifiedStorageManager();
    const commitCardCrudBatch = vi.fn(async (_mutation: UnifiedStorageCardCrudMutation) => undefined);
    manager.setPersistenceCallbacks(
      vi.fn(async (_store: UnifiedCardStore) => undefined),
      async () => createEmptyStore(),
      { commitCardCrudBatch },
    );

    expect((await manager.load()).ok).toBe(true);
    expect((await manager.createCardDTO(
      createXiuyuan('xy-delete', 'block-delete'),
      createDTO('card-delete', 'xy-delete', 'block-delete'),
    )).ok).toBe(true);
    expect((await manager.deleteCard('card-delete', { suppressAutosave: true })).ok).toBe(true);

    const result = await manager.saveXiuyuanCardDelta({
      xiuyuanIds: [],
      cardIds: [],
      deleteCardIds: ['card-delete'],
      deleteXiuyuanIds: ['xy-delete'],
    });

    expect(result.ok).toBe(true);
    expect(commitCardCrudBatch).toHaveBeenCalledWith({
      upsertXiuyuans: [],
      upsertCards: [],
      deleteCardIds: ['card-delete'],
      deleteXiuyuanIds: ['xy-delete'],
    });
  });

  it('fails explicitly when Worker Card CRUD authority is unavailable', async () => {
    const manager = new UnifiedStorageManager();
    const fullSave = vi.fn(async (_store: UnifiedCardStore) => undefined);
    manager.setPersistenceCallbacks(fullSave, async () => createEmptyStore());

    expect((await manager.load()).ok).toBe(true);
    expect((await manager.createCardDTO(
      createXiuyuan('xy-a', 'block-a'),
      createDTO('card-a', 'xy-a', 'block-a'),
    )).ok).toBe(true);

    const result = await manager.saveXiuyuanCardDelta({
      xiuyuanIds: ['xy-a'],
      cardIds: ['card-a'],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.message).toContain(
      'BACKEND_UNAVAILABLE: card.crud.batchMutate requires backend Worker',
    );
    expect(fullSave).not.toHaveBeenCalled();
  });
});
