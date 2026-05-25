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
  it('serves the hydrated active subset instead of failing the whole projection when rows reference inactive cards', async () => {
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
        readCounters: vi.fn((): QueueProjectionCounters => counters),
        readRows: vi.fn(() => rows),
        replaceQueueProjection: vi.fn(),
      },
      runtime: {
        runTransaction: vi.fn(async (_name, callback) => callback()),
      },
    });

    const snapshot = await runtime.snapshot({ queueType });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.rows.map((row) => row.fsrsCardId)).toEqual(['card-active']);
    expect(snapshot.counters).toMatchObject({
      remaining: 1,
      total: 1,
      due: 1,
    });
  });
});
