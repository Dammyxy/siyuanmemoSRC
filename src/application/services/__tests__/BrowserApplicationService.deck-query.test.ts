import { describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';

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
    meta: overrides.meta ?? {},
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

describe('BrowserApplicationService deck query kernel', () => {
  it('builds sorted lite rows and hydrates requested ids in order', async () => {
    const now = Date.now();
    const cards = [
      buildCard({
        id: 'card-1',
        blockId: 'block-1',
        due: now - 1_000,
        priority: 10,
        meta: {},
      }),
      buildCard({
        id: 'card-2',
        blockId: 'block-2',
        due: now - 500,
        priority: 80,
        meta: {},
      }),
      buildCard({
        id: 'card-3',
        blockId: 'block-3',
        due: now + 50_000,
        priority: 40,
        meta: {},
      }),
    ];
    const queryCards = createQueryCardsMock(cards);
    const getCard = vi.fn((id: string) => cards.find((card) => card.id === id));
    const siyuanApi = {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes('SELECT id') && stmt.includes('WHERE id IN') && !stmt.includes('GROUP_CONCAT')) {
          return [
            { id: 'block-1' },
            { id: 'block-2' },
            { id: 'block-3' },
          ];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [
            { id: 'block-1', root_id: 'doc-a', content: 'Alpha card', attrs: '' },
            { id: 'block-2', root_id: 'doc-a', content: 'Beta card', attrs: '' },
          ];
        }
        if (stmt.includes('FROM attributes')) {
          return [];
        }
        return [];
      }),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    };

    const service = new BrowserApplicationService(
      {
        getCard,
        queryCards,
        getAllCards: () => cards,
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      null,
      siyuanApi as never,
    );

    const snapshot = await service.getDeckQuerySnapshot({
      preset: 'due',
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    });
    expect(snapshot.total).toBe(2);
    expect(snapshot.rows.map((row) => row.id)).toEqual(['card-2', 'card-1']);

    const rows = await service.getDeckRowsByIds(['card-1', 'card-2']);
    expect(rows.map((row) => row.fsrsCardId)).toEqual(['card-1', 'card-2']);
    expect(rows.map((row) => row.content)).toEqual(['Alpha card', 'Beta card']);
    expect(rows.map((row) => row.rootId)).toEqual(['doc-a', 'doc-a']);

    const stats = await service.getStats();
    expect(stats.totalCards).toBe(3);
    expect(stats.dueCards).toBe(2);
    expect(queryCards).toHaveBeenCalled();
  });

  it('uses SQL browser read port for paged rows, matched ids, and stats', async () => {
    const now = Date.now();
    const cards = [
      buildCard({
        id: 'card-1',
        blockId: 'block-1',
        due: now - 1_000,
        priority: 10,
        meta: { content: 'Alpha card', rootId: 'doc-a', deckId: 'deck-a' },
      }),
      buildCard({
        id: 'card-2',
        blockId: 'block-2',
        due: now - 500,
        priority: 80,
        meta: { content: 'Beta card', rootId: 'doc-a', deckId: 'deck-a' },
      }),
    ];
    const storage = {
      getCard: vi.fn(() => {
        throw new Error('storage getCard should not be used for SQL browser page');
      }),
      queryCards: vi.fn(() => {
        throw new Error('storage queryCards should not be used for SQL browser page');
      }),
      getAllCards: vi.fn(() => {
        throw new Error('storage getAllCards should not be used for SQL browser page');
      }),
    };
    const readPort: BrowserDeckReadPort = {
      queryDeckPage: vi.fn(() => ({ cards: [cards[1]], total: 2 })),
      queryDeckMatchedIds: vi.fn(() => ['card-2', 'card-1']),
      getDeckCardsByIds: vi.fn((ids: string[]) => ids.map((id) => cards.find((card) => card.id === id)!).filter(Boolean)),
      countCards: vi.fn(() => 1),
      getBrowserStats: vi.fn(() => ({
        totalCards: 2,
        dueCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 2,
        suspendedCards: 0,
        lostCards: 0,
      })),
    };
    const siyuanApi = {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      sql: vi.fn(async () => [
        { id: 'block-1', root_id: 'doc-a', content: 'Alpha card', attrs: '' },
        { id: 'block-2', root_id: 'doc-a', content: 'Beta card', attrs: '' },
      ]),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    };

    const service = new BrowserApplicationService(
      storage as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      null,
      siyuanApi as never,
      null,
      readPort,
    );

    const page = await service.getDeckPage(
      { preset: 'review', sortModel: [{ colId: 'priority', sort: 'desc' }] },
      { startRow: 0, endRow: 1 },
    );
    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.fsrsCardId)).toEqual(['card-2']);
    expect(readPort.queryDeckPage).toHaveBeenCalledWith(
      { preset: 'review', sortModel: [{ colId: 'priority', sort: 'desc' }] },
      { startRow: 0, endRow: 1 },
    );

    await expect(service.getDeckMatchedIds({ preset: 'review' })).resolves.toEqual(['card-2', 'card-1']);
    await expect(service.getDeckRowsByIds(['card-1'])).resolves.toMatchObject([{ fsrsCardId: 'card-1' }]);
    await expect(service.getDueCount()).resolves.toBe(1);
    await expect(service.getStats()).resolves.toMatchObject({ totalCards: 2, dueCards: 1 });
    expect(storage.getAllCards).not.toHaveBeenCalled();
    expect(storage.queryCards).not.toHaveBeenCalled();
  });

  it('falls back to the legacy snapshot when the SQL browser read port throws', async () => {
    const now = Date.now();
    const cards = [
      buildCard({
        id: 'card-legacy',
        blockId: 'block-legacy',
        due: now - 1_000,
        priority: 10,
        meta: { content: 'Legacy fallback card', rootId: 'doc-a' },
      }),
    ];
    const queryCards = createQueryCardsMock(cards);
    const storage = {
      getCard: vi.fn((id: string) => cards.find((card) => card.id === id)),
      queryCards,
      getAllCards: vi.fn(() => cards),
    };
    const readPort: BrowserDeckReadPort = {
      queryDeckPage: vi.fn(() => {
        throw new Error('SQL unavailable');
      }),
      queryDeckMatchedIds: vi.fn(() => {
        throw new Error('SQL unavailable');
      }),
      getDeckCardsByIds: vi.fn(() => {
        throw new Error('SQL unavailable');
      }),
      countCards: vi.fn(() => {
        throw new Error('SQL unavailable');
      }),
      getBrowserStats: vi.fn(() => {
        throw new Error('SQL unavailable');
      }),
    };
    const siyuanApi = {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes('SELECT id') && stmt.includes('WHERE id IN') && !stmt.includes('GROUP_CONCAT')) {
          return [{ id: 'block-legacy' }];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [{ id: 'block-legacy', root_id: 'doc-a', content: 'Legacy fallback card', attrs: '' }];
        }
        return [];
      }),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    };

    const service = new BrowserApplicationService(
      storage as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      null,
      siyuanApi as never,
      null,
      readPort,
    );

    const page = await service.getDeckPage({ preset: 'due' }, { startRow: 0, endRow: 10 });

    expect(page.total).toBe(1);
    expect(page.rows.map((row) => row.fsrsCardId)).toEqual(['card-legacy']);
    await expect(service.getDeckMatchedIds({ preset: 'due' })).resolves.toEqual(['card-legacy']);
    await expect(service.getDeckRowsByIds(['card-legacy'])).resolves.toMatchObject([{ fsrsCardId: 'card-legacy' }]);
    await expect(service.getDueCount()).resolves.toBe(1);
    await expect(service.getStats()).resolves.toMatchObject({ totalCards: 1, dueCards: 1 });
    expect(queryCards).toHaveBeenCalled();
  });

  it('refreshes current SQL page source existence and requeries when a row becomes missing', async () => {
    const missingCard = buildCard({
      id: 'card-missing',
      blockId: 'block-missing',
      meta: { content: 'Missing card', rootId: 'doc-a' },
    });
    const activeCard = buildCard({
      id: 'card-active',
      blockId: 'block-active',
      meta: { content: 'Active card', rootId: 'doc-a' },
    });
    const sourceState = new Map<string, boolean | null>();
    const readPort: BrowserDeckReadPort = {
      queryDeckPage: vi.fn()
        .mockReturnValueOnce({ cards: [missingCard, activeCard], total: 2 })
        .mockReturnValueOnce({ cards: [activeCard], total: 1 }),
      queryDeckMatchedIds: vi.fn(() => ['card-active']),
      getDeckCardsByIds: vi.fn(() => [activeCard]),
      countCards: vi.fn(() => 1),
      getBrowserStats: vi.fn(() => ({
        totalCards: 1,
        dueCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 1,
        suspendedCards: 0,
        lostCards: 1,
      })),
      getSourceExistenceRefreshCandidates: vi.fn(() => [
        {
          cardId: 'card-missing',
          blockId: 'block-missing',
          sourceExists: null,
          sourceCheckedAt: null,
        },
        {
          cardId: 'card-active',
          blockId: 'block-active',
          sourceExists: null,
          sourceCheckedAt: null,
        },
      ]),
      updateSourceExistence: vi.fn(async (updates) => {
        for (const update of updates) {
          sourceState.set(update.blockId, update.exists);
        }
      }),
      getSourceExistenceByBlockIds: vi.fn((blockIds: string[]) => new Map(
        blockIds
          .map((blockId) => [blockId, sourceState.get(blockId) ?? null] as const),
      )),
      getSourceExistenceSummary: vi.fn(() => ({ unknown: 0, stale: 0, missing: 1 })),
      queryCardIdsByRootIds: vi.fn(() => []),
      queryRootlessCardBlockIds: vi.fn(() => []),
      queryInconsistentCardTypeMarkerIds: vi.fn(() => []),
    };
    const siyuanApi = {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      sql: vi.fn(async () => [{ id: 'block-active' }]),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    };

    const service = new BrowserApplicationService(
      {
        getCard: vi.fn(),
        queryCards: vi.fn(),
        getAllCards: vi.fn(),
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      null,
      siyuanApi as never,
      null,
      readPort,
    );

    const page = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });

    expect(page.total).toBe(1);
    expect(page.rows.map((row) => row.fsrsCardId)).toEqual(['card-active']);
    expect(readPort.queryDeckPage).toHaveBeenCalledTimes(2);
    expect(readPort.updateSourceExistence).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ blockId: 'block-missing', exists: false }),
        expect.objectContaining({ blockId: 'block-active', exists: true }),
      ]),
      expect.any(Number),
    );
  });
});
