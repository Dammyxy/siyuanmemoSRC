import { beforeEach, describe, expect, it } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { UnifiedCardStore } from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '../../../infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '../../xiuyuan/types';
import type { CardType } from '../../../types/card';

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
  let loadCallback: () => Promise<UnifiedCardStore>;

  beforeEach(() => {
    remoteStore = createEmptyStore();
    saveCallback = async (store: UnifiedCardStore) => {
      remoteStore = deepClone(store);
    };
    loadCallback = async () => deepClone(remoteStore);
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
});
