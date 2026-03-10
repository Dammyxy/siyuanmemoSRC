import { describe, expect, it, vi } from 'vitest';
import { GetDueCardsQueryHandler } from '../GetDueCardsQueryHandler';
import type { ICardReadModel } from '../ICardReadModel';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { ALL_CARD_QUERY_STATES } from '@/types/card-query';

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
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now - 86_400_000,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 1,
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

describe('GetDueCardsQueryHandler queryCards integration', () => {
  it('builds due candidates from queryCards and keeps total semantics', async () => {
    const now = new Date(1_700_000_000_000);
    const dueCard = createCard({ id: 'due', due: now.getTime() - 1_000 });
    const suspendedCard = createCard({
      id: 'suspended',
      due: now.getTime() - 500,
      state: CardState.Suspended,
    });
    const futureCard = createCard({ id: 'future', due: now.getTime() + 86_400_000 });
    const queryCards = vi.fn((query?: { dueDate?: { lte?: number }; states?: number[] }) => {
      if (query?.dueDate?.lte !== undefined) {
        return [dueCard, suspendedCard];
      }
      if (query?.states && query.states.length === ALL_CARD_QUERY_STATES.length) {
        return [dueCard, suspendedCard, futureCard];
      }
      return [];
    });

    const readModel: ICardReadModel = {
      getAllCards: vi.fn().mockReturnValue([]),
      queryCards,
      getDueCards: vi.fn().mockReturnValue([]),
      getCard: vi.fn(),
      getCardByBlockId: vi.fn(),
      getCardsByBlockId: vi.fn().mockReturnValue([]),
    };

    const handler = new GetDueCardsQueryHandler(readModel, new CardScheduleService());
    const result = await handler.execute({ now });

    expect(result.cards.map(card => card.id)).toEqual(['due']);
    expect(result.count).toBe(1);
    expect(result.total).toBe(3);
    expect(queryCards).toHaveBeenCalledWith({ dueDate: { lte: now.getTime() } });
    expect(queryCards).toHaveBeenCalledWith({ states: ALL_CARD_QUERY_STATES });
    expect(readModel.getAllCards).not.toHaveBeenCalled();
  });
});
