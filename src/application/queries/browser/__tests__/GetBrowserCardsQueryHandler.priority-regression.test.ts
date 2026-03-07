import { describe, expect, it } from 'vitest';
import { GetBrowserCardsQueryHandler } from '../GetBrowserCardsQueryHandler';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 19,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? { content: 'priority regression' },
  };
}

describe('GetBrowserCardsQueryHandler priority regression', () => {
  it('keeps local card priority when stale block attribute exists', () => {
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards: () => [],
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      {
        ATTR_PRIORITY: 'custom-fsrs-priority',
        ATTR_SUSPENDED: 'custom-fsrs-suspended',
        ATTR_CARD_TYPE: 'custom-fsrs-card-type',
        sql: async () => [],
        batchSetRiffCardsDueTime: async () => undefined,
      } as never,
    );

    const result = (
      handler as unknown as {
        transformFSRSCard: (card: FSRSCard, customAttrs: Record<string, string>) => { priority: number };
      }
    ).transformFSRSCard(buildCard({ priority: 19 }), {
      'custom-fsrs-priority': '88',
    });

    expect(result.priority).toBe(19);
  });

  it('keeps local card type when stale block attribute exists', () => {
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards: () => [],
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      {
        ATTR_PRIORITY: 'custom-fsrs-priority',
        ATTR_SUSPENDED: 'custom-fsrs-suspended',
        ATTR_CARD_TYPE: 'custom-fsrs-card-type',
        sql: async () => [],
        batchSetRiffCardsDueTime: async () => undefined,
      } as never,
    );

    const result = (
      handler as unknown as {
        transformFSRSCard: (card: FSRSCard, customAttrs: Record<string, string>) => { cardType: string };
      }
    ).transformFSRSCard(buildCard({ type: CardType.Concept }), {
      'custom-fsrs-card-type': 'item',
    });

    expect(result.cardType).toBe(CardType.Concept);
  });
});
