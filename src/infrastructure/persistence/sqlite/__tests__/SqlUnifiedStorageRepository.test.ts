import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { SqlCardReadModel } from '@/infrastructure/queries/SqlCardReadModel';
import { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import { CardState, CardType } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';

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

function createXiuyuan(id: string, blockId: string): IXiuyuan {
  return {
    id,
    blockIDs: [blockId],
    templateID: 'builtin-quick-card',
    fields: [{ name: 'content', blockID: blockId }],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

function createDTO(overrides: Partial<CardPersistenceDTO>): CardPersistenceDTO {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-default',
    blockId: overrides.blockId ?? 'block-default',
    due: overrides.due ?? now,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.New,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 1,
    learning_step: overrides.learning_step ?? 0,
    type: overrides.type ?? CardType.Item,
    priority: overrides.priority ?? 50,
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    xiuyuanID: overrides.xiuyuanID ?? 'xy-sql-query',
    templateID: overrides.templateID ?? 'builtin-quick-card',
    frontBlockIDs: overrides.frontBlockIDs ?? [overrides.blockId ?? 'block-default'],
    backBlockIDs: overrides.backBlockIDs ?? [],
    xiuyuanPriority: overrides.xiuyuanPriority ?? 50,
    meta: overrides.meta,
  };
}

async function seedRepositories(): Promise<{
  storage: UnifiedStorageManager;
  repository: SqlUnifiedStorageRepository;
  readModel: SqlCardReadModel;
}> {
  const storage = new UnifiedStorageManager();
  const dtos = [
    createDTO({
      id: 'card-a',
      blockId: 'block-a',
      xiuyuanID: 'xy-card-a',
      type: CardType.Item,
      state: CardState.New,
      due: 1_700_000_001_000,
      priority: 50,
      tags: ['alpha'],
    }),
    createDTO({
      id: 'card-b',
      blockId: 'block-b',
      xiuyuanID: 'xy-card-b',
      type: CardType.Topic,
      state: CardState.Review,
      due: 1_700_000_002_000,
      priority: 20,
      tags: ['beta'],
    }),
    createDTO({
      id: 'card-c',
      blockId: 'block-c',
      xiuyuanID: 'xy-card-c',
      type: CardType.Item,
      state: CardState.Review,
      due: 1_700_000_003_000,
      priority: 10,
      tags: ['gamma'],
      meta: { suspended: true, tags: ['meta-gamma'] },
    }),
    createDTO({
      id: 'card-d',
      blockId: 'block-d',
      xiuyuanID: 'xy-card-d',
      type: CardType.Item,
      state: CardState.Review,
      due: 1_700_000_002_500,
      priority: 30,
      tags: ['beta'],
    }),
  ];

  for (const dto of dtos) {
    const xiuyuan = createXiuyuan(dto.xiuyuanID || `xy-${dto.id}`, dto.blockId);
    const result = await storage.createCardDTO(xiuyuan, dto);
    expect(result.ok).toBe(true);
  }

  const database = new SqliteDatabaseService(new MemorySqliteFileService());
  await database.init();
  const repository = new SqlUnifiedStorageRepository(database);
  await repository.saveStore(storage.getStoreData());

  return {
    storage,
    repository,
    readModel: new SqlCardReadModel(repository),
  };
}

function ids(cards: Array<{ id: string }>): string[] {
  return cards.map((card) => card.id);
}

describe('SqlUnifiedStorageRepository queryCards', () => {
  it('matches the legacy indexed read model for structured queue filters', async () => {
    const { storage, repository } = await seedRepositories();
    const queries: StructuredCardQuery[] = [
      { blockIds: ['block-b'] },
      { cardTypes: [CardType.Item], states: [CardState.Review] },
      { dueDate: { lte: 1_700_000_002_500, gte: 1_700_000_002_000 } },
      { priority: { min: 20, max: 50 }, includeSuspended: false },
      { tags: ['meta-gamma'], suspended: true },
    ];

    for (const query of queries) {
      expect(ids(repository.queryCards(query))).toEqual(ids(storage.queryCards(query)));
    }
  });

  it('serves the ICardReadModel contract from SQL without hydrating the legacy store', async () => {
    const { readModel } = await seedRepositories();

    expect(readModel.getCard('card-a')?.blockId).toBe('block-a');
    expect(readModel.getCardByBlockId('block-b')?.id).toBe('card-b');
    expect(ids(readModel.getCardsByBlockId('block-d'))).toEqual(['card-d']);
    expect(ids(readModel.getDueCards(2))).toEqual(['card-a', 'card-b']);
  });
});
