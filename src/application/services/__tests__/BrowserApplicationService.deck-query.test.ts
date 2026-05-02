import { describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';

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

  it('requeries backend deck page after source-existence host sweep changes current backend page', async () => {
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
      browserDeckPage: vi.fn()
        .mockResolvedValueOnce({ total: 2, cards: [missingCard, activeCard] })
        .mockResolvedValueOnce({ total: 1, cards: [activeCard] }),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 2,
        updated: 2,
        changed: true,
        changedToMissing: true,
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

    expect(page.total).toBe(1);
    expect(page.rows.map((row) => row.fsrsCardId)).toEqual(['card-worker-active']);
    expect(backendClient.browserDeckPage).toHaveBeenCalledTimes(2);
    expect(backendClient.browserSourceExistenceApplySweepHost).toHaveBeenCalledWith(
      expect.objectContaining({ blockIds: ['block-worker-missing', 'block-worker-active'] }),
      expect.any(Number),
    );
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
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-follower-1',
      method: 'browser.sourceExistence.applySweepHost',
    }));
    expect(backendClient.browserSourceExistenceApplySweepHost).not.toHaveBeenCalled();
  });
});
