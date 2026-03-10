import { describe, expect, it, vi } from 'vitest';
import { GetCardsQueryHandler } from '../GetCardsQueryHandler';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { ICardReadModel } from '../ICardReadModel';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xy-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.New,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 0,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
  };
}

describe('GetCardsQueryHandler queryCards integration', () => {
  it('uses queryCards for structured filters without calling getAllCards', async () => {
    const queryCards = vi.fn().mockReturnValue([createCard()]);
    const readModel: ICardReadModel = {
      getAllCards: vi.fn().mockReturnValue([]),
      queryCards,
      getDueCards: vi.fn().mockReturnValue([]),
      getCard: vi.fn(),
      getCardByBlockId: vi.fn(),
      getCardsByBlockId: vi.fn().mockReturnValue([]),
    };
    const handler = new GetCardsQueryHandler(readModel);

    const result = await handler.execute({
      filter: {
        blockIds: ['block-1'],
        cardTypes: [CardType.Item],
        cardStatus: ['new'],
      },
    });

    expect(result.cards).toHaveLength(1);
    expect(queryCards).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['block-1'],
      cardTypes: [CardType.Item],
      states: [CardState.New],
    }));
    expect(readModel.getAllCards).not.toHaveBeenCalled();
  });

  it('keeps deckId filtering as residual logic after queryCards', async () => {
    const deckA = createCard({
      id: 'card-a',
      meta: { deckId: 'deck-a' },
    });
    const deckB = createCard({
      id: 'card-b',
      meta: { deckId: 'deck-b' },
    });
    const readModel: ICardReadModel = {
      getAllCards: vi.fn().mockReturnValue([]),
      queryCards: vi.fn().mockReturnValue([deckA, deckB]),
      getDueCards: vi.fn().mockReturnValue([]),
      getCard: vi.fn(),
      getCardByBlockId: vi.fn(),
      getCardsByBlockId: vi.fn().mockReturnValue([]),
    };
    const handler = new GetCardsQueryHandler(readModel);

    const result = await handler.execute({
      filter: {
        blockIds: ['block-1'],
        deckId: 'deck-b',
      },
    });

    expect(result.cards.map(card => card.id)).toEqual(['card-b']);
  });
});
