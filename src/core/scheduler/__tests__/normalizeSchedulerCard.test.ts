import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { normalizeSchedulerCard } from '../normalizeSchedulerCard';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const due = new Date('2026-04-26T23:38:33+08:00').getTime();
  const lastReview = new Date('2026-02-15T23:38:33+08:00').getTime();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due,
    stability: 70,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview,
    elapsedDays: 0,
    scheduledDays: 70,
    learning_step: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: lastReview,
    updatedAt: due,
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

describe('normalizeSchedulerCard', () => {
  it('does not rewrite valid elapsedDays zero because wall-clock time moved forward', () => {
    const card = createCard();

    const normalized = normalizeSchedulerCard(card, 'fsrs-v6', {
      now: new Date('2026-05-29T16:38:00+08:00').getTime(),
    });

    expect(normalized.elapsedDays).toBe(0);
  });

  it('repairs non-numeric elapsedDays from review history', () => {
    const normalized = normalizeSchedulerCard(createCard({
      elapsedDays: Number.NaN,
    }), 'fsrs-v6', {
      now: new Date('2026-02-18T23:38:33+08:00').getTime(),
    });

    expect(normalized.elapsedDays).toBe(3);
  });
});
