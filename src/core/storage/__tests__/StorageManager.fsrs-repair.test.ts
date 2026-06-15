import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { StorageManager } from '../manager';
import { removeRiffCards } from '@/core/siyuan/riff';
import { unmarkBlockAsCard } from '@/core/siyuan/block';

vi.mock('@/core/siyuan/riff', () => ({
  BUILTIN_DECK_ID: 'builtin-deck',
  removeRiffCards: vi.fn(async () => ({ name: 'builtin', size: 0 })),
}));

vi.mock('@/core/siyuan/block', () => ({
  unmarkBlockAsCard: vi.fn(async () => undefined),
}));

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

describe('StorageManager legacy deleteCards', () => {
  it('does local delete and unmarks blocks without native Riff hard-delete', async () => {
    const manager = Object.create(StorageManager.prototype) as StorageManager & {
      cardsCache: Map<string, FSRSCard>;
      isDirty: boolean;
      saveCards: () => Promise<void>;
    };
    const card = createMalformedReviewCard();
    manager.cardsCache = new Map([[card.id, card]]);
    manager.isDirty = false;
    manager.saveCards = vi.fn(async () => undefined);
    vi.mocked(removeRiffCards).mockClear();
    vi.mocked(unmarkBlockAsCard).mockClear();

    await manager.deleteCards([card.blockId]);

    expect(manager.cardsCache.has(card.id)).toBe(false);
    expect(manager.saveCards).toHaveBeenCalledTimes(1);
    expect(unmarkBlockAsCard).toHaveBeenCalledWith(card.blockId);
    expect(removeRiffCards).not.toHaveBeenCalled();
  });
});
