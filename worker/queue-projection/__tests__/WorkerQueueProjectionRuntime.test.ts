import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type { QueueProjectionCounters, QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import {
  buildQueueProjectionCountersFromRows,
  WorkerQueueProjectionRuntime,
} from '../WorkerQueueProjectionRuntime';

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
        getCardsByIds: vi.fn((ids: string[]) => ids.filter((id) => id === activeCard.id).map(() => activeCard)),
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
        getCardsByIds: vi.fn(() => [createCard()]),
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
        getCardsByIds: vi.fn(() => []),
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
        getCardsByIds: vi.fn(() => []),
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
        getCardsByIds: vi.fn(() => [createCard({ due: 2 })]),
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
        getCardsByIds: vi.fn(() => []),
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
