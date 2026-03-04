import { describe, expect, it } from 'vitest';
import type { BrowserCard } from '../../types';
import {
  formatSortContractDisplayValue,
  getSortContractRawValue,
  getSortContractValueType,
  normalizeSortContractColId,
} from '../sortDisplayContract';

function buildCard(overrides: Partial<BrowserCard>): BrowserCard {
  return {
    id: overrides.id ?? 'card-1',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? 'content',
    rootId: overrides.rootId ?? 'doc-1',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date('2026-01-01T00:00:00.000Z'),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.5,
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

describe('sortDisplayContract', () => {
  it('normalizes legacy formatted column ids to raw ids', () => {
    expect(normalizeSortContractColId('dueFormatted')).toBe('due');
    expect(normalizeSortContractColId('lastReviewFormatted')).toBe('lastReview');
    expect(normalizeSortContractColId('firstReviewFormatted')).toBe('firstReview');
  });

  it('keeps priority=0 as valid raw/display value', () => {
    const card = buildCard({ priority: 0 });
    expect(getSortContractRawValue(card, 'priority')).toBe(0);
    expect(formatSortContractDisplayValue(card, 'priority')).toBe('0');
  });

  it('uses retrievability raw 0-1 semantics for display and sort type', () => {
    const card = buildCard({ retrievability: 0.48 });
    expect(getSortContractValueType('retrievability')).toBe('number');
    expect(getSortContractRawValue(card, 'retrievability')).toBe(0.48);
    expect(formatSortContractDisplayValue(card, 'retrievability')).toBe('0.48');
  });
});
