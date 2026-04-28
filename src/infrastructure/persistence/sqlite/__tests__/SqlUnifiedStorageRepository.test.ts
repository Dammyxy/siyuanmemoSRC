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
      meta: { deckId: 'deck-a', rootId: 'doc-a', content: 'Alpha item', tags: ['alpha'] },
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
      meta: { deckId: 'deck-b', rootId: 'doc-a', content: 'Beta topic', tags: ['beta'] },
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
      meta: { deckId: 'deck-a', rootId: 'doc-b', content: 'Gamma suspended', suspended: true, tags: ['meta-gamma'] },
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
      meta: { deckId: 'deck-a', rootId: 'doc-a', content: 'Delta review', tags: ['beta'] },
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
    expect(readModel.countCards?.({ includeSuspended: false })).toBe(3);
  });

  it('serves SQL count, page, and matched-id reads from card projections', async () => {
    const { repository } = await seedRepositories();

    expect(repository.countCards()).toBe(4);
    expect(repository.countCards({ dueDate: { lte: 1_700_000_002_500 }, includeSuspended: false })).toBe(3);
    expect(ids(repository.queryCardsPage({ states: [CardState.Review] }, { startRow: 1, endRow: 3 }).cards)).toEqual(['card-c', 'card-d']);
    expect(repository.queryDeckMatchedIds({ sortModel: [] })).toEqual(['card-a', 'card-b', 'card-c', 'card-d']);
    expect(repository.queryDeckMatchedIds({ searchText: 'block-d', sortModel: [] })).toEqual([]);

    const page = repository.queryDeckPage({
      docId: 'doc-a',
      deckIds: ['deck-a'],
      searchText: 'Delta',
      sortModel: [{ colId: 'priority', sort: 'asc' }],
    }, {
      startRow: 0,
      endRow: 10,
    });

    expect(page?.total).toBe(1);
    expect(ids(page?.cards || [])).toEqual(['card-d']);
    expect(repository.queryDeckMatchedIds({
      docId: 'doc-a',
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    })).toEqual(['card-a', 'card-d', 'card-b']);
  });

  it('updates projection columns on upsert and serves missing-block SQL pages from source cache', async () => {
    const { repository } = await seedRepositories();
    const card = repository.getCard('card-a');
    expect(card).toBeTruthy();
    repository.upsertCard({
      ...card!,
      meta: {
        ...(card!.meta || {}),
        rootId: 'doc-z',
        deckId: 'deck-z',
        content: 'Zeta moved',
        tags: ['zeta'],
      },
    });

    expect(repository.queryDeckMatchedIds({
      docId: 'doc-z',
      deckIds: ['deck-z'],
      tags: ['zeta'],
      searchText: 'Zeta',
    })).toEqual(['card-a']);
    expect(repository.queryDeckPage({ docId: '__lost__' }, { startRow: 0, endRow: 20 })).toEqual({
      cards: [],
      total: 0,
    });
  });

  it('uses projected search fields and explicitly falls back for unsupported complex search', async () => {
    const { repository } = await seedRepositories();

    expect(repository.queryDeckMatchedIds({
      searchText: 'Alpha',
      sortModel: [],
    })).toEqual(['card-a']);
    expect(repository.queryDeckMatchedIds({
      searchText: 'tag:beta deck:deck-a',
      sortModel: [],
    })).toEqual(['card-d']);
    expect(repository.queryDeckMatchedIds({
      searchText: 'retrievability>0.5',
      sortModel: [],
    })).toBeNull();
  });

  it('maintains source-existence projection for active and lost browser queries', async () => {
    const { repository } = await seedRepositories();

    expect(repository.getSourceExistenceRefreshCandidates({ limit: 10 })).toHaveLength(4);
    await repository.updateSourceExistence([
      { cardId: 'card-a', blockId: 'block-a', exists: true },
      { cardId: 'card-b', blockId: 'block-b', exists: false },
    ], 1_700_000_010_000);

    expect(repository.queryDeckMatchedIds({ sortModel: [] })).toEqual(['card-a', 'card-c', 'card-d']);
    expect(repository.queryDeckMatchedIds({ docId: '__lost__', sortModel: [] })).toEqual(['card-b']);
    expect(repository.countCards({ sourceStatus: 'active' })).toBe(3);
    expect(repository.countCards({ sourceStatus: 'missing' })).toBe(1);
    expect(repository.getBrowserStats(1_700_000_002_500)).toMatchObject({
      totalCards: 3,
      dueCards: 2,
      lostCards: 1,
    });
    expect(repository.getSourceExistenceByBlockIds(['block-a', 'block-b', 'block-z'])).toEqual(new Map([
      ['block-a', true],
      ['block-b', false],
    ]));
  });

  it('preserves source cache on same-block upsert and resets it when block id changes', async () => {
    const { repository } = await seedRepositories();
    await repository.updateSourceExistence([
      { cardId: 'card-a', blockId: 'block-a', exists: true },
    ], 1_700_000_010_000);

    const card = repository.getCard('card-a')!;
    repository.upsertCard({
      ...card,
      priority: 88,
    });
    expect(repository.getSourceExistenceByBlockIds(['block-a']).get('block-a')).toBe(true);

    repository.upsertCard({
      ...card,
      blockId: 'block-a-next',
      priority: 89,
    });
    expect(repository.getSourceExistenceByBlockIds(['block-a-next']).get('block-a-next')).toBeNull();
  });

  it('serves root-scope and card-type-marker scan candidates from projections', async () => {
    const { repository } = await seedRepositories();
    const card = repository.getCard('card-a')!;
    repository.upsertCard({
      ...card,
      type: CardType.Item,
      cardTypeMarker: 'concept',
      meta: {
        ...(card.meta || {}),
        rootId: '',
      },
    });

    expect(repository.queryCardIdsByRootIds(['doc-a'])).toEqual(['card-b', 'card-d']);
    expect(repository.queryRootlessCardBlockIds()).toContain('block-a');
    expect(repository.queryInconsistentCardTypeMarkerIds()).toEqual(['card-a']);
  });
});
