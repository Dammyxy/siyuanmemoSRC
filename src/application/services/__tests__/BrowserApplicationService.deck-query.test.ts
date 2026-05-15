import { describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';

async function flushBackgroundTimers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 320));
}

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

    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckRowsByIds'
      | 'browserStats'
      | 'browserSourceExistenceRefreshCandidates'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckRowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => getCard(id)).filter(Boolean) as FSRSCard[]),
      browserStats: vi.fn(async () => ({
        totalCards: 3,
        dueCards: 2,
        newCards: 0,
        learningCards: 0,
        reviewCards: 3,
        suspendedCards: 0,
        lostCards: 0,
      })),
      browserSourceExistenceRefreshCandidates: vi.fn(async () => []),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-1', true],
        ['block-2', true],
      ])),
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
      null,
      null,
      backendClient as SrsBackendClient,
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

  it('fails closed for deck reads when backend worker client is unavailable', async () => {
    const readPort: BrowserDeckReadPort = {
      queryDeckPage: vi.fn(),
      queryDeckMatchedIds: vi.fn(),
      getDeckCardsByIds: vi.fn(),
      countCards: vi.fn(),
      getBrowserStats: vi.fn(() => ({
        totalCards: 0,
        dueCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
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
      sql: vi.fn(async () => []),
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
      null,
    );

    await expect(service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 }))
      .rejects.toThrow('BACKEND_UNAVAILABLE: browser.deck.page requires backend-worker ownership');
    await expect(service.getDeckMatchedIds({ preset: 'all' }))
      .rejects.toThrow('BACKEND_UNAVAILABLE: browser.deck.matchedIds requires backend-worker ownership');
    await expect(service.getDeckRowsByIds(['card-1']))
      .rejects.toThrow('BACKEND_UNAVAILABLE: browser.deck.rowsByIds requires backend-worker ownership');
    await expect(service.getDueCount())
      .rejects.toThrow('BACKEND_UNAVAILABLE: browser.count requires backend-worker ownership');
    await expect(service.getStats())
      .rejects.toThrow('BACKEND_UNAVAILABLE: browser.stats requires backend-worker ownership');
    expect(readPort.queryDeckPage).not.toHaveBeenCalled();
    expect(readPort.queryDeckMatchedIds).not.toHaveBeenCalled();
    expect(readPort.getDeckCardsByIds).not.toHaveBeenCalled();
    expect(readPort.countCards).not.toHaveBeenCalled();
    expect(readPort.getBrowserStats).not.toHaveBeenCalled();
  });

  it('uses worker backend client for deck page, matched ids, due count and stats when provided', async () => {
    const cards = [
      buildCard({
        id: 'card-worker-1',
        blockId: 'block-worker-1',
        due: Date.now() - 1000,
        priority: 20,
        meta: { content: 'Worker card 1', rootId: 'doc-worker' },
      }),
      buildCard({
        id: 'card-worker-2',
        blockId: 'block-worker-2',
        due: Date.now() + 1000,
        priority: 30,
        meta: { content: 'Worker card 2', rootId: 'doc-worker' },
      }),
    ];
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserDeckMatchedIds'
      | 'browserDeckRowsByIds'
      | 'browserCountCards'
      | 'browserStats'
      | 'browserSourceExistenceRefreshCandidates'
      | 'browserSourceExistenceApplySweep'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceUpdate'
      | 'browserSourceExistenceByBlockIds'
      | 'browserSourceExistenceSummary'
    > = {
      browserDeckPage: vi.fn(async () => ({ total: 2, cards })),
      browserDeckMatchedIds: vi.fn(async () => ['card-worker-1', 'card-worker-2']),
      browserDeckRowsByIds: vi.fn(async (ids: string[]) => cards.filter((card) => ids.includes(card.id))),
      browserCountCards: vi.fn(async () => 1),
      browserStats: vi.fn(async () => ({
        totalCards: 2,
        dueCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 2,
        suspendedCards: 0,
        lostCards: 0,
      })),
      browserSourceExistenceRefreshCandidates: vi.fn(async () => [
        {
          cardId: 'card-worker-1',
          blockId: 'block-worker-1',
          sourceExists: null,
          sourceCheckedAt: null,
        },
      ]),
      browserSourceExistenceUpdate: vi.fn(async () => 1),
      browserSourceExistenceApplySweep: vi.fn(async () => ({
        checked: 1,
        updated: 1,
        changed: true,
        changedToMissing: false,
      })),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 1,
        updated: 1,
        changed: true,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-worker-1', true],
        ['block-worker-2', true],
      ])),
      browserSourceExistenceSummary: vi.fn(async () => ({ unknown: 0, stale: 0, missing: 0 })),
    };
    const readPort: BrowserDeckReadPort = {
      queryDeckPage: vi.fn(() => {
        throw new Error('readPort should not be used when worker backend client is available');
      }),
      queryDeckMatchedIds: vi.fn(() => []),
      getDeckCardsByIds: vi.fn(() => []),
      countCards: vi.fn(() => 0),
      getBrowserStats: vi.fn(() => ({
        totalCards: 0,
        dueCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
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
      sql: vi.fn(async () => [{ id: 'block-worker-1' }, { id: 'block-worker-2' }]),
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
      backendClient as SrsBackendClient,
    );

    const page = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });
    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.fsrsCardId)).toEqual(['card-worker-1', 'card-worker-2']);
    await expect(service.getDeckRowsByIds(['card-worker-2'])).resolves.toMatchObject([{ fsrsCardId: 'card-worker-2' }]);
    await expect(service.getDeckMatchedIds({ preset: 'all' })).resolves.toEqual(['card-worker-1', 'card-worker-2']);
    await expect(service.getDueCount()).resolves.toBe(1);
    await expect(service.getStats()).resolves.toMatchObject({ totalCards: 2, dueCards: 1 });
    await flushBackgroundTimers();
    expect(backendClient.browserDeckPage).toHaveBeenCalled();
    expect(backendClient.browserDeckRowsByIds).toHaveBeenCalledWith(['card-worker-2']);
    expect(backendClient.browserDeckMatchedIds).toHaveBeenCalled();
    expect(backendClient.browserCountCards).toHaveBeenCalled();
    expect(backendClient.browserStats).toHaveBeenCalled();
    expect(backendClient.browserSourceExistenceApplySweepHost).toHaveBeenCalled();
    expect(backendClient.browserSourceExistenceApplySweepHost).toHaveBeenCalledWith(
      expect.objectContaining({ blockIds: ['block-worker-1', 'block-worker-2'] }),
      expect.any(Number),
    );
  });

  it('returns explicit unavailable when backend deck query fails', async () => {
    const backendClient: Pick<SrsBackendClient, 'browserDeckPage'> = {
      browserDeckPage: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: backend deck page unavailable');
      }),
    };
    const readPort: BrowserDeckReadPort = {
      queryDeckPage: vi.fn(() => ({ cards: [fallbackCard], total: 1 })),
      queryDeckMatchedIds: vi.fn(() => ['card-backend-fallback']),
      getDeckCardsByIds: vi.fn(() => [fallbackCard]),
      countCards: vi.fn(() => 1),
      getBrowserStats: vi.fn(() => ({
        totalCards: 1,
        dueCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 1,
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
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes('SELECT id') && stmt.includes('WHERE id IN') && !stmt.includes('GROUP_CONCAT')) {
          return [{ id: 'block-backend-fallback' }];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [{ id: 'block-backend-fallback', root_id: 'doc-fallback', content: 'Backend fallback card', attrs: '' }];
        }
        return [];
      }),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    };

    const service = new BrowserApplicationService(
      {
        getCard: vi.fn(),
        queryCards: vi.fn(() => []),
        getAllCards: vi.fn(() => []),
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      null,
      siyuanApi as never,
      null,
      readPort,
      backendClient as SrsBackendClient,
    );

    await expect(service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 }))
      .rejects.toThrow('BACKEND_UNAVAILABLE: backend deck page unavailable');
    expect(backendClient.browserDeckPage).toHaveBeenCalledTimes(1);
    expect(readPort.queryDeckPage).not.toHaveBeenCalled();
  });

  it('returns backend deck page before background source-existence refresh completes', async () => {
    const missingCard = buildCard({
      id: 'card-worker-missing',
      blockId: 'block-worker-missing',
      due: Date.now() - 2000,
      priority: 5,
      meta: { content: 'Worker missing card', rootId: 'doc-worker' },
    });
    const activeCard = buildCard({
      id: 'card-worker-active',
      blockId: 'block-worker-active',
      due: Date.now() - 1000,
      priority: 20,
      meta: { content: 'Worker active card', rootId: 'doc-worker' },
    });
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckPage: vi.fn(async () => ({ total: 2, cards: [missingCard, activeCard] })),
      browserSourceExistenceApplySweepHost: vi.fn(() => new Promise((resolve) => {
        setTimeout(() => resolve({
          checked: 2,
          updated: 2,
          changed: true,
          changedToMissing: true,
        }), 10);
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-worker-active', true],
      ])),
    };
    const siyuanApi = {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      sql: vi.fn(async () => [{ id: 'block-worker-active' }]),
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
      null,
      backendClient as SrsBackendClient,
    );

    const page = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });

    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.fsrsCardId)).toEqual(['card-worker-missing', 'card-worker-active']);
    expect(backendClient.browserDeckPage).toHaveBeenCalledTimes(1);
    await flushBackgroundTimers();
    expect(backendClient.browserSourceExistenceApplySweepHost).toHaveBeenCalledWith(
      expect.objectContaining({ blockIds: ['block-worker-missing', 'block-worker-active'] }),
      expect.any(Number),
    );
  });

  it('does not start source-existence page refresh in the first macrotask after deck page return', async () => {
    const card = buildCard({
      id: 'card-worker-deferred-refresh',
      blockId: 'block-worker-deferred-refresh',
      meta: { content: 'Worker deferred refresh card', rootId: 'doc-worker' },
    });
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckPage: vi.fn(async () => ({ total: 1, cards: [card] })),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 1,
        updated: 1,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-worker-deferred-refresh', true],
      ])),
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
      {
        sql: vi.fn(async () => [{ id: 'block-worker-deferred-refresh' }]),
      } as never,
      null,
      null,
      backendClient as SrsBackendClient,
    );

    const page = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(page.total).toBe(1);
    expect(backendClient.browserSourceExistenceApplySweepHost).not.toHaveBeenCalled();
  });

  it('emits async visible-row source updates after background page refresh changes cached status', async () => {
    const card = buildCard({
      id: 'card-worker-visible-patch',
      blockId: 'block-worker-visible-patch',
      meta: { content: 'Worker visible patch card', rootId: 'doc-worker' },
    });
    let statusReadCount = 0;
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckPage: vi.fn(async () => ({ total: 1, cards: [card] })),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 1,
        updated: 1,
        changed: true,
        changedToMissing: true,
        changedBlockIds: ['block-worker-visible-patch'],
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => {
        statusReadCount += 1;
        return new Map([
          ['block-worker-visible-patch', statusReadCount === 1 ? true : false],
        ]);
      }),
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
      {
        sql: vi.fn(async () => [{ id: 'block-worker-visible-patch' }]),
      } as never,
      null,
      null,
      backendClient as SrsBackendClient,
    );
    const updates: unknown[] = [];
    const unsubscribe = service.subscribeSourceExistenceUpdates((update) => updates.push(update));

    const page = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });
    expect(page.rows[0].meta?.blockType).toBeUndefined();

    await flushBackgroundTimers();
    unsubscribe();

    expect(updates).toEqual([{
      source: 'page-refresh',
      statuses: [{ blockId: 'block-worker-visible-patch', exists: false }],
    }]);
  });

  it('reuses backend deck rows when mapped projection and source status are unchanged', async () => {
    const card = buildCard({
      id: 'card-worker-row-cache',
      blockId: 'block-worker-row-cache',
      due: Date.now() - 1000,
      priority: 20,
      meta: { content: 'Worker row cache card', rootId: 'doc-worker' },
    });
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckPage: vi.fn(async () => ({
        total: 1,
        cards: [{ ...card, meta: { ...card.meta } }],
      })),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 1,
        updated: 1,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-worker-row-cache', true],
      ])),
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
      {
        sql: vi.fn(async () => [{ id: 'block-worker-row-cache' }]),
      } as never,
      null,
      null,
      backendClient as SrsBackendClient,
    );

    const first = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });
    const second = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });

    expect(second.rows[0]).toBe(first.rows[0]);
  });

  it('does not reuse backend deck rows after source status marks a block missing', async () => {
    const card = buildCard({
      id: 'card-worker-row-cache-missing',
      blockId: 'block-worker-row-cache-missing',
      due: Date.now() - 1000,
      priority: 20,
      meta: { content: 'Worker row cache missing card', rootId: 'doc-worker' },
    });
    let sourceExists = true;
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckPage: vi.fn(async () => ({
        total: 1,
        cards: [{ ...card, meta: { ...card.meta } }],
      })),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 1,
        updated: 1,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-worker-row-cache-missing', sourceExists],
      ])),
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
      {
        sql: vi.fn(async () => [{ id: 'block-worker-row-cache-missing' }]),
      } as never,
      null,
      null,
      backendClient as SrsBackendClient,
    );

    const first = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });
    sourceExists = false;
    const second = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });

    expect(second.rows[0]).not.toBe(first.rows[0]);
    expect(second.rows[0].meta?.blockType).toBe('missing');
  });

  it('coalesces delayed page source-existence refreshes for overlapping page reads', async () => {
    const firstCard = buildCard({
      id: 'card-worker-coalesce-1',
      blockId: 'block-worker-coalesce-1',
      meta: { content: 'Worker coalesce card 1', rootId: 'doc-worker' },
    });
    const secondCard = buildCard({
      id: 'card-worker-coalesce-2',
      blockId: 'block-worker-coalesce-2',
      meta: { content: 'Worker coalesce card 2', rootId: 'doc-worker' },
    });
    let pageReadCount = 0;
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckPage: vi.fn(async () => {
        pageReadCount += 1;
        return { total: 1, cards: [pageReadCount === 1 ? firstCard : secondCard] };
      }),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 2,
        updated: 2,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-worker-coalesce-1', true],
        ['block-worker-coalesce-2', true],
      ])),
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
      {
        sql: vi.fn(async () => [{ id: 'block-worker-coalesce-1' }, { id: 'block-worker-coalesce-2' }]),
      } as never,
      null,
      null,
      backendClient as SrsBackendClient,
    );

    await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });
    await service.getDeckPage({ preset: 'all' }, { startRow: 20, endRow: 40 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(backendClient.browserSourceExistenceApplySweepHost).not.toHaveBeenCalled();

    await flushBackgroundTimers();

    expect(backendClient.browserSourceExistenceApplySweepHost).toHaveBeenCalledTimes(1);
    expect(backendClient.browserSourceExistenceApplySweepHost).toHaveBeenCalledWith(
      expect.objectContaining({ blockIds: ['block-worker-coalesce-1', 'block-worker-coalesce-2'] }),
      expect.any(Number),
    );
  });

  it('does not schedule page source refresh for rows-by-ids snapshot hydration', async () => {
    const card = buildCard({
      id: 'card-worker-rows-by-ids-no-refresh',
      blockId: 'block-worker-rows-by-ids-no-refresh',
      meta: { content: 'Worker rows by ids no refresh card', rootId: 'doc-worker' },
    });
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckRowsByIds'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckRowsByIds: vi.fn(async () => [card]),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 1,
        updated: 1,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-worker-rows-by-ids-no-refresh', true],
      ])),
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
      {
        sql: vi.fn(async () => [{ id: 'block-worker-rows-by-ids-no-refresh' }]),
      } as never,
      null,
      null,
      backendClient as SrsBackendClient,
    );

    await service.getDeckRowsByIds(['card-worker-rows-by-ids-no-refresh']);
    await flushBackgroundTimers();

    expect(backendClient.browserSourceExistenceApplySweepHost).not.toHaveBeenCalled();
  });

  it('suppresses stale source refresh results when a newer page refresh starts', async () => {
    let resolveFirst: ((value: {
      checked: number;
      updated: number;
      changed: boolean;
      changedToMissing: boolean;
      changedBlockIds: string[];
    }) => void) | null = null;
    let resolveSecond: typeof resolveFirst = null;
    const firstSweep = new Promise<{
      checked: number;
      updated: number;
      changed: boolean;
      changedToMissing: boolean;
      changedBlockIds: string[];
    }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondSweep = new Promise<{
      checked: number;
      updated: number;
      changed: boolean;
      changedToMissing: boolean;
      changedBlockIds: string[];
    }>((resolve) => {
      resolveSecond = resolve;
    });
    const backendClient: Pick<SrsBackendClient,
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserSourceExistenceApplySweepHost: vi.fn(async (request: { blockIds?: string[] }) => {
        if (request.blockIds?.includes('block-stale-first')) {
          return firstSweep;
        }
        return secondSweep;
      }),
      browserSourceExistenceByBlockIds: vi.fn(async (blockIds: string[]) => new Map(
        blockIds.map((blockId) => [blockId, false] as const),
      )),
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
      {} as never,
      null,
      null,
      backendClient as SrsBackendClient,
    );
    const updates: unknown[] = [];
    service.subscribeSourceExistenceUpdates((update) => updates.push(update));

    const firstRefresh = (service as any).refreshSourceExistenceForBackendBlockIds(['block-stale-first']);
    const secondRefresh = (service as any).refreshSourceExistenceForBackendBlockIds(['block-stale-second']);

    resolveSecond?.({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: true,
      changedBlockIds: ['block-stale-second'],
    });
    await secondRefresh;
    resolveFirst?.({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: true,
      changedBlockIds: ['block-stale-first'],
    });
    await firstRefresh;

    expect(updates).toEqual([{
      source: 'page-refresh',
      statuses: [{ blockId: 'block-stale-second', exists: false }],
    }]);
  });

  it('relays source-existence sweep host mutation through follower command client when runtime is follower', async () => {
    const cards = [
      buildCard({
        id: 'card-worker-follower-1',
        blockId: 'block-worker-follower-1',
        due: Date.now() - 1000,
        priority: 20,
        meta: { content: 'Worker follower card', rootId: 'doc-worker' },
      }),
    ];
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserDeckMatchedIds'
      | 'browserDeckRowsByIds'
      | 'browserCountCards'
      | 'browserStats'
      | 'browserSourceExistenceRefreshCandidates'
      | 'browserSourceExistenceApplySweep'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceUpdate'
      | 'browserSourceExistenceByBlockIds'
      | 'browserSourceExistenceSummary'
    > = {
      browserDeckPage: vi.fn(async () => ({ total: 1, cards })),
      browserDeckMatchedIds: vi.fn(async () => ['card-worker-follower-1']),
      browserDeckRowsByIds: vi.fn(async () => cards),
      browserCountCards: vi.fn(async () => 1),
      browserStats: vi.fn(async () => ({
        totalCards: 1,
        dueCards: 1,
        newCards: 0,
        learningCards: 0,
        reviewCards: 1,
        suspendedCards: 0,
        lostCards: 0,
      })),
      browserSourceExistenceRefreshCandidates: vi.fn(async () => []),
      browserSourceExistenceUpdate: vi.fn(async () => 0),
      browserSourceExistenceApplySweep: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 1,
        updated: 1,
        changed: true,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-worker-follower-1', true],
      ])),
      browserSourceExistenceSummary: vi.fn(async () => ({ unknown: 0, stale: 0, missing: 0 })),
    };
    const readPort: BrowserDeckReadPort = {
      queryDeckPage: vi.fn(() => {
        throw new Error('readPort should not be used when worker backend client is available');
      }),
      queryDeckMatchedIds: vi.fn(() => []),
      getDeckCardsByIds: vi.fn(() => []),
      countCards: vi.fn(() => 0),
      getBrowserStats: vi.fn(() => ({
        totalCards: 0,
        dueCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
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
      sql: vi.fn(async () => [{ id: 'block-worker-follower-1' }]),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    };
    const submitAndWait = vi.fn(async () => ({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    }));

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
      backendClient as SrsBackendClient,
      {
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-1',
      } as never,
      {
        submitAndWait,
      } as never,
    );

    const page = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });
    expect(page.total).toBe(1);
    await flushBackgroundTimers();
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-follower-1',
      method: 'browser.sourceExistence.applySweepHost',
    }));
    expect(backendClient.browserSourceExistenceApplySweepHost).not.toHaveBeenCalled();
  });

  it('exposes count-difference diagnostics without changing deck page totals', async () => {
    const cards = [
      buildCard({ id: 'card-1', blockId: 'block-1', type: CardType.Item }),
      buildCard({ id: 'card-2', blockId: 'block-2', type: CardType.Concept }),
    ];
    const backendClient: Pick<SrsBackendClient,
      | 'browserDeckPage'
      | 'browserDeckMatchedIds'
      | 'browserDeckRowsByIds'
      | 'browserStats'
      | 'browserSourceExistenceRefreshCandidates'
      | 'browserSourceExistenceApplySweepHost'
      | 'browserSourceExistenceByBlockIds'
    > = {
      browserDeckPage: vi.fn(async () => ({ total: 2, cards })),
      browserDeckMatchedIds: vi.fn(async () => ['card-1', 'card-2']),
      browserDeckRowsByIds: vi.fn(async () => cards),
      browserStats: vi.fn(async () => ({
        totalCards: 2,
        dueCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 2,
        suspendedCards: 0,
        lostCards: 0,
      })),
      browserSourceExistenceRefreshCandidates: vi.fn(async () => []),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([
        ['block-1', true],
        ['block-2', true],
      ])),
    };
    const siyuanApi = {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      BUILTIN_DECK_ID: 'builtin-deck',
      getRiffCards: vi.fn(async () => [
        { id: 'block-1', type: 'p', riffCard: { id: 'riff-1', blockID: 'block-1' } },
        { id: 'block-2', type: 'p', riffCard: { id: 'riff-2', blockID: 'block-2' } },
        { id: 'block-3', type: 'p', riffCard: { id: 'riff-3', blockID: 'block-3' } },
      ]),
      sql: vi.fn(async () => []),
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
      null,
      backendClient as SrsBackendClient,
    );

    const page = await service.getDeckPage({ preset: 'all' }, { startRow: 0, endRow: 20 });
    const diagnostic = await service.getBrowserCountDifferenceDiagnostic();

    expect(page.total).toBe(2);
    expect(diagnostic).toMatchObject({
      status: 'difference',
      nativeTotal: 3,
      browserManageableTotal: 2,
      browserOperationalTotal: 2,
      differenceTotal: 1,
    });
    expect(diagnostic.groups).toEqual([{
      reason: 'missing-plugin-index',
      count: 1,
      sampleIds: ['block-3'],
    }]);
    expect(siyuanApi.getRiffCards).toHaveBeenCalledWith('builtin-deck', { includeNew: true });
  });

  it('refreshes writer lease before direct source-existence sweep host mutation', async () => {
    const ensureWritable = vi.fn(async () => undefined);
    const applySweepHost = vi.fn(async () => ({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    }));
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
      {} as never,
      null,
      null,
      {
        browserSourceExistenceApplySweepHost: applySweepHost,
      } as unknown as SrsBackendClient,
      {
        getMode: () => 'writer',
        getInstanceId: () => 'writer-browser-1',
        ensureWritable,
      } as never,
      {
        submitAndWait: vi.fn(async () => {
          throw new Error('real writer must not relay browser sweep');
        }),
      } as never,
    );

    const result = await (service as any).invokeBackendSourceExistenceSweepHost({
      blockIds: ['block-writer-browser-1'],
    }, Date.now());

    expect(result.changed).toBe(true);
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(applySweepHost).toHaveBeenCalledTimes(1);
  });

  it('routes stale writer source-existence sweep host mutation through follower relay after guard refresh', async () => {
    let mode: 'writer' | 'follower' = 'writer';
    const applySweepHost = vi.fn(async () => {
      throw new Error('stale writer must not run browser sweep directly');
    });
    const submitAndWait = vi.fn(async () => ({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    }));
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
      {} as never,
      null,
      null,
      {
        browserSourceExistenceApplySweepHost: applySweepHost,
      } as unknown as SrsBackendClient,
      {
        getMode: () => mode,
        getInstanceId: () => 'stale-writer-browser-1',
        ensureWritable: vi.fn(async () => {
          mode = 'follower';
          throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance');
        }),
      } as never,
      { submitAndWait } as never,
    );

    const result = await (service as any).invokeBackendSourceExistenceSweepHost({
      blockIds: ['block-stale-writer-browser-1'],
    }, Date.now());

    expect(result.changed).toBe(true);
    expect(applySweepHost).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'stale-writer-browser-1',
      method: 'browser.sourceExistence.applySweepHost',
    }));
  });
});
