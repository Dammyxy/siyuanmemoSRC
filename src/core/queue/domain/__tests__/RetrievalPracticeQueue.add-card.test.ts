import { describe, expect, it, vi } from 'vitest';
import { CardType, type FSRSCard } from '@/types/card';
import { RetrievalPracticeQueue } from '../RetrievalPracticeQueue';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now + 60_000,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now - 60_000,
    ...overrides,
  };
}

describe('RetrievalPracticeQueue addCard', () => {
  it('resolves blockId to real cardId for manual outstanding insertion', async () => {
    const storedCard = createCard();

    const manager = {
      getCard: vi.fn(async (_id: string) => {
        throw new Error('card not found by id');
      }),
      getCards: vi.fn(async (filter?: Record<string, unknown>) => {
        if (Array.isArray(filter?.blockIds)) {
          return filter.blockIds.includes('block-1') ? [storedCard] : [];
        }
        if (filter?.dueDate) {
          return [];
        }
        return [storedCard];
      }),
      updateCard: vi.fn(async (_card: FSRSCard) => {}),
      notifyObservers: vi.fn(),
      getDayStartHour: vi.fn(() => 4),
      getPriorityRandomness: vi.fn(() => 0),
      getAddToOutstandingEveryNth: vi.fn(() => 2),
    };

    const queue = new RetrievalPracticeQueue(manager as never);
    await queue.addCard('block-1');
    const cards = await queue.getCards();

    expect(manager.getCard).toHaveBeenCalledWith('block-1', { silent: true });
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-1'] });
    expect(cards.map((card) => card.id)).toContain('card-1');

    // Priority should be slightly boosted after manual add.
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'card-1',
        priority: 49,
      })
    );
  });

  it('respects autoSort toggle when building outstanding queue', async () => {
    const now = Date.now();
    const sourceOrderCards = [
      createCard({ id: 'card-low-priority', blockId: 'block-low', due: now + 500, priority: 80 }),
      createCard({ id: 'card-high-priority', blockId: 'block-high', due: now + 1000, priority: 10 }),
    ];

    const createManager = (autoSortEnabled: boolean) => ({
      getCard: vi.fn(async (_id: string) => {
        throw new Error('not found');
      }),
      getCards: vi.fn(async (filter?: Record<string, unknown>) => {
        if (filter?.cardType) {
          return sourceOrderCards;
        }
        return [];
      }),
      updateCard: vi.fn(async (_card: FSRSCard) => {}),
      notifyObservers: vi.fn(),
      getDayStartHour: vi.fn(() => 4),
      getPriorityRandomness: vi.fn(() => 0),
      getAutoSortEnabled: vi.fn(() => autoSortEnabled),
      getAddToOutstandingEveryNth: vi.fn(() => 2),
    });

    const sortedQueue = new RetrievalPracticeQueue(createManager(true) as never);
    const sortedCards = await sortedQueue.getCards();
    expect(sortedCards.map((card) => card.id)).toEqual(['card-high-priority', 'card-low-priority']);

    const unsortedQueue = new RetrievalPracticeQueue(createManager(false) as never);
    const unsortedCards = await unsortedQueue.getCards();
    expect(unsortedCards.map((card) => card.id)).toEqual(['card-low-priority', 'card-high-priority']);
  });

  it('rejects adding cards that were already reviewed today', async () => {
    const reviewedToday = createCard({
      id: 'card-reviewed-today',
      blockId: 'block-reviewed-today',
      lastReview: Date.now(),
    });

    const manager = {
      getCard: vi.fn(async (id: string) => {
        if (id === reviewedToday.id) {
          return reviewedToday;
        }
        throw new Error('card not found by id');
      }),
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async (_card: FSRSCard) => {}),
      notifyObservers: vi.fn(),
      getDayStartHour: vi.fn(() => 4),
      getPriorityRandomness: vi.fn(() => 0),
      getAddToOutstandingEveryNth: vi.fn(() => 2),
    };

    const queue = new RetrievalPracticeQueue(manager as never);

    await expect(queue.addCard(reviewedToday.id, 'manual')).rejects.toThrow('今日已复习');
    expect(manager.updateCard).not.toHaveBeenCalled();
  });

  it('allows adding cards reviewed today with manual-add-all source', async () => {
    const reviewedToday = createCard({
      id: 'card-reviewed-today',
      blockId: 'block-reviewed-today',
      lastReview: Date.now(),
    });

    const manager = {
      getCard: vi.fn(async (id: string) => {
        if (id === reviewedToday.id) {
          return reviewedToday;
        }
        throw new Error('card not found by id');
      }),
      getCards: vi.fn(async (filter?: Record<string, unknown>) => {
        if (Array.isArray(filter?.blockIds) && filter.blockIds.includes(reviewedToday.blockId)) {
          return [reviewedToday];
        }
        return [];
      }),
      updateCard: vi.fn(async (_card: FSRSCard) => {}),
      notifyObservers: vi.fn(),
      getDayStartHour: vi.fn(() => 4),
      getPriorityRandomness: vi.fn(() => 0),
      getAddToOutstandingEveryNth: vi.fn(() => 2),
    };

    const queue = new RetrievalPracticeQueue(manager as never);
    await expect(queue.addCard(reviewedToday.id, 'manual-add-all')).resolves.toBeUndefined();

    const cards = await queue.getCards();
    expect(cards.map((card) => card.id)).toContain(reviewedToday.id);
  });
});
