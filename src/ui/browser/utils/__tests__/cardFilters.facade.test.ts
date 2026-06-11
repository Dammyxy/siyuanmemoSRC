import { describe, expect, it } from 'vitest';
import { CardState } from '@/types/browser';
import type { BrowserCard, ParsedBrowserQuery } from '@/types/browser';
import {
  checkNumberCondition as typedCheckNumberCondition,
  matchesParsedQuery as typedMatchesParsedQuery,
  parseQuery,
} from '@/types/browser';
import {
  applyCardTypeFilter,
  checkNumberCondition,
  extractSqlStatement,
  matchesParsedQuery,
} from '../cardFilters';

function buildCard(overrides: Partial<BrowserCard> = {}): BrowserCard {
  const due = new Date('2026-06-11T00:00:00.000Z');
  return {
    id: 'browser-card-a',
    fsrsCardId: 'browser-card-a',
    blockId: 'block-a',
    deckId: 'deck-a',
    content: 'alpha beta',
    fullContent: 'alpha beta gamma',
    rootId: 'doc-a',
    state: CardState.Review,
    stateLabel: 'Review',
    due,
    dueFormatted: '',
    stability: 4,
    difficulty: 5,
    retrievability: 0.8,
    reps: 3,
    lapses: 1,
    elapsedDays: 2,
    scheduledDays: 3,
    lastReview: null,
    lastReviewFormatted: '',
    interval: 3,
    firstReview: null,
    firstReviewFormatted: '',
    priority: 42,
    suspended: false,
    tags: ['tag-a'],
    ...overrides,
  };
}

describe('cardFilters facade', () => {
  it('delegates parsed-query numeric helpers to the typed Browser helpers', () => {
    expect(checkNumberCondition).toBe(typedCheckNumberCondition);
    expect(matchesParsedQuery).toBe(typedMatchesParsedQuery);
  });

  it('matches the typed Browser parsed-query behavior', () => {
    const card = buildCard();
    const parsed = parseQuery('deck:deck-a state:review doc:doc-a tag:tag-a priority<50 stability>=4 alpha');
    const rejected = {
      ...parsed,
      decks: ['deck-b'],
    } satisfies ParsedBrowserQuery;

    expect(matchesParsedQuery(card, parsed)).toBe(true);
    expect(matchesParsedQuery(card, rejected)).toBe(false);
    expect(matchesParsedQuery(card, parsed)).toBe(typedMatchesParsedQuery(card, parsed));
    expect(checkNumberCondition(42, parsed.conditions.priority ?? [])).toBe(true);
    expect(checkNumberCondition(42, parsed.conditions.priority ?? [])).toBe(
      typedCheckNumberCondition(42, parsed.conditions.priority ?? []),
    );
  });

  it('keeps SQL detection and card-type filters compatible with Browser UI behavior', () => {
    expect(extractSqlStatement('  SELECT * FROM blocks  ')).toBe('SELECT * FROM blocks');
    expect(extractSqlStatement('with recent as (select * from blocks) select * from recent')).toBe(
      'with recent as (select * from blocks) select * from recent',
    );
    expect(extractSqlStatement('tag:math')).toBeNull();

    const rows = [
      buildCard({ id: 'topic', cardType: 'topic' }),
      buildCard({ id: 'item', cardType: 'item' }),
      buildCard({ id: 'implicit-item', cardType: undefined }),
      buildCard({ id: 'concept', cardType: 'concept' }),
      buildCard({ id: 'descriptor', cardType: 'descriptor' }),
      buildCard({ id: 'missing', meta: { blockType: 'missing' } }),
    ];

    expect(applyCardTypeFilter(rows, 'topic-only').map((card) => card.id)).toEqual(['topic']);
    expect(applyCardTypeFilter(rows, 'item-only').map((card) => card.id)).toEqual([
      'item',
      'implicit-item',
      'missing',
    ]);
    expect(applyCardTypeFilter(rows, 'concept-only').map((card) => card.id)).toEqual(['concept']);
    expect(applyCardTypeFilter(rows, 'descriptor-only').map((card) => card.id)).toEqual(['descriptor']);
    expect(applyCardTypeFilter(rows, 'missing-block-only').map((card) => card.id)).toEqual(['missing']);
  });
});
