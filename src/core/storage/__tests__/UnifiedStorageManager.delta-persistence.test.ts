import { describe, expect, it, vi } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type {
  UnifiedCardStore,
  UnifiedStorageXiuyuanCardDelta,
} from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import { CardState, CardType } from '@/types/card';

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

describe('UnifiedStorageManager Xiuyuan/card delta persistence', () => {
  it('persists an upsert-only Xiuyuan/card save through delta without full store save', async () => {
    const manager = new UnifiedStorageManager();
    const fullSave = vi.fn(async (_store: UnifiedCardStore) => undefined);
    const load = vi.fn(async () => createEmptyStore());
    const deltaSave = vi.fn(async (_delta: UnifiedStorageXiuyuanCardDelta) => undefined);
    manager.setPersistenceCallbacks(fullSave, load, { saveXiuyuanCardDelta: deltaSave });

    expect((await manager.load()).ok).toBe(true);
    expect((await manager.createCardDTO(createXiuyuan('xy-a', 'block-a'), createDTO('card-a', 'xy-a', 'block-a'))).ok).toBe(true);

    const result = await manager.saveXiuyuanCardDelta({
      xiuyuanIds: ['xy-a'],
      cardIds: ['card-a'],
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.mode : undefined).toBe('delta');
    expect(fullSave).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    expect(deltaSave).toHaveBeenCalledTimes(1);
    expect(deepClone(deltaSave.mock.calls[0]?.[0])).toMatchObject({
      version: 2,
      xiuyuans: {
        'xy-a': { id: 'xy-a', blockIDs: ['block-a'] },
      },
      cardDTOs: {
        'card-a': { id: 'card-a', xiuyuanID: 'xy-a', blockId: 'block-a' },
      },
      cards: {
        'card-a': { id: 'card-a', xiuyuanID: 'xy-a', blockId: 'block-a' },
      },
    });
    expect(manager.isDirty()).toBe(false);
  });

  it('stamps delta persistence with new sync metadata without loading a remote snapshot', async () => {
    const manager = new UnifiedStorageManager();
    const fullSave = vi.fn(async (_store: UnifiedCardStore) => undefined);
    const load = vi.fn(async () => ({
      ...createEmptyStore(),
      syncMetadata: {
        revision: 41,
        contentHash: 'before',
        lastModifiedAt: 1_700_000_000_000,
        lastModifiedBy: 'previous',
      },
    }));
    const deltaSave = vi.fn(async (_delta: UnifiedStorageXiuyuanCardDelta) => undefined);
    manager.setPersistenceCallbacks(fullSave, load, { saveXiuyuanCardDelta: deltaSave });

    expect((await manager.load()).ok).toBe(true);
    expect((await manager.createCardDTO(createXiuyuan('xy-a', 'block-a'), createDTO('card-a', 'xy-a', 'block-a'))).ok).toBe(true);

    const result = await manager.saveXiuyuanCardDelta({
      xiuyuanIds: ['xy-a'],
      cardIds: ['card-a'],
    });

    expect(result.ok).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(fullSave).not.toHaveBeenCalled();
    const metadata = deltaSave.mock.calls[0]?.[0].syncMetadata;
    expect(metadata?.revision).toBe(42);
    expect(metadata?.contentHash).toEqual(expect.any(String));
    expect(metadata?.contentHash).not.toBe('before');
    expect(metadata?.lastModifiedBy).toEqual(expect.stringMatching(/^storage-/));
    expect(manager.getStoreData().syncMetadata).toMatchObject({
      revision: 42,
      contentHash: metadata?.contentHash,
    });
  });

  it('falls back to full save when the delta adapter is unavailable', async () => {
    let remoteStore = createEmptyStore();
    const manager = new UnifiedStorageManager();
    const fullSave = vi.fn(async (store: UnifiedCardStore) => {
      remoteStore = deepClone(store);
    });
    manager.setPersistenceCallbacks(
      fullSave,
      async () => deepClone(remoteStore),
    );

    expect((await manager.load()).ok).toBe(true);
    expect((await manager.createCardDTO(createXiuyuan('xy-a', 'block-a'), createDTO('card-a', 'xy-a', 'block-a'))).ok).toBe(true);

    const result = await manager.saveXiuyuanCardDelta({
      xiuyuanIds: ['xy-a'],
      cardIds: ['card-a'],
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toMatchObject({
      mode: 'full-save',
      fallbackReason: 'delta-adapter-unavailable',
    });
    expect(fullSave).toHaveBeenCalledTimes(1);
    expect(remoteStore.cardDTOs?.['card-a']).toMatchObject({
      id: 'card-a',
      xiuyuanID: 'xy-a',
    });
  });

  it('uses full save when the caller marks the staged save as unsafe for delta', async () => {
    let remoteStore = createEmptyStore();
    const manager = new UnifiedStorageManager();
    const fullSave = vi.fn(async (store: UnifiedCardStore) => {
      remoteStore = deepClone(store);
    });
    const deltaSave = vi.fn(async (_delta: UnifiedStorageXiuyuanCardDelta) => undefined);
    manager.setPersistenceCallbacks(
      fullSave,
      async () => deepClone(remoteStore),
      { saveXiuyuanCardDelta: deltaSave },
    );

    expect((await manager.load()).ok).toBe(true);
    expect((await manager.createCardDTO(createXiuyuan('xy-a', 'block-a'), createDTO('card-a', 'xy-a', 'block-a'))).ok).toBe(true);

    const result = await manager.saveXiuyuanCardDelta({
      xiuyuanIds: ['xy-a'],
      cardIds: ['card-a'],
      fallbackReason: 'removed-existing-card',
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toMatchObject({
      mode: 'full-save',
      fallbackReason: 'removed-existing-card',
    });
    expect(deltaSave).not.toHaveBeenCalled();
    expect(fullSave).toHaveBeenCalledTimes(1);
    expect(remoteStore.cardDTOs?.['card-a']).toBeDefined();
  });
});
