import { describe, expect, it, vi } from 'vitest';
import { GetBrowserCardsQueryHandler } from '../GetBrowserCardsQueryHandler';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import { ALL_CARD_QUERY_STATES } from '@/types/card-query';

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
    meta: overrides.meta ?? { content: 'priority regression', rootId: 'doc-1' },
  };
}

function createQueryCardsMock(cards: FSRSCard[]) {
  return vi.fn((query?: {
    blockIds?: string[];
    states?: number[];
    cardTypes?: string[];
    dueDate?: { lte?: number };
  }) => {
    let result = cards;

    if (query?.blockIds) {
      const blockIds = new Set(query.blockIds);
      result = result.filter((card) => blockIds.has(card.blockId));
    }

    if (query?.states) {
      const states = new Set(query.states);
      result = result.filter((card) => states.has(card.state));
    }

    if (query?.cardTypes) {
      const cardTypes = new Set(query.cardTypes);
      result = result.filter((card) => cardTypes.has(card.type));
    }

    if (query?.dueDate?.lte !== undefined) {
      result = result.filter((card) => card.due <= query.dueDate!.lte!);
    }

    return result;
  });
}

function createSiyuanApi(sql: (stmt: string) => Promise<unknown[]>): QuerySiyuanPort {
  return {
    ATTR_PRIORITY: 'custom-fsrs-priority',
    ATTR_SUSPENDED: 'custom-fsrs-suspended',
    ATTR_CARD_TYPE: 'custom-fsrs-card-type',
    sql: sql as QuerySiyuanPort['sql'],
    batchSetRiffCardsDueTime: async () => undefined,
  };
}

describe('GetBrowserCardsQueryHandler priority regression', () => {
  it('keeps local card priority when stale block attribute exists', () => {
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards: () => [],
        queryCards: () => [],
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      createSiyuanApi(async () => []),
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
        queryCards: () => [],
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      createSiyuanApi(async () => []),
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

  it('hydrates dismissed cards from candidate attrs for suspended preset and stats without getAllCards()', async () => {
    const card = buildCard({
      id: 'card-dismissed',
      blockId: 'block-dismissed',
      state: CardState.Review,
      meta: { content: 'dismiss me', rootId: 'doc-1' },
    });
    const queryCards = createQueryCardsMock([card]);
    const getAllCards = vi.fn(() => {
      throw new Error('getAllCards should not be used when suspended candidate SQL succeeds');
    });
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards,
        queryCards,
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      createSiyuanApi(async (stmt: string) => {
        if (stmt.includes('FROM attributes') && stmt.includes('custom-fsrs-suspended')) {
          return [{ block_id: 'block-dismissed', value: 'true' }];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [{
            id: 'block-dismissed',
            root_id: 'doc-1',
            content: 'dismiss me',
            attrs: 'custom-fsrs-suspended=true',
          }];
        }
        return [];
      }),
    );

    const result = await handler.execute({
      preset: 'suspended',
      page: 1,
      pageSize: 20,
    });

    expect(result.stats.suspendedCards).toBe(1);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.suspended).toBe(true);
    expect(getAllCards).not.toHaveBeenCalled();
    expect(queryCards).toHaveBeenCalledWith({ states: ALL_CARD_QUERY_STATES });
    expect(queryCards).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['block-dismissed'],
    }));
  });

  it('uses queryCards for the due preset when searchText and docId are empty', async () => {
    const now = Date.now();
    const card = buildCard({
      id: 'card-due',
      blockId: 'block-due',
      due: now - 1_000,
      state: CardState.Review,
      meta: { content: 'due card', rootId: 'doc-1' },
    });
    const queryCards = createQueryCardsMock([card]);
    const getAllCards = vi.fn(() => {
      throw new Error('getAllCards should not be used for structured browser queries');
    });
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards,
        queryCards,
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      createSiyuanApi(async (stmt: string) => {
        if (stmt.includes('GROUP_CONCAT')) {
          return [{
            id: 'block-due',
            root_id: 'doc-1',
            content: 'due card',
            attrs: '',
          }];
        }
        return [];
      }),
    );

    const result = await handler.execute({
      preset: 'due',
      page: 1,
      pageSize: 20,
    });

    expect(result.cards).toHaveLength(1);
    expect(getAllCards).not.toHaveBeenCalled();
    expect(queryCards).toHaveBeenCalledWith({ states: ALL_CARD_QUERY_STATES });
    expect(queryCards).toHaveBeenCalledWith(expect.objectContaining({
      dueDate: expect.objectContaining({
        lte: expect.any(Number),
      }),
    }));
  });

  it.each([
    { preset: 'new' as const, state: CardState.New, id: 'card-new' },
    { preset: 'review' as const, state: CardState.Review, id: 'card-review' },
  ])('uses queryCards for the $preset preset', async ({ preset, state, id }) => {
    const card = buildCard({
      id,
      blockId: `block-${id}`,
      state,
      meta: { content: preset, rootId: 'doc-1' },
    });
    const queryCards = createQueryCardsMock([card]);
    const getAllCards = vi.fn(() => {
      throw new Error('getAllCards should not be used for structured browser queries');
    });
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards,
        queryCards,
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      createSiyuanApi(async (stmt: string) => {
        if (stmt.includes('GROUP_CONCAT')) {
          return [{
            id: `block-${id}`,
            root_id: 'doc-1',
            content: preset,
            attrs: '',
          }];
        }
        return [];
      }),
    );

    await handler.execute({
      preset,
      page: 1,
      pageSize: 20,
    });

    expect(getAllCards).not.toHaveBeenCalled();
    expect(queryCards).toHaveBeenCalledWith(expect.objectContaining({
      states: [state],
    }));
  });

  it('uses SQL block candidates for docId without falling back to getAllCards()', async () => {
    const card = buildCard({
      id: 'card-doc',
      blockId: 'block-doc',
      meta: { content: 'doc card', rootId: 'doc-1' },
    });
    const queryCards = createQueryCardsMock([card]);
    const getAllCards = vi.fn(() => {
      throw new Error('getAllCards should not be used when docId SQL succeeds');
    });
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards,
        queryCards,
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      createSiyuanApi(async (stmt: string) => {
        if (stmt.includes("WHERE root_id = 'doc-1'")) {
          return [{ id: 'block-doc' }];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [{
            id: 'block-doc',
            root_id: 'doc-1',
            content: 'doc card',
            attrs: '',
          }];
        }
        return [];
      }),
    );

    const result = await handler.execute({
      docId: 'doc-1',
      page: 1,
      pageSize: 20,
    });

    expect(result.cards).toHaveLength(1);
    expect(getAllCards).not.toHaveBeenCalled();
    expect(queryCards).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['block-doc'],
    }));
  });

  it('uses SQL block candidates for searchText without falling back to getAllCards()', async () => {
    const card = buildCard({
      id: 'card-search',
      blockId: 'block-search',
      meta: { rootId: 'doc-1' },
    });
    const queryCards = createQueryCardsMock([card]);
    const getAllCards = vi.fn(() => {
      throw new Error('getAllCards should not be used when search SQL succeeds');
    });
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards,
        queryCards,
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      createSiyuanApi(async (stmt: string) => {
        if (stmt.includes("WHERE content LIKE '%priority regression%'")) {
          return [{ id: 'block-search' }];
        }
        if (stmt.includes('SELECT id, content')) {
          return [{ id: 'block-search', content: 'priority regression' }];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [{
            id: 'block-search',
            root_id: 'doc-1',
            content: 'priority regression',
            attrs: '',
          }];
        }
        return [];
      }),
    );

    const result = await handler.execute({
      searchText: 'priority regression',
      page: 1,
      pageSize: 20,
    });

    expect(result.cards).toHaveLength(1);
    expect(getAllCards).not.toHaveBeenCalled();
    expect(queryCards).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['block-search'],
    }));
  });

  it.each([
    {
      name: 'docId',
      query: { docId: 'doc-1' },
      failingSqlNeedle: "WHERE root_id = 'doc-1'",
    },
    {
      name: 'searchText',
      query: { searchText: 'priority regression' },
      failingSqlNeedle: "WHERE content LIKE '%priority regression%'",
    },
    {
      name: 'suspended',
      query: { preset: 'suspended' as const },
      failingSqlNeedle: "WHERE name = 'custom-fsrs-suspended'",
    },
  ])('falls back to getAllCards() when $name SQL candidate loading fails', async ({ query, failingSqlNeedle }) => {
    const isSuspendedQuery = 'preset' in query && query.preset === 'suspended';
    const card = buildCard({
      id: 'card-fallback',
      blockId: 'block-fallback',
      meta: isSuspendedQuery
        ? { content: 'priority regression', rootId: 'doc-1', suspended: true }
        : { content: 'priority regression', rootId: 'doc-1' },
    });
    const queryCards = createQueryCardsMock([card]);
    const getAllCards = vi.fn(() => [card]);
    const handler = new GetBrowserCardsQueryHandler(
      {
        getCard: () => undefined,
        getAllCards,
        queryCards,
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      createSiyuanApi(async (stmt: string) => {
        if (stmt.includes(failingSqlNeedle)) {
          throw new Error('sql unavailable');
        }
        if (stmt.includes('SELECT id, content')) {
          return [{ id: 'block-fallback', content: 'priority regression' }];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [{
            id: 'block-fallback',
            root_id: 'doc-1',
            content: 'priority regression',
            attrs: isSuspendedQuery ? 'custom-fsrs-suspended=true' : '',
          }];
        }
        return [];
      }),
    );

    const result = await handler.execute({
      page: 1,
      pageSize: 20,
      ...query,
    });

    expect(result.cards).toHaveLength(1);
    expect(getAllCards).toHaveBeenCalledOnce();
    expect(queryCards).toHaveBeenCalledWith({ states: ALL_CARD_QUERY_STATES });
  });
});
