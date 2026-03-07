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

describe('SubsetReviewQueue preferredCardId', () => {
  it('places preferredCardId first when multiple cards share the same block', async () => {
    const cards = [
      createCard('card-1', 'block-1'),
      createCard('card-2', 'block-1'),
      createCard('card-3', 'block-1'),
    ];
    const cardMap = new Map(cards.map((card) => [card.id, card]));

    const manager = {
      getCards: vi.fn(async () => cards),
      getCard: vi.fn(async (cardId: string) => {
        const card = cardMap.get(cardId);
        if (!card) {
          throw new Error(`card not found: ${cardId}`);
        }
        return card;
      }),
      updateCard: vi.fn(async (_card: FSRSCard) => {}),
      notifyObservers: vi.fn(),
    };

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
    const cardMap = new Map(cards.map((card) => [card.id, card]));

    const manager = {
      getCards: vi.fn(async () => cards),
      getCard: vi.fn(async (cardId: string) => {
        const card = cardMap.get(cardId);
        if (!card) {
          throw new Error(`card not found: ${cardId}`);
        }
        return card;
      }),
      updateCard: vi.fn(async (_card: FSRSCard) => {}),
      notifyObservers: vi.fn(),
    };

    const queue = new SubsetReviewQueue(manager as never, ['block-1'], {
      preferredCardId: 'card-missing',
    });

    const ordered = await queue.getCards();
    expect(ordered.map((card) => card.id)).toEqual(['card-1', 'card-2']);
  });
});
