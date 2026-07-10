import { beforeEach, describe, expect, it } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { UnifiedCardStore } from '../UnifiedStorageManager';
import type { CardPersistenceDTO } from '../../../infrastructure/persistence/dto/CardPersistenceDTO';
import { SqliteDatabaseService } from '../../../infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SqlUnifiedStorageRepository } from '../../../infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import type { IFileService } from '../../../infrastructure/services/FileService';
import type { IXiuyuan } from '../../xiuyuan/types';
import { CardState, CardType } from '../../../types/card';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class MemorySqliteFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'> {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, new Uint8Array(bytes));
  }
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

function createXiuyuanWithBlock(id: string, blockId: string, meta: Record<string, unknown> = {}): IXiuyuan {
  const now = Date.now();
  return {
    id,
    blockIDs: [blockId],
    fields: [{ name: 'content', blockID: blockId }],
    templateID: 'builtin-riff-sync',
    createdAt: now,
    updatedAt: now,
    meta,
  };
}

function createDTO(
  cardId: string,
  xiuyuanId: string,
  schedulerType?: string,
  overrides: Partial<CardPersistenceDTO> = {},
): CardPersistenceDTO {
  const now = Date.now();
  return {
    id: cardId,
    blockId: `block-${cardId}`,
    due: now + 86400000,
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
    schedulerType,
    ...overrides,
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

  it('hydrates malformed Review scheduling as repaired before persistence catches up', async () => {
    const due = new Date('2026-04-26T23:38:33+08:00').getTime();
    const lastReview = new Date('2026-02-15T23:38:33+08:00').getTime();
    remoteStore.cardDTOs = {
      malformed: createDTO('malformed', 'xy-1', 'fsrs-v6', {
        due,
        lastReview,
        state: CardState.Review,
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        elapsedDays: 0,
        reps: 4,
      }),
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async (store) => {
        saveCalls += 1;
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore)
    );
    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    const hydrated = storage.getCard('malformed');
    expect(hydrated).toMatchObject({
      stability: 70,
      difficulty: 5,
      scheduledDays: 70,
      schedulerType: 'fsrs-v6',
    });
    expect(storage.getCardDTO('malformed')?.stability).toBe(0);

    const normalizedCount = storage.normalizeMalformedReviewScheduling(due);
    expect(normalizedCount).toBe(1);
    expect(storage.getCardDTO('malformed')).toMatchObject({
      stability: 70,
      difficulty: 5,
      scheduledDays: 70,
      schedulerType: 'fsrs-v6',
    });

    const saveResult = await storage.save();
    expect(saveResult.ok).toBe(true);
    expect(remoteStore.cardDTOs?.malformed).toMatchObject({
      stability: 70,
      scheduledDays: 70,
      schedulerType: 'fsrs-v6',
    });
  });

  it('persists scheduling normalization when another unreviewed card has empty FSRS memory', async () => {
    const due = new Date('2026-04-26T23:38:33+08:00').getTime();
    const lastReview = new Date('2026-02-15T23:38:33+08:00').getTime();
    remoteStore.cardDTOs = {
      dirtyReview: createDTO('dirtyReview', 'xy-1', 'fsrs-v6', {
        due,
        lastReview,
        state: CardState.Review,
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        elapsedDays: 0,
        reps: 4,
      }),
      emptyNew: createDTO('emptyNew', 'xy-1', 'fsrs-v6', {
        state: CardState.New,
        due,
        lastReview: 0,
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        elapsedDays: 0,
        reps: 0,
        lapses: 0,
      }),
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async (store) => {
        saveCalls += 1;
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore)
    );
    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    expect(storage.normalizeMalformedReviewScheduling(due)).toBe(1);
    const saveResult = await storage.save();

    expect(saveResult.ok).toBe(true);
    expect(remoteStore.cardDTOs?.dirtyReview).toMatchObject({
      stability: 70,
      difficulty: 5,
      scheduledDays: 70,
      schedulerType: 'fsrs-v6',
    });
    expect(remoteStore.cardDTOs?.emptyNew).toMatchObject({
      state: CardState.New,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lastReview: 0,
    });
  });

  it('persists scheduling normalization through SQL when another card has empty new-card memory', async () => {
    const due = new Date('2026-04-26T23:38:33+08:00').getTime();
    const lastReview = new Date('2026-02-15T23:38:33+08:00').getTime();
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const startupStore: UnifiedCardStore = {
      version: 2,
      xiuyuans: {
        'xy-1': createXiuyuan('xy-1'),
      },
      cards: {},
      cardDTOs: {
        dirtyReview: createDTO('dirtyReview', 'xy-1', 'fsrs-v6', {
          due,
          lastReview,
          state: CardState.Review,
          stability: 0,
          difficulty: 0,
          scheduledDays: 0,
          elapsedDays: 0,
          reps: 4,
        }),
        emptyNew: createDTO('emptyNew', 'xy-1', 'fsrs-v6', {
          state: CardState.New,
          due,
          lastReview: 0,
          stability: 0,
          difficulty: 0,
          scheduledDays: 0,
          elapsedDays: 0,
          reps: 0,
          lapses: 0,
        }),
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      (store) => repository.saveStore(store),
      async () => deepClone(startupStore)
    );
    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    expect(storage.normalizeMalformedReviewScheduling(due)).toBe(1);
    const saveResult = await storage.save();

    expect(saveResult.ok).toBe(true);
    const loaded = await repository.loadStore();
    expect(loaded.cardDTOs?.dirtyReview).toMatchObject({
      stability: 70,
      difficulty: 5,
      scheduledDays: 70,
      schedulerType: 'fsrs-v6',
    });
    expect(loaded.cardDTOs?.emptyNew).toMatchObject({
      state: CardState.New,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lastReview: 0,
    });
  });

  it('persists scheduling normalization through SQL when another review-state a-factor card has empty FSRS memory fields', async () => {
    const due = new Date('2026-04-26T23:38:33+08:00').getTime();
    const lastReview = new Date('2026-02-15T23:38:33+08:00').getTime();
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const startupStore: UnifiedCardStore = {
      version: 2,
      xiuyuans: {
        'xy-1': createXiuyuan('xy-1'),
      },
      cards: {},
      cardDTOs: {
        dirtyReview: createDTO('dirtyReview', 'xy-1', 'fsrs-v6', {
          due,
          lastReview,
          state: CardState.Review,
          stability: 0,
          difficulty: 0,
          scheduledDays: 0,
          elapsedDays: 0,
          reps: 4,
        }),
        '20211020084142-v4m7d1n': createDTO('20211020084142-v4m7d1n', 'xy-1', 'a-factor-v2', {
          type: CardType.Topic,
          state: CardState.Review,
          due,
          lastReview,
          stability: 0,
          difficulty: 0,
          scheduledDays: 0,
          elapsedDays: 0,
          reps: 4,
          aFactor: 2.5,
          schedulerMeta: {
            topic: {
              afs: [2.5],
              of: 2.5,
              optimalInterval: 1,
            },
          },
        }),
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      (store) => repository.saveStore(store),
      async () => deepClone(startupStore)
    );
    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    expect(storage.normalizeMalformedReviewScheduling(due)).toBe(1);
    const saveResult = await storage.save();

    expect(saveResult.ok).toBe(true);
    const loaded = await repository.loadStore();
    expect(loaded.cardDTOs?.dirtyReview).toMatchObject({
      stability: 70,
      difficulty: 5,
      scheduledDays: 70,
      schedulerType: 'fsrs-v6',
    });
    expect(loaded.cardDTOs?.['20211020084142-v4m7d1n']).toMatchObject({
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
      state: CardState.Review,
      stability: 0,
      difficulty: 0,
      aFactor: 2.5,
    });
  });

  it('normalizes legacy a-factor item cards with one-day Review memory to fsrs-v6 history interval', async () => {
    const due = new Date('2026-04-26T23:38:33+08:00').getTime();
    const lastReview = new Date('2026-02-15T23:38:33+08:00').getTime();
    remoteStore.cardDTOs = {
      legacyItem: createDTO('legacyItem', 'xy-1', 'a-factor-v2', {
        due,
        lastReview,
        state: CardState.Review,
        stability: 1,
        difficulty: 6,
        scheduledDays: 1,
        elapsedDays: 0,
        reps: 4,
      }),
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async (store) => {
        saveCalls += 1;
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore)
    );
    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    expect(storage.getCard('legacyItem')).toMatchObject({
      stability: 70,
      difficulty: 6,
      scheduledDays: 70,
      schedulerType: 'fsrs-v6',
    });

    expect(storage.normalizeMalformedReviewScheduling(due)).toBe(1);
    expect(storage.getCardDTO('legacyItem')).toMatchObject({
      stability: 70,
      scheduledDays: 70,
      schedulerType: 'fsrs-v6',
    });
  });

  it('normalizes historical Topic schedulerType pollution to a-factor-v2', async () => {
    remoteStore.cardDTOs = {
      dirtyTopic: createDTO('dirtyTopic', 'xy-1', 'fsrs-v6', {
        type: CardType.Topic,
        aFactor: 9,
        schedulerMeta: {
          staleExternal: {
            of: 3,
            optimumInterval: 4,
            afs: [3],
          } as unknown,
        },
        meta: {
          nextDues: { good: 1 },
          aFactor: 9,
          customField: 'kept',
        },
      }),
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async (store) => {
        saveCalls += 1;
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore)
    );
    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    expect(storage.getCard('dirtyTopic')).toMatchObject({
      schedulerType: 'a-factor-v2',
      aFactor: 6,
      schedulerMeta: {
        topic: {
          afs: [6],
          of: 6,
          optimalInterval: 1,
        },
      },
      meta: { customField: 'kept' },
    });

    expect(storage.normalizeMalformedReviewScheduling()).toBe(1);
    expect(storage.getCardDTO('dirtyTopic')).toMatchObject({
      schedulerType: 'a-factor-v2',
      aFactor: 6,
      schedulerMeta: {
        topic: {
          afs: [6],
          of: 6,
          optimalInterval: 1,
        },
      },
      meta: { customField: 'kept' },
    });
  });

  it('renames a unique legacy Xiuyuan when a card points at a missing canonical Xiuyuan id', async () => {
    remoteStore = {
      version: 2,
      xiuyuans: {
        'xy_migrated_card-riff': createXiuyuanWithBlock('xy_migrated_card-riff', 'block-riff', {
          ownership: 'riff-managed',
          source: 'riff-sync',
          riffCardId: 'riff-1',
        }),
      },
      cards: {},
      cardDTOs: {
        'card-riff': createDTO('card-riff', 'xy_riff_block-riff', 'fsrs-v6', {
          blockId: 'block-riff',
          riffCardId: 'riff-1',
          templateID: 'builtin-riff-sync',
          meta: {
            ownership: 'riff-managed',
            source: 'riff-sync',
            riffCardId: 'riff-1',
            xiuyuanID: 'xy_riff_block-riff',
          },
        }),
      },
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async (store) => {
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore)
    );

    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    expect(storage.getXiuYuan('xy_riff_block-riff')).toMatchObject({
      id: 'xy_riff_block-riff',
      blockIDs: ['block-riff'],
    });
    expect(storage.getXiuYuan('xy_migrated_card-riff')).toBeUndefined();
    expect(storage.getCardsByXiuyuanId('xy_riff_block-riff').map(card => card.id)).toEqual(['card-riff']);
  });

  it('reconstructs a missing Xiuyuan from the card DTO when no legacy candidate exists', async () => {
    remoteStore = {
      version: 2,
      xiuyuans: {},
      cards: {},
      cardDTOs: {
        'card-rebuild': createDTO('card-rebuild', 'xy_rebuild_block', 'fsrs-v6', {
          blockId: 'block-rebuild',
          templateID: 'builtin-riff-sync',
          frontBlockIDs: ['block-rebuild'],
          meta: {
            ownership: 'riff-managed',
            source: 'riff-sync',
            content: 'rebuild content',
            xiuyuanID: 'xy_rebuild_block',
          },
        }),
      },
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async (store) => {
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore)
    );

    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    expect(storage.getXiuYuan('xy_rebuild_block')).toMatchObject({
      id: 'xy_rebuild_block',
      blockIDs: ['block-rebuild'],
    });
    expect(storage.getCardsByXiuyuanId('xy_rebuild_block').map(card => card.id)).toEqual(['card-rebuild']);
  });

  it('repairs half Xiuyuan payloads from bound semantic card DTOs', async () => {
    remoteStore = {
      version: 2,
      xiuyuans: {
        'xy_semantic_half': createXiuyuanWithBlock('xy_semantic_half', 'descriptor-block', {
          ownership: 'riff-managed',
          source: 'riff-sync',
        }),
      },
      cards: {},
      cardDTOs: {
        'card-semantic': createDTO('card-semantic', 'xy_semantic_half', 'fsrs-v6', {
          blockId: 'descriptor-block',
          type: CardType.Descriptor,
          templateID: 'builtin-riff-sync',
          frontBlockIDs: ['concept-block'],
          backBlockIDs: ['concept-block'],
          fieldMapping: {
            concept: 'concept-block',
            descriptor: 'descriptor-block',
          },
          meta: {
            typeMarker: 'concept-descriptor',
            content: '界面→不支持跨卡片批量操作',
            faces: [{
              question: 'SRS卡片独立单元问题',
              answer: 'SRS卡片独立单元问题',
              questionBlockId: 'concept-block',
              answerBlockId: 'concept-block',
            }],
          },
        }),
      },
    };

    const storage = new UnifiedStorageManager();
    storage.setPersistenceCallbacks(
      async (store) => {
        remoteStore = deepClone(store);
      },
      async () => deepClone(remoteStore)
    );

    const loadResult = await storage.load();
    expect(loadResult.ok).toBe(true);

    const xiuyuan = storage.getXiuYuan('xy_semantic_half');
    expect(xiuyuan?.meta).toMatchObject({
      cardIds: ['card-semantic'],
      typeMarker: 'concept-descriptor',
      fieldMapping: {
        concept: 'concept-block',
        descriptor: 'descriptor-block',
      },
    });
    expect(Array.isArray(xiuyuan?.meta?.faces)).toBe(true);
    expect(storage.getCardsByXiuyuanId('xy_semantic_half').map(card => card.id)).toEqual(['card-semantic']);
  });
});
