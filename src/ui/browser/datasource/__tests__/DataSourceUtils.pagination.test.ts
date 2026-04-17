import { describe, expect, it } from 'vitest';
import type { BrowserCard } from '../../types';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import {
  applyDocFilter,
  applyLegacyPresetFilter,
  applySimpleQueryFilter,
  sortQueueSnapshotRows,
  sortAndPaginateBrowserCards,
} from '../DataSourceUtils';

function buildCard(overrides: Partial<BrowserCard>): BrowserCard {
  return {
    id: overrides.id ?? `card-${Math.random()}`,
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? '',
    blockId: overrides.blockId ?? overrides.id ?? '',
    deckId: overrides.deckId ?? 'deck-a',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? overrides.content ?? 'content',
    rootId: overrides.rootId ?? 'doc-a',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.9,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '',
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    tags: overrides.tags ?? [],
    note: overrides.note ?? '',
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
  };
}

function buildQueueRow(overrides: Partial<QueueSnapshotRow>): QueueSnapshotRow {
  return {
    id: overrides.id ?? `queue-${Math.random()}`,
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? '',
    blockId: overrides.blockId ?? overrides.id ?? '',
    deckId: overrides.deckId ?? 'deck-a',
    rootId: overrides.rootId ?? 'doc-a',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? overrides.content ?? 'content',
    state: overrides.state ?? 0,
    due: overrides.due ?? Date.now(),
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.9,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    queueIndex: overrides.queueIndex ?? 0,
    tags: overrides.tags ?? [],
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    blockType: overrides.blockType ?? null,
  };
}

describe('DataSourceUtils pagination', () => {
  it('keeps totalCount stable while slicing sorted pages', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', priority: 30 }),
      buildCard({ id: 'c2', blockId: 'b2', priority: 10 }),
      buildCard({ id: 'c3', blockId: 'b3', priority: 20 }),
      buildCard({ id: 'c4', blockId: 'b4', priority: 40 }),
    ];

    const page1 = sortAndPaginateBrowserCards(rows, [{ colId: 'priority', sort: 'asc' }], 0, 2);
    const page2 = sortAndPaginateBrowserCards(rows, [{ colId: 'priority', sort: 'asc' }], 2, 4);
    const merged = [...page1.rows, ...page2.rows].map((card) => card.blockId);

    expect(page1.totalCount).toBe(4);
    expect(page2.totalCount).toBe(4);
    expect(merged).toEqual(['b2', 'b3', 'b1', 'b4']);
  });

  it('sorts by multiple fields before pagination', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', priority: 10, due: new Date('2026-01-03T00:00:00.000Z') }),
      buildCard({ id: 'c2', blockId: 'b2', priority: 20, due: new Date('2026-01-01T00:00:00.000Z') }),
      buildCard({ id: 'c3', blockId: 'b3', priority: 10, due: new Date('2026-01-01T00:00:00.000Z') }),
      buildCard({ id: 'c4', blockId: 'b4', priority: 10, due: new Date('2026-01-02T00:00:00.000Z') }),
    ];

    const sortModel = [
      { colId: 'priority', sort: 'asc' as const },
      { colId: 'due', sort: 'asc' as const },
    ];

    const page1 = sortAndPaginateBrowserCards(rows, sortModel, 0, 2);
    const page2 = sortAndPaginateBrowserCards(rows, sortModel, 2, 4);
    const merged = [...page1.rows, ...page2.rows].map((card) => card.blockId);

    expect(page1.totalCount).toBe(4);
    expect(page2.totalCount).toBe(4);
    expect(merged).toEqual(['b3', 'b4', 'b1', 'b2']);
  });

  it('uses stable blockId->id tie-breaker when sort values are equal', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c2', blockId: 'b1', priority: 10 }),
      buildCard({ id: 'c1', blockId: 'b1', priority: 10 }),
      buildCard({ id: 'c3', blockId: 'b0', priority: 10 }),
    ];

    const page1 = sortAndPaginateBrowserCards(rows, [{ colId: 'priority', sort: 'asc' }], 0, 2);
    const page2 = sortAndPaginateBrowserCards(rows, [{ colId: 'priority', sort: 'asc' }], 2, 4);
    const merged = [...page1.rows, ...page2.rows].map((card) => `${card.blockId}:${card.id}`);

    expect(merged).toEqual(['b0:c3', 'b1:c1', 'b1:c2']);
  });

  it('keeps queue snapshot sorting view-only by falling back to queueIndex', () => {
    const rows: QueueSnapshotRow[] = [
      buildQueueRow({ id: 'q3', blockId: 'b3', priority: 10, queueIndex: 2 }),
      buildQueueRow({ id: 'q1', blockId: 'b1', priority: 10, queueIndex: 0 }),
      buildQueueRow({ id: 'q2', blockId: 'b2', priority: 10, queueIndex: 1 }),
    ];

    const sorted = sortQueueSnapshotRows(rows, [{ colId: 'priority', sort: 'asc' }]);

    expect(sorted.map((row) => `${row.queueIndex}:${row.id}`)).toEqual(['0:q1', '1:q2', '2:q3']);
  });

  it('sorts formatted date columns by raw date values globally', () => {
    const rows: BrowserCard[] = [
      buildCard({
        id: 'c1',
        blockId: 'b1',
        due: new Date('2026-01-10T00:00:00.000Z'),
        dueFormatted: '2026-1-10',
      }),
      buildCard({
        id: 'c2',
        blockId: 'b2',
        due: new Date('2026-01-02T00:00:00.000Z'),
        dueFormatted: '2026-1-2',
      }),
      buildCard({
        id: 'c3',
        blockId: 'b3',
        due: new Date('2026-01-01T00:00:00.000Z'),
        dueFormatted: '2026-1-1',
      }),
      buildCard({
        id: 'c4',
        blockId: 'b4',
        due: new Date('2026-01-09T00:00:00.000Z'),
        dueFormatted: '2026-1-9',
      }),
    ];

    const page1 = sortAndPaginateBrowserCards(rows, [{ colId: 'dueFormatted', sort: 'asc' }], 0, 2);
    const page2 = sortAndPaginateBrowserCards(rows, [{ colId: 'dueFormatted', sort: 'asc' }], 2, 4);
    const merged = [...page1.rows, ...page2.rows].map((card) => card.blockId);

    expect(merged).toEqual(['b3', 'b2', 'b4', 'b1']);
  });

  it('keeps invalid numeric values at the bottom for both asc and desc', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', priority: 50 }),
      buildCard({ id: 'c2', blockId: 'b2', priority: 46 }),
      buildCard({ id: 'c3', blockId: 'b3', priority: 48 }),
      buildCard({ id: 'c4', blockId: 'b4', priority: 48 }),
      buildCard({ id: 'c5', blockId: 'b5', priority: 47 }),
    ];

    (rows[1] as Record<string, unknown>).priority = '46';
    (rows[2] as Record<string, unknown>).priority = Number.NaN;
    (rows[3] as Record<string, unknown>).priority = '48%';

    const asc = sortAndPaginateBrowserCards(rows, [{ colId: 'priority', sort: 'asc' }], 0, 10);
    const desc = sortAndPaginateBrowserCards(rows, [{ colId: 'priority', sort: 'desc' }], 0, 10);

    expect(asc.rows.map((card) => card.blockId)).toEqual(['b2', 'b5', 'b1', 'b3', 'b4']);
    expect(desc.rows.map((card) => card.blockId)).toEqual(['b1', 'b5', 'b2', 'b3', 'b4']);
  });

  it('keeps priority 0 as a real sortable value', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', priority: 0 }),
      buildCard({ id: 'c2', blockId: 'b2', priority: 46 }),
      buildCard({ id: 'c3', blockId: 'b3', priority: 98 }),
      buildCard({ id: 'c4', blockId: 'b4', priority: 50 }),
    ];

    const asc = sortAndPaginateBrowserCards(rows, [{ colId: 'priority', sort: 'asc' }], 0, 10);
    const desc = sortAndPaginateBrowserCards(rows, [{ colId: 'priority', sort: 'desc' }], 0, 10);

    expect(asc.rows.map((card) => card.blockId)).toEqual(['b1', 'b2', 'b4', 'b3']);
    expect(desc.rows.map((card) => card.blockId)).toEqual(['b3', 'b4', 'b2', 'b1']);
  });

  it('sorts retrievability by raw 0-1 values across pages', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', retrievability: 0.98 }),
      buildCard({ id: 'c2', blockId: 'b2', retrievability: 0.5 }),
      buildCard({ id: 'c3', blockId: 'b3', retrievability: 0.48 }),
      buildCard({ id: 'c4', blockId: 'b4', retrievability: 0.46 }),
      buildCard({ id: 'c5', blockId: 'b5', retrievability: 0.5 }),
    ];

    const page1 = sortAndPaginateBrowserCards(rows, [{ colId: 'retrievability', sort: 'asc' }], 0, 2);
    const page2 = sortAndPaginateBrowserCards(rows, [{ colId: 'retrievability', sort: 'asc' }], 2, 5);
    const merged = [...page1.rows, ...page2.rows].map((card) => card.blockId);

    expect(merged).toEqual(['b4', 'b3', 'b2', 'b5', 'b1']);
  });

  it('supports __lost__ doc filter semantics', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', rootId: 'doc-a' }),
      buildCard({ id: 'c2', blockId: 'b2', rootId: 'doc-a', meta: { blockType: 'missing' } }),
      buildCard({ id: 'c3', blockId: 'b3', rootId: 'doc-b', meta: { blockType: 'missing' } }),
    ];

    const lostOnly = applyDocFilter(rows, '__lost__').map((card) => card.blockId);
    expect(lostOnly).toEqual(['b2', 'b3']);
  });

  it('excludes missing cards outside __lost__ view', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', rootId: 'doc-a' }),
      buildCard({ id: 'c2', blockId: 'b2', rootId: 'doc-a', meta: { blockType: 'missing' } }),
      buildCard({ id: 'c3', blockId: 'b3', rootId: 'doc-b' }),
    ];

    const allVisible = applyDocFilter(rows, undefined).map((card) => card.blockId);
    const docAVisible = applyDocFilter(rows, 'doc-a').map((card) => card.blockId);

    expect(allVisible).toEqual(['b1', 'b3']);
    expect(docAVisible).toEqual(['b1']);
  });

  it('keeps suspended cards in all view but filters them in suspended preset', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', suspended: false }),
      buildCard({ id: 'c2', blockId: 'b2', suspended: true }),
      buildCard({ id: 'c3', blockId: 'b3', suspended: false }),
    ];

    expect(applyLegacyPresetFilter(rows, 'all').map((card) => card.blockId)).toEqual(['b1', 'b2', 'b3']);
    expect(applyLegacyPresetFilter(rows, 'suspended').map((card) => card.blockId)).toEqual(['b2']);
  });

  it('applies advanced query semantics via parseQuery matcher', () => {
    const rows: BrowserCard[] = [
      buildCard({
        id: 'c1',
        blockId: 'b1',
        deckId: 'deck-a',
        rootId: 'doc-a',
        priority: 10,
        state: 0,
        tags: ['alpha'],
        fullContent: 'first content',
      }),
      buildCard({
        id: 'c2',
        blockId: 'b2',
        deckId: 'deck-b',
        rootId: 'doc-b',
        priority: 60,
        state: 2,
        tags: ['beta'],
        fullContent: 'second content',
      }),
    ];

    const filtered = applySimpleQueryFilter(
      rows,
      'deck:deck-a doc:doc-a tag:alpha state:new priority<20'
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].blockId).toBe('b1');
  });
});
