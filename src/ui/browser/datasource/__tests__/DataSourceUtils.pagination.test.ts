import { describe, expect, it } from 'vitest';
import type { BrowserCard } from '../../types';
import {
  applyDocFilter,
  applySimpleQueryFilter,
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

  it('supports __lost__ doc filter semantics', () => {
    const rows: BrowserCard[] = [
      buildCard({ id: 'c1', blockId: 'b1', rootId: 'doc-a' }),
      buildCard({ id: 'c2', blockId: 'b2', rootId: '' }),
      buildCard({ id: 'c3', blockId: 'b3', rootId: '' }),
    ];

    const lostOnly = applyDocFilter(rows, '__lost__').map((card) => card.blockId);
    expect(lostOnly).toEqual(['b2', 'b3']);
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
