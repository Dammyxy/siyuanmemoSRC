import { describe, expect, it } from 'vitest';
import type { BrowserCard } from '../../types';
import {
  resolveBrowserCardActionId,
  resolveBrowserCardStableId,
} from '../browserCardIdentity';

function makeCard(overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id: overrides.id ?? 'riff-1',
    fsrsCardId: overrides.fsrsCardId,
    blockId: overrides.blockId ?? 'block-1',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? 'content',
    rootId: overrides.rootId ?? 'doc-1',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 1,
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
    note: overrides.note,
    queueIndex: overrides.queueIndex,
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
  };
}

describe('browserCardIdentity', () => {
  it('uses card-level ids ahead of block ids for stable row identity', () => {
    const row = makeCard({
      id: 'riff-42',
      fsrsCardId: 'fsrs-42',
      blockId: 'shared-block',
    });

    expect(resolveBrowserCardStableId(row)).toBe('fsrs-42');
    expect(resolveBrowserCardActionId(row)).toBe('fsrs-42');
  });

  it('uses explicit cardId before projection row id for browser actions', () => {
    const row = {
      ...makeCard({
        id: 'projection-row-42',
        fsrsCardId: '',
        blockId: 'shared-block',
      }),
      cardId: 'fsrs-42',
    } as unknown as BrowserCard;

    expect(resolveBrowserCardStableId(row)).toBe('fsrs-42');
    expect(resolveBrowserCardActionId(row)).toBe('fsrs-42');
  });

  it('falls back to block id only for stable row identity when card id is missing', () => {
    const row = makeCard({
      id: '',
      fsrsCardId: '',
      blockId: 'block-fallback',
    });

    expect(resolveBrowserCardStableId(row)).toBe('block-fallback');
    expect(resolveBrowserCardActionId(row)).toBe('');
  });
});
