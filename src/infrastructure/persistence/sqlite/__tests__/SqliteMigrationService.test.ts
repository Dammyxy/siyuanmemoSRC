import { describe, expect, it } from 'vitest';
import type { UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import type { IFileService } from '@/infrastructure/services/FileService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { SqlArenaRepository } from '@/infrastructure/persistence/sqlite/SqlArenaRepository';
import { SqlQueueStateRepository } from '@/infrastructure/persistence/sqlite/SqlQueueStateRepository';
import { SqlReviewLogRepository } from '@/infrastructure/persistence/sqlite/SqlReviewLogRepository';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SqliteMigrationService } from '@/infrastructure/persistence/sqlite/SqliteMigrationService';
import {
  type AlgorithmCardStateBackfillSummary,
  type AlgorithmCardStateDiagnosticSummary,
  SqlUnifiedStorageRepository,
} from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';

class MemoryMigrationFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readMsgpack' | 'readBinary' | 'writeBinary'> {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readMsgpack<T>(): Promise<T | null> {
    return null;
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, new Uint8Array(bytes));
  }
}

function createDirtyCard(): FSRSCard {
  const due = new Date('2026-04-26T23:38:33+08:00').getTime();
  const lastReview = new Date('2026-02-15T23:38:33+08:00').getTime();
  return {
    id: 'migration-dirty-card',
    xiuyuanID: 'xy-migration-dirty',
    blockId: 'block-migration-dirty',
    due,
    stability: 1,
    difficulty: 0,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview,
    elapsedDays: 0,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: lastReview,
    updatedAt: due,
    schedulerType: 'a-factor-v2',
    aFactor: 4,
    meta: {
      nextDues: { again: 1, hard: 1, good: 1 },
      aFactor: 4,
      content: 'dirty migration card',
    },
    schedulerMeta: {
      topic: {
        afs: [4],
        of: 4,
        optimalInterval: 4,
      },
    },
  };
}

function createLegacyStore(): UnifiedCardStore {
  const card = createDirtyCard();
  return {
    version: 2,
    xiuyuans: {},
    cards: {
      [card.id]: card,
    },
    cardDTOs: {},
    deletedCardDTOs: {},
    deletedXiuyuans: {},
    riffBlacklist: [],
    riffSyncState: {},
  };
}

function createDtoOnlyLegacyStore(): UnifiedCardStore {
  const card = createDirtyCard();
  const { meta, ...dto } = card;
  return {
    version: 2,
    xiuyuans: {},
    cards: {},
    cardDTOs: {
      [card.id]: {
        ...dto,
        xiuyuanID: card.xiuyuanID,
        templateID: 'builtin-quick-card',
        meta: {
          ...meta,
          customSemantic: 'dto-only',
        },
      },
    },
    deletedCardDTOs: {},
    deletedXiuyuans: {},
    riffBlacklist: [],
    riffSyncState: {},
  };
}

describe('SqliteMigrationService algorithm card state migration', () => {
  it('imports DTO-only legacy cards during initial migration', async () => {
    const fileService = new MemoryMigrationFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    const unified = new SqlUnifiedStorageRepository(database);
    const migration = new SqliteMigrationService(
      database,
      fileService,
      {
        unified,
        queue: new SqlQueueStateRepository(database),
        reviewLogs: new SqlReviewLogRepository(database),
        arena: new SqlArenaRepository(database),
      },
      async () => createDtoOnlyLegacyStore(),
    );

    const result = await migration.migrateIfNeeded(1_701_000_000_003);

    expect(result).toEqual({ migrated: true, usedSql: true });
    expect(database.hasMigration('initial-msgpack-json-import-v1')).toBe(true);
    expect(unified.getCard('migration-dirty-card')).toMatchObject({
      id: 'migration-dirty-card',
      xiuyuanID: 'xy-migration-dirty',
      meta: { customSemantic: 'dto-only' },
    });
  });

  it('fails closed and keeps initial migration unmarked when a legacy DTO cannot be imported', async () => {
    const fileService = new MemoryMigrationFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    const unified = new SqlUnifiedStorageRepository(database);
    const malformed = createDtoOnlyLegacyStore();
    const malformedSourceDTO = malformed.cardDTOs!['migration-dirty-card'];
    malformed.cardDTOs = {
      malformed: {
        ...malformedSourceDTO,
        id: 'malformed',
        blockId: '',
      },
    };
    const migration = new SqliteMigrationService(
      database,
      fileService,
      {
        unified,
        queue: new SqlQueueStateRepository(database),
        reviewLogs: new SqlReviewLogRepository(database),
        arena: new SqlArenaRepository(database),
      },
      async () => malformed,
    );

    await expect(migration.migrateIfNeeded(1_701_000_000_004)).rejects.toThrow();

    expect(database.hasMigration('initial-msgpack-json-import-v1')).toBe(false);
    expect(fileService.json.has('migration-backups/unified-cards-1701000000004.json')).toBe(true);
    expect(unified.getCard('malformed')).toBeUndefined();
  });

  it('backs up, backfills algorithm_card_state, marks migration, and is idempotent', async () => {
    const fileService = new MemoryMigrationFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    const unified = new SqlUnifiedStorageRepository(database);
    const migration = new SqliteMigrationService(
      database,
      fileService,
      {
        unified,
        queue: new SqlQueueStateRepository(database),
        reviewLogs: new SqlReviewLogRepository(database),
        arena: new SqlArenaRepository(database),
      },
      async () => createLegacyStore(),
    );

    const result = await migration.migrateIfNeeded(1_701_000_000_000);

    expect(result).toEqual({ migrated: true, usedSql: true });
    expect(database.hasMigration('initial-msgpack-json-import-v1')).toBe(true);
    expect(database.hasMigration('algorithm-card-state-production-v1')).toBe(true);
    expect(Array.from(fileService.json.keys())).toEqual(expect.arrayContaining([
      'migration-backups/unified-cards-1701000000000.json',
      'migration-backups/algorithm-card-state-1701000000000.json',
    ]));
    expect(unified.getAlgorithmCardStateDiagnostic()).toMatchObject({
      total: 1,
      dirty: 0,
      missingStateRows: 0,
      invalidStateRows: 0,
      cardStateMismatches: 0,
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM algorithm_card_state WHERE card_id = ? AND algorithm_id = ?',
      ['migration-dirty-card', 'fsrs-v6'],
    )?.count).toBe(1);
    expect(unified.getCard('migration-dirty-card')).toMatchObject({
      schedulerType: 'fsrs-v6',
      stability: 70,
      difficulty: 5,
      scheduledDays: 70,
      meta: { content: 'dirty migration card' },
    });

    const secondRun = await migration.migrateIfNeeded(1_701_000_000_001);

    expect(secondRun).toEqual({ migrated: false, usedSql: true });
  });

  it('repairs dirty algorithm state rows left behind by a previous marked migration', async () => {
    const fileService = new MemoryMigrationFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    const unified = new SqlUnifiedStorageRepository(database);
    await unified.saveStore(createLegacyStore());
    database.markMigration('initial-msgpack-json-import-v1', 1_701_000_000_000);
    database.markMigration('algorithm-card-state-production-v1', 1_701_000_000_000);
    database.run(
      `UPDATE algorithm_card_state
       SET state_json = ?
       WHERE card_id = ? AND algorithm_id = ?`,
      [
        JSON.stringify({
          schemaVersion: 1,
          schedulerType: 'fsrs-v6',
          common: {
            due: 1_700_000_000_000,
            state: CardState.Review,
            reps: 1,
            lapses: 0,
            lastReview: 1_699_000_000_000,
            elapsedDays: 1,
            scheduledDays: 1,
          },
          fsrs: { stability: 0, difficulty: 0 },
        }),
        'migration-dirty-card',
        'fsrs-v6',
      ],
    );

    const migration = new SqliteMigrationService(
      database,
      fileService,
      {
        unified,
        queue: new SqlQueueStateRepository(database),
        reviewLogs: new SqlReviewLogRepository(database),
        arena: new SqlArenaRepository(database),
      },
      async () => ({ ...createLegacyStore(), cards: {} }),
    );

    expect(unified.getAlgorithmCardStateDiagnostic().dirty).toBeGreaterThan(0);

    const result = await migration.migrateIfNeeded(1_701_000_000_002);

    expect(result).toEqual({ migrated: true, usedSql: true });
    expect(fileService.json.has('migration-backups/algorithm-card-state-repair-1701000000002.json')).toBe(true);
    expect(unified.getAlgorithmCardStateDiagnostic()).toMatchObject({
      dirty: 0,
      invalidStateRows: 0,
    });
  });

  it('does not emit repeated full repair backups when a prior repair attempt could not make the state clean', async () => {
    const fileService = new MemoryMigrationFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    database.markMigration('initial-msgpack-json-import-v1', 1_701_000_000_000);
    database.markMigration('algorithm-card-state-production-v1', 1_701_000_000_000);

    const dirtyDiagnostic: AlgorithmCardStateDiagnosticSummary = {
      total: 1,
      dirty: 1,
      missingStateRows: 0,
      invalidStateRows: 1,
      cardStateMismatches: 0,
      orphanStateRows: 0,
      reasons: { 'algorithmState.repaired': 1 },
    };
    const repairAttempts: number[] = [];
    const unified = {
      getAlgorithmCardStateDiagnostic: () => dirtyDiagnostic,
      createAlgorithmCardStateMigrationBackup: () => ({
        cards: [{
          id: 'irreparable-card',
          payload_json: JSON.stringify({ id: 'irreparable-card' }),
          dto_json: null,
        }],
        algorithmCardStates: [],
      }),
      backfillAlgorithmCardStates: (now?: number): AlgorithmCardStateBackfillSummary => {
        repairAttempts.push(Number(now));
        return {
          ...dirtyDiagnostic,
          backfilled: 0,
          repaired: 1,
          afterDirty: 1,
        };
      },
    } as unknown as SqlUnifiedStorageRepository;
    const migration = new SqliteMigrationService(
      database,
      fileService,
      {
        unified,
        queue: new SqlQueueStateRepository(database),
        reviewLogs: new SqlReviewLogRepository(database),
        arena: new SqlArenaRepository(database),
      },
      async () => ({ ...createLegacyStore(), cards: {} }),
    );

    const firstRun = await migration.migrateIfNeeded(1_701_000_000_005);
    const secondRun = await migration.migrateIfNeeded(1_701_000_000_006);
    const repairBackupKeys = Array.from(fileService.json.keys())
      .filter((key) => key.startsWith('migration-backups/algorithm-card-state-repair-'));

    expect(firstRun).toEqual({ migrated: true, usedSql: true });
    expect(secondRun).toEqual({ migrated: false, usedSql: true });
    expect(repairAttempts).toEqual([1_701_000_000_005]);
    expect(repairBackupKeys).toEqual([
      'migration-backups/algorithm-card-state-repair-1701000000005.json',
    ]);
  });
});
