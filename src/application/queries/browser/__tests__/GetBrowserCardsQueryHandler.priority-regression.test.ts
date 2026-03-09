import { describe, expect, it } from 'vitest';
import { GetBrowserCardsQueryHandler } from '../GetBrowserCardsQueryHandler';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';

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

  it('hydrates dismissed cards from block attrs for suspended preset and stats', async () => {
    const card = buildCard({
      id: 'card-dismissed',
      blockId: 'block-dismissed',
      state: CardState.Review,
      meta: { content: 'dismiss me' },
    });
    const siyuanApi: QuerySiyuanPort = {
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      sql: async (stmt: string) => {
        if (stmt.includes('FROM attributes') && stmt.includes('custom-fsrs-suspended')) {
          return [{ block_id: 'block-dismissed', value: 'true' }] as never[];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [{
            id: 'block-dismissed',
            root_id: 'doc-1',
            content: 'dismiss me',
            attrs: 'custom-fsrs-suspended=true',
          }] as never[];
        }
        return [] as never[];
      },
      batchSetRiffCardsDueTime: async () => undefined,
    };
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards: () => [card],
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      siyuanApi,
    );

    const result = await handler.execute({
      preset: 'suspended',
      page: 1,
      pageSize: 20,
    });

    expect(result.stats.suspendedCards).toBe(1);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.suspended).toBe(true);
  });
});
