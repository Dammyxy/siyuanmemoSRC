import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { StorageLoadReason, UnifiedCardStore } from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '../../../infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '../../xiuyuan/types';
import { CardState, type CardType } from '../../../types/card';

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

function createDTO(cardId: string, xiuyuanId: string, overrides: Partial<CardPersistenceDTO> = {}): CardPersistenceDTO {
  const now = Date.now();
  return {
    id: overrides.id ?? cardId,
    blockId: overrides.blockId ?? `block-${cardId}`,
    due: overrides.due ?? now + 86400000,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? 0,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 1,
    learning_step: overrides.learning_step ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? ('item' as CardType),
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    xiuyuanID: overrides.xiuyuanID ?? xiuyuanId,
    templateID: overrides.templateID ?? 'builtin-quick-card',
    frontBlockIDs: overrides.frontBlockIDs ?? [`block-${cardId}`],
    backBlockIDs: overrides.backBlockIDs ?? [],
    xiuyuanPriority: overrides.xiuyuanPriority ?? 50,
    meta: overrides.meta,
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

  it('serializes independent write transactions while another transaction is awaiting', async () => {
    const manager = createManager('merge');
    const order: string[] = [];
    let releaseFirstTransaction: (() => void) | undefined;

    const firstTransaction = manager.runWriteTransaction('first', async () => {
      order.push('first-start');
      await new Promise<void>((resolve) => {
        releaseFirstTransaction = resolve;
      });
      order.push('first-end');
    });

    await Promise.resolve();

    const secondTransaction = manager.runWriteTransaction('second', async () => {
      order.push('second-run');
    });

    await Promise.resolve();

    expect(order).toEqual(['first-start']);

    releaseFirstTransaction?.();
    await Promise.all([firstTransaction, secondTransaction]);

    expect(order).toEqual(['first-start', 'first-end', 'second-run']);
  });

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

  it('merge strategy preserves remote review-owned scheduling against stale local snapshots', async () => {
    const managerA = createManager('merge');
    const managerB = createManager('merge');
    await managerA.load();

    const reviewedAt = 1_779_590_000_000;
    const xiuyuan = createXiuyuan('xy-review');
    await managerA.createCardDTO(xiuyuan, createDTO('card-review', 'xy-review', {
      due: reviewedAt + 60_000,
      reps: 1,
      state: CardState.Review,
      lastReview: reviewedAt,
      scheduledDays: 1,
      stability: 1,
      difficulty: 5,
      updatedAt: reviewedAt,
    }));
    await managerA.save();

    await managerB.load();

    await managerA.updateCardDTO(createDTO('card-review', 'xy-review', {
      due: reviewedAt + 22 * 86_400_000,
      reps: 8,
      state: CardState.Review,
      lastReview: reviewedAt,
      scheduledDays: 22,
      stability: 19,
      difficulty: 2,
      updatedAt: reviewedAt + 1_000,
    }), {
      preferIncomingScheduling: true,
      schedulingWriteSource: 'review-commit',
    });
    await managerA.save();

    managerB.addToRiffBlacklist('block-local-only');
    await managerB.save();

    expect(remoteStore.cardDTOs?.['card-review']).toMatchObject({
      reps: 8,
      lastReview: reviewedAt,
      scheduledDays: 22,
      stability: 19,
      difficulty: 2,
      updatedAt: reviewedAt + 1_000,
    });
    expect(managerB.getCardDTO('card-review')).toMatchObject({
      reps: 8,
      scheduledDays: 22,
    });
    expect(remoteStore.riffBlacklist).toContain('block-local-only');
  });

  it('keeps local snapshot when remote snapshot was last written by the same instance', async () => {
    const manager = createManager('merge');
    await manager.load();

    await manager.createCardDTO(createXiuyuan('xy-a'), createDTO('card-a', 'xy-a'));
    await manager.save();

    remoteStore.xiuyuans['xy-remote'] = createXiuyuan('xy-remote');
    remoteStore.cardDTOs['card-remote'] = createDTO('card-remote', 'xy-remote');

    await manager.createCardDTO(createXiuyuan('xy-local'), createDTO('card-local', 'xy-local'));
    await manager.save();

    expect(remoteStore.cardDTOs?.['card-a']).toBeDefined();
    expect(remoteStore.cardDTOs?.['card-local']).toBeDefined();
    expect(remoteStore.cardDTOs?.['card-remote']).toBeUndefined();
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

  it('persists a canonical remote snapshot when conflict check repairs payload shape only', async () => {
    remoteStore = {
      ...createEmptyStore(),
      xiuyuans: {
        'xy-a': createXiuyuan('xy-a'),
      },
      cardDTOs: {
        'card-a': createDTO('card-a', 'xy-a'),
      },
    };
    const manager = createManager('merge');
    await manager.load();
    savedStores = [];

    const saveResult = await manager.save();

    expect(saveResult.ok).toBe(true);
    expect(savedStores).toHaveLength(1);
    expect(remoteStore.xiuyuans['xy-a']?.meta).toMatchObject({
      cardIds: ['card-a'],
    });

    savedStores = [];
    const secondSaveResult = await manager.save();

    expect(secondSaveResult.ok).toBe(true);
    expect(savedStores).toHaveLength(0);
  });

  it('canonicalizes the same persisted snapshot deterministically across loads', async () => {
    vi.useFakeTimers();
    try {
      const rawRemoteStore: UnifiedCardStore = {
        ...createEmptyStore(),
        xiuyuans: {
          'xy-a': {
            ...createXiuyuan('xy-a'),
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
          },
        },
        cardDTOs: {
          'card-a': createDTO('card-a', 'xy-a', {
            createdAt: 1_700_000_001_000,
            updatedAt: 1_700_000_001_000,
          }),
        },
      };
      const loadRawSnapshot = async () => deepClone(rawRemoteStore);

      vi.setSystemTime(1_780_000_000_000);
      const firstManager = new UnifiedStorageManager();
      firstManager.setPersistenceCallbacks(async () => {}, loadRawSnapshot);
      expect((await firstManager.load()).ok).toBe(true);
      const firstStore = firstManager.getStoreData();

      vi.setSystemTime(1_790_000_000_000);
      const secondManager = new UnifiedStorageManager();
      secondManager.setPersistenceCallbacks(async () => {}, loadRawSnapshot);
      expect((await secondManager.load()).ok).toBe(true);
      const secondStore = secondManager.getStoreData();

      expect(firstStore.xiuyuans['xy-a']?.updatedAt).toBe(secondStore.xiuyuans['xy-a']?.updatedAt);
      expect(firstStore.xiuyuans['xy-a']?.updatedAt).toBe(1_700_000_001_000);
      expect(firstStore.syncMetadata?.contentHash).toBe(secondStore.syncMetadata?.contentHash);
    } finally {
      vi.useRealTimers();
    }
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
