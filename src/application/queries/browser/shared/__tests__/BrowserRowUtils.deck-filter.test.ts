import { describe, expect, it } from 'vitest';
import { CardState, type BrowserCard } from '@/types/browser';
import {
  applyDeckPresetFilter,
  applyExplicitCardTypesFilter,
} from '../BrowserRowUtils';

function buildCard(overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id: overrides.id ?? 'card',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'card',
    blockId: overrides.blockId ?? overrides.id ?? 'block',
    deckId: overrides.deckId ?? 'deck-a',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? overrides.content ?? 'content',
    rootId: overrides.rootId ?? 'doc-a',
    state: overrides.state ?? CardState.Review,
    stateLabel: overrides.stateLabel ?? 'Review',
    due: overrides.due ?? new Date(Date.now() - 1_000),
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

describe('BrowserRowUtils deck row filters', () => {
  it('keeps deck preset filtering behavior in the shared row helper module', () => {
    const future = new Date(Date.now() + 86_400_000);
    const rows = [
      buildCard({ id: 'due-review', state: CardState.Review, due: new Date(Date.now() - 1_000) }),
      buildCard({ id: 'future-review', state: CardState.Review, due: future }),
      buildCard({ id: 'learning', state: CardState.Learning, due: new Date(Date.now() - 1_000) }),
      buildCard({ id: 'leech', state: CardState.Review, due: future, lapses: 1 }),
      buildCard({ id: 'suspended', state: CardState.Review, due: future, suspended: true }),
    ];

    expect(applyDeckPresetFilter(rows, 'due').map((row) => row.id)).toEqual(['due-review', 'learning']);
    expect(applyDeckPresetFilter(rows, 'learning').map((row) => row.id)).toEqual(['learning']);
    expect(applyDeckPresetFilter(rows, 'review').map((row) => row.id)).toEqual([
      'due-review',
      'future-review',
      'leech',
      'suspended',
    ]);
    expect(applyDeckPresetFilter(rows, 'leech').map((row) => row.id)).toEqual(['leech']);
    expect(applyDeckPresetFilter(rows, 'suspended').map((row) => row.id)).toEqual(['suspended']);
  });

  it('keeps explicit deck card-type behavior including implicit items and missing blocks', () => {
    const rows = [
      buildCard({ id: 'topic', cardType: 'topic' }),
      buildCard({ id: 'item', cardType: 'item' }),
      buildCard({ id: 'implicit-item', cardType: undefined }),
      buildCard({ id: 'missing', cardType: undefined, meta: { blockType: 'missing' } }),
      buildCard({ id: 'concept', cardType: 'concept' }),
    ];

    expect(applyExplicitCardTypesFilter(rows, ['item']).map((row) => row.id)).toEqual([
      'item',
      'implicit-item',
      'missing',
    ]);
    expect(applyExplicitCardTypesFilter(rows, ['missing-block-only']).map((row) => row.id)).toEqual(['missing']);
    expect(applyExplicitCardTypesFilter(rows, ['topic', 'concept']).map((row) => row.id)).toEqual([
      'topic',
      'concept',
    ]);
  });
});
