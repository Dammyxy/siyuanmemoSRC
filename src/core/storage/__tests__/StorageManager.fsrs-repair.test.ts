import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { StorageManager } from '../manager';

function createMalformedReviewCard(): FSRSCard {
  const due = new Date('2026-04-26T23:38:33+08:00').getTime();
  return {
    id: 'storage-repair-card',
    xiuyuanID: 'xy-storage-repair-card',
    blockId: 'storage-repair-card',
    due,
    stability: 0,
    difficulty: 0,
    reps: 4,
    lapses: 0,
    state: CardState.Review,
    lastReview: new Date('2026-02-15T23:38:33+08:00').getTime(),
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: due,
    updatedAt: due,
    schedulerType: 'fsrs-v6',
  };
}

describe('StorageManager FSRS load normalization', () => {
  it('repairs legacy Review cards with zero stability and marks them for normalized save', () => {
    const manager = Object.create(StorageManager.prototype) as StorageManager & {
      cardsCache: Map<string, FSRSCard>;
      cacheNormalizedCards(cards: unknown[]): number;
    };
    manager.cardsCache = new Map();
    const malformedCard = createMalformedReviewCard();

    const normalizedCount = manager.cacheNormalizedCards([malformedCard]);
    const repaired = manager.cardsCache.get(malformedCard.id);

    expect(normalizedCount).toBe(1);
    expect(repaired?.stability).toBe(70);
    expect(repaired?.scheduledDays).toBe(70);
    expect(repaired?.difficulty).toBe(5);
  });
});
