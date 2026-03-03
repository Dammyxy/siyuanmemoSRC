import { beforeEach, describe, expect, it } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { UnifiedCardStore } from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '../../../infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '../../xiuyuan/types';
import type { CardType } from '../../../types/card';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function createDTO(cardId: string, xiuyuanId: string, schedulerType?: string): CardPersistenceDTO {
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
    schedulerType,
  };
}

describe('UnifiedStorageManager legacy scheduler migration', () => {
  let manager: UnifiedStorageManager;
  let remoteStore: UnifiedCardStore;
  let saveCalls: number;

  beforeEach(async () => {
    manager = new UnifiedStorageManager();
    saveCalls = 0;
    remoteStore = {
      version: 1,
      xiuyuans: {
        'xy-1': createXiuyuan('xy-1'),
      },
      cards: {},
      cardDTOs: {
        'legacy-1': createDTO('legacy-1', 'xy-1', 'fsrs-v5'),
        'legacy-2': createDTO('legacy-2', 'xy-1', 'fsrs-v5'),
        current: createDTO('current', 'xy-1', 'fsrs-v6'),
      },
      riffBlacklist: [],
    };

    manager.setPersistenceCallbacks(
      async (store) => {
        saveCalls += 1;
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore)
    );

    const loadResult = await manager.load();
    if (!loadResult.ok) {
      throw loadResult.error;
    }
  });

  it('migrates fsrs-v5 schedulerType to fsrs-v6 and persists once', async () => {
    const migratedCount = manager.migrateLegacyFSRSV5SchedulerType();
    expect(migratedCount).toBe(2);
    expect(manager.getCardDTO('legacy-1')?.schedulerType).toBe('fsrs-v6');
    expect(manager.getCardDTO('legacy-2')?.schedulerType).toBe('fsrs-v6');
    expect(manager.getCardDTO('current')?.schedulerType).toBe('fsrs-v6');

    const saveResult = await manager.save();
    expect(saveResult.ok).toBe(true);
    expect(saveCalls).toBe(1);
    expect(remoteStore.cardDTOs?.['legacy-1']?.schedulerType).toBe('fsrs-v6');
    expect(remoteStore.cardDTOs?.['legacy-2']?.schedulerType).toBe('fsrs-v6');
  });

  it('is idempotent after first migration', () => {
    const firstPass = manager.migrateLegacyFSRSV5SchedulerType();
    const secondPass = manager.migrateLegacyFSRSV5SchedulerType();

    expect(firstPass).toBe(2);
    expect(secondPass).toBe(0);
  });
});
