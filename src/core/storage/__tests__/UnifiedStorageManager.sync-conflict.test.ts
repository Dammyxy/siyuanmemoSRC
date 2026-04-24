import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { StorageLoadReason, UnifiedCardStore } from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '../../../infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '../../xiuyuan/types';
import type { CardType } from '../../../types/card';

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

function createXiuyuan(id: string): IXiuyuan {
  const now = Date.now();
  return {
    id,
    blockIDs: [`block-${id}`],
    fields: [{ name: 'content', blockID: `block-${id}` }],
    templateID: 'builtin-quick-card',
    createdAt: now,
    updatedAt: now,
  };
}

function createDTO(cardId: string, xiuyuanId: string): CardPersistenceDTO {
  const now = Date.now();
  return {
    id: cardId,
    blockId: `block-${cardId}`,
    due: now + 86400000,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 1,
    learning_step: 0,
    priority: 50,
    type: 'item' as CardType,
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
  };
}

describe('UnifiedStorageManager sync conflict resolution', () => {
  let remoteStore: UnifiedCardStore;
  let saveCallback: (store: UnifiedCardStore) => Promise<void>;
  let loadCallback: (reason?: StorageLoadReason) => Promise<UnifiedCardStore>;
  let loadReasons: Array<StorageLoadReason | undefined>;
  let savedStores: UnifiedCardStore[];

  beforeEach(() => {
    remoteStore = createEmptyStore();
    loadReasons = [];
    savedStores = [];
    saveCallback = async (store: UnifiedCardStore) => {
      savedStores.push(deepClone(store));
      remoteStore = deepClone(store);
    };
    loadCallback = async (reason?: StorageLoadReason) => {
      loadReasons.push(reason);
      return deepClone(remoteStore);
    };
  });

  function createManager(strategy: 'merge' | 'prefer-local' | 'prefer-remote'): UnifiedStorageManager {
    const manager = new UnifiedStorageManager();
    manager.setPersistenceCallbacks(saveCallback, loadCallback);
    manager.setConflictResolutionStrategy(strategy);
    return manager;
  }

  it('merge strategy keeps both local and remote updates', async () => {
    const managerA = createManager('merge');
    const managerB = createManager('merge');
    await managerA.load();
    await managerB.load();

    const xiuyuanA = createXiuyuan('xy-a');
    const xiuyuanB = createXiuyuan('xy-b');
    await managerA.createCardDTO(xiuyuanA, createDTO('card-a', 'xy-a'));
    await managerA.save();

    await managerB.createCardDTO(xiuyuanB, createDTO('card-b', 'xy-b'));
    await managerB.save();

    expect(Object.keys(remoteStore.cardDTOs || {})).toContain('card-a');
    expect(Object.keys(remoteStore.cardDTOs || {})).toContain('card-b');
    expect(managerB.getCardDTO('card-a')).toBeDefined();
    expect(managerB.getCardDTO('card-b')).toBeDefined();
  });

  it('merge strategy preserves deletions against stale remote snapshots', async () => {
    const managerA = createManager('merge');
    const managerB = createManager('merge');
    await managerA.load();

    await managerA.createCardDTO(createXiuyuan('xy-a'), createDTO('card-a', 'xy-a'));
    await managerA.save();

    await managerB.load();

    await managerA.deleteCard('card-a');
    await managerA.save();

    const staleSaveResult = await managerB.save();
    expect(staleSaveResult.ok).toBe(true);

    expect(remoteStore.cardDTOs?.['card-a']).toBeUndefined();
    expect(remoteStore.deletedCardDTOs?.['card-a']).toBeDefined();
    expect(managerB.getCardDTO('card-a')).toBeUndefined();
  });

  it('prefer-local strategy overwrites remote with local snapshot', async () => {
    const managerA = createManager('merge');
    const managerB = createManager('prefer-local');
    await managerA.load();
    await managerB.load();

    await managerA.createCardDTO(createXiuyuan('xy-a'), createDTO('card-a', 'xy-a'));
    await managerA.save();

    await managerB.createCardDTO(createXiuyuan('xy-b'), createDTO('card-b', 'xy-b'));
    await managerB.save();

    expect(Object.keys(remoteStore.cardDTOs || {})).toEqual(['card-b']);
  });

  it('prefer-remote strategy keeps remote and drops conflicting local changes', async () => {
    const managerA = createManager('merge');
    const managerB = createManager('prefer-remote');
    await managerA.load();
    await managerB.load();

    await managerA.createCardDTO(createXiuyuan('xy-a'), createDTO('card-a', 'xy-a'));
    await managerA.save();

    await managerB.createCardDTO(createXiuyuan('xy-b'), createDTO('card-b', 'xy-b'));
    await managerB.save();

    expect(Object.keys(remoteStore.cardDTOs || {})).toEqual(['card-a']);
    expect(managerB.getCardDTO('card-a')).toBeDefined();
    expect(managerB.getCardDTO('card-b')).toBeUndefined();
  });

  it('passes explicit load reasons for startup loads and pre-save conflict checks', async () => {
    const manager = createManager('merge');

    await manager.load();
    await manager.createCardDTO(createXiuyuan('xy-a'), createDTO('card-a', 'xy-a'));
    await manager.save();

    expect(loadReasons).toEqual(['startup-load', 'pre-save-conflict-check']);
  });

  it('migrates legacy version 1 metadata to version 2 with 64-bit hash on save', async () => {
    remoteStore = {
      ...createEmptyStore(),
      version: 1,
      syncMetadata: {
        revision: 7,
        contentHash: 'deadbeef',
        lastModifiedAt: 123,
        lastModifiedBy: 'legacy-writer',
      },
    };

    const manager = createManager('merge');
    await manager.load();
    manager.addToRiffBlacklist('20260101010101-abc1234');
    const saveResult = await manager.save();

    expect(saveResult.ok).toBe(true);
    expect(savedStores.at(-1)?.version).toBe(2);
    expect(savedStores.at(-1)?.syncMetadata?.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('skips unchanged riff sync state patches without marking storage dirty', async () => {
    const manager = createManager('merge');
    await manager.load();

    const changed = manager.patchRiffSyncState({
      lastSuccessfulIncrementalAt: 123,
      lastSuccessfulIncrementalCursor: 'timestamp:123',
    }, { scheduleSave: false });
    expect(changed).toBe(true);
    expect(manager.isDirty()).toBe(true);

    await manager.save();
    expect(manager.isDirty()).toBe(false);

    const unchanged = manager.patchRiffSyncState({
      lastSuccessfulIncrementalAt: 123,
      lastSuccessfulIncrementalCursor: 'timestamp:123',
    }, { scheduleSave: false });

    expect(unchanged).toBe(false);
    expect(manager.isDirty()).toBe(false);
  });

  it('does not reschedule save when a riff blacklist block is already present', async () => {
    const manager = createManager('merge');
    await manager.load();

    manager.addToRiffBlacklist('block-1');
    expect(manager.isDirty()).toBe(true);
    await manager.save();
    expect(savedStores).toHaveLength(1);

    manager.addToRiffBlacklist('block-1');

    expect(manager.isDirty()).toBe(false);
    expect(savedStores).toHaveLength(1);
  });

  it('skips no-op updateCardDTO writes', async () => {
    const manager = createManager('merge');
    await manager.load();

    await manager.createCardDTO(createXiuyuan('xy-a'), createDTO('card-a', 'xy-a'));
    await manager.save();
    expect(savedStores).toHaveLength(1);

    const existing = manager.getCardDTO('card-a');
    expect(existing).toBeDefined();

    const result = await manager.updateCardDTO(deepClone(existing!));

    expect(result.ok).toBe(true);
    expect(manager.isDirty()).toBe(false);
    expect(savedStores).toHaveLength(1);
  });

  it('clears deletion tombstones when a newer entity is recreated with the same id', async () => {
    const manager = createManager('merge');
    await manager.load();

    await manager.createCardDTO(createXiuyuan('xy-a'), createDTO('card-a', 'xy-a'));
    await manager.save();

    await manager.deleteCard('card-a');
    await manager.save();

    const recreatedAt = Date.now() + 1000;
    const recreatedXiuyuan = createXiuyuan('xy-a');
    recreatedXiuyuan.updatedAt = recreatedAt;
    const recreatedDto = createDTO('card-a', 'xy-a');
    recreatedDto.createdAt = recreatedAt;
    recreatedDto.updatedAt = recreatedAt;

    await manager.createCardDTO(recreatedXiuyuan, recreatedDto);
    await manager.save();

    expect(remoteStore.cardDTOs?.['card-a']).toBeDefined();
    expect(remoteStore.deletedCardDTOs?.['card-a']).toBeUndefined();
    expect(remoteStore.deletedXiuyuans?.['xy-a']).toBeUndefined();
  });
});
