import { describe, expect, it } from 'vitest';
import { QueueType, type QueueCounterSnapshot } from '@/types/unified-data-source';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import { compareQueueProjectionParity } from '../QueueProjectionParityDiagnostics';

const CHECKED_AT = new Date('2026-05-08T09:00:00+08:00').getTime();

function row(id: string, index: number): QueueSnapshotRow {
  return {
    id: `row-${id}`,
    fsrsCardId: `card-${id}`,
    blockId: `block-${id}`,
    deckId: 'deck-a',
    rootId: 'doc-a',
    content: `content-${id}`,
    fullContent: `content-${id}`,
    state: 2,
    due: CHECKED_AT,
    stability: 5,
    difficulty: 5,
    retrievability: 0.9,
    reps: 1,
    lapses: 0,
    elapsedDays: 1,
    scheduledDays: 1,
    lastReview: CHECKED_AT - 86_400_000,
    interval: 1,
    firstReview: CHECKED_AT - 86_400_000,
    priority: 50,
    suspended: false,
    cardType: 'item',
    queueIndex: index,
    tags: [],
    blockType: 'p',
  };
}

function counters(total: number, due = total): QueueCounterSnapshot {
  return {
    version: 7,
    remaining: total,
    due,
    total,
    buckets: {
      all: total,
      item: total,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'reconciled',
  };
}

describe('QueueProjectionParityDiagnostics', () => {
  it('reports matching strategy and projection rows with counters', () => {
    const rows = [row('a', 1), row('b', 2)];

    const diagnostic = compareQueueProjectionParity({
      queueType: QueueType.FilterGroup,
      generation: 3,
      policyHash: 'filter-policy',
      checkedAt: CHECKED_AT,
      strategy: {
        rows,
        counters: counters(2),
      },
      projection: {
        rows: rows.map((entry) => ({ ...entry, tags: [...entry.tags] })),
        counters: counters(2),
      },
    });

    expect(diagnostic).toMatchObject({
      queueType: QueueType.FilterGroup,
      generation: 3,
      policyHash: 'filter-policy',
      checkedAt: CHECKED_AT,
      mismatch: false,
      rowsMatch: true,
      countersMatch: true,
      rowCount: {
        strategy: 2,
        projection: 2,
      },
      missingProjectionRowIds: [],
      extraProjectionRowIds: [],
      orderMismatchAt: null,
      counterDelta: {
        remaining: 0,
        due: 0,
        total: 0,
        buckets: {
          all: 0,
          item: 0,
          descriptor: 0,
          topic: 0,
          concept: 0,
        },
      },
    });
  });

  it('reports row identity, order, and counter mismatches', () => {
    const diagnostic = compareQueueProjectionParity({
      queueType: QueueType.FinalDrill,
      generation: 4,
      policyHash: 'drill-policy',
      checkedAt: CHECKED_AT,
      strategy: {
        rows: [row('a', 1), row('b', 2)],
        counters: counters(2, 2),
      },
      projection: {
        rows: [row('b', 1), row('c', 2)],
        counters: counters(1, 0),
      },
    });

    expect(diagnostic).toMatchObject({
      mismatch: true,
      rowsMatch: false,
      countersMatch: false,
      missingProjectionRowIds: ['row-a'],
      extraProjectionRowIds: ['row-c'],
      orderMismatchAt: {
        index: 0,
        strategyRowId: 'row-a',
        projectionRowId: 'row-b',
      },
      counterDelta: {
        remaining: -1,
        due: -2,
        total: -1,
        buckets: {
          all: -1,
          item: -1,
          descriptor: 0,
          topic: 0,
          concept: 0,
        },
      },
    });
  });
});
