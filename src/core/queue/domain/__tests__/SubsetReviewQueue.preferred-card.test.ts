import { describe, expect, it, vi } from 'vitest';
import { CardType, type FSRSCard } from '@/types/card';
import { SubsetReviewQueue } from '../SubsetReviewQueue';

function createCard(id: string, blockId: string): FSRSCard {
  const now = Date.now();
  return {
    id,
    xiuyuanID: `xy-${id}`,
    blockId,
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
  };
}

function createManager(cards: FSRSCard[]) {
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const route = vi.fn(async (card: FSRSCard) => {
    const updated = {
      ...card,
      due: Date.now() + 7 * 86_400_000,
      reps: card.reps + 1,
      updatedAt: Date.now(),
    };
    cardMap.set(updated.id, updated);
    return updated;
  });
  const commitReview = vi.fn(async ({ cardId }: { cardId: string; rating: number }) => {
    const card = cardMap.get(cardId);
    if (!card) {
      throw new Error(`card not found: ${cardId}`);
    }
    const updatedCard = await route(card);
    return {
      card,
      updatedCard,
      committed: true,
    };
  });

  return {
    getCards: vi.fn(async () => Array.from(cardMap.values())),
    getCard: vi.fn(async (cardId: string) => {
      const card = cardMap.get(cardId);
      if (!card) {
        throw new Error(`card not found: ${cardId}`);
      }
      return card;
    }),
    updateCard: vi.fn(async (card: FSRSCard) => {
      cardMap.set(card.id, card);
    }),
    onCardUpdatedFromScheduler: vi.fn(async (card: FSRSCard) => {
      cardMap.set(card.id, card);
    }),
    commitReview,
    getSchedulerRouter: vi.fn(() => ({ route })),
    notifyObservers: vi.fn(),
  };
}

describe('SubsetReviewQueue preferredCardId', () => {
  it('places preferredCardId first when multiple cards share the same block', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
      createCard('card-3', 'block-1'),
    ];
    const manager = createManager(cards);

    const queue = new SubsetReviewQueue(manager as never, ['block-1'], {
      preferredCardId: 'card-2',
    });

    const ordered = await queue.getCards();
    expect(ordered.map((card) => card.id)).toEqual(['card-2', 'card-1', 'card-3']);
  });

  it('keeps natural order when preferredCardId is not in queue', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
    ];
    const manager = createManager(cards);

    const queue = new SubsetReviewQueue(manager as never, ['block-1'], {
      preferredCardId: 'card-missing',
    });

    const ordered = await queue.getCards();
    expect(ordered.map((card) => card.id)).toEqual(['card-1', 'card-2']);
  });

  it('uses explicit cardIds without expanding sibling cards from the same block', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
      createCard('card-3', 'block-1'),
    ];
    const manager = createManager(cards);

    const queue = new SubsetReviewQueue(manager as never, ['block-1'], {
      cardIds: ['card-2'],
    });

    const ordered = await queue.getCards();
    expect(ordered.map((card) => card.id)).toEqual(['card-2']);
  });

  it('preserves explicit cardIds order', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
      createCard('card-3', 'block-1'),
    ];
    const manager = createManager(cards);

    const queue = new SubsetReviewQueue(manager as never, ['block-1'], {
      cardIds: ['card-3', 'card-2'],
    });

    const ordered = await queue.getCards();
    expect(ordered.map((card) => card.id)).toEqual(['card-3', 'card-2']);
  });

  it('reorders only within explicit cardIds when preferredCardId is present', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
      createCard('card-3', 'block-1'),
    ];
    const manager = createManager(cards);

    const queue = new SubsetReviewQueue(manager as never, ['block-1'], {
      cardIds: ['card-1', 'card-2'],
      preferredCardId: 'card-2',
    });

    const ordered = await queue.getCards();
    expect(ordered.map((card) => card.id)).toEqual(['card-2', 'card-1']);
  });

  it('does not expand explicit cardIds when preferredCardId is outside the subset', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
      createCard('card-3', 'block-1'),
    ];
    const manager = createManager(cards);

    const queue = new SubsetReviewQueue(manager as never, ['block-1'], {
      cardIds: ['card-1', 'card-2'],
      preferredCardId: 'card-3',
    });

    const ordered = await queue.getCards();
    expect(ordered.map((card) => card.id)).toEqual(['card-1', 'card-2']);
  });

  it('removes only the reviewed card when sibling cards share the same block', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
      createCard('card-3', 'block-1'),
    ];
    const manager = createManager(cards);
    const queue = new SubsetReviewQueue(manager as never, ['block-1']);

    await queue.getCards();
    const result = await queue.handleReview('card-1', 3);
    const remaining = await queue.getCards();

    expect(remaining.map((card) => card.id)).toEqual(['card-2', 'card-3']);
    expect(result.counterSnapshot).toEqual(expect.objectContaining({
      remaining: 2,
      total: 2,
      buckets: expect.objectContaining({
        all: 2,
        item: 2,
      }),
    }));
  });

  it('removes only the skipped card when sibling cards share the same block', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
      createCard('card-3', 'block-1'),
    ];
    const manager = createManager(cards);
    const queue = new SubsetReviewQueue(manager as never, ['block-1']);

    await queue.skip('card-1');
    const remaining = await queue.getCards();
    const snapshot = await queue.getCounterSnapshot(true);

    expect(remaining.map((card) => card.id)).toEqual(['card-2', 'card-3']);
    expect(snapshot).toEqual(expect.objectContaining({
      remaining: 2,
      total: 2,
      buckets: expect.objectContaining({
        all: 2,
        item: 2,
      }),
    }));
  });
});
