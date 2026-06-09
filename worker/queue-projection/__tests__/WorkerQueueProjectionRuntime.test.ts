import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type { QueueProjectionCounters, QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import {
  buildOrderedQueueProjectionRows,
} from '@/application/services/queue-projection/QueueProjectionBuilder';
import {
  buildQueueProjectionCountersFromRows,
  WorkerQueueProjectionRuntime,
} from '../WorkerQueueProjectionRuntime';

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

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-active',
    xiuyuanID: overrides.xiuyuanID ?? 'xy-active',
    blockId: overrides.blockId ?? 'block-active',
    due: overrides.due ?? now,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 1,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now - 86_400_000,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 3,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now - 86_400_000,
    updatedAt: overrides.updatedAt ?? now,
    riffCardId: overrides.riffCardId,
    meta: overrides.meta ?? { content: 'active card' },
  };
}

function createProjectionRow(overrides: Partial<QueueProjectionRow> = {}): QueueProjectionRow {
  return {
    queueType: overrides.queueType ?? QueueType.IncrementalLearning,
    rowId: overrides.rowId ?? 'row-active',
    cardId: overrides.cardId ?? 'card-active',
    blockId: overrides.blockId ?? 'block-active',
    deckId: overrides.deckId ?? null,
    membershipReason: overrides.membershipReason ?? 'review-due',
    dueAt: overrides.dueAt ?? 1_700_000_000_000,
    dueBucket: overrides.dueBucket ?? 'due',
    priorityScore: overrides.priorityScore ?? 50,
    sortKey: overrides.sortKey ?? '0001',
    queueIndexHint: overrides.queueIndexHint ?? 1,
    policyHash: overrides.policyHash ?? 'policy-browser',
    sourceGeneration: overrides.sourceGeneration ?? 7,
    payload: overrides.payload ?? {},
    updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
  };
}

describe('WorkerQueueProjectionRuntime', () => {
  it('returns refreshing when ready generation rows reference missing cards', async () => {
    const queueType = QueueType.IncrementalLearning;
    const policyHash = 'policy-browser';
    const generation = 7;
    const activeRow = createProjectionRow({ rowId: 'row-active', cardId: 'card-active', blockId: 'block-active' });
    const inactiveRow = createProjectionRow({
      rowId: 'row-missing-source',
      cardId: 'card-missing-source',
      blockId: 'block-missing-source',
      sortKey: '0002',
      queueIndexHint: 2,
    });
    const rows = [activeRow, inactiveRow];
    const counters = buildQueueProjectionCountersFromRows({
      queueType,
      policyHash,
      generation,
      updatedAt: 1_700_000_000_000,
      now: 1_700_000_000_000,
      rows,
    });
    const activeCard = createCard();
    const runtime = new WorkerQueueProjectionRuntime({
      repository: {
        getCardsByExactIds: vi.fn((ids: string[]) => ids.filter((id) => id === activeCard.id).map(() => activeCard)),
      },
      queueProjection: {
        readGeneration: vi.fn(() => ({
          queueType,
          policyHash,
          generation,
          status: 'ready',
          rebuildReason: null,
          updatedAt: 1_700_000_000_000,
          metadata: {},
        })),
        readLastReadyGeneration: vi.fn(() => null),
        readCounters: vi.fn((): QueueProjectionCounters => counters),
        readRows: vi.fn(() => rows),
        replaceQueueProjection: vi.fn(),
      },
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    const snapshot = await runtime.snapshot({ queueType });

    expect(snapshot.status).toBe('refreshing');
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.counters).toBeNull();
    expect(snapshot.freshness).toMatchObject({
      totalRows: 2,
      freshRows: 1,
      staleRows: 0,
      missingRows: 1,
      missingCardIds: ['card-missing-source'],
    });
  });

  it('returns refreshing for hard reads and serves last-good only for soft-stale reads while current generation rebuilds', async () => {
    const queueType = QueueType.IncrementalLearning;
    const lastReady = {
      queueType,
      policyHash: 'policy-ready',
      generation: 7,
      status: 'ready' as const,
      rebuildReason: null,
      updatedAt: 1_700_000_000_000,
      metadata: {},
    };
    const rebuilding = {
      queueType,
      policyHash: 'policy-next',
      generation: 8,
      status: 'invalidated' as const,
      rebuildReason: 'review-feedback',
      updatedAt: 1_700_000_001_000,
      metadata: {
        lastReadyGeneration: {
          policyHash: 'policy-ready',
          generation: 7,
          updatedAt: 1_700_000_000_000,
        },
      },
    };
    const row = createProjectionRow({
      policyHash: 'policy-ready',
      sourceGeneration: 7,
      rowId: 'row-ready',
      cardId: 'card-active',
    });
    const counters = buildQueueProjectionCountersFromRows({
      queueType,
      policyHash: 'policy-ready',
      generation: 7,
      updatedAt: 1_700_000_000_000,
      now: 1_700_000_000_000,
      rows: [row],
    });
    const runtime = new WorkerQueueProjectionRuntime({
      repository: {
        getCardsByExactIds: vi.fn(() => [createCard()]),
      },
      queueProjection: {
        readGeneration: vi.fn(() => rebuilding),
        readLastReadyGeneration: vi.fn(() => lastReady),
        readCounters: vi.fn((): QueueProjectionCounters => counters),
        readRows: vi.fn(() => [row]),
        replaceQueueProjection: vi.fn(),
      },
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    const hard = await runtime.snapshot({ queueType });
    expect(hard.status).toBe('refreshing');
    expect(hard.rows).toEqual([]);

    const soft = await runtime.snapshot({ queueType, allowStale: true });
    expect(soft.status).toBe('ready');
    expect(soft.policyHash).toBe('policy-ready');
    expect(soft.generation).toBe(7);
    expect(soft.stale).toBe(true);
    expect(soft.rows.map((snapshotRow) => snapshotRow.fsrsCardId)).toEqual(['card-active']);
  });

  it('returns refreshing when projection generation is missing but storage is available', async () => {
    const queueType = QueueType.FilterGroup;
    const runtime = new WorkerQueueProjectionRuntime({
      repository: {
        getCardsByExactIds: vi.fn(() => []),
      },
      queueProjection: {
        readGeneration: vi.fn(() => null),
        readLastReadyGeneration: vi.fn(() => null),
        readCounters: vi.fn(() => null),
        readRows: vi.fn(() => []),
        replaceQueueProjection: vi.fn(),
      },
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    await expect(runtime.snapshot({ queueType })).resolves.toMatchObject({
      queueType,
      status: 'refreshing',
      policyHash: null,
      generation: null,
      rows: [],
      counters: null,
      cacheState: 'missing-derived-cache',
    });
  });

  it('keeps a committed compatible zero-row projection as ready empty', async () => {
    const queueType = QueueType.FilterGroup;
    const policyHash = 'policy-empty';
    const generation = 11;
    const counters = buildQueueProjectionCountersFromRows({
      queueType,
      policyHash,
      generation,
      updatedAt: 1_700_000_000_000,
      now: 1_700_000_000_000,
      rows: [],
    });
    const runtime = new WorkerQueueProjectionRuntime({
      repository: {
        getCardsByExactIds: vi.fn(() => []),
      },
      queueProjection: {
        readGeneration: vi.fn(() => ({
          queueType,
          policyHash,
          generation,
          status: 'ready',
          rebuildReason: null,
          updatedAt: 1_700_000_000_000,
          metadata: {},
        })),
        readLastReadyGeneration: vi.fn(() => null),
        readCounters: vi.fn((): QueueProjectionCounters => counters),
        readRows: vi.fn(() => []),
        replaceQueueProjection: vi.fn(),
      },
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    await expect(runtime.snapshot({ queueType })).resolves.toMatchObject({
      queueType,
      policyHash,
      generation,
      status: 'ready',
      rows: [],
      counters: expect.objectContaining({ total: 0 }),
      cacheState: 'ready-empty',
    });
  });

  it('serves full ready snapshots above the repository default row window', async () => {
    const queueType = QueueType.IncrementalLearning;
    const policyHash = 'policy-large-incremental';
    const generation = 12;
    const now = 1_700_000_000_000;
    const rows = Array.from({ length: 501 }, (_, index) => createProjectionRow({
      queueType,
      policyHash,
      sourceGeneration: generation,
      rowId: `large-row-${index}`,
      cardId: `large-card-${index}`,
      blockId: `large-block-${index}`,
      dueAt: now,
      priorityScore: index,
      sortKey: String(index).padStart(4, '0'),
      queueIndexHint: index + 1,
      payload: { cardType: CardType.Item },
    }));
    const counters = buildQueueProjectionCountersFromRows({
      queueType,
      policyHash,
      generation,
      updatedAt: now,
      now,
      rows,
    });
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const queueProjection = new SqlQueueProjectionRepository(database);
    queueProjection.replaceQueueProjection({
      queueType,
      policyHash,
      generation,
      rows,
      counters,
    });
    const cardsById = new Map(rows.map((row) => [
      row.cardId,
      createCard({
        id: row.cardId,
        blockId: row.blockId || row.cardId,
        due: now,
        priority: row.priorityScore,
      }),
    ]));
    const runtime = new WorkerQueueProjectionRuntime({
      repository: {
        getCardsByExactIds: vi.fn((ids: string[]) => ids
          .map((id) => cardsById.get(id))
          .filter((card): card is FSRSCard => Boolean(card))),
      },
      queueProjection,
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    const snapshot = await runtime.snapshot({ queueType });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.rows).toHaveLength(501);
    expect(snapshot.counters).toMatchObject({
      total: 501,
      remaining: 501,
    });
    expect(snapshot.cacheState).toBe('ready-populated');
  });

  it('keeps incremental-learning ready when two local cards share the same Riff card id', async () => {
    const queueType = QueueType.IncrementalLearning;
    const policyHash = 'policy-shared-riff';
    const generation = 13;
    const now = 1_700_000_000_000;
    const riffCardId = '20260415034044-66oa2em';
    const cards = [
      createCard({
        id: '20260415034039-4gpdpyo',
        blockId: 'block-shared-a',
        priority: 10,
        riffCardId,
      }),
      createCard({
        id: 'card-20260415034039-4gpdpyo',
        blockId: 'block-shared-b',
        priority: 20,
        riffCardId,
      }),
    ];
    const projection = buildOrderedQueueProjectionRows({
      queueType,
      cards,
      now,
      policyHash,
      sourceGeneration: generation,
      updatedAt: now,
      membershipReason: 'materialized-strategy',
    });
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const queueProjection = new SqlQueueProjectionRepository(database);
    queueProjection.replaceQueueProjection({
      queueType,
      policyHash,
      generation,
      rows: projection.rows,
      counters: projection.counters,
    });
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const runtime = new WorkerQueueProjectionRuntime({
      repository: {
        getCardsByExactIds: vi.fn((ids: string[]) => ids
          .map((id) => cardsById.get(id))
          .filter((card): card is FSRSCard => Boolean(card))),
      },
      queueProjection,
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    const snapshot = await runtime.snapshot({ queueType });

    expect(projection.rows.map((row) => row.rowId)).toEqual(cards.map((card) => card.id));
    expect(snapshot).toMatchObject({
      status: 'ready',
      policyHash,
      generation,
      cacheState: 'ready-populated',
      counters: {
        total: 2,
        remaining: 2,
      },
    });
    expect(snapshot.rows.map((row) => row.id)).toEqual(cards.map((card) => card.id));
    expect(snapshot.rows.map((row) => row.fsrsCardId)).toEqual(cards.map((card) => card.id));
  });

  it('hydrates projection source cards by exact card id when another card uses that id as block id', async () => {
    const queueType = QueueType.IncrementalLearning;
    const policyHash = 'policy-exact-card-id';
    const generation = 14;
    const now = 1_700_000_000_000;
    const exactCardId = '20260420154247-90cjg7w';
    const exactCard = createCard({
      id: exactCardId,
      blockId: exactCardId,
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
      aFactor: 2.6,
    });
    const collidingBlockCard = createCard({
      id: `card-${exactCardId}`,
      blockId: exactCardId,
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
      aFactor: 3.1,
      priority: 5,
    });
    const projection = buildOrderedQueueProjectionRows({
      queueType,
      cards: [exactCard],
      now,
      policyHash,
      sourceGeneration: generation,
      updatedAt: now,
      membershipReason: 'materialized-strategy',
    });
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const storage = new SqlUnifiedStorageRepository(database);
    storage.upsertCards([exactCard, collidingBlockCard]);
    const queueProjection = new SqlQueueProjectionRepository(database);
    queueProjection.replaceQueueProjection({
      queueType,
      policyHash,
      generation,
      rows: projection.rows,
      counters: projection.counters,
    });
    const runtime = new WorkerQueueProjectionRuntime({
      repository: storage,
      queueProjection,
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    const snapshot = await runtime.snapshot({ queueType });

    expect(snapshot).toMatchObject({
      status: 'ready',
      policyHash,
      generation,
      cacheState: 'ready-populated',
    });
    expect(snapshot.rows.map((row) => row.fsrsCardId)).toEqual([exactCardId]);
  });

  it('returns refreshing when row freshness proves stale projection membership', async () => {
    const queueType = QueueType.RetrievalPractice;
    const policyHash = 'policy-stale';
    const generation = 4;
    const row = createProjectionRow({
      queueType,
      policyHash,
      sourceGeneration: generation,
      cardId: 'card-active',
      dueAt: 1,
    });
    const runtime = new WorkerQueueProjectionRuntime({
      repository: {
        getCardsByExactIds: vi.fn(() => [createCard({ due: 2 })]),
      },
      queueProjection: {
        readGeneration: vi.fn(() => ({
          queueType,
          policyHash,
          generation,
          status: 'ready',
          rebuildReason: null,
          updatedAt: 1_700_000_000_000,
          metadata: {},
        })),
        readLastReadyGeneration: vi.fn(() => null),
        readCounters: vi.fn(() => buildQueueProjectionCountersFromRows({
          queueType,
          policyHash,
          generation,
          updatedAt: 1_700_000_000_000,
          now: 1_700_000_000_000,
          rows: [row],
        })),
        readRows: vi.fn(() => [row]),
        replaceQueueProjection: vi.fn(),
      },
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    const snapshot = await runtime.snapshot({ queueType });

    expect(snapshot.status).toBe('refreshing');
    expect(snapshot.freshness).toMatchObject({
      totalRows: 1,
      freshRows: 0,
      staleRows: 1,
      missingRows: 0,
      staleCardIds: ['card-active'],
    });
  });

  it('returns refreshing when row hydration requests missing SQL rows', async () => {
    const queueType = QueueType.FilterGroup;
    const policyHash = 'policy-filter';
    const generation = 5;
    const runtime = new WorkerQueueProjectionRuntime({
      repository: {
        getCardsByExactIds: vi.fn(() => []),
      },
      queueProjection: {
        readGeneration: vi.fn(() => ({
          queueType,
          policyHash,
          generation,
          status: 'ready',
          rebuildReason: null,
          updatedAt: 1_700_000_000_000,
          metadata: {},
        })),
        readLastReadyGeneration: vi.fn(() => null),
        readCounters: vi.fn(() => null),
        readRows: vi.fn(() => []),
        replaceQueueProjection: vi.fn(),
      },
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    const result = await runtime.rowsByIds({ queueType, ids: ['missing-row'] });

    expect(result.status).toBe('refreshing');
    expect(result.rows).toEqual([]);
    expect(result.cards).toEqual([]);
    expect(result.freshness).toMatchObject({
      totalRows: 1,
      freshRows: 0,
      staleRows: 0,
      missingRows: 1,
      missingCardIds: ['missing-row'],
    });
    expect(result.cacheState).toBe('missing-derived-cache');
  });
});
