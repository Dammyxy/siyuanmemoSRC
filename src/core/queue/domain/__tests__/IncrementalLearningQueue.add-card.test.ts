import { describe, expect, it, vi } from 'vitest';
import { CardType, type FSRSCard } from '@/types/card';
import { IncrementalLearningQueue } from '../IncrementalLearningQueue';
import { NOOP_QUEUE_PERSISTENCE } from '../ports';

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

describe('IncrementalLearningQueue addCard', () => {
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

    const queue = new IncrementalLearningQueue(manager as never, NOOP_QUEUE_PERSISTENCE);

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

    const queue = new IncrementalLearningQueue(manager as never, NOOP_QUEUE_PERSISTENCE);
    await expect(queue.addCard(reviewedToday.id, 'manual-add-all')).resolves.toBeUndefined();

    const cards = await queue.getCards();
    expect(cards.map((card) => card.id)).toContain(reviewedToday.id);
  });
});
