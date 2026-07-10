import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { SqlCardReadModel } from '@/infrastructure/queries/SqlCardReadModel';
import { DomainSyncLedger } from '../../../../../worker/domain-sync/DomainSyncLedger';
import { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import {
  deriveAlgorithmCardState,
  stringifyAlgorithmCardState,
} from '@/infrastructure/persistence/sqlite/algorithmCardState';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import { CardState, CardType } from '@/types/card';
import type { FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';
import { QueueType } from '@/types/unified-data-source';
import { planCardSemanticRepair } from '@/core/card/semantics';
import {
  applyDeckPresetFilter,
  applyDocFilter,
  applyExplicitCardTypesFilter,
  applySimpleQueryFilter,
  sortBrowserRows,
  type QueueFilterRowLike,
} from '@/application/queries/browser/shared/BrowserRowUtils';

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
    faceKey: overrides.faceKey,
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
    aFactor: overrides.aFactor,
    schedulerType: overrides.schedulerType,
    schedulerMeta: overrides.schedulerMeta,
    xiuyuanID: overrides.xiuyuanID ?? 'xy-sql-query',
    templateID: overrides.templateID ?? 'builtin-quick-card',
    frontBlockIDs: overrides.frontBlockIDs ?? [overrides.blockId ?? 'block-default'],
    backBlockIDs: overrides.backBlockIDs ?? [],
    xiuyuanPriority: overrides.xiuyuanPriority ?? 50,
    meta: overrides.meta,
  };
}

async function seedRepositories(): Promise<{
  database: SqliteDatabaseService;
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
    database,
    storage,
    repository,
    readModel: new SqlCardReadModel(repository),
  };
}

function ids(cards: Array<{ id: string }>): string[] {
  return cards.map((card) => card.id);
}

type BrowserRowContractFixture = QueueFilterRowLike & {
  id: string;
  fsrsCardId: string;
};

function toBrowserRowContractFixture(card: FSRSCard): BrowserRowContractFixture {
  const meta = card.meta && typeof card.meta === 'object'
    ? card.meta as Record<string, unknown>
    : {};
  return {
    id: card.id,
    fsrsCardId: card.id,
    blockId: card.blockId,
    deckId: String(meta.deckId || ''),
    rootId: String(meta.rootId || ''),
    content: String(meta.content || ''),
    fullContent: String(meta.content || ''),
    state: card.state,
    due: card.due,
    priority: card.priority,
    lapses: card.lapses,
    reps: card.reps,
    interval: card.scheduledDays,
    suspended: card.skipped === true || meta.suspended === true,
    cardType: card.type,
    tags: Array.isArray(meta.tags) ? meta.tags.map((tag) => String(tag)) : card.tags,
  };
}

function applySharedBrowserRowContract(
  cards: FSRSCard[],
  query: {
    docId?: string;
    scopeDocIds?: string[];
    preset?: string;
    searchText?: string;
    cardTypes?: string[];
    sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
  },
): string[] {
  let rows = cards.map(toBrowserRowContractFixture);
  rows = applyDocFilter(rows, query.docId, query.scopeDocIds);
  rows = applyDeckPresetFilter(rows, query.preset);
  rows = applyExplicitCardTypesFilter(rows, query.cardTypes);
  rows = applySimpleQueryFilter(rows, query.searchText);
  rows = sortBrowserRows(rows, query.sortModel || []);
  return rows.map((row) => row.id);
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

  it('hydrates query cards from dto_json when payload_json has stale Xiuyuan binding', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const dto = createDTO({
      id: 'card-stale-payload',
      blockId: 'block-stale-payload',
      xiuyuanID: 'xy-canonical',
      meta: { content: 'canonical card', xiuyuanID: 'xy-canonical' },
    });
    const stalePayload = {
      ...dto,
      xiuyuanID: 'xy-stale',
      meta: { ...dto.meta, xiuyuanID: 'xy-stale' },
    };
    await repository.saveStore({
      version: 2,
      xiuyuans: {
        'xy-canonical': createXiuyuan('xy-canonical', 'block-stale-payload'),
      },
      cards: {
        [stalePayload.id]: stalePayload as FSRSCard,
      },
      cardDTOs: {
        [dto.id]: dto,
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    });
    database.run(
      'UPDATE cards SET payload_json = ?, dto_json = ? WHERE id = ?',
      [JSON.stringify(stalePayload), JSON.stringify(dto), dto.id],
    );

    expect(repository.getCard(dto.id)).toMatchObject({
      id: dto.id,
      xiuyuanID: 'xy-canonical',
      meta: { xiuyuanID: 'xy-canonical' },
    });
    expect(repository.queryCards({ blockIds: [dto.blockId] })[0]).toMatchObject({
      xiuyuanID: 'xy-canonical',
    });
  });

  it('imports DTO-only legacy stores and writes both payload and dto JSON', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const dto = createDTO({
      id: 'dto-only-card',
      blockId: 'block-dto-only',
      xiuyuanID: 'xy-dto-only',
      faceKey: { ruleId: 'forward', faceIndex: 0 },
      templateID: 'builtin-bidirectional',
      meta: {
        content: 'DTO-only semantic payload',
        customSemantic: { kind: 'owned-card-type' },
      },
    });

    await repository.saveStore({
      version: 2,
      xiuyuans: {
        'xy-dto-only': createXiuyuan('xy-dto-only', 'block-dto-only'),
      },
      cards: {},
      cardDTOs: {
        [dto.id]: dto,
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    });

    const row = database.getOne<{
      id: string;
      block_id: string | null;
      xiuyuan_id: string | null;
      payload_json: string | null;
      dto_json: string | null;
    }>('SELECT id, block_id, xiuyuan_id, payload_json, dto_json FROM cards WHERE id = ?', [dto.id]);

    expect(row).toMatchObject({
      id: 'dto-only-card',
      block_id: 'block-dto-only',
      xiuyuan_id: 'xy-dto-only',
    });
    expect(row?.payload_json).toBeTruthy();
    expect(row?.dto_json).toBeTruthy();
    expect(repository.getCard(dto.id)).toMatchObject({
      id: dto.id,
      xiuyuanID: 'xy-dto-only',
      faceKey: { ruleId: 'forward', faceIndex: 0 },
      meta: {
        customSemantic: { kind: 'owned-card-type' },
      },
    });
  });

  it('prefers canonical DTO semantics over stale domain card metadata during store import', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const dto = createDTO({
      id: 'dto-wins-card',
      blockId: 'block-canonical',
      xiuyuanID: 'xy-canonical',
      faceKey: { ruleId: 'reverse', faceIndex: 1 },
      templateID: 'builtin-bidirectional',
      meta: {
        content: 'canonical content',
        typeMarker: 'reverse',
        customSemantic: 'canonical',
      },
    });
    const staleCard = {
      ...dto,
      xiuyuanID: 'xy-stale',
      blockId: 'block-stale',
      faceKey: { ruleId: 'stale-rule', faceIndex: 9 },
      meta: {
        content: 'stale content',
        xiuyuanID: 'xy-stale',
        typeMarker: 'stale-rule',
        customSemantic: 'stale',
      },
    } as FSRSCard;

    await repository.saveStore({
      version: 2,
      xiuyuans: {
        'xy-canonical': createXiuyuan('xy-canonical', 'block-canonical'),
      },
      cards: {
        [staleCard.id]: staleCard,
      },
      cardDTOs: {
        [dto.id]: dto,
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    });

    expect(repository.getCard(dto.id)).toMatchObject({
      id: dto.id,
      blockId: 'block-canonical',
      xiuyuanID: 'xy-canonical',
      faceKey: { ruleId: 'reverse', faceIndex: 1 },
      meta: {
        customSemantic: 'canonical',
      },
    });
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

  it('keeps Browser deck SQL pushdown equivalent to shared row helper semantics', async () => {
    const { repository } = await seedRepositories();
    const universe = repository.queryCards();
    const queries = [
      {
        docId: 'doc-a',
        cardTypes: ['item'],
        searchText: 'Delta',
        sortModel: [{ colId: 'priority', sort: 'asc' }] as const,
      },
      {
        docId: 'doc-a',
        cardTypes: ['topic'],
        searchText: 'Beta',
        sortModel: [] as const,
      },
      {
        scopeDocIds: ['doc-a'],
        preset: 'review',
        sortModel: [{ colId: 'priority', sort: 'desc' }] as const,
      },
    ];

    for (const query of queries) {
      expect(repository.queryDeckMatchedIds(query)).toEqual(
        applySharedBrowserRowContract(universe, query),
      );
    }
  });

  it('serves deck page rows from skinny SQL projections without parsing card payload JSON', async () => {
    const { database } = await seedRepositories();
    database.run(
      'UPDATE cards SET payload_json = ?, dto_json = ?, projection_generation = ? WHERE id = ?',
      ['{broken payload json', '{broken dto json', 42, 'card-d'],
    );
    const diagnosticSteps: string[] = [];
    const repository = new SqlUnifiedStorageRepository(database, {
      diagnosticRecorder: (step) => diagnosticSteps.push(step),
    });

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
    expect(page?.generation).toBe(42);
    expect(ids(page?.cards || [])).toEqual(['card-d']);
    expect(page?.cards[0]).toMatchObject({
      id: 'card-d',
      blockId: 'block-d',
      xiuyuanID: 'xy-card-d',
      meta: {
        deckId: 'deck-a',
        rootId: 'doc-a',
        content: 'Delta review',
      },
    });
    expect(diagnosticSteps).toEqual(expect.arrayContaining([
      'queryDeckPage.count',
      'queryDeckPage.select',
    ]));
    expect(diagnosticSteps).not.toContain('queryDeckPage.parse');
  });

  it('serves browser document counts from count-only root projections', async () => {
    const { repository } = await seedRepositories();

    expect(repository.queryBrowserDocumentCounts({
      kind: 'deck',
      preset: 'all',
      searchText: '',
      docId: null,
      scopeDocIds: null,
      cardType: 'all',
    })).toMatchObject({
      status: 'ready',
      owner: 'sql-card-universe',
      rows: [
        { rootId: 'doc-a', count: 3 },
        { rootId: 'doc-b', count: 1 },
      ],
      diagnostics: {
        countOnly: true,
        rowsHydratedForHierarchy: 0,
      },
    });

    expect(repository.queryBrowserDocumentCounts({
      kind: 'deck',
      preset: 'all',
      searchText: '',
      docId: null,
      scopeDocIds: null,
      cardType: 'topic-only',
    })).toMatchObject({
      status: 'ready',
      rows: [
        { rootId: 'doc-a', count: 1 },
      ],
      diagnostics: {
        rowsHydratedForHierarchy: 0,
      },
    });
  });

  it('serves queue browser document counts from ready projection identity without hydrating rows', async () => {
    const { database, repository } = await seedRepositories();

    database.run(
      `INSERT OR REPLACE INTO queue_projection_generations
        (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [QueueType.RetrievalPractice, 'policy-doc-count', 9, 'ready', null, 1_700_000_010_000, '{}'],
    );
    for (const [index, cardId] of ['card-a', 'card-b', 'card-c'].entries()) {
      database.run(
        `INSERT OR REPLACE INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
           priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          QueueType.RetrievalPractice,
          `row-${cardId}`,
          cardId,
          `block-${cardId}`,
          'deck-a',
          'due',
          1_700_000_020_000 + index,
          'due',
          10 + index,
          `000${index}`,
          index,
          'policy-doc-count',
          9,
          JSON.stringify({ fsrsCardId: cardId }),
          1_700_000_020_000 + index,
        ],
      );
    }

    expect(repository.queryBrowserDocumentCounts({
      kind: 'queue',
      queueType: QueueType.RetrievalPractice,
      preset: 'all',
      searchText: '',
      docId: null,
      scopeDocIds: null,
      cardType: 'all',
    })).toMatchObject({
      status: 'ready',
      owner: 'queue-projection',
      rows: [
        { rootId: 'doc-a', count: 2 },
        { rootId: 'doc-b', count: 1 },
      ],
      diagnostics: {
        countOnly: true,
        rowsHydratedForHierarchy: 0,
        queueReadiness: {
          status: 'ready',
          queueId: QueueType.RetrievalPractice,
          policyId: 'policy-doc-count',
          generation: 9,
        },
        projectionIdentity: {
          queueId: QueueType.RetrievalPractice,
          policyId: 'policy-doc-count',
          generation: 9,
        },
      },
    });
  });

  it('fails closed for queue browser document counts when projection generation is invalidated', async () => {
    const { database, repository } = await seedRepositories();

    database.run(
      `INSERT OR REPLACE INTO queue_projection_generations
        (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [QueueType.RetrievalPractice, 'policy-stale', 3, 'invalidated', 'sync-conflict-merge', 1_700_000_010_000, '{}'],
    );

    expect(repository.queryBrowserDocumentCounts({
      kind: 'queue',
      queueType: QueueType.RetrievalPractice,
      preset: 'all',
      searchText: '',
      docId: null,
      scopeDocIds: null,
      cardType: 'all',
    })).toMatchObject({
      status: 'unavailable',
      owner: 'queue-projection',
      rows: [],
      diagnostics: {
        countOnly: true,
        rowsHydratedForHierarchy: 0,
        queueReadiness: {
          status: 'refreshing',
          queueId: QueueType.RetrievalPractice,
          policyId: 'policy-stale',
          generation: 3,
          cause: 'projection_stale',
          retryAfterMs: 300,
        },
      },
    });
  });

  it('supports browser grid sort columns without returning unavailable for aggregate snapshot queries', async () => {
    const { repository } = await seedRepositories();

    const sortableColumns = [
      'content',
      'priority',
      'interval',
      'lastReview',
      'due',
      'reps',
      'lapses',
      'stateLabel',
      'cardType',
      'firstReview',
      'retrievability',
      'difficulty',
      'stability',
    ];

    for (const colId of sortableColumns) {
      expect(repository.queryDeckMatchedIds({ sortModel: [{ colId, sort: 'asc' }] })).not.toBeNull();
    }
  });

  it('sorts retrievability by computed FSRS projection rather than rejecting the query', async () => {
    const { repository } = await seedRepositories();
    const now = 1_700_000_010_000;

    repository.upsertCard({
      ...(repository.getCard('card-a')!),
      stability: 10,
      lastReview: now - 86_400_000,
      updatedAt: now,
      meta: {
        ...(repository.getCard('card-a')?.meta || {}),
      },
    });
    repository.upsertCard({
      ...(repository.getCard('card-b')!),
      stability: 1,
      lastReview: now - 86_400_000,
      updatedAt: now,
      meta: {
        ...(repository.getCard('card-b')?.meta || {}),
      },
    });

    expect(repository.queryDeckMatchedIds({
      sortModel: [{ colId: 'retrievability', sort: 'desc' }],
    })).toEqual(['card-a', 'card-c', 'card-d', 'card-b']);
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
      generation: null,
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
    const missingCard = repository.getCard('card-b');
    expect(missingCard).toBeTruthy();
    repository.upsertCard({
      ...missingCard!,
      meta: {
        ...(missingCard!.meta || {}),
        content: '',
      },
    });

    await repository.updateSourceExistence([
      { cardId: 'card-a', blockId: 'block-a', exists: true },
      { cardId: 'card-b', blockId: 'block-b', exists: false },
    ], 1_700_000_010_000);

    expect(ids(repository.queryCards())).toEqual(['card-a', 'card-c', 'card-d']);
    expect(repository.countCards()).toBe(3);
    expect(repository.countCards({ sourceStatus: 'all' })).toBe(4);
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

  it('treats missing source existence as lost even when old rendered content remains', async () => {
    const { repository } = await seedRepositories();
    await repository.updateSourceExistence([
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
  });

  it('force-selects visible source-existence candidates even when their cache is fresh', async () => {
    const { repository } = await seedRepositories();
    await repository.updateSourceExistence([
      { cardId: 'card-a', blockId: 'block-a', exists: true },
    ], 1_700_000_010_000);

    expect(repository.getSourceExistenceRefreshCandidates({
      blockIds: ['block-a'],
      staleBefore: 1_700_000_000_000,
      limit: 10,
    })).toEqual([]);
    expect(repository.getSourceExistenceRefreshCandidates({
      blockIds: ['block-a'],
      force: true,
      staleBefore: 1_700_000_000_000,
      limit: 10,
    })).toMatchObject([
      { cardId: 'card-a', blockId: 'block-a', sourceExists: true },
    ]);
  });

  it('treats active tombstones as deletion truth for SQL card reads', async () => {
    const { storage, repository } = await seedRepositories();
    const store = storage.getStoreData();
    store.deletedCardDTOs = {
      ...(store.deletedCardDTOs || {}),
      'card-b': {
        deletedAt: 1_700_000_010_000,
        deletedBy: 'test-delete',
      },
    };
    await repository.saveStore(store);

    expect(repository.getCard('card-b')).toBeUndefined();
    expect(repository.getCardByBlockId('block-b')).toBeUndefined();
    expect(ids(repository.getCardsByIds(['card-a', 'card-b', 'card-c']))).toEqual(['card-a', 'card-c']);
    expect(ids(repository.queryCards())).toEqual(['card-a', 'card-c', 'card-d']);
    expect(repository.countCards()).toBe(3);
    expect(repository.queryDeckMatchedIds({ sortModel: [] })).toEqual(['card-a', 'card-c', 'card-d']);
    expect(repository.getBrowserStats(1_700_000_002_500)).toMatchObject({
      totalCards: 3,
      dueCards: 2,
      lostCards: 0,
    });

    const loaded = await repository.loadStore();
    expect(loaded.cards['card-b']).toBeUndefined();
    expect(loaded.cardDTOs?.['card-b']).toBeUndefined();
    expect(loaded.deletedCardDTOs?.['card-b']).toMatchObject({ deletedBy: 'test-delete' });
  });

  it('saves and reloads unreviewed new-card empty FSRS memory', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const dto = createDTO({
      id: 'card-empty-new-memory',
      blockId: 'block-empty-new-memory',
      state: CardState.New,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learning_step: 0,
      xiuyuanID: 'xy-empty-new-memory',
    });

    await repository.saveStore({
      version: 2,
      xiuyuans: {
        'xy-empty-new-memory': createXiuyuan('xy-empty-new-memory', dto.blockId),
      },
      cards: {},
      cardDTOs: {
        [dto.id]: dto,
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    });

    const loaded = await repository.loadStore();
    expect(loaded.cardDTOs?.[dto.id]).toMatchObject({
      state: CardState.New,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lastReview: 0,
    });
    expect(repository.getCard(dto.id)).toMatchObject({
      state: CardState.New,
      stability: 0,
      difficulty: 0,
    });
  });

  it('repairs polluted lastReview on DTO-only unreviewed new-card empty FSRS memory', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const importedAt = 1_777_804_699_943;
    const dto = createDTO({
      id: '20260430101444-otdi7bu',
      blockId: '20260430101444-otdi7bu',
      state: CardState.New,
      due: importedAt - 418,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReview: importedAt,
      elapsedDays: 0,
      scheduledDays: 0,
      learning_step: 0,
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
      xiuyuanID: 'xy_20260430101444-otdi7bu',
      templateID: 'builtin-riff-sync',
      frontBlockIDs: ['20260430101444-otdi7bu'],
      backBlockIDs: ['20260430101444-otdi7bu'],
    });

    await repository.saveStore({
      version: 2,
      xiuyuans: {
        [dto.xiuyuanID!]: createXiuyuan(dto.xiuyuanID!, dto.blockId),
      },
      cards: {},
      cardDTOs: {
        [dto.id]: dto,
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    });

    const loaded = await repository.loadStore();
    expect(loaded.cardDTOs?.[dto.id]).toMatchObject({
      state: CardState.New,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lastReview: 0,
    });
    expect(repository.getCard(dto.id)).toMatchObject({
      state: CardState.New,
      lastReview: 0,
      stability: 0,
      difficulty: 0,
    });
  });

  it('saves and reloads review-state a-factor cards with empty FSRS memory fields', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const dto = createDTO({
      id: '20211020084142-v4m7d1n',
      blockId: 'block-topic-empty-fsrs-memory',
      type: CardType.Topic,
      state: CardState.Review,
      schedulerType: 'a-factor-v2',
      stability: 0,
      difficulty: 0,
      reps: 4,
      lastReview: 1_699_000_000_000,
      xiuyuanID: 'xy-topic-empty-fsrs-memory',
      aFactor: 2.5,
      schedulerMeta: {
        topic: {
          afs: [2.5],
          of: 2.5,
          optimalInterval: 1,
        },
      },
    });

    await repository.saveStore({
      version: 2,
      xiuyuans: {
        'xy-topic-empty-fsrs-memory': createXiuyuan('xy-topic-empty-fsrs-memory', dto.blockId),
      },
      cards: {},
      cardDTOs: {
        [dto.id]: dto,
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    });

    const loaded = await repository.loadStore();
    expect(loaded.cardDTOs?.[dto.id]).toMatchObject({
      id: '20211020084142-v4m7d1n',
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
      state: CardState.Review,
      stability: 0,
      difficulty: 0,
      aFactor: 2.5,
    });
  });

  it('repairs reviewed empty FSRS memory before SQL save validation', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const dto = createDTO({
      id: 'card-empty-review-memory',
      blockId: 'block-empty-review-memory',
      state: CardState.Review,
      stability: 0,
      difficulty: 0,
      reps: 1,
      lastReview: 1_699_000_000_000,
      xiuyuanID: 'xy-empty-review-memory',
    });

    await repository.saveStore({
      version: 2,
      xiuyuans: {
        'xy-empty-review-memory': createXiuyuan('xy-empty-review-memory', dto.blockId),
      },
      cards: {},
      cardDTOs: {
        [dto.id]: dto,
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    });

    const loaded = await repository.loadStore();
    expect(loaded.cardDTOs?.[dto.id]).toMatchObject({
      state: CardState.Review,
      stability: expect.any(Number),
      difficulty: 5,
    });
    expect(loaded.cardDTOs?.[dto.id]?.stability).toBeGreaterThan(0);
  });

  it('reports card-scoped diagnostics for unrecoverable out-of-range scheduling DTOs', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const dto = createDTO({
      id: 'card-unrecoverable-difficulty',
      blockId: 'block-unrecoverable-difficulty',
      state: CardState.New,
      stability: 1,
      difficulty: 99,
      reps: 0,
      lastReview: 0,
      xiuyuanID: 'xy-unrecoverable-difficulty',
    });

    await expect(repository.saveStore({
      version: 2,
      xiuyuans: {
        'xy-unrecoverable-difficulty': createXiuyuan('xy-unrecoverable-difficulty', dto.blockId),
      },
      cards: {},
      cardDTOs: {
        [dto.id]: dto,
      },
      deletedCardDTOs: {},
      deletedXiuyuans: {},
    })).rejects.toThrow(/Invalid card DTO card-unrecoverable-difficulty: Invalid difficulty: must be between 0 and 10/);
  });

  it('records card-deleted domain sync operations when a card tombstone is saved', async () => {
    const storage = new UnifiedStorageManager();
    const dto = createDTO({
      id: 'card-delete-ledger',
      blockId: 'block-delete-ledger',
      updatedAt: 1_700_000_000_000,
    });
    const result = await storage.createCardDTO(createXiuyuan('xy-delete-ledger', dto.blockId), dto);
    expect(result.ok).toBe(true);
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database, {
      domainSyncLedger: new DomainSyncLedger(database),
    });
    const store = storage.getStoreData();
    store.deletedCardDTOs = {
      ...(store.deletedCardDTOs || {}),
      'card-delete-ledger': {
        deletedAt: 1_700_000_020_000,
        deletedBy: 'test-delete-ledger',
      },
    };

    await repository.saveStore(store);
    await repository.saveStore(store);

    const ledgerRows = database.getAll<{
      operation_type: string;
      entity_id: string;
      entity_block_id: string | null;
      idempotency_key: string | null;
      payload_fingerprint: string;
      payload_json: string;
    }>(
      `SELECT operation_type, entity_id, entity_block_id, idempotency_key, payload_fingerprint, payload_json
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?
       ORDER BY operation_id`,
      ['card-deleted', 'card-delete-ledger'],
    );
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({
      operation_type: 'card-deleted',
      entity_id: 'card-delete-ledger',
      entity_block_id: 'block-delete-ledger',
      idempotency_key: 'card-delete:card-delete-ledger:1700000020000',
    });
    expect(ledgerRows[0].payload_fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.parse(ledgerRows[0].payload_json)).toMatchObject({
      cardId: 'card-delete-ledger',
      blockId: 'block-delete-ledger',
      deletedAt: 1_700_000_020_000,
      deletedBy: 'test-delete-ledger',
      idempotencyKey: 'card-delete:card-delete-ledger:1700000020000',
    });
  });

  it('hydrates card ids with active-source semantics and preserves unknown fail-open behavior', async () => {
    const { repository } = await seedRepositories();
    const missingCard = repository.getCard('card-b');
    expect(missingCard).toBeTruthy();
    repository.upsertCard({
      ...missingCard!,
      meta: {
        ...(missingCard!.meta || {}),
        content: '',
      },
    });
    await repository.updateSourceExistence([
      { cardId: 'card-a', blockId: 'block-a', exists: true },
      { cardId: 'card-b', blockId: 'block-b', exists: false },
    ], 1_700_000_010_000);

    expect(ids(repository.getCardsByIds(['card-a', 'card-b', 'card-c']))).toEqual([
      'card-a',
      'card-c',
    ]);
  });

  it('prefers exact card ids over block-id aliases for colliding projection identities', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const exactCardId = '20260420154247-90cjg7w';
    const exactCard = createDTO({
      id: exactCardId,
      blockId: exactCardId,
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
      aFactor: 2.6,
      priority: 30,
      xiuyuanID: 'xy-exact-card',
      meta: { content: 'exact topic' },
    }) as unknown as FSRSCard;
    const blockAliasCard = createDTO({
      id: `card-${exactCardId}`,
      blockId: exactCardId,
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
      aFactor: 3.1,
      priority: 5,
      xiuyuanID: 'xy-block-alias-card',
      meta: { content: 'block alias topic' },
    }) as unknown as FSRSCard;

    repository.upsertCards([exactCard, blockAliasCard]);

    expect(ids(repository.getCardsByIds([exactCardId]))).toEqual([exactCardId]);
    expect(ids(repository.getCardsByExactIds([exactCardId]))).toEqual([exactCardId]);
    expect(ids(repository.getCardsByExactIds(['missing-card-id']))).toEqual([]);
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

  it('does not dirty the database when source existence status is unchanged', async () => {
    const { database, repository } = await seedRepositories();
    await repository.updateSourceExistence([
      { cardId: 'card-a', blockId: 'block-a', exists: true },
    ], 1_700_000_010_000);
    const first = database.getOne<{
      source_exists: number | null;
      source_checked_at: number | null;
      source_missing_at: number | null;
    }>(
      'SELECT source_exists, source_checked_at, source_missing_at FROM cards WHERE id = ?',
      ['card-a'],
    );

    await repository.updateSourceExistence([
      { cardId: 'card-a', blockId: 'block-a', exists: true },
    ], 1_700_000_020_000);

    expect(database.getOne<{
      source_exists: number | null;
      source_checked_at: number | null;
      source_missing_at: number | null;
    }>(
      'SELECT source_exists, source_checked_at, source_missing_at FROM cards WHERE id = ?',
      ['card-a'],
    )).toEqual(first);
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

  it('does not project or persist scheduling truth from card meta', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const dirtyItem = {
      ...createDTO({
        id: 'item-meta-afactor',
        blockId: 'block-item-meta-afactor',
        type: CardType.Item,
        schedulerType: 'fsrs-v6',
        meta: {
          content: 'Item with polluted meta afactor',
          aFactor: 9,
          nextDues: { good: 1 },
        },
      }),
      xiuyuanID: 'xy-item-meta-afactor',
      schedulerType: 'fsrs-v6',
      meta: {
        content: 'Item with polluted meta afactor',
        aFactor: 9,
        nextDues: { good: 1 },
      },
    } as FSRSCard;
    const cleanTopic = {
      ...createDTO({
        id: 'topic-afactor',
        blockId: 'block-topic-afactor',
        type: CardType.Topic,
        schedulerType: 'a-factor-v2',
        aFactor: 2.5,
        meta: {
          content: 'Topic with real afactor',
        },
      }),
      xiuyuanID: 'xy-topic-afactor',
      schedulerType: 'a-factor-v2',
      aFactor: 2.5,
      meta: {
        content: 'Topic with real afactor',
      },
    } as FSRSCard;

    repository.upsertCard(dirtyItem);
    repository.upsertCard(cleanTopic);

    expect(repository.getCard('item-meta-afactor')).toMatchObject({
      schedulerType: 'fsrs-v6',
      meta: { content: 'Item with polluted meta afactor' },
    });
    expect(repository.getCard('item-meta-afactor')?.aFactor).toBeUndefined();
    expect(repository.queryDeckMatchedIds({
      sortModel: [{ colId: 'aFactor', sort: 'desc' }],
    })).toEqual(['topic-afactor', 'item-meta-afactor']);
  });

  it('writes algorithm_card_state and hydrates cards from that authoritative state row', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const card = {
      ...createDTO({
        id: 'state-authority',
        blockId: 'block-state-authority',
        type: CardType.Item,
        state: CardState.Review,
        due: 1_700_000_000_000,
        scheduledDays: 5,
        stability: 5,
        difficulty: 5,
      }),
      xiuyuanID: 'xy-state-authority',
      schedulerType: 'fsrs-v6',
    } as FSRSCard;

    repository.upsertCard(card);
    const storedState = database.getOne<{ algorithm_id: string; state_json: string }>(
      'SELECT algorithm_id, state_json FROM algorithm_card_state WHERE card_id = ?',
      ['state-authority'],
    );
    expect(storedState?.algorithm_id).toBe('fsrs-v6');

    const rowState = deriveAlgorithmCardState({
      ...card,
      due: 1_700_900_000_000,
      scheduledDays: 9,
      stability: 9,
      difficulty: 4,
    }).state;
    database.run(
      'UPDATE algorithm_card_state SET state_json = ? WHERE card_id = ? AND algorithm_id = ?',
      [stringifyAlgorithmCardState(rowState), 'state-authority', 'fsrs-v6'],
    );

    expect(repository.getCard('state-authority')).toMatchObject({
      due: 1_700_900_000_000,
      scheduledDays: 9,
      stability: 9,
      difficulty: 4,
    });
    expect(repository.getAlgorithmCardStateDiagnostic()).toMatchObject({
      total: 1,
      dirty: 1,
      cardStateMismatches: 1,
    });
    const summary = repository.backfillAlgorithmCardStates(1_701_000_000_000);
    expect(summary.afterDirty).toBe(0);
    expect(repository.getAlgorithmCardStateDiagnostic().dirty).toBe(0);
  });

  it('touches Review mutation metadata without loading the full unified store', async () => {
    const { database, repository } = await seedRepositories();
    let loadStoreCalls = 0;
    const originalLoadStore = repository.loadStore.bind(repository);
    repository.loadStore = async (reason?: Parameters<typeof repository.loadStore>[0]) => {
      loadStoreCalls += 1;
      return originalLoadStore(reason);
    };

    await repository.touchReviewMutationMetadata({
      modifiedAt: 1_700_300_000_000,
      modifiedBy: 'srs-backend-worker:review.feedback',
    });

    const reviewStampRow = database.getOne<{ value_json: string }>(
      'SELECT value_json FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    );
    const reviewStamp = JSON.parse(reviewStampRow?.value_json ?? '{}') as {
      revision?: number;
      contentHash?: string;
      lastModifiedAt?: number;
      lastModifiedBy?: string;
    };
    expect(loadStoreCalls).toBe(0);
    expect(Number(reviewStamp.revision)).toBeGreaterThan(0);
    expect(reviewStamp).toMatchObject({
      lastModifiedAt: 1_700_300_000_000,
      lastModifiedBy: 'srs-backend-worker:review.feedback',
    });
    expect(reviewStamp.contentHash).toMatch(/^[0-9a-f]{16}$/);

    await repository.touchSyncMetadata({
      modifiedAt: 1_700_300_000_001,
      modifiedBy: 'full-sync',
    });

    const fullTouchRow = database.getOne<{ value_json: string }>(
      'SELECT value_json FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    );
    const fullTouch = JSON.parse(fullTouchRow?.value_json ?? '{}') as {
      revision?: number;
      contentHash?: string;
      lastModifiedAt?: number;
      lastModifiedBy?: string;
    };
    expect(loadStoreCalls).toBe(1);
    expect(fullTouch).toMatchObject({
      revision: Number(reviewStamp.revision) + 1,
      lastModifiedAt: 1_700_300_000_001,
      lastModifiedBy: 'full-sync',
    });
    expect(fullTouch.contentHash).toMatch(/^[0-9a-f]{16}$/);
    expect(fullTouch.contentHash).not.toBe(reviewStamp.contentHash);
  });

  it('diagnoses missing and invalid algorithm_card_state rows and backfills them cleanly', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const missing = {
      ...createDTO({
        id: 'state-missing',
        blockId: 'block-state-missing',
        type: CardType.Item,
      }),
      xiuyuanID: 'xy-state-missing',
      schedulerType: 'fsrs-v6',
    } as FSRSCard;
    const invalid = {
      ...createDTO({
        id: 'state-invalid',
        blockId: 'block-state-invalid',
        type: CardType.Item,
      }),
      xiuyuanID: 'xy-state-invalid',
      schedulerType: 'fsrs-v6',
    } as FSRSCard;

    repository.upsertCard(missing);
    repository.upsertCard(invalid);
    database.run(
      'DELETE FROM algorithm_card_state WHERE card_id = ?',
      ['state-missing'],
    );
    database.run(
      'UPDATE algorithm_card_state SET state_json = ? WHERE card_id = ?',
      [
        JSON.stringify({
          schemaVersion: 1,
          schedulerType: 'fsrs-v6',
          common: {
            due: invalid.due,
            state: invalid.state,
            reps: invalid.reps,
            lapses: invalid.lapses,
            lastReview: invalid.lastReview,
            elapsedDays: invalid.elapsedDays,
            scheduledDays: invalid.scheduledDays,
          },
          fsrs: { stability: 1, difficulty: 99 },
        }),
        'state-invalid',
      ],
    );

    expect(repository.getAlgorithmCardStateDiagnostic()).toMatchObject({
      total: 2,
      dirty: 2,
      missingStateRows: 1,
      invalidStateRows: 1,
    });
    const summary = repository.backfillAlgorithmCardStates(1_701_000_000_000);
    expect(summary.backfilled).toBe(1);
    expect(summary.afterDirty).toBe(0);
    expect(repository.getAlgorithmCardStateDiagnostic()).toMatchObject({
      dirty: 0,
      missingStateRows: 0,
      invalidStateRows: 0,
    });
  });

  it('reads SQL semantic repair candidates from active card rows', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    repository.upsertCard({
      ...createDTO({
        id: 'semantic-candidate',
        blockId: 'block-semantic-candidate',
        type: CardType.Topic,
        templateID: 'builtin-list-item',
      }),
      meta: { templateID: 'builtin-list-item' },
    } as FSRSCard);

    const candidates = repository.querySrsCardSemanticRepairCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: 'semantic-candidate',
      type: CardType.Topic,
      meta: expect.objectContaining({ templateID: 'builtin-list-item' }),
    });
  });

  it('applies deterministic semantic repairs, invalidates queue projections, and writes receipts', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlUnifiedStorageRepository(database);
    const corrupted = {
      ...createDTO({
        id: 'repair-list-as-topic',
        blockId: 'block-repair-list',
        type: CardType.Topic,
        templateID: 'builtin-list-item',
      }),
      meta: { templateID: 'builtin-list-item' },
    } as FSRSCard;
    repository.upsertCard(corrupted);
    database.run(
      `INSERT OR REPLACE INTO queue_projection_generations
        (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [QueueType.RetrievalPractice, 'policy-a', 7, 'ready', null, 1_700_000_000_000, '{}'],
    );
    database.run(
      `INSERT OR REPLACE INTO queue_projection_rows
        (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
         priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        QueueType.RetrievalPractice,
        'row-1',
        'repair-list-as-topic',
        'block-repair-list',
        null,
        'due',
        1,
        'due',
        50,
        '0001',
        0,
        'policy-a',
        7,
        JSON.stringify({ cardType: CardType.Topic }),
        1_700_000_000_000,
      ],
    );
    const safePlan = planCardSemanticRepair({ card: corrupted });

    const result = await repository.applySrsCardSemanticRepairPlans({
      safePlans: [safePlan],
      skippedPlans: [],
      preview: {
        status: 'ready',
        counts: {
          total: 1,
          safeRepair: 1,
          ambiguous: 0,
          insufficient: 0,
          noop: 0,
          skipped: 0,
        },
        rows: [],
        audits: [],
      },
    });

    expect(result).toMatchObject({
      repairedCount: 1,
      failedCardIds: [],
      updatedCards: [expect.objectContaining({ id: 'repair-list-as-topic', type: CardType.Item })],
    });
    expect(repository.getCard('repair-list-as-topic')).toMatchObject({
      type: CardType.Item,
      cardTypeMarker: undefined,
    });
    expect(database.getOne<{ status: string; rebuild_reason: string | null }>(
      'SELECT status, rebuild_reason FROM queue_projection_generations WHERE queue_type = ?',
      [QueueType.RetrievalPractice],
    )).toMatchObject({
      status: 'invalidated',
      rebuild_reason: 'srs-card-semantic-repair',
    });
    expect(database.getAll<{ card_id: string }>(
      'SELECT card_id FROM queue_projection_rows WHERE card_id = ?',
      ['repair-list-as-topic'],
    )).toHaveLength(0);
    const receipt = database.getOne<{ payload_json: string }>(
      'SELECT payload_json FROM srs_card_semantic_repair_receipts WHERE receipt_id = ?',
      [result.receiptId],
    );
    expect(JSON.parse(receipt?.payload_json ?? '{}')).toMatchObject({
      repairedCardIds: ['repair-list-as-topic'],
      skippedPlans: [],
      failedCardIds: [],
    });
  });
});
